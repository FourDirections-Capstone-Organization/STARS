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
        Assert.Equal("Out for Delivery", updatedDetail.DmsStatus);
        Assert.Equal("Out for Delivery", updatedDetail.DmsRawStatus);
        Assert.Equal(14.5995, updatedDetail.DmsLatitude);

        _mockNotification.Verify(n => n.SendBulkNotificationAsync(
            It.IsAny<List<Guid>>(),
            NotificationType.TaskUpdated,
            It.Is<string>(s => s.Contains("Out for Delivery")),
            It.Is<string>(s => s.Contains("WB-2026-000001")),
            taskId), Times.Once);
    }

    [Fact]
    public async Task ProcessStatusUpdate_ShouldCompleteTaskAndAssignments_WhenDelivered()
    {
        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "Deliver Urgent Invoice",
            Description = "FOMS Invoice Delivery",
            Status = Backend.Models.Enums.TaskStatus.InProgress,
            CreatedById = Guid.NewGuid(),
            Assignments = new List<TaskAssignment>
            {
                new() { TaskId = taskId, CompletionPercentage = 40 }
            }
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            TaskId = taskId,
            RecipientName = "Finance Dept",
            RecipientContact = "09123456789",
            DeliveryAddress = "BGC, Taguig",
            DmsWaybillNo = "WB-2026-000999",
            DmsStatus = "In Transit",
            SyncStatus = "Synced"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        var service = CreateService();
        var updateDto = new DmsStatusWebhookDTO
        {
            WaybillNo = "WB-2026-000999",
            StarsTaskId = taskId,
            Status = "Delivered",
            DmsStatus = "Delivered",
            Timestamp = DateTime.UtcNow
        };

        var result = await service.ProcessStatusUpdateAsync(updateDto);

        Assert.True(result.IsSuccess);
        var updatedTask = await _db.Tasks.Include(t => t.Assignments).FirstAsync(t => t.Id == taskId);
        Assert.Equal(Backend.Models.Enums.TaskStatus.Completed, updatedTask.Status);
        Assert.True(updatedTask.IsApproved);
        Assert.Equal(100, updatedTask.Assignments.First().CompletionPercentage);

        var updatedDetail = await _db.TaskDeliveryDetails.FirstAsync(d => d.TaskId == taskId);
        Assert.Equal("Delivered", updatedDetail.DmsStatus);
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

    [Fact]
    public async Task SyncDeliveryStatus_ShouldQueryDmsAndCompleteTask_WhenDelivered()
    {
        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "Batch Delivery Verification",
            Description = "Operations run",
            Status = Backend.Models.Enums.TaskStatus.InProgress,
            Assignments = new List<TaskAssignment>
            {
                new() { TaskId = taskId, CompletionPercentage = 50 }
            }
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            TaskId = taskId,
            RecipientName = "Logistics Hub",
            RecipientContact = "09181112233",
            DeliveryAddress = "Pasig City",
            DmsWaybillNo = "WB-2026-000456",
            DmsOrderId = 101,
            DmsStatus = "In Transit",
            SyncStatus = "Synced"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(r => r.Method == HttpMethod.Get && r.RequestUri!.ToString().Contains(taskId.ToString())),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = JsonContent.Create(new
                {
                    waybillNo = "WB-2026-000456",
                    orderId = 101,
                    status = "Delivered",
                    starsTaskId = taskId
                })
            });

        var client = new HttpClient(mockHandler.Object);
        var service = CreateService(client);

        var syncResult = await service.SyncDeliveryStatusForTaskAsync(taskId);

        Assert.True(syncResult.IsSuccess, syncResult.Message);
        Assert.Equal("Delivered", syncResult.Data!.DmsStatus);

        var updatedTask = await _db.Tasks.Include(t => t.Assignments).FirstAsync(t => t.Id == taskId);
        Assert.Equal(Backend.Models.Enums.TaskStatus.Completed, updatedTask.Status);
        Assert.True(updatedTask.IsApproved);
        Assert.Equal(100, updatedTask.Assignments.First().CompletionPercentage);
    }

    [Fact]
    public async Task GetPerformanceSummary_IncludesDeliveredTaskDeliveryDetails()
    {
        var service = CreateService();
        var taskId = Guid.NewGuid();
        var task = new Backend.Models.Task
        {
            Id = taskId,
            Title = "Parcel Delivery Task",
            Description = "Medical supplies",
            Deadline = DateTime.UtcNow.AddHours(2),
            Status = Backend.Models.Enums.TaskStatus.Completed,
            CreatedAt = DateTime.UtcNow.AddHours(-1)
        };
        var delivery = new TaskDeliveryDetail
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            Task = task,
            RecipientName = "Maria Santos",
            RecipientContact = "09171234567",
            DeliveryAddress = "Makati City",
            DmsWaybillNo = "WB-2026-999888",
            DmsStatus = "Delivered",
            CourierEmployeeId = "DRV-HERO-01",
            CreatedAt = DateTime.UtcNow.AddHours(-1),
            DmsLastSyncedAt = DateTime.UtcNow.AddMinutes(-30)
        };
        _db.Tasks.Add(task);
        _db.TaskDeliveryDetails.Add(delivery);
        await _db.SaveChangesAsync();

        var summary = await service.GetPerformanceSummaryAsync();
        Assert.True(summary.IsSuccess);
        Assert.Contains(summary.Data!.Records, r => r.WaybillNo == "WB-2026-999888");
        var record = summary.Data.Records.First(r => r.WaybillNo == "WB-2026-999888");
        Assert.Equal("DRV-HERO-01", record.DriverId);
        Assert.True(record.IsOnTime);
    }

    [Fact]
    public async Task GetPerformanceSummary_ResolvesDriverNamesFromUsersTable()
    {
        var activeDriver = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "DRV-101",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Email = "jdelacruz@example.com",
            IsActive = true,
            IsDeactivated = false,
            Username = "jdelacruz",
            PasswordHash = "hash",
            Role = UserRole.Courier
        };
        var inactiveDriver = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "DRV-102",
            FirstName = "Pedro",
            LastName = "Penduko",
            Email = "ppenduko@example.com",
            IsActive = false,
            IsDeactivated = true,
            Username = "ppenduko",
            PasswordHash = "hash",
            Role = UserRole.Courier
        };
        _db.Users.AddRange(activeDriver, inactiveDriver);

        _db.DmsDeliveryPerformances.AddRange(
            new DmsDeliveryPerformance
            {
                WaybillNo = "WB-PERF-01",
                DriverId = "DRV-101",
                CompletedAt = DateTime.UtcNow.AddMinutes(-10),
                SlaTargetAt = DateTime.UtcNow.AddMinutes(30),
                IsOnTime = true,
                ReceivedAt = DateTime.UtcNow
            },
            new DmsDeliveryPerformance
            {
                WaybillNo = "WB-PERF-02",
                DriverId = "DRV-102",
                CompletedAt = DateTime.UtcNow.AddMinutes(-5),
                SlaTargetAt = DateTime.UtcNow.AddMinutes(30),
                IsOnTime = true,
                ReceivedAt = DateTime.UtcNow
            },
            new DmsDeliveryPerformance
            {
                WaybillNo = "WB-PERF-03",
                DriverId = "UNKNOWN-999",
                CompletedAt = DateTime.UtcNow.AddMinutes(-2),
                SlaTargetAt = DateTime.UtcNow.AddMinutes(30),
                IsOnTime = true,
                ReceivedAt = DateTime.UtcNow
            }
        );
        await _db.SaveChangesAsync();

        var service = CreateService();
        var result = await service.GetPerformanceSummaryAsync();

        Assert.True(result.IsSuccess);
        var rec1 = result.Data!.Records.First(r => r.WaybillNo == "WB-PERF-01");
        Assert.Equal("Juan Dela Cruz", rec1.DriverName);
        Assert.True(rec1.DriverIsActive);

        var rec2 = result.Data.Records.First(r => r.WaybillNo == "WB-PERF-02");
        Assert.Equal("Pedro Penduko", rec2.DriverName);
        Assert.False(rec2.DriverIsActive);

        var rec3 = result.Data.Records.First(r => r.WaybillNo == "WB-PERF-03");
        Assert.Equal("UNKNOWN-999", rec3.DriverName);
        Assert.Null(rec3.DriverIsActive);
    }

    [Fact]
    public async Task GetDeliveryDetail_ResolvesCourierFullNameAndPodMetadata()
    {
        var driver = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "DRV-COUR-01",
            FirstName = "Maria",
            LastName = "Clara",
            IsActive = true,
            IsDeactivated = false,
            Username = "mclara",
            PasswordHash = "hash",
            Role = UserRole.Courier,
            Email = "mclara@example.com"
        };
        _db.Users.Add(driver);

        var taskId = Guid.NewGuid();
        var task = new Backend.Models.Task
        {
            Id = taskId,
            Title = "Delivery Task with POD",
            Description = "VIP Shipment",
            PriorityLevel = PriorityLevel.High,
            Deadline = DateTime.UtcNow.AddDays(1)
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            RecipientName = "Crisostomo Ibarra",
            RecipientContact = "09181112233",
            DeliveryAddress = "Intramuros, Manila",
            CourierEmployeeId = "DRV-COUR-01",
            DmsWaybillNo = "WB-POD-001",
            DmsStatus = "Delivered"
        };
        _db.TaskDeliveryDetails.Add(detail);

        var podAttachment = new TaskAttachment
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            FileName = "POD_WB-POD-001.jpg",
            FilePath = "https://dms.test.local/uploads/pod-001.jpg",
            FileSize = 1024,
            FileType = ".jpg",
            Description = "Proof of Delivery (POD) from DMS",
            UploadedById = driver.Id,
            CreatedAt = DateTime.UtcNow
        };
        _db.TaskAttachments.Add(podAttachment);
        await _db.SaveChangesAsync();

        var service = CreateService();
        var result = await service.GetDeliveryDetailAsync(taskId);

        Assert.True(result.IsSuccess);
        Assert.Equal("Maria Clara", result.Data!.CourierFullName);
        Assert.True(result.Data.CourierIsActive);
        Assert.Equal("POD_WB-POD-001.jpg", result.Data.PodFileName);
        Assert.Equal($"/api/dms-integration/tasks/{taskId}/pod/download?inline=true", result.Data.PodUrl);
        Assert.Equal("Maria Clara", result.Data.PodUploadedBy);
    }

    [Fact]
    public async Task ProcessStatusUpdate_PersistsPodAttachmentAndUpdatesStatus()
    {
        var taskId = Guid.NewGuid();
        var task = new Backend.Models.Task
        {
            Id = taskId,
            Title = "Status Update Task",
            Description = "Testing POD extraction",
            PriorityLevel = PriorityLevel.Medium,
            Deadline = DateTime.UtcNow.AddDays(1),
            Status = Backend.Models.Enums.TaskStatus.InProgress
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            RecipientName = "Test Recipient",
            RecipientContact = "09990001111",
            DeliveryAddress = "Quezon City",
            DmsWaybillNo = "WB-WEBHOOK-99",
            DmsStatus = "In Transit"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        var service = CreateService();
        var webhook = new DmsStatusWebhookDTO
        {
            WaybillNo = "WB-WEBHOOK-99",
            StarsTaskId = taskId,
            Status = "Delivered",
            DriverId = "DRV-NEW-99",
            PodUrl = "https://dms.test.local/uploads/signed-receipt.png",
            Timestamp = DateTime.UtcNow
        };

        var response = await service.ProcessStatusUpdateAsync(webhook);
        Assert.True(response.IsSuccess);

        var updatedTask = await _db.Tasks.FirstAsync(t => t.Id == taskId);
        Assert.Equal(Backend.Models.Enums.TaskStatus.Completed, updatedTask.Status);

        var updatedDetail = await _db.TaskDeliveryDetails.FirstAsync(d => d.TaskId == taskId);
        Assert.Equal("Delivered", updatedDetail.DmsStatus);
        Assert.Equal("DRV-NEW-99", updatedDetail.CourierEmployeeId);

        var attachment = await _db.TaskAttachments.FirstOrDefaultAsync(a => a.TaskId == taskId);
        Assert.NotNull(attachment);
        Assert.Contains("Proof of Delivery", attachment.Description);
        Assert.Equal("https://dms.test.local/uploads/signed-receipt.png", attachment.FilePath);
        Assert.Equal("signed-receipt.png", attachment.FileName);
    }

    [Fact]
    public async Task GetTaskPod_EnforcesRbacPermissionsCorrectly()
    {
        var managerId = Guid.NewGuid();
        var assignedCourierId = Guid.NewGuid();
        var unassignedCourierId = Guid.NewGuid();

        var managerUser = new User
        {
            Id = managerId,
            EmployeeNumber = "MGR-001",
            FirstName = "Manager",
            LastName = "User",
            Email = "mgr@example.com",
            Role = UserRole.Manager
        };
        var assignedCourierUser = new User
        {
            Id = assignedCourierId,
            EmployeeNumber = "DRV-ASSIGNED",
            FirstName = "Assigned",
            LastName = "Courier",
            Email = "assigned@example.com",
            Role = UserRole.Courier
        };
        var unassignedCourierUser = new User
        {
            Id = unassignedCourierId,
            EmployeeNumber = "DRV-UNASSIGNED",
            FirstName = "Unassigned",
            LastName = "Courier",
            Email = "unassigned@example.com",
            Role = UserRole.Courier
        };
        _db.Users.AddRange(managerUser, assignedCourierUser, unassignedCourierUser);

        var taskId = Guid.NewGuid();
        var task = new Backend.Models.Task
        {
            Id = taskId,
            Title = "RBAC POD Task",
            Description = "Confidential customer details",
            PriorityLevel = PriorityLevel.High,
            Deadline = DateTime.UtcNow.AddDays(1),
            IsConfidential = false,
            Assignments = new List<TaskAssignment>
            {
                new() { TaskId = taskId, AssignedUserId = assignedCourierId }
            }
        };
        _db.Tasks.Add(task);

        var podAttachment = new TaskAttachment
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            FileName = "POD_Proof.jpg",
            FilePath = "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
            Description = "Proof of Delivery (POD) from DMS",
            UploadedById = assignedCourierId,
            CreatedAt = DateTime.UtcNow
        };
        _db.TaskAttachments.Add(podAttachment);
        await _db.SaveChangesAsync();

        var service = CreateService();

        // 1. Manager has access
        var mgrResult = await service.GetTaskPodAsync(taskId, managerId, UserRole.Manager);
        Assert.True(mgrResult.IsSuccess);
        Assert.True(mgrResult.Data!.HasPod);
        Assert.Equal("POD_Proof.jpg", mgrResult.Data.FileName);

        // 2. Assigned Courier has access
        var assignedResult = await service.GetTaskPodAsync(taskId, assignedCourierId, UserRole.Courier);
        Assert.True(assignedResult.IsSuccess);
        Assert.True(assignedResult.Data!.HasPod);

        // 3. Unassigned Courier is Denied (403)
        var unassignedResult = await service.GetTaskPodAsync(taskId, unassignedCourierId, UserRole.Courier);
        Assert.False(unassignedResult.IsSuccess);
        Assert.Contains("Access denied", unassignedResult.Message);

        // 4. Confidential task: Courier is denied even if assigned
        task.IsConfidential = true;
        await _db.SaveChangesAsync();

        var confResult = await service.GetTaskPodAsync(taskId, assignedCourierId, UserRole.Courier);
        Assert.False(confResult.IsSuccess);
        Assert.Contains("Access denied: task is confidential", confResult.Message);

        // Manager still has access to confidential tasks
        var mgrConfResult = await service.GetTaskPodAsync(taskId, managerId, UserRole.Manager);
        Assert.True(mgrConfResult.IsSuccess);
    }

    [Fact]
    public async Task DownloadTaskPod_ReturnsBytesForBase64AndEnforcesRbac()
    {
        var managerId = Guid.NewGuid();
        var unauthorizedUserId = Guid.NewGuid();

        var managerUser = new User
        {
            Id = managerId,
            EmployeeNumber = "MGR-002",
            FirstName = "Manager",
            LastName = "Download",
            Email = "mgrdown@example.com",
            Role = UserRole.Manager
        };
        var unauthorizedUser = new User
        {
            Id = unauthorizedUserId,
            EmployeeNumber = "DSP-001",
            FirstName = "Dispatcher",
            LastName = "User",
            Email = "dsp@example.com",
            Role = UserRole.Dispatcher
        };
        _db.Users.AddRange(managerUser, unauthorizedUser);

        var taskId = Guid.NewGuid();
        var dummyBytes = new byte[] { 0x01, 0x02, 0x03, 0x04 };
        var base64Str = $"data:image/png;base64,{Convert.ToBase64String(dummyBytes)}";

        var task = new Backend.Models.Task
        {
            Id = taskId,
            Title = "Download POD Task",
            Description = "Test download",
            PriorityLevel = PriorityLevel.Medium,
            Deadline = DateTime.UtcNow.AddDays(1)
        };
        _db.Tasks.Add(task);

        var pod = new TaskAttachment
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            FileName = "delivery_receipt.png",
            FilePath = base64Str,
            Description = "Proof of Delivery (POD) from DMS",
            UploadedById = managerId,
            CreatedAt = DateTime.UtcNow
        };
        _db.TaskAttachments.Add(pod);
        await _db.SaveChangesAsync();

        var service = CreateService();

        // Unauthorized user (unassigned dispatcher)
        var unauthResult = await service.DownloadTaskPodAsync(taskId, unauthorizedUserId, UserRole.Dispatcher);
        Assert.Null(unauthResult);

        // Authorized Manager
        var authResult = await service.DownloadTaskPodAsync(taskId, managerId, UserRole.Manager);
        Assert.NotNull(authResult);
        Assert.Equal("delivery_receipt.png", authResult.Value.FileName);
        Assert.Equal("image/png", authResult.Value.ContentType);
        Assert.Equal(dummyBytes, authResult.Value.FileBytes);
    }

    [Fact]
    public async Task GetPendingOrders_NormalizesDateOnlyDeadlinesAndResolvesDriverName()
    {
        var driver = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "DRV-008",
            FirstName = "Ricardo",
            LastName = "Bautista",
            IsActive = true,
            IsDeactivated = false,
            Username = "rbautista",
            PasswordHash = "hash",
            Role = UserRole.Courier,
            Email = "rbautista@example.com"
        };
        _db.Users.Add(driver);
        await _db.SaveChangesAsync();

        var pendingOrdersJson = @"[
            {
                ""orderId"": 101,
                ""waybillNo"": ""WB-PENDING-001"",
                ""clientName"": ""Apex Logistics"",
                ""recipientName"": ""Juan Perez"",
                ""recipientContact"": ""09171234567"",
                ""recipientAddress"": ""123 Main St"",
                ""area"": ""Makati"",
                ""packageDescription"": ""Documents"",
                ""orderDate"": ""2026-11-10T02:00:00Z"",
                ""expectedDelivery"": ""2026-11-13T08:30:00Z"",
                ""driverEmployeeId"": ""DRV-008"",
                ""status"": ""Pending""
            },
            {
                ""orderId"": 102,
                ""waybillNo"": ""WB-PENDING-002"",
                ""clientName"": ""Global Supplies"",
                ""recipientName"": ""Maria Reyes"",
                ""recipientContact"": ""09187654321"",
                ""recipientAddress"": ""456 High St"",
                ""area"": ""Taguig"",
                ""packageDescription"": ""Hardware"",
                ""orderDate"": ""2026-11-10T03:00:00Z"",
                ""expectedDelivery"": ""2026-11-14T00:00:00"",
                ""driverId"": ""EMP-UNMAPPED"",
                ""status"": ""Pending""
            },
            {
                ""orderId"": 103,
                ""waybillNo"": ""WB-PENDING-003"",
                ""clientName"": ""Zenith Corp"",
                ""recipientName"": ""Carlos Tan"",
                ""recipientContact"": ""09191112222"",
                ""recipientAddress"": ""789 Bay St"",
                ""area"": ""Pasay"",
                ""packageDescription"": ""Electronics"",
                ""orderDate"": ""2026-11-10T04:00:00Z"",
                ""expectedDelivery"": ""2026-11-15T14:15:00Z"",
                ""status"": ""Pending""
            }
        ]";

        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("/api/integration/stars/pending-orders")),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(pendingOrdersJson, System.Text.Encoding.UTF8, "application/json")
            });

        var client = new HttpClient(mockHandler.Object);
        var service = CreateService(client);

        var result = await service.GetPendingOrdersAsync();

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal(3, result.Data.Count);

        // Order 101: mapped driver DRV-008 -> Ricardo Bautista
        var order101 = result.Data.First(o => o.OrderId == 101);
        Assert.Equal("DRV-008", order101.DriverEmployeeId);
        Assert.Equal("DRV-008", order101.DriverId);
        Assert.Equal("Ricardo Bautista", order101.DriverName);
        Assert.Equal("Ricardo Bautista", order101.CourierFullName);
        Assert.True(order101.DriverIsActive);
        Assert.Equal("2026-11-13", order101.ExpectedDeliveryDate);
        Assert.Equal(new DateTime(2026, 11, 13, 0, 0, 0, DateTimeKind.Utc), order101.ExpectedDelivery);

        // Order 102: unmapped driver EMP-UNMAPPED -> fallback to ID
        var order102 = result.Data.First(o => o.OrderId == 102);
        Assert.Equal("EMP-UNMAPPED", order102.DriverEmployeeId);
        Assert.Equal("EMP-UNMAPPED", order102.DriverId);
        Assert.Equal("EMP-UNMAPPED", order102.DriverName);
        Assert.Null(order102.DriverIsActive);
        Assert.Equal("2026-11-14", order102.ExpectedDeliveryDate);
        Assert.Equal(new DateTime(2026, 11, 14, 0, 0, 0, DateTimeKind.Utc), order102.ExpectedDelivery);

        // Order 103: unassigned driver
        var order103 = result.Data.First(o => o.OrderId == 103);
        Assert.Null(order103.DriverEmployeeId);
        Assert.Null(order103.DriverId);
        Assert.Equal("Unassigned", order103.DriverName);
        Assert.Equal("2026-11-15", order103.ExpectedDeliveryDate);
        Assert.Equal(new DateTime(2026, 11, 15, 0, 0, 0, DateTimeKind.Utc), order103.ExpectedDelivery);
    }

    [Fact]
    public async Task CreateDeliveryOrderForTask_PayloadIncludesDateOnlyDeadlineAndDriverKeys()
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "COORD-002",
            FirstName = "Coordinator",
            LastName = "User",
            Email = "coord2@example.com",
            PasswordHash = "hash"
        };
        var driver = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "DRV-008",
            FirstName = "Ricardo",
            LastName = "Bautista",
            Email = "rbautista2@example.com",
            PasswordHash = "hash"
        };
        _db.Users.AddRange(user, driver);

        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "Ship Spare Parts",
            Description = "Machine parts",
            PriorityLevel = PriorityLevel.High,
            Deadline = new DateTime(2026, 11, 20, 15, 45, 0, DateTimeKind.Utc),
            CreatedById = user.Id,
            CreatedBy = user
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            TaskId = taskId,
            RecipientName = "Beta Logistics",
            RecipientContact = "09201234567",
            DeliveryAddress = "Taguig City",
            Area = "Taguig",
            PackageDescription = "Spare Gears",
            CourierEmployeeId = "DRV-008"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        string capturedPayload = string.Empty;
        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.Method == HttpMethod.Post && req.RequestUri!.ToString().Contains("/api/integration/stars/delivery-orders")),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) =>
            {
                capturedPayload = req.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            })
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.Created,
                Content = JsonContent.Create(new
                {
                    waybillNo = "WB-2026-999999",
                    orderId = 999,
                    status = "Pending",
                    starsTaskId = taskId,
                    alreadyExisted = false
                })
            });

        var client = new HttpClient(mockHandler.Object);
        var service = CreateService(client);

        var result = await service.CreateDeliveryOrderForTaskAsync(taskId);

        Assert.True(result.IsSuccess);
        Assert.NotEmpty(capturedPayload);

        using var doc = System.Text.Json.JsonDocument.Parse(capturedPayload);
        var root = doc.RootElement;

        Assert.Equal("2026-11-20", root.GetProperty("expectedDelivery").GetString());
        Assert.Equal("2026-11-20", root.GetProperty("expectedDeliveryDate").GetString());
        Assert.Equal("2026-11-20", root.GetProperty("deadline").GetString());
        Assert.Equal("DRV-008", root.GetProperty("courierEmployeeId").GetString());
        Assert.Equal("DRV-008", root.GetProperty("driverEmployeeId").GetString());
        Assert.Equal("DRV-008", root.GetProperty("driverId").GetString());
        Assert.Equal("Ricardo Bautista", root.GetProperty("driverName").GetString());
    }

    [Fact]
    public async Task GetDeliveryDetail_IncludesDateOnlyDeadlineAndDriverAliases()
    {
        var driver = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "DRV-008",
            FirstName = "Ricardo",
            LastName = "Bautista",
            IsActive = true,
            IsDeactivated = false,
            Username = "rbautista3",
            PasswordHash = "hash",
            Role = UserRole.Courier,
            Email = "rbautista3@example.com"
        };
        _db.Users.Add(driver);

        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "Deliver Sensitive File",
            Description = "Confidential",
            PriorityLevel = PriorityLevel.Medium,
            Deadline = new DateTime(2026, 11, 25, 17, 0, 0, DateTimeKind.Utc)
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            RecipientName = "Gamma Corp",
            RecipientContact = "09120001111",
            DeliveryAddress = "Makati Ave",
            CourierEmployeeId = "DRV-008",
            DmsWaybillNo = "WB-DATE-001"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        var service = CreateService();
        var result = await service.GetDeliveryDetailAsync(taskId);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal("2026-11-25", result.Data.ExpectedDeliveryDate);
        Assert.Equal("DRV-008", result.Data.CourierEmployeeId);
        Assert.Equal("DRV-008", result.Data.DriverId);
        Assert.Equal("DRV-008", result.Data.DriverEmployeeId);
        Assert.Equal("Ricardo Bautista", result.Data.CourierFullName);
        Assert.Equal("Ricardo Bautista", result.Data.DriverName);
        Assert.True(result.Data.DriverIsActive);
    }

    [Fact]
    public async Task SyncDeliveryStatus_ParsesDriverEmployeeIdOrDriverId()
    {
        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "Ongoing Delivery",
            Description = "Package in transit",
            PriorityLevel = PriorityLevel.Medium,
            Deadline = DateTime.UtcNow.AddDays(1)
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            RecipientName = "Recipient A",
            RecipientContact = "09170002222",
            DeliveryAddress = "Pasig",
            DmsWaybillNo = "WB-SYNC-DRIVER-01",
            DmsStatus = "Pending"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.Method == HttpMethod.Get && req.RequestUri!.ToString().Contains("/api/integration/stars/delivery-orders/")),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = JsonContent.Create(new
                {
                    waybillNo = "WB-SYNC-DRIVER-01",
                    orderId = 555,
                    status = "In Transit",
                    driverEmployeeId = "DRV-008"
                })
            });

        var client = new HttpClient(mockHandler.Object);
        var service = CreateService(client);

        var result = await service.SyncDeliveryStatusForTaskAsync(taskId);

        Assert.True(result.IsSuccess);
        Assert.Equal("DRV-008", result.Data!.CourierEmployeeId);
        Assert.Equal("DRV-008", result.Data.DriverId);

        var savedDetail = await _db.TaskDeliveryDetails.FirstAsync(d => d.TaskId == taskId);
        Assert.Equal("DRV-008", savedDetail.CourierEmployeeId);
    }

    [Fact]
    public async Task QaDefectScenarios_VerifyDmsSync_MidnightDeadlineNormalization_And_DriverIdKeyResolution()
    {
        // Scenario 1: Midnight deadline normalization
        // DMS passes ExpectedDelivery at UTC midnight (00:00:00Z) or date-only string.
        // STARS backend normalizes it to date-only string YYYY-MM-DD and UTC midnight DateTime without offset shifts.
        var driver = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-008",
            FirstName = "Ricardo",
            LastName = "Bautista",
            Role = UserRole.Courier,
            Username = "rbautista_qa",
            Email = "rbautista_qa@example.com"
        };
        _db.Users.Add(driver);
        await _db.SaveChangesAsync();

        var pendingOrdersJson = @"[
            {
                ""orderId"": 801,
                ""waybillNo"": ""WB-QA-001"",
                ""clientName"": ""QA Logistics"",
                ""recipientName"": ""Juan Dela Cruz"",
                ""recipientContact"": ""09170009999"",
                ""recipientAddress"": ""100 Ayala Ave, Makati"",
                ""area"": ""Makati"",
                ""packageDescription"": ""Sensitive Legal Docs"",
                ""orderDate"": ""2026-11-10T01:00:00Z"",
                ""expectedDelivery"": ""2026-11-25T00:00:00Z"",
                ""driverEmployeeId"": ""EMP-008"",
                ""status"": ""Pending""
            }
        ]";

        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("/api/integration/stars/pending-orders")),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(pendingOrdersJson, System.Text.Encoding.UTF8, "application/json")
            });

        var client = new HttpClient(mockHandler.Object);
        var service = CreateService(client);

        var result = await service.GetPendingOrdersAsync();

        Assert.True(result.IsSuccess);
        var order = Assert.Single(result.Data);

        // Verification of Scenario 1 (Date-only normalization, no timezone shift)
        Assert.Equal("2026-11-25", order.ExpectedDeliveryDate);
        Assert.Equal(new DateTime(2026, 11, 25, 0, 0, 0, DateTimeKind.Utc), order.ExpectedDelivery);

        // Verification of Scenario 2 (Driver ID as key and paired name resolution)
        Assert.Equal("EMP-008", order.DriverEmployeeId);
        Assert.Equal("EMP-008", order.DriverId);
        Assert.Equal("Ricardo Bautista", order.DriverName);
        Assert.Equal("Ricardo Bautista", order.CourierFullName);
    }

    [Fact]
    public async Task UpsertDeliveryDetail_CapturesAndPersistsCourierFullName_AndResolvesFromUsers()
    {
        // Scenario A: Persists explicit CourierFullName even if user unmapped in Users table
        var taskA = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Task A",
            Deadline = DateTime.UtcNow.AddDays(1)
        };
        _db.Tasks.Add(taskA);
        await _db.SaveChangesAsync();

        var service = CreateService();
        var dtoA = new UpsertTaskDeliveryDetailDTO
        {
            RecipientName = "Recipient A",
            RecipientContact = "09170001111",
            DeliveryAddress = "Taguig",
            CourierEmployeeId = "UNMAPPED-01",
            CourierFullName = "Explicit Driver Name"
        };

        var resultA = await service.UpsertDeliveryDetailAsync(taskA.Id, dtoA, Guid.NewGuid());
        Assert.True(resultA.IsSuccess);
        Assert.Equal("Explicit Driver Name", resultA.Data!.CourierFullName);
        Assert.Equal("Explicit Driver Name", resultA.Data.DriverName);

        var savedDetailA = await _db.TaskDeliveryDetails.FirstAsync(d => d.TaskId == taskA.Id);
        Assert.Equal("Explicit Driver Name", savedDetailA.CourierFullName);

        // Scenario B: Resolves CourierFullName from Users table when omitted in DTO
        var mappedUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-KNOWN-99",
            FirstName = "Andres",
            LastName = "Bonifacio",
            Role = UserRole.Courier,
            Username = "abonifacio",
            Email = "abonifacio@example.com"
        };
        _db.Users.Add(mappedUser);

        var taskB = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Task B",
            Deadline = DateTime.UtcNow.AddDays(1)
        };
        _db.Tasks.Add(taskB);
        await _db.SaveChangesAsync();

        var dtoB = new UpsertTaskDeliveryDetailDTO
        {
            RecipientName = "Recipient B",
            RecipientContact = "09170002222",
            DeliveryAddress = "Caloocan",
            CourierEmployeeId = "EMP-KNOWN-99"
        };

        var resultB = await service.UpsertDeliveryDetailAsync(taskB.Id, dtoB, Guid.NewGuid());
        Assert.True(resultB.IsSuccess);
        Assert.Equal("Andres Bonifacio", resultB.Data!.CourierFullName);

        var savedDetailB = await _db.TaskDeliveryDetails.FirstAsync(d => d.TaskId == taskB.Id);
        Assert.Equal("Andres Bonifacio", savedDetailB.CourierFullName);
    }

    [Fact]
    public async Task SyncDeliveryStatus_CapturesAndPersistsDriverNameFromDmsPayload_EvenWhenUnmappedInUsers()
    {
        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "DMS Status Sync Courier Name",
            Deadline = DateTime.UtcNow.AddDays(1)
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            RecipientName = "Recipient C",
            RecipientContact = "09170003333",
            DeliveryAddress = "Quezon City",
            DmsWaybillNo = "WB-SYNC-COURIER-NAME-01",
            DmsStatus = "Pending"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.Method == HttpMethod.Get && req.RequestUri!.ToString().Contains("/api/integration/stars/delivery-orders/")),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = JsonContent.Create(new
                {
                    waybillNo = "WB-SYNC-COURIER-NAME-01",
                    orderId = 777,
                    status = "In Transit",
                    driverEmployeeId = "EMP-UNMAPPED-55",
                    driverName = "Ricardo Bautista"
                })
            });

        var client = new HttpClient(mockHandler.Object);
        var service = CreateService(client);

        var result = await service.SyncDeliveryStatusForTaskAsync(taskId);

        Assert.True(result.IsSuccess);
        Assert.Equal("EMP-UNMAPPED-55", result.Data!.CourierEmployeeId);
        Assert.Equal("Ricardo Bautista", result.Data.CourierFullName);
        Assert.Equal("Ricardo Bautista", result.Data.DriverName);

        var savedDetail = await _db.TaskDeliveryDetails.FirstAsync(d => d.TaskId == taskId);
        Assert.Equal("EMP-UNMAPPED-55", savedDetail.CourierEmployeeId);
        Assert.Equal("Ricardo Bautista", savedDetail.CourierFullName);
    }

    [Fact]
    public async Task ProcessStatusUpdate_CapturesAndPersistsDriverNameFromWebhook()
    {
        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "Webhook Driver Name Task",
            CreatedById = Guid.NewGuid()
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            TaskId = taskId,
            RecipientName = "Webhook Recipient",
            RecipientContact = "09123456789",
            DeliveryAddress = "Mandaluyong",
            DmsWaybillNo = "WB-WEBHOOK-DRIVER-01",
            SyncStatus = "Synced"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        var service = CreateService();
        var updateDto = new DmsStatusWebhookDTO
        {
            WaybillNo = "WB-WEBHOOK-DRIVER-01",
            StarsTaskId = taskId,
            Status = "In Transit",
            DriverId = "EMP-UNMAPPED-88",
            DriverName = "Emilio Aguinaldo",
            Timestamp = DateTime.UtcNow
        };

        var result = await service.ProcessStatusUpdateAsync(updateDto);
        Assert.True(result.IsSuccess);

        var savedDetail = await _db.TaskDeliveryDetails.FirstAsync(d => d.TaskId == taskId);
        Assert.Equal("EMP-UNMAPPED-88", savedDetail.CourierEmployeeId);
        Assert.Equal("Emilio Aguinaldo", savedDetail.CourierFullName);
    }

    [Fact]
    public async Task GetPendingOrders_PreservesDmsDriverNameWhenUnmappedInUsers_AndFallsBackToIdWhenEmpty()
    {
        var pendingOrdersJson = @"[
            {
                ""orderId"": 901,
                ""waybillNo"": ""WB-PRESERVE-01"",
                ""clientName"": ""Preserve Logistics"",
                ""recipientName"": ""Juan Recipient"",
                ""recipientContact"": ""09170001234"",
                ""recipientAddress"": ""Makati"",
                ""area"": ""Makati"",
                ""orderDate"": ""2026-11-10T00:00:00Z"",
                ""expectedDelivery"": ""2026-11-20T00:00:00Z"",
                ""driverEmployeeId"": ""EMP-UNMAPPED-100"",
                ""driverName"": ""Ricardo Bautista"",
                ""status"": ""Pending""
            },
            {
                ""orderId"": 902,
                ""waybillNo"": ""WB-FALLBACK-02"",
                ""clientName"": ""Fallback Logistics"",
                ""recipientName"": ""Pedro Recipient"",
                ""recipientContact"": ""09170005678"",
                ""recipientAddress"": ""Pasay"",
                ""area"": ""Pasay"",
                ""orderDate"": ""2026-11-10T00:00:00Z"",
                ""expectedDelivery"": ""2026-11-20T00:00:00Z"",
                ""driverEmployeeId"": ""EMP-UNMAPPED-200"",
                ""driverName"": null,
                ""status"": ""Pending""
            }
        ]";

        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("/api/integration/stars/pending-orders")),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(pendingOrdersJson, System.Text.Encoding.UTF8, "application/json")
            });

        var client = new HttpClient(mockHandler.Object);
        var service = CreateService(client);

        var result = await service.GetPendingOrdersAsync();

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal(2, result.Data.Count);

        var order1 = result.Data.First(o => o.OrderId == 901);
        Assert.Equal("EMP-UNMAPPED-100", order1.DriverEmployeeId);
        Assert.Equal("Ricardo Bautista", order1.DriverName);

        var order2 = result.Data.First(o => o.OrderId == 902);
        Assert.Equal("EMP-UNMAPPED-200", order2.DriverEmployeeId);
        Assert.Equal("EMP-UNMAPPED-200", order2.DriverName);
    }

    [Fact]
    public async Task GetAllDeliveries_ReturnsPersistedCourierFullName_WhenDriverUnmappedInUsers()
    {
        var taskId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = taskId,
            Title = "Task with Persisted Courier Name",
            TaskNumber = "TSK-PERSIST-01"
        };
        _db.Tasks.Add(task);

        var detail = new TaskDeliveryDetail
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            RecipientName = "Recipient X",
            RecipientContact = "09170009999",
            DeliveryAddress = "Taguig",
            CourierEmployeeId = "EMP-UNMAPPED-777",
            CourierFullName = "Apolinario Mabini",
            DmsWaybillNo = "WB-PERSIST-01",
            DmsStatus = "Delivered"
        };
        _db.TaskDeliveryDetails.Add(detail);
        await _db.SaveChangesAsync();

        var service = CreateService();
        var result = await service.GetAllDeliveriesAsync();

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);

        var item = Assert.Single(result.Data, d => d.TaskId == taskId);
        Assert.Equal("EMP-UNMAPPED-777", item.CourierEmployeeId);
        Assert.Equal("Apolinario Mabini", item.CourierFullName);
        Assert.Equal("Apolinario Mabini", item.DriverName);
    }

    [Fact]
    public async Task GetAllDeliveries_AugmentsWithPendingOrders_WhenTaskDeliveryDetailsIsEmpty()
    {
        var pendingOrdersJson = @"[
            {
                ""orderId"": 901,
                ""waybillNo"": ""WB-DMS-AUTO-01"",
                ""clientName"": ""Apex Deliveries"",
                ""recipientName"": ""Elena Roxas"",
                ""recipientContact"": ""09170001234"",
                ""recipientAddress"": ""BGC Taguig"",
                ""area"": ""Taguig"",
                ""packageDescription"": ""Corporate Legal Dossier"",
                ""orderDate"": ""2026-11-11T09:00:00Z"",
                ""expectedDelivery"": ""2026-11-12T15:00:00Z"",
                ""driverEmployeeId"": ""EMP-008"",
                ""driverName"": ""Ricardo Bautista"",
                ""status"": ""Pending""
            }
        ]";

        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("/api/integration/stars/pending-orders")),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(pendingOrdersJson, System.Text.Encoding.UTF8, "application/json")
            });

        var client = new HttpClient(mockHandler.Object);
        var service = CreateService(client);

        var result = await service.GetAllDeliveriesAsync();

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        var delivery = Assert.Single(result.Data);
        Assert.Equal("WB-DMS-AUTO-01", delivery.DmsWaybillNo);
        Assert.Equal("Elena Roxas", delivery.RecipientName);
        Assert.Equal("Taguig", delivery.Area);
        Assert.Equal("EMP-008", delivery.CourierEmployeeId);
        Assert.Equal("Ricardo Bautista", delivery.CourierFullName);
        Assert.Equal("Pending", delivery.DmsStatus);
    }

    [Fact]
    public async Task GetAllDeliveries_HandlesDuplicateEmployeeNumbersSafely()
    {
        var taskId = Guid.NewGuid();
        _db.Tasks.Add(new Models.Task
        {
            Id = taskId,
            Title = "Task Duplicate Driver Check",
            TaskNumber = "TSK-DUP-01"
        });

        _db.Users.AddRange(
            new User
            {
                Id = Guid.NewGuid(),
                EmployeeNumber = "EMP-DUP-01",
                FirstName = "First",
                LastName = "Driver",
                Username = "driver1",
                Email = "driver1@example.com",
                PasswordHash = "hash",
                IsActive = true
            },
            new User
            {
                Id = Guid.NewGuid(),
                EmployeeNumber = "EMP-DUP-01",
                FirstName = "Duplicate",
                LastName = "Driver",
                Username = "driver2",
                Email = "driver2@example.com",
                PasswordHash = "hash",
                IsActive = true
            });

        _db.TaskDeliveryDetails.Add(new TaskDeliveryDetail
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            RecipientName = "Client Alpha",
            RecipientContact = "09171110000",
            DeliveryAddress = "Makati Ave",
            CourierEmployeeId = "EMP-DUP-01",
            DmsWaybillNo = "WB-DUP-01",
            DmsStatus = "In Transit"
        });
        await _db.SaveChangesAsync();

        var service = CreateService();
        var result = await service.GetAllDeliveriesAsync();

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        var item = Assert.Single(result.Data, d => d.TaskId == taskId);
        Assert.Equal("EMP-DUP-01", item.CourierEmployeeId);
        Assert.False(string.IsNullOrWhiteSpace(item.CourierFullName));
    }

    [Fact]
    public async Task GetAllDeliveries_AugmentsPreDeliveryOperationalTasksWithoutDeliveryDetails()
    {
        var taskId = Guid.NewGuid();
        _db.Tasks.Add(new Models.Task
        {
            Id = taskId,
            Title = "[Pre-Delivery] Delivery to Marco Polo - Waybill WB-TASK-ONLY-01",
            Description = "Pre-delivery operational validation for DMS Waybill WB-TASK-ONLY-01",
            TaskNumber = "TSK-PD-99",
            Status = Backend.Models.Enums.TaskStatus.InProgress,
            Deadline = DateTime.UtcNow.AddDays(2)
        });
        await _db.SaveChangesAsync();

        var service = CreateService();
        var result = await service.GetAllDeliveriesAsync();

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        var item = Assert.Single(result.Data, d => d.TaskId == taskId);
        Assert.Equal("WB-TASK-ONLY-01", item.DmsWaybillNo);
        Assert.Equal("Marco Polo", item.RecipientName);
        Assert.Equal("In Transit", item.DmsStatus);
    }
}
