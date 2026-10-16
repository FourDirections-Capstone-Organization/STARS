using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Notifications;
using Backend.Modules.TaskManagement;
using Backend.Modules.Utilities;

namespace Backend.Modules.FomsIntegration;

public class FomsIntegrationService : IFomsIntegrationService
{
    public const string HttpClientName = "foms";
    public const string ApiKeyHeaderName = "X-Api-Key";

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _http;
    private readonly FomsIntegrationSettings _settings;
    private readonly INotificationService _notificationService;
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<FomsIntegrationService> _logger;

    public FomsIntegrationService(
        AppDbContext db,
        IHttpClientFactory http,
        IOptions<FomsIntegrationSettings> settings,
        INotificationService notificationService,
        IAuditLogService auditLogService,
        ILogger<FomsIntegrationService> logger)
    {
        _db = db;
        _http = http;
        _settings = settings.Value;
        _notificationService = notificationService;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    public bool IsConfigured => _settings.CanCallFoms;

    public static bool ValidateApiKey(string? provided, string? expected)
    {
        if (string.IsNullOrWhiteSpace(provided) || string.IsNullOrWhiteSpace(expected)) return false;
        var a = SHA256.HashData(Encoding.UTF8.GetBytes(provided));
        var b = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        return CryptographicOperations.FixedTimeEquals(a, b);
    }

    /// <summary>
    /// Integration 1 (FOMS → STARS): Receives a finalized invoice from FOMS and creates an endorsement task in STARS.
    /// </summary>
    public async Task<ApiResponseDTO<FomsEndorsementResponseDTO>> CreateEndorsementTaskAsync(FomsEndorsementRequestDTO dto)
    {
        if (string.IsNullOrWhiteSpace(dto.InvoiceNumber))
            return ApiResponseDTO<FomsEndorsementResponseDTO>.Failure("InvoiceNumber is required");

        // Idempotency: If an endorsement detail already exists for this invoice, return existing task
        var existingDetail = await _db.TaskFomsInvoiceDetails
            .Include(d => d.Task)
            .FirstOrDefaultAsync(d => d.InvoiceNumber == dto.InvoiceNumber.Trim());

        if (existingDetail != null && existingDetail.Task != null)
        {
            return ApiResponseDTO<FomsEndorsementResponseDTO>.Success(new FomsEndorsementResponseDTO
            {
                IsSuccess = true,
                StarsTaskId = existingDetail.TaskId,
                StarsTaskNumber = existingDetail.Task.TaskNumber,
                InvoiceNumber = existingDetail.InvoiceNumber,
                Status = existingDetail.EndorsementStatus,
                Message = "Invoice endorsement task already exists in STARS (idempotent response)."
            });
        }

        // Determine creator/manager user
        var defaultCreatorId = await _db.Users
            .Where(u => u.Role == UserRole.Manager || u.Role == UserRole.Coordinator)
            .Select(u => u.Id)
            .FirstOrDefaultAsync();

        if (defaultCreatorId == Guid.Empty)
        {
            defaultCreatorId = await _db.Users.Select(u => u.Id).FirstOrDefaultAsync();
        }

        var taskNumber = TaskNumberGenerator.Generate(8);
        var now = DateTime.UtcNow;

        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = taskNumber,
            Title = $"[FOMS Endorsement] Invoice {dto.InvoiceNumber.Trim()} - {dto.ClientName.Trim()}",
            Description = $"Deliver finalized invoice {dto.InvoiceNumber.Trim()} to client {dto.ClientName.Trim()} for official receiving endorsement and signature.\n" +
                          $"Amount: ₱{dto.InvoiceAmount:N2}\n" +
                          $"Due Date: {(dto.DueDate.HasValue ? dto.DueDate.Value.ToString("yyyy-MM-dd") : "30 days upon receipt")}\n" +
                          $"Address: {dto.ClientAddress ?? "N/A"}\n" +
                          $"Contact: {dto.ClientContactPerson ?? "N/A"} ({dto.ClientContactNumber ?? "N/A"})\n" +
                          $"Document: {dto.InvoiceDocumentUrl ?? "Attached in FOMS"}\n" +
                          $"Remarks: {dto.Remarks ?? "Finalized invoice endorsement requested"}",
            PriorityLevel = PriorityLevel.Medium,
            Status = Models.Enums.TaskStatus.NotStarted,
            Classification = TaskClassification.SpecialTask,
            Deadline = dto.DueDate ?? now.AddDays(7),
            CreatedById = defaultCreatorId,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Tasks.Add(task);

        var endorsementDetail = new TaskFomsInvoiceDetail
        {
            TaskId = task.Id,
            InvoiceNumber = dto.InvoiceNumber.Trim(),
            ClientName = dto.ClientName.Trim(),
            ClientAddress = dto.ClientAddress?.Trim(),
            ClientContactPerson = dto.ClientContactPerson?.Trim(),
            ClientContactNumber = dto.ClientContactNumber?.Trim(),
            ClientEmail = dto.ClientEmail?.Trim(),
            InvoiceAmount = dto.InvoiceAmount,
            BillingDate = dto.BillingDate,
            DueDate = dto.DueDate,
            InvoiceDocumentUrl = dto.InvoiceDocumentUrl?.Trim(),
            EndorsementStatus = "PendingEndorsement",
            FomsSyncStatus = "Synced",
            LastSyncedAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.TaskFomsInvoiceDetails.Add(endorsementDetail);

        // Optimal Coordinator Assignment (workload distribution)
        var optimalCoordinator = await _db.Users
            .Where(u => u.Role == UserRole.Coordinator && u.EmploymentStatus == "Active")
            .OrderBy(u => _db.TaskAssignments.Count(a => a.AssignedUserId == u.Id && a.Task!.Status != Models.Enums.TaskStatus.Completed && a.Task!.Status != Models.Enums.TaskStatus.Cancelled))
            .FirstOrDefaultAsync();

        string? assignedCoordinatorName = null;
        if (optimalCoordinator != null)
        {
            _db.TaskAssignments.Add(new TaskAssignment
            {
                TaskId = task.Id,
                AssignedUserId = optimalCoordinator.Id,
                AssignedAt = now
            });
            task.Status = Models.Enums.TaskStatus.InProgress;
            assignedCoordinatorName = $"{optimalCoordinator.FirstName} {optimalCoordinator.LastName}".Trim();

            try
            {
                await _notificationService.SendNotificationAsync(
                    optimalCoordinator.Id,
                    NotificationType.TaskAssigned,
                    "New Invoice Endorsement Task Assigned",
                    $"Invoice {dto.InvoiceNumber} for {dto.ClientName} is ready for client delivery and signature endorsement.",
                    task.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send assignment notification for endorsement task {TaskId}", task.Id);
            }
        }

        await _db.SaveChangesAsync();

        return ApiResponseDTO<FomsEndorsementResponseDTO>.Success(new FomsEndorsementResponseDTO
        {
            IsSuccess = true,
            StarsTaskId = task.Id,
            StarsTaskNumber = task.TaskNumber,
            InvoiceNumber = endorsementDetail.InvoiceNumber,
            Status = endorsementDetail.EndorsementStatus,
            AssignedTo = assignedCoordinatorName ?? "Unassigned",
            Message = "Invoice endorsement task created and scheduled in STARS."
        });
    }

    /// <summary>
    /// Integration 1 (STARS → FOMS): Sends completion callback with signed copy URL and received date to FOMS.
    /// </summary>
    public async Task<ApiResponseDTO<bool>> SendInvoiceEndorsementCompletionAsync(
        Guid taskId, Guid? reviewerId = null, SubmitSignedEndorsementDTO? explicitSubmission = null)
    {
        var detail = await _db.TaskFomsInvoiceDetails
            .Include(d => d.Task)
            .FirstOrDefaultAsync(d => d.TaskId == taskId);

        if (detail == null)
            return ApiResponseDTO<bool>.Failure("No FOMS invoice endorsement linked to this task");

        var task = detail.Task ?? await _db.Tasks.FindAsync(taskId);
        if (task == null)
            return ApiResponseDTO<bool>.Failure("Task not found");

        if (explicitSubmission != null)
        {
            detail.ActualReceivedDate = explicitSubmission.ActualReceivedDate;
            if (!string.IsNullOrWhiteSpace(explicitSubmission.SignedCopyUrl))
                detail.SignedReceivingCopyUrl = explicitSubmission.SignedCopyUrl.Trim();
            if (!string.IsNullOrWhiteSpace(explicitSubmission.DeliveryRemarks))
                detail.DeliveryRemarks = explicitSubmission.DeliveryRemarks.Trim();
        }

        if (!detail.ActualReceivedDate.HasValue)
        {
            detail.ActualReceivedDate = DateTime.UtcNow;
        }

        var reviewer = reviewerId.HasValue ? await _db.Users.FindAsync(reviewerId.Value) : null;
        var completedByName = reviewer != null
            ? $"{reviewer.FirstName} {reviewer.LastName}".Trim()
            : "Operations Coordinator";

        var payload = new StarsEndorsementCompletionDTO
        {
            InvoiceNumber = detail.InvoiceNumber,
            StarsTaskId = task.Id,
            StarsTaskNumber = task.TaskNumber,
            CompletionResult = "Completed",
            ActualReceivedDate = detail.ActualReceivedDate.Value,
            SignedCopyUrl = detail.SignedReceivingCopyUrl,
            DeliveryRemarks = detail.DeliveryRemarks ?? $"Approved in STARS by {completedByName}",
            CompletedAt = DateTime.UtcNow,
            CompletedBy = completedByName
        };

        if (!IsConfigured)
        {
            detail.FomsSyncStatus = "Failed";
            detail.LastSyncError = "FOMS integration is not configured (missing BaseUrl or OutboundApiKey)";
            detail.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            _logger.LogWarning("Cannot send endorsement completion for task {TaskId}: FOMS integration not configured", taskId);
            return ApiResponseDTO<bool>.Failure("FOMS integration is not configured on this server");
        }

        try
        {
            var client = _http.CreateClient(HttpClientName);
            client.Timeout = TimeSpan.FromSeconds(30);

            var endpoint = $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/invoice-endorsed";
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(payload)
            };
            req.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var res = await client.SendAsync(req);
            var responseBody = await res.Content.ReadAsStringAsync();

            if (res.IsSuccessStatusCode)
            {
                detail.EndorsementStatus = "Completed";
                detail.FomsSyncStatus = "Synced";
                detail.LastSyncedAt = DateTime.UtcNow;
                detail.LastSyncError = null;
                detail.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();

                _logger.LogInformation("Successfully synced endorsement completion to FOMS for invoice {InvoiceNumber}", detail.InvoiceNumber);
                return ApiResponseDTO<bool>.Success(true, "Endorsement completion acknowledged by FOMS");
            }

            detail.FomsSyncStatus = "Failed";
            detail.LastSyncError = $"HTTP {(int)res.StatusCode}: {responseBody}";
            detail.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            _logger.LogWarning("FOMS returned HTTP {Status} for invoice {InvoiceNumber}: {Body}", (int)res.StatusCode, detail.InvoiceNumber, responseBody);
            return ApiResponseDTO<bool>.Failure($"FOMS returned HTTP {(int)res.StatusCode}: {responseBody}");
        }
        catch (Exception ex)
        {
            detail.FomsSyncStatus = "Failed";
            detail.LastSyncError = ex.Message;
            detail.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            _logger.LogError(ex, "Exception sending endorsement completion for invoice {InvoiceNumber}", detail.InvoiceNumber);
            return ApiResponseDTO<bool>.Failure($"Failed to contact FOMS: {ex.Message}");
        }
    }

    /// <summary>
    /// Integration 2 (FOMS → STARS): Real-time payment / invoice workflow status update pushed from FOMS.
    /// </summary>
    public async Task<ApiResponseDTO<bool>> ProcessPaymentStatusWebhookAsync(FomsPaymentStatusDTO dto)
    {
        if (string.IsNullOrWhiteSpace(dto.InvoiceNumber))
            return ApiResponseDTO<bool>.Failure("InvoiceNumber is required");

        var record = await _db.FomsClientFinancialStatuses
            .FirstOrDefaultAsync(s => s.InvoiceNumber == dto.InvoiceNumber.Trim());

        var now = DateTime.UtcNow;
        if (record == null)
        {
            record = new FomsClientFinancialStatus
            {
                ClientAccountId = dto.ClientAccountId.Trim(),
                ClientName = (dto.ClientName ?? string.Empty).Trim(),
                InvoiceNumber = dto.InvoiceNumber.Trim(),
                CurrentStatus = dto.CurrentStatus.Trim(),
                TotalAmount = dto.TotalAmount,
                AmountPaid = dto.AmountPaid,
                OutstandingBalance = dto.OutstandingBalance,
                NextDueDate = dto.NextDueDate,
                LastPaymentDate = dto.LastPaymentDate,
                LastUpdatedFromFoms = now
            };
            _db.FomsClientFinancialStatuses.Add(record);
        }
        else
        {
            record.ClientAccountId = dto.ClientAccountId.Trim();
            if (!string.IsNullOrWhiteSpace(dto.ClientName))
                record.ClientName = dto.ClientName.Trim();
            record.CurrentStatus = dto.CurrentStatus.Trim();
            record.TotalAmount = dto.TotalAmount;
            record.AmountPaid = dto.AmountPaid;
            record.OutstandingBalance = dto.OutstandingBalance;
            record.NextDueDate = dto.NextDueDate;
            record.LastPaymentDate = dto.LastPaymentDate;
            record.LastUpdatedFromFoms = now;
        }

        await _db.SaveChangesAsync();
        _logger.LogInformation("Recorded FOMS financial status update for invoice {InvoiceNumber}: Status={Status}, Balance={Balance}",
            record.InvoiceNumber, record.CurrentStatus, record.OutstandingBalance);

        return ApiResponseDTO<bool>.Success(true, "Payment status recorded successfully");
    }

    /// <summary>
    /// Integration 3 (FOMS → STARS): Overdue accounts collection alert from FOMS aging logic.
    /// Creates a collection follow-up task and routes via Graph Routing / workload distribution.
    /// </summary>
    public async Task<ApiResponseDTO<FomsEndorsementResponseDTO>> ProcessOverdueAlertWebhookAsync(FomsOverdueAlertDTO dto)
    {
        if (string.IsNullOrWhiteSpace(dto.InvoiceNumber))
            return ApiResponseDTO<FomsEndorsementResponseDTO>.Failure("InvoiceNumber is required");

        // Idempotency: If an active collection follow-up task already exists for this invoice, return it
        var existingActiveCollection = await _db.TaskFomsCollectionDetails
            .Include(c => c.Task)
            .FirstOrDefaultAsync(c => c.InvoiceNumber == dto.InvoiceNumber.Trim() &&
                                      c.Task != null &&
                                      c.Task.Status != Models.Enums.TaskStatus.Completed &&
                                      c.Task.Status != Models.Enums.TaskStatus.Cancelled);

        if (existingActiveCollection != null && existingActiveCollection.Task != null)
        {
            return ApiResponseDTO<FomsEndorsementResponseDTO>.Success(new FomsEndorsementResponseDTO
            {
                IsSuccess = true,
                StarsTaskId = existingActiveCollection.TaskId,
                StarsTaskNumber = existingActiveCollection.Task.TaskNumber,
                InvoiceNumber = existingActiveCollection.InvoiceNumber,
                Status = existingActiveCollection.Task.Status.ToString(),
                Message = "Active collection follow-up task already exists in STARS (idempotent response)."
            });
        }

        // Determine priority based on aging status and overdue duration
        var priority = (dto.DaysOverdue >= 30 || dto.AgingStatus.Contains("60") || dto.AgingStatus.Contains("90"))
            ? PriorityLevel.Urgent
            : PriorityLevel.High;

        var defaultCreatorId = await _db.Users
            .Where(u => u.Role == UserRole.Manager || u.Role == UserRole.Coordinator)
            .Select(u => u.Id)
            .FirstOrDefaultAsync();

        if (defaultCreatorId == Guid.Empty)
            defaultCreatorId = await _db.Users.Select(u => u.Id).FirstOrDefaultAsync();

        var taskNumber = TaskNumberGenerator.Generate(8);
        var now = DateTime.UtcNow;

        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            TaskNumber = taskNumber,
            Title = $"[Collection Follow-up] Invoice {dto.InvoiceNumber.Trim()} - {dto.ClientName.Trim()}",
            Description = $"Automated collection follow-up routed from FOMS.\n" +
                          $"Invoice: {dto.InvoiceNumber.Trim()}\n" +
                          $"Amount Due: ₱{dto.AmountDue:N2}\n" +
                          $"Aging: {dto.AgingStatus.Trim()} ({dto.DaysOverdue} days overdue)\n" +
                          $"Due Date: {(dto.DueDate.HasValue ? dto.DueDate.Value.ToString("yyyy-MM-dd") : "N/A")}\n" +
                          $"Client Account: {dto.ClientAccountId.Trim()} ({dto.ClientName.Trim()})\n" +
                          $"Contact: {dto.ClientContactPerson ?? "N/A"} ({dto.ClientContactNumber ?? "N/A"})\n" +
                          $"Email: {dto.ClientEmail ?? "N/A"}\n" +
                          $"Address: {dto.ClientAddress ?? "N/A"}\n" +
                          $"Remarks: {dto.Remarks ?? "Overdue invoice follow-up requested by FOMS finance"}",
            PriorityLevel = priority,
            Status = Models.Enums.TaskStatus.NotStarted,
            Classification = TaskClassification.SpecialTask,
            Deadline = now.AddDays(3),
            CreatedById = defaultCreatorId,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Tasks.Add(task);

        var collectionDetail = new TaskFomsCollectionDetail
        {
            TaskId = task.Id,
            InvoiceNumber = dto.InvoiceNumber.Trim(),
            ClientAccountId = dto.ClientAccountId.Trim(),
            ClientName = dto.ClientName.Trim(),
            AmountDue = dto.AmountDue,
            DaysOverdue = dto.DaysOverdue,
            AgingStatus = dto.AgingStatus.Trim(),
            DueDate = dto.DueDate,
            ClientContactPerson = dto.ClientContactPerson?.Trim(),
            ClientContactNumber = dto.ClientContactNumber?.Trim(),
            ClientAddress = dto.ClientAddress?.Trim(),
            RoutedAt = now
        };

        _db.TaskFomsCollectionDetails.Add(collectionDetail);

        // Optimal Coordinator Assignment via Graph Routing / Workload Evaluator
        var optimalCoordinator = await _db.Users
            .Where(u => u.Role == UserRole.Coordinator && u.EmploymentStatus == "Active")
            .OrderBy(u => _db.TaskAssignments.Count(a => a.AssignedUserId == u.Id && a.Task!.Status != Models.Enums.TaskStatus.Completed && a.Task!.Status != Models.Enums.TaskStatus.Cancelled))
            .FirstOrDefaultAsync();

        string? assignedName = null;
        if (optimalCoordinator != null)
        {
            _db.TaskAssignments.Add(new TaskAssignment
            {
                TaskId = task.Id,
                AssignedUserId = optimalCoordinator.Id,
                AssignedAt = now
            });
            task.Status = Models.Enums.TaskStatus.InProgress;
            assignedName = $"{optimalCoordinator.FirstName} {optimalCoordinator.LastName}".Trim();

            try
            {
                await _notificationService.SendNotificationAsync(
                    optimalCoordinator.Id,
                    NotificationType.TaskAssigned,
                    "URGENT: Overdue Collection Task Assigned",
                    $"Collection follow-up for {dto.ClientName} (Invoice {dto.InvoiceNumber}, ₱{dto.AmountDue:N2}) has been routed to you.",
                    task.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send notification for collection task {TaskId}", task.Id);
            }
        }

        await _db.SaveChangesAsync();

        return ApiResponseDTO<FomsEndorsementResponseDTO>.Success(new FomsEndorsementResponseDTO
        {
            IsSuccess = true,
            StarsTaskId = task.Id,
            StarsTaskNumber = task.TaskNumber,
            InvoiceNumber = collectionDetail.InvoiceNumber,
            Status = task.Status.ToString(),
            AssignedTo = assignedName ?? "Unassigned",
            Message = "Collection follow-up task created and routed successfully."
        });
    }

    /// <summary>
    /// Aggregated client balances and invoice metrics for the STARS dashboard (FR-038).
    /// </summary>
    public async Task<ApiResponseDTO<FomsDashboardFinancialSummaryDTO>> GetDashboardFinancialSummaryAsync()
    {
        var records = await _db.FomsClientFinancialStatuses.ToListAsync();

        var totalOutstanding = records.Sum(r => r.OutstandingBalance);
        var overdueRecords = records.Where(r => r.CurrentStatus.Equals("Overdue", StringComparison.OrdinalIgnoreCase)).ToList();
        var totalOverdue = overdueRecords.Sum(r => r.OutstandingBalance);
        var paidCount = records.Count(r => r.CurrentStatus.Equals("Paid", StringComparison.OrdinalIgnoreCase));
        var overdueCount = overdueRecords.Count;
        var pendingCount = records.Count - paidCount - overdueCount;

        var topClients = records
            .GroupBy(r => new { r.ClientAccountId, r.ClientName })
            .Select(g => new FomsClientFinancialSummaryItemDTO
            {
                ClientAccountId = g.Key.ClientAccountId,
                ClientName = g.Key.ClientName,
                OutstandingBalance = g.Sum(x => x.OutstandingBalance),
                OverdueInvoicesCount = g.Count(x => x.CurrentStatus.Equals("Overdue", StringComparison.OrdinalIgnoreCase)),
                LatestStatus = g.OrderByDescending(x => x.LastUpdatedFromFoms).Select(x => x.CurrentStatus).FirstOrDefault() ?? "Current",
                NextDueDate = g.Where(x => x.NextDueDate.HasValue).OrderBy(x => x.NextDueDate).Select(x => x.NextDueDate).FirstOrDefault()
            })
            .OrderByDescending(c => c.OutstandingBalance)
            .Take(10)
            .ToList();

        var summary = new FomsDashboardFinancialSummaryDTO
        {
            TotalOutstandingBalance = totalOutstanding,
            TotalOverdueBalance = totalOverdue,
            TotalInvoicesTracked = records.Count,
            OverdueInvoicesCount = overdueCount,
            PaidInvoicesCount = paidCount,
            PendingInvoicesCount = Math.Max(0, pendingCount),
            TopOutstandingClients = topClients,
            LastUpdatedAt = DateTime.UtcNow
        };

        return ApiResponseDTO<FomsDashboardFinancialSummaryDTO>.Success(summary);
    }

    public async Task<ApiResponseDTO<TaskFomsInvoiceDetail>> GetEndorsementDetailAsync(Guid taskId)
    {
        var detail = await _db.TaskFomsInvoiceDetails
            .Include(d => d.Task)
            .FirstOrDefaultAsync(d => d.TaskId == taskId);

        if (detail == null)
            return ApiResponseDTO<TaskFomsInvoiceDetail>.Failure("Endorsement details not found");

        return ApiResponseDTO<TaskFomsInvoiceDetail>.Success(detail);
    }

    public async Task<ApiResponseDTO<TaskFomsInvoiceDetail>> SubmitSignedEndorsementAsync(
        Guid taskId, SubmitSignedEndorsementDTO dto, Guid userId)
    {
        var detail = await _db.TaskFomsInvoiceDetails.FirstOrDefaultAsync(d => d.TaskId == taskId);
        if (detail == null)
            return ApiResponseDTO<TaskFomsInvoiceDetail>.Failure("Endorsement details not found for task");

        detail.ActualReceivedDate = dto.ActualReceivedDate;
        if (!string.IsNullOrWhiteSpace(dto.SignedCopyUrl))
            detail.SignedReceivingCopyUrl = dto.SignedCopyUrl.Trim();
        if (!string.IsNullOrWhiteSpace(dto.DeliveryRemarks))
            detail.DeliveryRemarks = dto.DeliveryRemarks.Trim();

        detail.EndorsementStatus = "Endorsed";
        detail.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            userId,
            AuditActionType.Update,
            "TaskFomsInvoiceDetail",
            detail.Id,
            null,
            $"Submitted signed endorsement copy for invoice {detail.InvoiceNumber}",
            "FomsIntegration");

        return ApiResponseDTO<TaskFomsInvoiceDetail>.Success(detail, "Signed endorsement recorded successfully");
    }
}
