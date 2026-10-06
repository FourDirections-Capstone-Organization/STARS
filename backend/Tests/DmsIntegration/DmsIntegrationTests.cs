using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Moq.Protected;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.DmsIntegration;
using Backend.Modules.Notifications;
using Backend.Modules.TaskManagement;
using Task = System.Threading.Tasks.Task;

namespace Backend.Tests.DmsIntegration;

public class DmsIntegrationTests : IDisposable
{
    private readonly AppDbContext _db;
    private readonly Mock<INotificationService> _mockNotification;
    private readonly Mock<IAuditLogService> _mockAudit;
    private readonly Mock<ILogger<DmsIntegrationService>> _mockLogger;
    private readonly DmsIntegrationSettings _settings;

    public DmsIntegrationTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"STARS_DmsTest_{Guid.NewGuid()}")
            .Options;
        _db = new AppDbContext(options);

        _mockNotification = new Mock<INotificationService>();
        _mockAudit = new Mock<IAuditLogService>();
        _mockLogger = new Mock<ILogger<DmsIntegrationService>>();

        _settings = new DmsIntegrationSettings
        {
            BaseUrl = "https://dms.test.local",
            OutboundApiKey = "test-outbound-key",
            InboundApiKey = "test-inbound-key"
        };
    }

    public void Dispose()
    {
        _db.Database.EnsureDeleted();
        _db.Dispose();
    }

    private DmsIntegrationService CreateService(HttpClient? customClient = null)
    {
        var mockHttpFactory = new Mock<IHttpClientFactory>();
        var client = customClient ?? new HttpClient();
        mockHttpFactory.Setup(f => f.CreateClient(DmsIntegrationService.HttpClientName))
            .Returns(client);

        return new DmsIntegrationService(
            _db,
            mockHttpFactory.Object,
            Options.Create(_settings),
            _mockNotification.Object,
            _mockAudit.Object,
            _mockLogger.Object);
    }

    [Fact]
    public void ValidateApiKey_ShouldVerifyKeysCorrectly()
    {
        Assert.True(DmsIntegrationService.ValidateApiKey("secret-123", "secret-123"));
        Assert.False(DmsIntegrationService.ValidateApiKey("wrong-key", "secret-123"));
        Assert.False(DmsIntegrationService.ValidateApiKey(null, "secret-123"));
        Assert.False(DmsIntegrationService.ValidateApiKey("secret-123", ""));
    }

    [Fact]
    public async Task UpsertDeliveryDetail_ShouldSaveAndRetrieveDetails()
    {
        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Deliver Critical Documents",
            Description = "Urgent legal contract",
            PriorityLevel = PriorityLevel.High,
            Deadline = DateTime.UtcNow.AddDays(1)
        };
        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        var service = CreateService();
        var dto = new UpsertTaskDeliveryDetailDTO
        {
            RecipientName = "Maria Santos",
            RecipientContact = "09171234567",
            DeliveryAddress = "Building A, Ayala Ave, Makati City",
            Area = "Makati",
            PackageDescription = "Sealed Envelope",
            CourierEmployeeId = "DRV-001"
        };

        var result = await service.UpsertDeliveryDetailAsync(task.Id, dto, Guid.NewGuid());

        Assert.True(result.IsSuccess);
        Assert.Equal("Maria Santos", result.Data!.RecipientName);
        Assert.Equal("Makati", result.Data.Area);
        Assert.Equal("Pending", result.Data.SyncStatus);

        var getResult = await service.GetDeliveryDetailAsync(task.Id);
        Assert.True(getResult.IsSuccess);
        Assert.Equal("Building A, Ayala Ave, Makati City", getResult.Data!.DeliveryAddress);
    }

    [Fact]
    public async Task ProcessStatusUpdate_ShouldUpdateDeliveryFieldsAndNotify()
    {
        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "Deliver Contract",
            Description = "Legal package",
            CreatedById = Guid.NewGuid()
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            TaskId = taskId,
            RecipientName = "Juan Dela Cruz",
            RecipientContact = "09123456789",
            DeliveryAddress = "Manila",
            DmsWaybillNo = "WB-2026-000001",
            SyncStatus = "Synced"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        var service = CreateService();
        var updateDto = new DmsStatusWebhookDTO
        {
            WaybillNo = "WB-2026-000001",
            StarsTaskId = taskId,
            Status = "In Transit",
            DmsStatus = "Out for Delivery",
            Timestamp = DateTime.UtcNow,
            DriverId = "DRV-001",
            Latitude = 14.5995,
            Longitude = 120.9842
        };

        var result = await service.ProcessStatusUpdateAsync(updateDto);

        Assert.True(result.IsSuccess);
        var updatedDetail = await _db.TaskDeliveryDetails.FirstAsync(d => d.TaskId == taskId);
        Assert.Equal("In Transit", updatedDetail.DmsStatus);
        Assert.Equal("Out for Delivery", updatedDetail.DmsRawStatus);
        Assert.Equal(14.5995, updatedDetail.DmsLatitude);

        _mockNotification.Verify(n => n.SendBulkNotificationAsync(
            It.IsAny<List<Guid>>(),
            NotificationType.TaskUpdated,
            It.Is<string>(s => s.Contains("In Transit")),
            It.Is<string>(s => s.Contains("WB-2026-000001")),
            taskId), Times.Once);
    }

    [Fact]
    public async Task ProcessPerformanceBatch_ShouldStoreAndAggregateMetrics()
    {
        var service = CreateService();
        var batch = new DmsPerformanceBatchDTO
        {
            Records = new List<DmsPerformanceRecordDTO>
            {
                new()
                {
                    WaybillNo = "WB-2026-000101",
                    DriverId = "DRV-001",
                    CompletedAt = DateTime.UtcNow.AddHours(-2),
                    SlaTargetAt = DateTime.UtcNow.AddHours(-1),
                    IsOnTime = true
                },
                new()
                {
                    WaybillNo = "WB-2026-000102",
                    DriverId = "DRV-001",
                    CompletedAt = DateTime.UtcNow.AddHours(-1),
                    SlaTargetAt = DateTime.UtcNow.AddHours(-3),
                    IsOnTime = false
                },
                new()
                {
                    WaybillNo = "WB-2026-000103",
                    DriverId = "DRV-002",
                    CompletedAt = DateTime.UtcNow.AddHours(-2),
                    SlaTargetAt = DateTime.UtcNow,
                    IsOnTime = true
                }
            }
        };

        var batchResult = await service.ProcessPerformanceBatchAsync(batch);
        Assert.True(batchResult.IsSuccess);
        Assert.Equal(3, batchResult.Data);

        var summaryAll = await service.GetPerformanceSummaryAsync();
        Assert.True(summaryAll.IsSuccess);
        Assert.Equal(3, summaryAll.Data!.TotalDeliveries);
        Assert.Equal(2, summaryAll.Data.OnTimeCount);
        Assert.Equal(1, summaryAll.Data.LateCount);
        Assert.Equal(66.67, summaryAll.Data.OnTimePercentage);

        var summaryDriver1 = await service.GetPerformanceSummaryAsync("DRV-001");
        Assert.True(summaryDriver1.IsSuccess);
        Assert.Equal(2, summaryDriver1.Data!.TotalDeliveries);
        Assert.Equal(1, summaryDriver1.Data.OnTimeCount);
        Assert.Equal(50.0, summaryDriver1.Data.OnTimePercentage);
    }

    [Fact]
    public async Task CreateDeliveryOrderForTask_WhenDmsReturnsSuccess_ShouldSaveWaybill()
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "COORD-001",
            FirstName = "Coordinator",
            LastName = "User",
            Email = "coord@example.com",
            PasswordHash = "hash"
        };
        _db.Users.Add(user);

        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "Ship Express Parts",
            Description = "Machine parts",
            PriorityLevel = PriorityLevel.Urgent,
            Deadline = DateTime.UtcNow.AddDays(1),
            CreatedById = user.Id,
            CreatedBy = user
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            TaskId = taskId,
            RecipientName = "ACME Industries",
            RecipientContact = "09201234567",
            DeliveryAddress = "Taguig City",
            Area = "Taguig",
            PackageDescription = "Spare Gears",
            CourierEmployeeId = "DRV-002"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        // Mock HTTP response from DMS
        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.Created,
                Content = JsonContent.Create(new
                {
                    waybillNo = "WB-2026-000789",
                    orderId = 42,
                    status = "Pending",
                    starsTaskId = taskId,
                    alreadyExisted = false
                })
            });

        var client = new HttpClient(mockHandler.Object);
        var service = CreateService(client);

        var result = await service.CreateDeliveryOrderForTaskAsync(taskId);

        Assert.True(result.IsSuccess, result.Message);
        Assert.Equal("WB-2026-000789", result.Data!.DmsWaybillNo);
        Assert.Equal(42, result.Data.DmsOrderId);
        Assert.Equal("Synced", result.Data.SyncStatus);

        var saved = await _db.TaskDeliveryDetails.FirstAsync(d => d.TaskId == taskId);
        Assert.Equal("WB-2026-000789", saved.DmsWaybillNo);
        Assert.Equal(42, saved.DmsOrderId);
    }
}
