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

        // FR-044: Verify duplicate check appended an audit remark (TaskComment)
        var comment = await _db.TaskComments.FirstOrDefaultAsync(c => c.TaskId == firstResult.Data.StarsTaskId);
        Assert.NotNull(comment);
        Assert.Contains("Duplicate endorsement request received", comment.Content);
    }

    [Fact]
    public async Task CreateEndorsementTaskAsync_DuplicateEndorsementRequest_AppendsTaskCommentRemark_AndPreventsDuplicateTask_FR044()
    {
        var service = CreateService();

        var request = new FomsEndorsementRequestDTO
        {
            InvoiceNumber = "INV-FR044-DUPLICATE-001",
            ClientName = "FR044 Test Corp",
            ClientAddress = "456 Test Blvd, Taguig",
            InvoiceAmount = 120500.00m,
            SentDate = DateTime.UtcNow
        };

        // First call creates the task
        var firstResult = await service.CreateEndorsementTaskAsync(request);
        Assert.True(firstResult.IsSuccess);
        Assert.NotNull(firstResult.Data);
        var initialTaskId = firstResult.Data.StarsTaskId;

        var commentCountBefore = await _db.TaskComments.CountAsync(c => c.TaskId == initialTaskId);
        Assert.Equal(0, commentCountBefore);

        // Duplicate call with exact same invoice number
        var secondResult = await service.CreateEndorsementTaskAsync(request);
        Assert.True(secondResult.IsSuccess);
        Assert.NotNull(secondResult.Data);
        Assert.Equal(initialTaskId, secondResult.Data.StarsTaskId);

        // Ensure no duplicate task detail or task was created in DB
        var totalDetails = await _db.TaskFomsInvoiceDetails.CountAsync(d => d.InvoiceNumber == "INV-FR044-DUPLICATE-001");
        Assert.Equal(1, totalDetails);

        // Ensure TaskComment audit remark was appended per FR-044
        var comments = await _db.TaskComments.Where(c => c.TaskId == initialTaskId).ToListAsync();
        Assert.Single(comments);
        Assert.Contains("[FOMS Endorsement Sync] Duplicate endorsement request received from FOMS for invoice INV-FR044-DUPLICATE-001", comments[0].Content);
    }

    [Fact]
    public async Task CreateEndorsementTaskAsync_WithActiveCoordinators_AssignsOptimalCoordinator_AndNotifiesAndAudits()
    {
        var service = CreateService();

        // Seed 2 coordinators with different workloads
        var coord1 = new User
        {
            Id = Guid.NewGuid(),
            Email = "coord1@test.local",
            PasswordHash = "hash",
            FirstName = "Alice",
            LastName = "Coordinator",
            Username = "alice.coord",
            Role = UserRole.Coordinator,
            EmploymentStatus = "Active",
            IsActive = true,
            IsDeactivated = false
        };
        var coord2 = new User
        {
            Id = Guid.NewGuid(),
            Email = "coord2@test.local",
            PasswordHash = "hash",
            FirstName = "Bob",
            LastName = "Coordinator",
            Username = "bob.coord",
            Role = UserRole.Coordinator,
            EmploymentStatus = "Active",
            IsActive = true,
            IsDeactivated = false
        };

        // Give coord1 an active task assignment so coord2 has lower workload
        var existingTask = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TASK0001",
            Title = "Existing Task",
            Status = Models.Enums.TaskStatus.InProgress,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.AddRange(coord1, coord2);
        _db.Tasks.Add(existingTask);
        _db.TaskAssignments.Add(new TaskAssignment
        {
            Id = Guid.NewGuid(),
            TaskId = existingTask.Id,
            AssignedUserId = coord1.Id,
            AssignedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        var request = new FomsEndorsementRequestDTO
        {
            InvoiceNumber = "INV-SCOPING-001",
            ClientAccountId = "CLI-SCOPING-1",
            ClientName = "Optimal Logistics Inc",
            InvoiceAmount = 95000m,
            SentDate = DateTime.UtcNow
        };

        var result = await service.CreateEndorsementTaskAsync(request);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal("Bob Coordinator", result.Data.AssignedTo);

        // Verify TaskAssignment was created for Bob
        var assignment = await _db.TaskAssignments.FirstOrDefaultAsync(a => a.TaskId == result.Data.StarsTaskId);
        Assert.NotNull(assignment);
        Assert.Equal(coord2.Id, assignment.AssignedUserId);

        // Verify Notification (FR-033) was dispatched
        _mockNotification.Verify(n => n.SendNotificationAsync(
            coord2.Id,
            NotificationType.TaskAssigned,
            It.Is<string>(s => s.Contains("Invoice Endorsement Task Assigned")),
            It.Is<string>(s => s.Contains("INV-SCOPING-001")),
            result.Data.StarsTaskId), Times.Once);

        // Verify Audit Log (FR-046) was recorded
        _mockAudit.Verify(a => a.LogAsync(
            It.IsAny<Guid?>(),
            AuditActionType.Create,
            "TaskManagement",
            result.Data.StarsTaskId,
            null,
            It.Is<string>(s => s.Contains("INV-SCOPING-001") && s.Contains("Bob Coordinator")),
            "TaskManagement",
            null,
            null), Times.Once);
    }

    [Fact]
    public async Task SendInvoiceEndorsementCompletionAsync_WhenHttpFails_SetsStatusFailed_SendsNotification_KeepsTaskCompleted()
    {
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.InternalServerError)
            {
                Content = new StringContent("HTTP Error 500.30 - ASP.NET Core app failed to start")
            });

        var client = new HttpClient(handlerMock.Object);
        var service = CreateService(client);

        var reviewerId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TASKFAIL",
            Title = "Endorsement Task",
            Status = Models.Enums.TaskStatus.Completed,
            CreatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        var detail = new TaskFomsInvoiceDetail
        {
            TaskId = task.Id,
            InvoiceNumber = "INV-FAIL-001",
            ClientName = "Fail Test Client",
            InvoiceAmount = 15000m,
            EndorsementStatus = "PendingEndorsement",
            FomsSyncStatus = "Pending",
            CreatedAt = DateTime.UtcNow
        };
        _db.TaskFomsInvoiceDetails.Add(detail);
        await _db.SaveChangesAsync();

        var result = await service.SendInvoiceEndorsementCompletionAsync(task.Id, reviewerId);

        Assert.False(result.IsSuccess);
        var updatedDetail = await _db.TaskFomsInvoiceDetails.FindAsync(detail.Id);
        Assert.Equal("Failed", updatedDetail!.FomsSyncStatus);
        Assert.Contains("500", updatedDetail.LastSyncError);

        // Task status remains strictly Completed (FSM preservation)
        var updatedTask = await _db.Tasks.FindAsync(task.Id);
        Assert.Equal(Models.Enums.TaskStatus.Completed, updatedTask!.Status);

        // Notification dispatched to reviewer
        _mockNotification.Verify(n => n.SendNotificationAsync(
            reviewerId,
            NotificationType.TaskUpdated,
            It.Is<string>(s => s.Contains("FOMS Endorsement Sync Failed")),
            It.Is<string>(s => s.Contains("INV-FAIL-001")),
            task.Id), Times.Once);
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

    [Fact]
    public async Task ProcessPaymentStatusWebhookAsync_PaidInvoice_ResolvesOpenCollectionTask_AndNotifiesCoordinator()
    {
        var service = CreateService();

        var coordinator = new User
        {
            Id = Guid.NewGuid(),
            Username = "coord_resolver",
            Email = "coord_resolver@speedex.com",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        _db.Users.Add(coordinator);

        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-COL-001",
            Title = "[Collection Follow-up] Invoice INV-COL-001 - Acme Corp",
            Status = Models.Enums.TaskStatus.InProgress,
            PriorityLevel = PriorityLevel.Urgent,
            Deadline = DateTime.UtcNow.AddDays(7),
            CreatedById = coordinator.Id,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        _db.TaskAssignments.Add(new TaskAssignment
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            AssignedUserId = coordinator.Id,
            AssignedAt = DateTime.UtcNow
        });

        var collectionDetail = new TaskFomsCollectionDetail
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            InvoiceNumber = "INV-COL-001",
            ClientAccountId = "CLI-ACME",
            ClientName = "Acme Corp",
            AmountDue = 85000m,
            DaysOverdue = 15,
            AgingStatus = "1-30",
            DueDate = DateTime.UtcNow.AddDays(-15)
        };
        _db.TaskFomsCollectionDetails.Add(collectionDetail);
        await _db.SaveChangesAsync();

        var payload = new FomsPaymentStatusDTO
        {
            InvoiceNumber = "INV-COL-001",
            ClientAccountId = "CLI-ACME",
            ClientName = "Acme Corp",
            InvoiceStatus = "Approved",
            PaymentStatus = "Paid",
            DueStatus = "Normal",
            AgingBucket = "Current",
            OutstandingBalance = 0m,
            TotalAmount = 85000m,
            AmountPaid = 85000m
        };

        var res = await service.ProcessPaymentStatusWebhookAsync(payload);

        Assert.True(res.IsSuccess);

        // Verify open collection task was resolved to Completed
        var updatedTask = await _db.Tasks.FindAsync(task.Id);
        Assert.NotNull(updatedTask);
        Assert.Equal(Models.Enums.TaskStatus.Completed, updatedTask.Status);

        // Verify TaskComment remark was added per Step 6
        var comment = await _db.TaskComments.FirstOrDefaultAsync(c => c.TaskId == task.Id);
        Assert.NotNull(comment);
        Assert.Contains("Full payment settled for invoice INV-COL-001", comment.Content);
        Assert.Contains("Follow-up concluded", comment.Content);

        // Verify Coordinator notification was dispatched
        _mockNotification.Verify(n => n.SendNotificationAsync(
            coordinator.Id,
            NotificationType.TaskCompleted,
            It.Is<string>(s => s.Contains("Payment") || s.Contains("Concluded")),
            It.Is<string>(s => s.Contains("INV-COL-001")),
            task.Id), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ProcessPaymentStatusWebhookAsync_OverdueInvoice_DispatchesAlertNotification()
    {
        var service = CreateService();

        var coordinator = new User
        {
            Id = Guid.NewGuid(),
            Username = "coord_overdue",
            Email = "coord_overdue@speedex.com",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        _db.Users.Add(coordinator);

        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-INV-002",
            Title = "[FOMS Endorsement] Invoice INV-OVERDUE-99 - Global Corp",
            Status = Models.Enums.TaskStatus.InProgress,
            PriorityLevel = PriorityLevel.Medium,
            Deadline = DateTime.UtcNow.AddDays(7),
            CreatedById = coordinator.Id,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        _db.TaskAssignments.Add(new TaskAssignment
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            AssignedUserId = coordinator.Id,
            AssignedAt = DateTime.UtcNow
        });

        var invDetail = new TaskFomsInvoiceDetail
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            InvoiceNumber = "INV-OVERDUE-99",
            ClientName = "Global Corp",
            InvoiceAmount = 64000m
        };
        _db.TaskFomsInvoiceDetails.Add(invDetail);
        await _db.SaveChangesAsync();

        var payload = new FomsPaymentStatusDTO
        {
            InvoiceNumber = "INV-OVERDUE-99",
            ClientAccountId = "CLI-GLOBAL",
            ClientName = "Global Corp",
            InvoiceStatus = "Sent",
            PaymentStatus = "Unpaid",
            DueStatus = "Overdue",
            AgingBucket = "1-30",
            OutstandingBalance = 64000m,
            TotalAmount = 64000m,
            AmountPaid = 0m
        };

        var res = await service.ProcessPaymentStatusWebhookAsync(payload);

        Assert.True(res.IsSuccess);

        // Verify Overdue notification was sent to assigned coordinator
        _mockNotification.Verify(n => n.SendNotificationAsync(
            coordinator.Id,
            NotificationType.TaskOverdue,
            "Invoice Overdue Alert",
            It.Is<string>(s => s.Contains("INV-OVERDUE-99") && s.Contains("64,000.00")),
            task.Id), Times.Once);
    }

    [Fact]
    public async Task GetDashboardFinancialSummaryAsync_CoordinatorRole_ScopesToManagedClientsOnly()
    {
        var service = CreateService();

        var coordA = new User
        {
            Id = Guid.NewGuid(),
            Username = "coord_alpha",
            Email = "coord_alpha@speedex.com",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        var coordB = new User
        {
            Id = Guid.NewGuid(),
            Username = "coord_bravo",
            Email = "coord_bravo@speedex.com",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        _db.Users.AddRange(coordA, coordB);

        // Task A managed by coordA
        var taskA = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-A",
            Title = "[FOMS Endorsement] Invoice INV-ALPHA - Client Alpha",
            Status = Models.Enums.TaskStatus.InProgress,
            Deadline = DateTime.UtcNow.AddDays(10),
            CreatedById = coordA.Id,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        // Task B managed by coordB
        var taskB = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-B",
            Title = "[FOMS Endorsement] Invoice INV-BRAVO - Client Bravo",
            Status = Models.Enums.TaskStatus.InProgress,
            Deadline = DateTime.UtcNow.AddDays(10),
            CreatedById = coordB.Id,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _db.Tasks.AddRange(taskA, taskB);

        _db.TaskAssignments.AddRange(
            new TaskAssignment { Id = Guid.NewGuid(), TaskId = taskA.Id, AssignedUserId = coordA.Id, AssignedAt = DateTime.UtcNow },
            new TaskAssignment { Id = Guid.NewGuid(), TaskId = taskB.Id, AssignedUserId = coordB.Id, AssignedAt = DateTime.UtcNow }
        );

        _db.TaskFomsInvoiceDetails.AddRange(
            new TaskFomsInvoiceDetail { Id = Guid.NewGuid(), TaskId = taskA.Id, InvoiceNumber = "INV-ALPHA", ClientName = "Client Alpha", InvoiceAmount = 50000m },
            new TaskFomsInvoiceDetail { Id = Guid.NewGuid(), TaskId = taskB.Id, InvoiceNumber = "INV-BRAVO", ClientName = "Client Bravo", InvoiceAmount = 30000m }
        );

        _db.FomsClientFinancialStatuses.AddRange(
            new FomsClientFinancialStatus
            {
                ClientAccountId = "CLI-ALPHA",
                ClientName = "Client Alpha",
                InvoiceNumber = "INV-ALPHA",
                CurrentStatus = "Overdue",
                OutstandingBalance = 50000m,
                TotalAmount = 50000m
            },
            new FomsClientFinancialStatus
            {
                ClientAccountId = "CLI-BRAVO",
                ClientName = "Client Bravo",
                InvoiceNumber = "INV-BRAVO",
                CurrentStatus = "Overdue",
                OutstandingBalance = 30000m,
                TotalAmount = 30000m
            }
        );
        await _db.SaveChangesAsync();

        // 1. Scoped query for Coordinator Alpha
        var scopedRes = await service.GetDashboardFinancialSummaryAsync(coordA.Id, UserRole.Coordinator);
        Assert.True(scopedRes.IsSuccess);
        Assert.NotNull(scopedRes.Data);
        Assert.Equal(50000m, scopedRes.Data.TotalOutstandingBalance);
        Assert.Equal(50000m, scopedRes.Data.TotalOverdueBalance);
        Assert.Equal(1, scopedRes.Data.OverdueInvoicesCount);
        Assert.Single(scopedRes.Data.TopOutstandingClients);
        Assert.Equal("Client Alpha", scopedRes.Data.TopOutstandingClients[0].ClientName);

        // 2. Unscoped / Company-wide query for Manager
        var managerRes = await service.GetDashboardFinancialSummaryAsync(Guid.NewGuid(), UserRole.Manager);
        Assert.True(managerRes.IsSuccess);
        Assert.NotNull(managerRes.Data);
        Assert.Equal(80000m, managerRes.Data.TotalOutstandingBalance);
        Assert.Equal(80000m, managerRes.Data.TotalOverdueBalance);
        Assert.Equal(2, managerRes.Data.OverdueInvoicesCount);
        Assert.Equal(2, managerRes.Data.TopOutstandingClients.Count);
    }

    [Fact]
    public async Task ProcessOverdueAlertWebhookAsync_DuplicateAlert_AppendsRemarkAndDoesNotDuplicate_FR044()
    {
        var service = CreateService();

        var alertDto = new FomsOverdueAlertDTO
        {
            InvoiceNumber = "INV-2026-COLLECT-DUP-01",
            ClientAccountId = "CLI-DUP-01",
            ClientName = "Duplicate Test Logistics Corp",
            AmountDue = 88000m,
            DueDate = DateTime.UtcNow.AddDays(-15),
            DaysOverdue = 15,
            AgingStatus = "1-30"
        };

        // First alert creates the collection task
        var firstResult = await service.ProcessOverdueAlertWebhookAsync(alertDto);
        Assert.True(firstResult.IsSuccess);
        Assert.NotNull(firstResult.Data);
        var initialTaskId = firstResult.Data.StarsTaskId;

        var commentCountBefore = await _db.TaskComments.CountAsync(c => c.TaskId == initialTaskId);
        Assert.Equal(0, commentCountBefore);

        // Duplicate alert arrives for same invoice
        var secondResult = await service.ProcessOverdueAlertWebhookAsync(alertDto);
        Assert.True(secondResult.IsSuccess);
        Assert.NotNull(secondResult.Data);
        Assert.Equal(initialTaskId, secondResult.Data.StarsTaskId);
        Assert.Contains("duplicate remark appended (FR-044)", secondResult.Data.Message);

        // Verify only 1 collection task and detail exists
        Assert.Equal(1, await _db.TaskFomsCollectionDetails.CountAsync(c => c.InvoiceNumber == alertDto.InvoiceNumber));

        // Verify audit remark (TaskComment) was logged
        var comments = await _db.TaskComments.Where(c => c.TaskId == initialTaskId).ToListAsync();
        Assert.Single(comments);
        Assert.Contains("[FOMS Overdue Alert] Duplicate overdue alert received", comments[0].Content);
        Assert.Contains("FR-044", comments[0].Content);
    }

    [Fact]
    public async Task SendCollectionOutcomeAsync_DispatchesCallbackToFoms_AndCompletesTask()
    {
        HttpRequestMessage? capturedRequest = null;
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"success\":true,\"message\":\"Outcome recorded\"}")
            });

        var client = new HttpClient(handlerMock.Object);
        var service = CreateService(client);

        var coordId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-COL01",
            Title = "[Collection Follow-up] Invoice INV-COL-001 - Test Corp",
            Status = Models.Enums.TaskStatus.InProgress,
            CreatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        var detail = new TaskFomsCollectionDetail
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            InvoiceNumber = "INV-COL-001",
            ClientAccountId = "CLI-001",
            ClientName = "Test Corp",
            AmountDue = 55000m,
            DaysOverdue = 20,
            AgingStatus = "1-30",
            RoutedAt = DateTime.UtcNow
        };
        _db.TaskFomsCollectionDetails.Add(detail);
        await _db.SaveChangesAsync();

        var submitDto = new SubmitCollectionOutcomeDTO
        {
            Outcome = "Promised to Pay",
            PromisedPaymentDate = DateTime.UtcNow.AddDays(7),
            ActionTaken = "Phone Conference with Finance Head",
            Notes = "Client confirmed wire transfer on Monday."
        };

        var result = await service.SendCollectionOutcomeAsync(task.Id, submitDto, coordId, "Maria Santos");

        Assert.True(result.IsSuccess);

        // Verify task state transitioned to Completed
        var updatedTask = await _db.Tasks.FindAsync(task.Id);
        Assert.NotNull(updatedTask);
        Assert.Equal(Models.Enums.TaskStatus.Completed, updatedTask.Status);

        // Verify remark comment logged
        var comment = await _db.TaskComments.FirstOrDefaultAsync(c => c.TaskId == task.Id);
        Assert.NotNull(comment);
        Assert.Contains("[Collection Outcome] Recorded outcome: Promised to Pay", comment.Content);
        Assert.Contains("Phone Conference", comment.Content);

        // Verify HTTP request sent to FOMS
        Assert.NotNull(capturedRequest);
        Assert.Equal(HttpMethod.Post, capturedRequest.Method);
        Assert.Contains("/api/integration/stars/collection-outcome", capturedRequest.RequestUri?.ToString());
        Assert.True(capturedRequest.Headers.Contains("X-Api-Key"));
    }

    [Fact]
    public async Task SendCollectionOutcomeAsync_WhenHttpFails_PreservesCompletedFsmState()
    {
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.InternalServerError)
            {
                Content = new StringContent("FOMS Database Connection Timeout")
            });

        var client = new HttpClient(handlerMock.Object);
        var service = CreateService(client);

        var coordId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-COL02",
            Title = "[Collection Follow-up] Invoice INV-COL-002 - Error Corp",
            Status = Models.Enums.TaskStatus.InProgress,
            CreatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        var detail = new TaskFomsCollectionDetail
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            InvoiceNumber = "INV-COL-002",
            ClientAccountId = "CLI-002",
            ClientName = "Error Corp",
            AmountDue = 45000m,
            DaysOverdue = 45,
            AgingStatus = "31-60",
            RoutedAt = DateTime.UtcNow
        };
        _db.TaskFomsCollectionDetails.Add(detail);
        await _db.SaveChangesAsync();

        var submitDto = new SubmitCollectionOutcomeDTO
        {
            Outcome = "Unreachable",
            ActionTaken = "Multiple Unanswered Phone Calls",
            Notes = "Sent email demand notice."
        };

        var result = await service.SendCollectionOutcomeAsync(task.Id, submitDto, coordId, "Maria Santos");

        // Callback returned failure
        Assert.False(result.IsSuccess);
        Assert.Contains("500", result.Message);

        // Task still completes locally (FSM integrity)
        var updatedTask = await _db.Tasks.FindAsync(task.Id);
        Assert.NotNull(updatedTask);
        Assert.Equal(Models.Enums.TaskStatus.Completed, updatedTask.Status);

        // Notification sent to coordinator
        _mockNotification.Verify(n => n.SendNotificationAsync(
            coordId,
            NotificationType.TaskUpdated,
            "FOMS Collection Sync Failed",
            It.Is<string>(msg => msg.Contains("could not be synced to FOMS")),
            task.Id), Times.Once);
    }

    // ─── Integration 4: Client Account Sync Tests ─────────────────────────────

    [Fact]
    public async Task ProcessClientSyncWebhookAsync_NewClient_CreatesRecordAsUnassigned()
    {
        var service = CreateService();

        var syncDto = new FomsClientSyncDTO
        {
            ClientAccountId = "CLI-TEST-001",
            ClientName = "Acme Logistics Inc.",
            ContactPerson = "John Doe",
            ContactNumber = "09171234567",
            Email = "john.doe@acme.com",
            Address = "100 Logistics Way, Pasig City",
            Status = "Active"
        };

        var result = await service.ProcessClientSyncWebhookAsync(syncDto);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal("CLI-TEST-001", result.Data.ClientAccountId);
        Assert.Null(result.Data.AssignedCoordinatorId); // Newly created are Unassigned
        Assert.Equal("Active", result.Data.Status);

        var saved = await _db.FomsClientAccounts.FirstOrDefaultAsync(c => c.ClientAccountId == "CLI-TEST-001");
        Assert.NotNull(saved);
        Assert.Null(saved.AssignedCoordinatorId);
        Assert.Equal("Acme Logistics Inc.", saved.ClientName);
    }

    [Fact]
    public async Task ProcessClientSyncWebhookAsync_DuplicatePayload_UpdatesIdempotentlyWithoutDuplication()
    {
        var service = CreateService();

        var initialDto = new FomsClientSyncDTO
        {
            ClientAccountId = "CLI-IDEMP-001",
            ClientName = "Beta Enterprise",
            ContactPerson = "Original Contact",
            Status = "Active"
        };
        await service.ProcessClientSyncWebhookAsync(initialDto);

        // Assign a coordinator
        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "MGR-001",
            Email = "mgr@speedex.com",
            Username = "mgr",
            FirstName = "Manager",
            LastName = "Boss",
            Role = UserRole.Manager,
            PasswordHash = "hash"
        };
        var coord = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "COR-001",
            Email = "cor@speedex.com",
            Username = "cor",
            FirstName = "Coord",
            LastName = "One",
            Role = UserRole.Coordinator,
            PasswordHash = "hash"
        };
        _db.Users.AddRange(manager, coord);
        await _db.SaveChangesAsync();

        await service.AssignClientCoordinatorAsync("CLI-IDEMP-001", coord.Id, manager.Id);

        // Send updated sync
        var updateDto = new FomsClientSyncDTO
        {
            ClientAccountId = "CLI-IDEMP-001",
            ClientName = "Beta Enterprise Updated",
            ContactPerson = "New Contact Person",
            Status = "Active"
        };
        var updateResult = await service.ProcessClientSyncWebhookAsync(updateDto);

        Assert.True(updateResult.IsSuccess);
        var count = await _db.FomsClientAccounts.CountAsync(c => c.ClientAccountId == "CLI-IDEMP-001");
        Assert.Equal(1, count); // No duplicate records created!

        var updated = await _db.FomsClientAccounts.FirstOrDefaultAsync(c => c.ClientAccountId == "CLI-IDEMP-001");
        Assert.NotNull(updated);
        Assert.Equal("Beta Enterprise Updated", updated.ClientName);
        Assert.Equal("New Contact Person", updated.ContactPerson);
        Assert.Equal(coord.Id, updated.AssignedCoordinatorId); // Preserved coordinator assignment!
    }

    [Fact]
    public async Task ProcessClientSyncWebhookAsync_ValidAccountHandler_MatchesStarsUser()
    {
        var service = CreateService();

        var handlerUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-MATCH-001",
            Email = "handler@speedex.com",
            Username = "handler",
            FirstName = "Handler",
            LastName = "User",
            Role = UserRole.Coordinator,
            PasswordHash = "hash"
        };
        _db.Users.Add(handlerUser);
        await _db.SaveChangesAsync();

        var syncDto = new FomsClientSyncDTO
        {
            ClientAccountId = "CLI-HANDLER-001",
            ClientName = "Gamma Corp",
            AccountHandler = "EMP-MATCH-001",
            Status = "Active"
        };

        var result = await service.ProcessClientSyncWebhookAsync(syncDto);

        Assert.True(result.IsSuccess);
        Assert.Equal(handlerUser.Id, result.Data!.AccountHandlerUserId);
        Assert.Equal("EMP-MATCH-001", result.Data.AccountHandlerEmployeeNumber);
    }

    [Fact]
    public async Task ProcessClientSyncWebhookAsync_InvalidAccountHandler_LeavesBlankAndNotifiesManager()
    {
        var service = CreateService();

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "MGR-NOTIF-001",
            Email = "manager.alert@speedex.com",
            Username = "mgralert",
            FirstName = "Manager",
            LastName = "Alert",
            Role = UserRole.Manager,
            PasswordHash = "hash"
        };
        _db.Users.Add(manager);
        await _db.SaveChangesAsync();

        var syncDto = new FomsClientSyncDTO
        {
            ClientAccountId = "CLI-UNMATCHED-001",
            ClientName = "Delta Services",
            AccountHandler = "NON-EXISTENT-EMP-999",
            Status = "Active"
        };

        var result = await service.ProcessClientSyncWebhookAsync(syncDto);

        Assert.True(result.IsSuccess);
        Assert.Null(result.Data!.AccountHandlerUserId);
        Assert.Equal("NON-EXISTENT-EMP-999", result.Data.AccountHandlerEmployeeNumber);

        // Dispatched in-app notification alert to the Manager (FR-033)
        _mockNotification.Verify(n => n.SendNotificationAsync(
            manager.Id,
            NotificationType.TaskUpdated,
            "Unmatched FOMS Account Handler",
            It.Is<string>(msg => msg.Contains("NON-EXISTENT-EMP-999")),
            null), Times.Once);
    }

    [Fact]
    public async Task AssignClientCoordinatorAsync_ManagerAssignsCoordinator_SuccessfullyUpdates()
    {
        var service = CreateService();

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "MGR-ASSIGN-01",
            Email = "mgr.assign@speedex.com",
            Username = "mrgassign",
            FirstName = "Manager",
            LastName = "Lead",
            Role = UserRole.Manager,
            PasswordHash = "hash"
        };
        var coordinator = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "COR-ASSIGN-01",
            Email = "coord.assign@speedex.com",
            Username = "coordassign",
            FirstName = "Maria",
            LastName = "Santos",
            Role = UserRole.Coordinator,
            PasswordHash = "hash"
        };
        _db.Users.AddRange(manager, coordinator);

        var client = new FomsClientAccount
        {
            Id = Guid.NewGuid(),
            ClientAccountId = "CLI-ASSIGN-001",
            ClientName = "Epsilon Retail Inc.",
            Status = "Active",
            AssignedCoordinatorId = null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _db.FomsClientAccounts.Add(client);
        await _db.SaveChangesAsync();

        var result = await service.AssignClientCoordinatorAsync("CLI-ASSIGN-001", coordinator.Id, manager.Id);

        Assert.True(result.IsSuccess);
        Assert.Equal(coordinator.Id, result.Data!.AssignedCoordinatorId);
        Assert.Equal("Maria Santos", result.Data.AssignedCoordinatorName);

        // Verification of database update
        var updated = await _db.FomsClientAccounts.FirstOrDefaultAsync(c => c.ClientAccountId == "CLI-ASSIGN-001");
        Assert.NotNull(updated);
        Assert.Equal(coordinator.Id, updated.AssignedCoordinatorId);

        // Verification of in-app notification to assigned coordinator (FR-033)
        _mockNotification.Verify(n => n.SendNotificationAsync(
            coordinator.Id,
            NotificationType.TaskAssigned,
            "Client Account Assigned",
            It.Is<string>(msg => msg.Contains("CLI-ASSIGN-001")),
            null), Times.Once);

        // Verification of AuditLog record (FR-046)
        _mockAudit.Verify(a => a.LogAsync(
            manager.Id,
            AuditActionType.Update,
            "FomsClientAccount",
            client.Id,
            null,
            It.Is<string>(desc => desc.Contains("Maria Santos")),
            "FomsIntegration",
            null,
            null), Times.Once);
    }

    [Fact]
    public async Task GetClientAccountsAsync_CoordinatorRole_ScopesToAssignedClientsOnly_FR011()
    {
        var service = CreateService();

        var coord1 = Guid.NewGuid();
        var coord2 = Guid.NewGuid();

        _db.FomsClientAccounts.AddRange(
            new FomsClientAccount
            {
                Id = Guid.NewGuid(),
                ClientAccountId = "CLI-SCOPE-1",
                ClientName = "Client 1 for Coord 1",
                AssignedCoordinatorId = coord1,
                Status = "Active"
            },
            new FomsClientAccount
            {
                Id = Guid.NewGuid(),
                ClientAccountId = "CLI-SCOPE-2",
                ClientName = "Client 2 for Coord 2",
                AssignedCoordinatorId = coord2,
                Status = "Active"
            },
            new FomsClientAccount
            {
                Id = Guid.NewGuid(),
                ClientAccountId = "CLI-SCOPE-3",
                ClientName = "Client 3 Unassigned",
                AssignedCoordinatorId = null,
                Status = "Active"
            }
        );
        await _db.SaveChangesAsync();

        var result = await service.GetClientAccountsAsync(UserRole.Coordinator, coord1);

        Assert.True(result.IsSuccess);
        Assert.Single(result.Data!);
        Assert.Equal("CLI-SCOPE-1", result.Data![0].ClientAccountId);
    }

    [Fact]
    public async Task GetClientAccountsAsync_ManagerRole_SeesAllClients_FR012()
    {
        var service = CreateService();

        var coord1 = Guid.NewGuid();
        var managerId = Guid.NewGuid();

        _db.FomsClientAccounts.AddRange(
            new FomsClientAccount
            {
                Id = Guid.NewGuid(),
                ClientAccountId = "CLI-MGR-1",
                ClientName = "Client Alpha",
                AssignedCoordinatorId = coord1,
                Status = "Active"
            },
            new FomsClientAccount
            {
                Id = Guid.NewGuid(),
                ClientAccountId = "CLI-MGR-2",
                ClientName = "Client Beta",
                AssignedCoordinatorId = null,
                Status = "Inactive"
            }
        );
        await _db.SaveChangesAsync();

        var result = await service.GetClientAccountsAsync(UserRole.Manager, managerId);

        Assert.True(result.IsSuccess);
        Assert.True(result.Data!.Count >= 2);
        Assert.Contains(result.Data, c => c.ClientAccountId == "CLI-MGR-1");
        Assert.Contains(result.Data, c => c.ClientAccountId == "CLI-MGR-2");
    }

    [Fact]
    public async Task CreateEndorsementTaskAsync_InactiveClient_BlocksNewTaskCreation()
    {
        var service = CreateService();

        var inactiveClient = new FomsClientAccount
        {
            Id = Guid.NewGuid(),
            ClientAccountId = "CLI-INACTIVE-01",
            ClientName = "Defunct Enterprises",
            Status = "Inactive"
        };
        _db.FomsClientAccounts.Add(inactiveClient);
        await _db.SaveChangesAsync();

        var request = new FomsEndorsementRequestDTO
        {
            InvoiceNumber = "INV-BLOCKED-001",
            ClientAccountId = "CLI-INACTIVE-01",
            ClientName = "Defunct Enterprises",
            InvoiceAmount = 50000m
        };

        var result = await service.CreateEndorsementTaskAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Contains("inactive", result.Message, StringComparison.OrdinalIgnoreCase);

        // Verification that no task was created
        var taskExists = await _db.Tasks.AnyAsync(t => t.Title.Contains("INV-BLOCKED-001"));
        Assert.False(taskExists);
    }

    [Fact]
    public async Task ProcessClientSyncWebhookAsync_MalformedPayload_RejectsAndNotifiesManager_FR046()
    {
        var service = CreateService();

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "MGR-MALFORMED",
            Email = "manager.err@speedex.com",
            Username = "mgrerr",
            FirstName = "Manager",
            LastName = "ErrorReceiver",
            Role = UserRole.Manager,
            PasswordHash = "hash"
        };
        _db.Users.Add(manager);
        await _db.SaveChangesAsync();

        var invalidDto = new FomsClientSyncDTO
        {
            ClientAccountId = "", // Malformed: missing required ClientAccountId
            ClientName = "Missing Account Id Corp"
        };

        var result = await service.ProcessClientSyncWebhookAsync(invalidDto);

        Assert.False(result.IsSuccess);
        Assert.Contains("required", result.Message);

        // Verification of Manager notification alert (FR-033)
        _mockNotification.Verify(n => n.SendNotificationAsync(
            manager.Id,
            NotificationType.TaskUpdated,
            "Client Sync Payload Rejected",
            It.Is<string>(msg => msg.Contains("validation failure")),
            null), Times.Once);

        // Verification of AuditLog record (FR-046)
        _mockAudit.Verify(a => a.LogAsync(
            null,
            AuditActionType.Create,
            "FomsClientAccount",
            Guid.Empty,
            null,
            It.Is<string>(desc => desc.Contains("Rejected malformed")),
            "FomsIntegration",
            null,
            null), Times.Once);
    }

    // ═════════════════════════════════════════════════════════════════════════════
    // INTEGRATION 5: FOMS Late/Invalid Liquidation -> STARS Liquidation Correction Task
    // ═════════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task CreateLiquidationCorrectionTaskAsync_ValidRequest_CreatesTaskAndRoutesToOptimalCoordinator()
    {
        var service = CreateService();

        var coordinator = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "COORD-LIQ-01",
            Email = "coord.liq@speedex.com",
            Username = "coordliq01",
            FirstName = "Carlos",
            LastName = "Coordinator",
            Role = UserRole.Coordinator,
            EmploymentStatus = "Active",
            PasswordHash = "hash"
        };
        _db.Users.Add(coordinator);

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "MGR-LIQ-01",
            Email = "mgr.liq@speedex.com",
            Username = "mgrliq01",
            FirstName = "Manny",
            LastName = "Manager",
            Role = UserRole.Manager,
            EmploymentStatus = "Active",
            PasswordHash = "hash"
        };
        _db.Users.Add(manager);
        await _db.SaveChangesAsync();

        var request = new FomsLiquidationCorrectionRequestDTO
        {
            RequestId = "LIQ-2026-TEST-001",
            LiquidationId = 101,
            Requester = "Juan Dela Cruz",
            RequesterEmployeeId = "EMP-005",
            DeliveryReference = "WB-998877",
            LiquidationStatus = "For Correction",
            CorrectionReason = "Missing official BIR receipt for fuel purchase",
            DueDate = DateTime.UtcNow.AddDays(2),
            Amount = 3500.50m,
            Remarks = "Please submit original receipt to finance"
        };

        var result = await service.CreateLiquidationCorrectionTaskAsync(request);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal("LIQ-2026-TEST-001", result.Data.RequestId);
        Assert.Equal("Carlos Coordinator", result.Data.AssignedTo);
        Assert.Equal(8, result.Data.StarsTaskNumber.Length);

        // Verify task persisted in database
        var task = await _db.Tasks.FindAsync(result.Data.StarsTaskId);
        Assert.NotNull(task);
        Assert.Contains("LIQ-2026-TEST-001", task.Title);
        Assert.Contains("Juan Dela Cruz", task.Title);
        Assert.Equal(Models.Enums.TaskStatus.InProgress, task.Status);
        Assert.Equal(PriorityLevel.High, task.PriorityLevel);
        Assert.Equal(TaskClassification.SpecialTask, task.Classification);

        // Verify detail record persisted
        var detail = await _db.TaskFomsLiquidationDetails.FirstOrDefaultAsync(d => d.TaskId == task.Id);
        Assert.NotNull(detail);
        Assert.Equal("LIQ-2026-TEST-001", detail.RequestId);
        Assert.Equal(101, detail.LiquidationId);
        Assert.Equal("Juan Dela Cruz", detail.Requester);
        Assert.Equal("EMP-005", detail.RequesterEmployeeId);
        Assert.Equal("WB-998877", detail.DeliveryReference);
        Assert.Equal("For Correction", detail.LiquidationStatus);
        Assert.Equal(3500.50m, detail.Amount);
        Assert.Equal("PendingCorrection", detail.CorrectionStatus);
        Assert.Equal("Pending", detail.FomsSyncStatus);

        // Verify notifications sent to Coordinator and Manager (FR-033)
        _mockNotification.Verify(n => n.SendNotificationAsync(
            coordinator.Id,
            NotificationType.TaskAssigned,
            It.Is<string>(t => t.Contains("Liquidation Correction Task Assigned")),
            It.Is<string>(m => m.Contains("LIQ-2026-TEST-001")),
            task.Id), Times.Once);

        // Verify audit logging (FR-046)
        _mockAudit.Verify(a => a.LogAsync(
            It.IsAny<Guid?>(),
            AuditActionType.Create,
            "TaskManagement",
            task.Id,
            null,
            It.Is<string>(d => d.Contains("LIQ-2026-TEST-001")),
            "TaskManagement",
            null,
            null), Times.Once);
    }

    [Fact]
    public async Task CreateLiquidationCorrectionTaskAsync_DuplicateRequestId_AppendsCommentWithoutCreatingDuplicateTask_FR044()
    {
        var service = CreateService();

        var request = new FomsLiquidationCorrectionRequestDTO
        {
            RequestId = "LIQ-DUP-001",
            LiquidationId = 202,
            Requester = "Maria Santos",
            LiquidationStatus = "For Correction",
            CorrectionReason = "Incomplete itemized list",
            Amount = 1500m
        };

        var firstResult = await service.CreateLiquidationCorrectionTaskAsync(request);
        Assert.True(firstResult.IsSuccess);
        var initialTaskId = firstResult.Data!.StarsTaskId;

        var countAfterFirst = await _db.Tasks.CountAsync(t => t.Title.Contains("LIQ-DUP-001"));
        Assert.Equal(1, countAfterFirst);

        // Second duplicate request
        var duplicateRequest = new FomsLiquidationCorrectionRequestDTO
        {
            RequestId = "LIQ-DUP-001",
            LiquidationId = 202,
            Requester = "Maria Santos",
            LiquidationStatus = "For Correction",
            CorrectionReason = "Incomplete itemized list - REMINDER",
            Amount = 1500m
        };

        var secondResult = await service.CreateLiquidationCorrectionTaskAsync(duplicateRequest);
        Assert.True(secondResult.IsSuccess);
        Assert.Equal(initialTaskId, secondResult.Data!.StarsTaskId);
        Assert.Contains("duplicate remark appended", secondResult.Data.Message);

        // Verification: Exactly 1 task exists (no duplicate created)
        var countAfterSecond = await _db.Tasks.CountAsync(t => t.Title.Contains("LIQ-DUP-001"));
        Assert.Equal(1, countAfterSecond);

        // Verification: TaskComment appended per FR-044
        var comments = await _db.TaskComments.Where(c => c.TaskId == initialTaskId).ToListAsync();
        Assert.Contains(comments, c => c.Content.Contains("FR-044") && c.Content.Contains("LIQ-DUP-001"));
    }

    [Fact]
    public async Task CreateLiquidationCorrectionTaskAsync_RejectedStatus_SetsUrgentPriority()
    {
        var service = CreateService();

        var request = new FomsLiquidationCorrectionRequestDTO
        {
            RequestId = "LIQ-REJ-001",
            Requester = "Pedro Penduko",
            LiquidationStatus = "Rejected",
            CorrectionReason = "Voucher was disallowed by internal audit",
            Amount = 8200m
        };

        var result = await service.CreateLiquidationCorrectionTaskAsync(request);

        Assert.True(result.IsSuccess);
        var task = await _db.Tasks.FindAsync(result.Data!.StarsTaskId);
        Assert.NotNull(task);
        Assert.Equal(PriorityLevel.Urgent, task.PriorityLevel);
    }

    [Fact]
    public async Task SubmitLiquidationCorrectionAsync_ValidReceipt_UpdatesStatusAndAttachesReceipt()
    {
        var service = CreateService();

        var coordId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-LIQ01",
            Title = "[Liquidation Correction] LIQ-SUB-001 - Juan",
            Status = Models.Enums.TaskStatus.InProgress,
            CreatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        var detail = new TaskFomsLiquidationDetail
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            RequestId = "LIQ-SUB-001",
            Requester = "Juan",
            LiquidationStatus = "For Correction",
            CorrectionReason = "Missing receipt",
            CorrectionStatus = "PendingCorrection",
            FomsSyncStatus = "Pending"
        };
        _db.TaskFomsLiquidationDetails.Add(detail);
        await _db.SaveChangesAsync();

        var submission = new SubmitLiquidationCorrectionDTO
        {
            CorrectedReceiptsUrl = "https://blob.speedex.com/receipts/corrected_receipt_001.pdf",
            Remarks = "Obtained original BIR receipt from Shell gas station"
        };

        var result = await service.SubmitLiquidationCorrectionAsync(task.Id, submission, coordId);

        Assert.True(result.IsSuccess);
        Assert.Equal("https://blob.speedex.com/receipts/corrected_receipt_001.pdf", result.Data!.CorrectedReceiptsUrl);
        Assert.Equal("Corrected", result.Data.CorrectionStatus);
        Assert.Equal(Models.Enums.TaskStatus.DonePendingReview, task.Status);

        // Verify TaskComment attached per FR-018
        var comment = await _db.TaskComments.FirstOrDefaultAsync(c => c.TaskId == task.Id);
        Assert.NotNull(comment);
        Assert.Contains("Corrected receipts attached", comment.Content);
        Assert.Contains("Shell gas station", comment.Content);
    }

    [Fact]
    public async Task SendLiquidationCorrectionCallbackAsync_Success_DispatchesCallbackAndSetsCallbackSuccess()
    {
        HttpRequestMessage? capturedRequest = null;
        string? capturedBody = null;
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) =>
            {
                capturedRequest = req;
                if (req.Content != null)
                {
                    capturedBody = req.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                }
            })
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"isSuccess\":true,\"message\":\"Liquidation correction received\"}")
            });

        var client = new HttpClient(handlerMock.Object);
        var service = CreateService(client);

        var coordId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-LIQCB1",
            Title = "[Liquidation Correction] LIQ-CB-001 - Juan",
            Status = Models.Enums.TaskStatus.DonePendingReview,
            CreatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        var detail = new TaskFomsLiquidationDetail
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            RequestId = "LIQ-CB-001",
            LiquidationId = 555,
            Requester = "Juan",
            LiquidationStatus = "For Correction",
            CorrectionReason = "Missing receipt",
            CorrectedReceiptsUrl = "https://blob.speedex.com/receipts/valid_receipt.png",
            ResolutionRemarks = "Receipt verified by Coordinator",
            CorrectionStatus = "Corrected",
            FomsSyncStatus = "Pending"
        };
        _db.TaskFomsLiquidationDetails.Add(detail);
        await _db.SaveChangesAsync();

        var result = await service.SendLiquidationCorrectionCallbackAsync(task.Id, coordId);

        Assert.True(result.IsSuccess);
        Assert.Equal("CallbackSuccess", detail.FomsSyncStatus);
        Assert.Equal(Models.Enums.TaskStatus.Completed, task.Status);
        Assert.NotNull(detail.LastSyncedAt);

        // Verify outbound HTTP request
        Assert.NotNull(capturedRequest);
        Assert.Equal(HttpMethod.Post, capturedRequest.Method);
        Assert.EndsWith("/api/integration/stars/liquidation-correction-callback", capturedRequest.RequestUri!.AbsolutePath);
        Assert.True(capturedRequest.Headers.Contains("X-Api-Key"));

        Assert.NotNull(capturedBody);
        Assert.Contains("LIQ-CB-001", capturedBody);
        Assert.Contains("555", capturedBody);
        Assert.Contains(task.Id.ToString(), capturedBody);
        Assert.Contains("https://blob.speedex.com/receipts/valid_receipt.png", capturedBody);
        Assert.Contains("Completed", capturedBody);
    }

    [Fact]
    public async Task SendLiquidationCorrectionCallbackAsync_FomsUnavailable_MarksFailedAndPreservesCompletedStatus()
    {
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.InternalServerError)
            {
                Content = new StringContent("{\"isSuccess\":false,\"message\":\"FOMS DB Error\"}")
            });

        var client = new HttpClient(handlerMock.Object);
        var service = CreateService(client);

        var coordId = Guid.NewGuid();
        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-LIQERR1",
            Title = "[Liquidation Correction] LIQ-ERR-001 - Juan",
            Status = Models.Enums.TaskStatus.DonePendingReview,
            CreatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        var detail = new TaskFomsLiquidationDetail
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            RequestId = "LIQ-ERR-001",
            Requester = "Juan",
            LiquidationStatus = "For Correction",
            CorrectionReason = "Missing receipt",
            CorrectedReceiptsUrl = "https://blob.speedex.com/receipts/error_test.jpg",
            CorrectionStatus = "Corrected",
            FomsSyncStatus = "Pending"
        };
        _db.TaskFomsLiquidationDetails.Add(detail);
        await _db.SaveChangesAsync();

        var result = await service.SendLiquidationCorrectionCallbackAsync(task.Id, coordId);

        Assert.False(result.IsSuccess);
        Assert.Equal("Failed", detail.FomsSyncStatus);
        Assert.NotNull(detail.LastSyncError);

        // Crucial FSM preservation: Task status remains Completed even though remote callback failed
        Assert.Equal(Models.Enums.TaskStatus.Completed, task.Status);

        // Verification of Coordinator alert
        _mockNotification.Verify(n => n.SendNotificationAsync(
            coordId,
            NotificationType.TaskUpdated,
            It.Is<string>(t => t.Contains("FOMS Liquidation Sync Failed")),
            It.Is<string>(m => m.Contains("LIQ-ERR-001")),
            task.Id), Times.Once);
    }

    [Fact]
    public async Task RetryLiquidationCorrectionCallbackAsync_SuccessfulRetry_UpdatesSyncStatus()
    {
        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"isSuccess\":true,\"message\":\"Success on retry\"}")
            });

        var client = new HttpClient(handlerMock.Object);
        var service = CreateService(client);

        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TK-RETRY01",
            Title = "[Liquidation Correction] LIQ-RETRY-001 - Juan",
            Status = Models.Enums.TaskStatus.Completed,
            CreatedAt = DateTime.UtcNow
        };
        _db.Tasks.Add(task);

        var detail = new TaskFomsLiquidationDetail
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            RequestId = "LIQ-RETRY-001",
            Requester = "Juan",
            LiquidationStatus = "For Correction",
            CorrectionReason = "Missing receipt",
            CorrectedReceiptsUrl = "https://blob.speedex.com/receipts/retry.jpg",
            CorrectionStatus = "Corrected",
            FomsSyncStatus = "Failed",
            LastSyncError = "Previous timeout"
        };
        _db.TaskFomsLiquidationDetails.Add(detail);
        await _db.SaveChangesAsync();

        var retryResult = await service.RetryLiquidationCorrectionCallbackAsync(task.Id);

        Assert.True(retryResult.IsSuccess);
        Assert.Equal("CallbackSuccess", detail.FomsSyncStatus);
        Assert.Null(detail.LastSyncError);
        Assert.NotNull(detail.LastSyncedAt);
    }
}
