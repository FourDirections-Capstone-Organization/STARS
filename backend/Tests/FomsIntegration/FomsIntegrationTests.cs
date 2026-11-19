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
}
