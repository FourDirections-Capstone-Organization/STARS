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
using Backend.Modules.FomsIntegration;
using Backend.Modules.Notifications;
using Backend.Modules.TaskManagement;
using Task = System.Threading.Tasks.Task;
using Xunit;

namespace Backend.Tests.FomsIntegration;

public class FomsIntegrationTests : IDisposable
{
    private readonly AppDbContext _db;
    private readonly Mock<INotificationService> _mockNotification;
    private readonly Mock<IAuditLogService> _mockAudit;
    private readonly Mock<ILogger<FomsIntegrationService>> _mockLogger;
    private readonly FomsIntegrationSettings _settings;

    public FomsIntegrationTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"STARS_FomsTest_{Guid.NewGuid()}")
            .Options;
        _db = new AppDbContext(options);

        _mockNotification = new Mock<INotificationService>();
        _mockAudit = new Mock<IAuditLogService>();
        _mockLogger = new Mock<ILogger<FomsIntegrationService>>();

        _settings = new FomsIntegrationSettings
        {
            BaseUrl = "https://foms.test.local",
            OutboundApiKey = "test-outbound-foms-key",
            InboundApiKey = "test-inbound-foms-key"
        };
    }

    public void Dispose()
    {
        _db.Database.EnsureDeleted();
        _db.Dispose();
    }

    private FomsIntegrationService CreateService(HttpClient? customClient = null)
    {
        var mockHttpFactory = new Mock<IHttpClientFactory>();
        var client = customClient ?? new HttpClient();
        mockHttpFactory.Setup(f => f.CreateClient(FomsIntegrationService.HttpClientName))
            .Returns(client);

        return new FomsIntegrationService(
            _db,
            mockHttpFactory.Object,
            Options.Create(_settings),
            _mockNotification.Object,
            _mockAudit.Object,
            _mockLogger.Object);
    }

    [Fact]
    public void ValidateApiKey_RejectsMissingOrMismatch_AcceptsMatch()
    {
        Assert.False(FomsIntegrationService.ValidateApiKey(null, "valid-key"));
        Assert.False(FomsIntegrationService.ValidateApiKey("wrong-key", "valid-key"));
        Assert.False(FomsIntegrationService.ValidateApiKey("", "valid-key"));
        Assert.True(FomsIntegrationService.ValidateApiKey("valid-key", "valid-key"));
    }

    [Fact]
    public async Task CreateEndorsementTaskAsync_CreatesTask_AndIsIdempotent()
    {
        var service = CreateService();

        var request = new FomsEndorsementRequestDTO
        {
            InvoiceNumber = "INV-2026-TEST-001",
            ClientName = "Acme Distribution Corp",
            ClientAddress = "123 Ayala Ave, Makati City",
            ClientContactPerson = "Maria Clara",
            ClientContactNumber = "09181234567",
            InvoiceAmount = 75000.50m,
            DueDate = DateTime.UtcNow.AddDays(30),
            InvoiceDocumentUrl = "https://foms.test/invoices/INV-001.pdf"
        };

        var firstResult = await service.CreateEndorsementTaskAsync(request);

        Assert.True(firstResult.IsSuccess);
        Assert.NotNull(firstResult.Data);
        Assert.Equal("INV-2026-TEST-001", firstResult.Data.InvoiceNumber);
        Assert.Equal(8, firstResult.Data.StarsTaskNumber.Length);

        var taskInDb = await _db.Tasks.FindAsync(firstResult.Data.StarsTaskId);
        Assert.NotNull(taskInDb);
        Assert.Contains("INV-2026-TEST-001", taskInDb.Title);

        var detailInDb = await _db.TaskFomsInvoiceDetails.FirstOrDefaultAsync(d => d.TaskId == firstResult.Data.StarsTaskId);
        Assert.NotNull(detailInDb);
        Assert.Equal(75000.50m, detailInDb.InvoiceAmount);

        // Test Idempotency: Calling with identical InvoiceNumber returns same task without duplicates
        var secondResult = await service.CreateEndorsementTaskAsync(request);
        Assert.True(secondResult.IsSuccess);
        Assert.Equal(firstResult.Data.StarsTaskId, secondResult.Data!.StarsTaskId);
        Assert.Equal(1, await _db.TaskFomsInvoiceDetails.CountAsync(d => d.InvoiceNumber == "INV-2026-TEST-001"));
    }

    [Fact]
    public async Task SendInvoiceEndorsementCompletionAsync_SendsCallback_UpdatesStatusToCompleted()
    {
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(r =>
                    r.Method == HttpMethod.Post &&
                    r.RequestUri!.ToString().Contains("/api/integration/stars/invoice-endorsed")),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"isSuccess\":true}")
            });

        var client = new HttpClient(handlerMock.Object);
        var service = CreateService(client);

        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TASK1234",
            Title = "Endorsement Task",
            Description = "Desc",
            Status = Models.Enums.TaskStatus.Completed,
            CreatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        var detail = new TaskFomsInvoiceDetail
        {
            TaskId = task.Id,
            InvoiceNumber = "INV-CALLBACK-001",
            ClientName = "Test Client",
            InvoiceAmount = 10000m,
            EndorsementStatus = "PendingEndorsement",
            FomsSyncStatus = "Pending",
            CreatedAt = DateTime.UtcNow
        };
        _db.TaskFomsInvoiceDetails.Add(detail);
        await _db.SaveChangesAsync();

        var submission = new SubmitSignedEndorsementDTO
        {
            ActualReceivedDate = DateTime.UtcNow.AddHours(-2),
            SignedCopyUrl = "https://stars.test/signed.pdf",
            DeliveryRemarks = "Delivered and signed"
        };

        var result = await service.SendInvoiceEndorsementCompletionAsync(task.Id, null, submission);

        Assert.True(result.IsSuccess);
        var updatedDetail = await _db.TaskFomsInvoiceDetails.FindAsync(detail.Id);
        Assert.Equal("Completed", updatedDetail!.EndorsementStatus);
        Assert.Equal("Synced", updatedDetail.FomsSyncStatus);
        Assert.NotNull(updatedDetail.LastSyncedAt);
    }

    [Fact]
    public async Task ProcessPaymentStatusWebhookAsync_UpsertsFinancialRecord()
    {
        var service = CreateService();

        var payload = new FomsPaymentStatusDTO
        {
            ClientAccountId = "CLI-999",
            ClientName = "Enterprise Global",
            InvoiceNumber = "INV-STATUS-01",
            CurrentStatus = "Overdue",
            TotalAmount = 50000m,
            AmountPaid = 10000m,
            OutstandingBalance = 40000m,
            NextDueDate = DateTime.UtcNow.AddDays(-5)
        };

        var res = await service.ProcessPaymentStatusWebhookAsync(payload);
        Assert.True(res.IsSuccess);

        var record = await _db.FomsClientFinancialStatuses.FirstOrDefaultAsync(s => s.InvoiceNumber == "INV-STATUS-01");
        Assert.NotNull(record);
        Assert.Equal("Overdue", record.CurrentStatus);
        Assert.Equal(40000m, record.OutstandingBalance);

        // Update to Paid
        payload.CurrentStatus = "Paid";
        payload.AmountPaid = 50000m;
        payload.OutstandingBalance = 0m;

        await service.ProcessPaymentStatusWebhookAsync(payload);
        record = await _db.FomsClientFinancialStatuses.FirstOrDefaultAsync(s => s.InvoiceNumber == "INV-STATUS-01");
        Assert.Equal("Paid", record!.CurrentStatus);
        Assert.Equal(0m, record.OutstandingBalance);
    }

    [Fact]
    public async Task ProcessOverdueAlertWebhookAsync_CreatesCollectionTask()
    {
        var service = CreateService();

        var alert = new FomsOverdueAlertDTO
        {
            InvoiceNumber = "INV-OVERDUE-01",
            ClientAccountId = "CLI-888",
            ClientName = "Delinquent Logistics",
            AmountDue = 120000m,
            DaysOverdue = 45,
            AgingStatus = "31-60",
            ClientContactPerson = "John Doe",
            ClientContactNumber = "09170001111"
        };

        var res = await service.ProcessOverdueAlertWebhookAsync(alert);
        Assert.True(res.IsSuccess);
        Assert.NotNull(res.Data);

        var task = await _db.Tasks.FindAsync(res.Data.StarsTaskId);
        Assert.NotNull(task);
        Assert.Equal(PriorityLevel.Urgent, task.PriorityLevel);
        Assert.Contains("Collection Follow-up", task.Title);

        var detail = await _db.TaskFomsCollectionDetails.FirstOrDefaultAsync(c => c.TaskId == task.Id);
        Assert.NotNull(detail);
        Assert.Equal(120000m, detail.AmountDue);
    }

    [Fact]
    public async Task GetDashboardFinancialSummaryAsync_ComputesAggregatesCorrectly()
    {
        var service = CreateService();

        _db.FomsClientFinancialStatuses.AddRange(
            new FomsClientFinancialStatus
            {
                ClientAccountId = "C1",
                ClientName = "Client 1",
                InvoiceNumber = "INV-1",
                CurrentStatus = "Overdue",
                OutstandingBalance = 20000m,
                TotalAmount = 20000m
            },
            new FomsClientFinancialStatus
            {
                ClientAccountId = "C2",
                ClientName = "Client 2",
                InvoiceNumber = "INV-2",
                CurrentStatus = "Paid",
                OutstandingBalance = 0m,
                TotalAmount = 15000m
            },
            new FomsClientFinancialStatus
            {
                ClientAccountId = "C1",
                ClientName = "Client 1",
                InvoiceNumber = "INV-3",
                CurrentStatus = "Sent",
                OutstandingBalance = 10000m,
                TotalAmount = 10000m
            }
        );
        await _db.SaveChangesAsync();

        var res = await service.GetDashboardFinancialSummaryAsync();
        Assert.True(res.IsSuccess);
        Assert.NotNull(res.Data);
        Assert.Equal(30000m, res.Data.TotalOutstandingBalance);
        Assert.Equal(20000m, res.Data.TotalOverdueBalance);
        Assert.Equal(3, res.Data.TotalInvoicesTracked);
        Assert.Equal(1, res.Data.OverdueInvoicesCount);
        Assert.Equal(1, res.Data.PaidInvoicesCount);
        Assert.Equal(1, res.Data.PendingInvoicesCount);
    }
}
