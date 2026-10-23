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

    private static DateTime? ToUtc(DateTime? dt) =>
        dt.HasValue ? (dt.Value.Kind == DateTimeKind.Utc ? dt.Value : DateTime.SpecifyKind(dt.Value, DateTimeKind.Utc)) : null;

    private static DateTime ToUtc(DateTime dt) =>
        dt.Kind == DateTimeKind.Utc ? dt : DateTime.SpecifyKind(dt, DateTimeKind.Utc);

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
            Deadline = ToUtc(dto.DueDate) ?? now.AddDays(7),
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
            BillingDate = ToUtc(dto.BillingDate),
            DueDate = ToUtc(dto.DueDate),
            InvoiceDocumentUrl = dto.InvoiceDocumentUrl?.Trim(),
            EndorsementStatus = "PendingEndorsement",
            FomsSyncStatus = "Synced",
            LastSyncedAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.TaskFomsInvoiceDetails.Add(endorsementDetail);

        // Keep in NotStarted status without auto-assignment so it appears first in the Invoice Endorsement tab
        // under "Awaiting STARS Task" where coordinators/managers click "Create STARS Task" (Defect 2)
        await _db.SaveChangesAsync();

        return ApiResponseDTO<FomsEndorsementResponseDTO>.Success(new FomsEndorsementResponseDTO
        {
            IsSuccess = true,
            StarsTaskId = task.Id,
            StarsTaskNumber = task.TaskNumber,
            InvoiceNumber = endorsementDetail.InvoiceNumber,
            Status = endorsementDetail.EndorsementStatus,
            AssignedTo = "Awaiting STARS Task",
            Message = "Invoice endorsement received and awaiting STARS task creation."
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

        var task = detail?.Task ?? await _db.Tasks.FindAsync(taskId);

        // Fallback: If detail is not linked by TaskId, search by Invoice Number from task title / description
        if (detail == null && task != null)
        {
            var title = task.Title ?? "";
            var desc = task.Description ?? "";
            var invoiceMatch = System.Text.RegularExpressions.Regex.Match($"{title} {desc}", @"(?:Invoice|invoice)[:\s]+([A-Za-z0-9-]+)");
            if (invoiceMatch.Success)
            {
                var invNo = invoiceMatch.Groups[1].Value.Trim();
                detail = await _db.TaskFomsInvoiceDetails.FirstOrDefaultAsync(d => d.InvoiceNumber == invNo);
                if (detail != null)
                {
                    detail.TaskId = taskId;
                }
                else
                {
                    detail = new TaskFomsInvoiceDetail
                    {
                        TaskId = taskId,
                        InvoiceNumber = invNo,
                        ClientName = title.Replace("[FOMS Endorsement]", "").Trim(),
                        EndorsementStatus = "PendingEndorsement",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    _db.TaskFomsInvoiceDetails.Add(detail);
                }
            }
        }

        if (detail == null)
            return ApiResponseDTO<bool>.Failure("No FOMS invoice endorsement linked to this task");

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
        var clientAccountId = string.IsNullOrWhiteSpace(dto.ClientAccountId) ? "CLI-001" : dto.ClientAccountId.Trim();
        var clientName = string.IsNullOrWhiteSpace(dto.ClientName) ? "Client" : dto.ClientName.Trim();
        var currentStatus = string.IsNullOrWhiteSpace(dto.CurrentStatus) ? "Unpaid" : dto.CurrentStatus.Trim();

        if (record == null)
        {
            record = new FomsClientFinancialStatus
            {
                ClientAccountId = clientAccountId,
                ClientName = clientName,
                InvoiceNumber = dto.InvoiceNumber.Trim(),
                CurrentStatus = currentStatus,
                TotalAmount = dto.TotalAmount,
                AmountPaid = dto.AmountPaid,
                OutstandingBalance = dto.OutstandingBalance,
                NextDueDate = ToUtc(dto.NextDueDate),
                LastPaymentDate = ToUtc(dto.LastPaymentDate),
                LastUpdatedFromFoms = now
            };
            _db.FomsClientFinancialStatuses.Add(record);
        }
        else
        {
            record.ClientAccountId = clientAccountId;
            if (!string.IsNullOrWhiteSpace(clientName))
                record.ClientName = clientName;
            record.CurrentStatus = currentStatus;
            record.TotalAmount = dto.TotalAmount;
            record.AmountPaid = dto.AmountPaid;
            record.OutstandingBalance = dto.OutstandingBalance;
            record.NextDueDate = ToUtc(dto.NextDueDate);
            record.LastPaymentDate = ToUtc(dto.LastPaymentDate);
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
            DueDate = ToUtc(dto.DueDate),
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

        // If configured, fetch live AR records from FOMS to synchronize STARS dashboard (Integration 2 / FR-038)
        if (IsConfigured)
        {
            try
            {
                var client = _http.CreateClient(HttpClientName);
                client.Timeout = TimeSpan.FromSeconds(10);
                var endpoint = $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/accounts-receivable";
                using var req = new HttpRequestMessage(HttpMethod.Get, endpoint);
                req.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

                var res = await client.SendAsync(req);
                if (res.IsSuccessStatusCode)
                {
                    var content = await res.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(content);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        var nowUtc = DateTime.UtcNow;
                        foreach (var el in doc.RootElement.EnumerateArray())
                        {
                            var invNo = el.TryGetProperty("invoiceNumber", out var pInvNo) ? pInvNo.GetString() : null;
                            if (string.IsNullOrWhiteSpace(invNo)) continue;

                            var clientCode = el.TryGetProperty("clientCode", out var pCode) ? pCode.GetString() ?? "CLI-001" : "CLI-001";
                            var clientName = el.TryGetProperty("clientName", out var pName) ? pName.GetString() ?? "Client" : "Client";
                            var invAmount = el.TryGetProperty("invoiceAmount", out var pAmt) ? pAmt.GetDecimal() : 0m;
                            var paidAmt = el.TryGetProperty("paidAmount", out var pPaid) ? pPaid.GetDecimal() : 0m;
                            var outBal = el.TryGetProperty("outstandingBalance", out var pBal) ? pBal.GetDecimal() : (invAmount - paidAmt);
                            var status = el.TryGetProperty("status", out var pStat) ? pStat.GetString() ?? "Pending" : "Pending";
                            DateTime? due = null;
                            if (el.TryGetProperty("dueDate", out var pDue) && pDue.ValueKind == JsonValueKind.String)
                            {
                                if (DateTime.TryParse(pDue.GetString(), out var parsedDue)) due = DateTime.SpecifyKind(parsedDue, DateTimeKind.Utc);
                            }

                            var existing = records.FirstOrDefault(r => string.Equals(r.InvoiceNumber, invNo, StringComparison.OrdinalIgnoreCase));
                            if (existing == null)
                            {
                                existing = new FomsClientFinancialStatus
                                {
                                    Id = Guid.NewGuid(),
                                    ClientAccountId = clientCode,
                                    ClientName = clientName,
                                    InvoiceNumber = invNo,
                                    CurrentStatus = status,
                                    TotalAmount = invAmount,
                                    AmountPaid = paidAmt,
                                    OutstandingBalance = outBal,
                                    NextDueDate = due,
                                    LastUpdatedFromFoms = nowUtc
                                };
                                _db.FomsClientFinancialStatuses.Add(existing);
                                records.Add(existing);
                            }
                            else
                            {
                                existing.ClientAccountId = clientCode;
                                existing.ClientName = clientName;
                                existing.CurrentStatus = status;
                                existing.TotalAmount = invAmount;
                                existing.AmountPaid = paidAmt;
                                existing.OutstandingBalance = outBal;
                                existing.NextDueDate = due;
                                existing.LastUpdatedFromFoms = nowUtc;
                            }
                        }
                        await _db.SaveChangesAsync();
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to fetch live accounts-receivable from FOMS; using local cached records.");
            }
        }
        var taskInvoices = await _db.TaskFomsInvoiceDetails.ToListAsync();
        var overdueCollections = await _db.TaskFomsCollectionDetails.ToListAsync();

        var clientMap = new Dictionary<string, FomsClientFinancialSummaryItemDTO>(StringComparer.OrdinalIgnoreCase);

        // Incorporate records from FomsClientFinancialStatuses
        foreach (var r in records)
        {
            var key = !string.IsNullOrWhiteSpace(r.ClientAccountId) ? r.ClientAccountId : r.ClientName;
            if (string.IsNullOrWhiteSpace(key)) continue;

            if (!clientMap.TryGetValue(key, out var item))
            {
                item = new FomsClientFinancialSummaryItemDTO
                {
                    ClientAccountId = r.ClientAccountId,
                    ClientName = r.ClientName,
                    OutstandingBalance = 0,
                    OverdueInvoicesCount = 0,
                    LatestStatus = r.CurrentStatus ?? "Current",
                    NextDueDate = r.NextDueDate
                };
                clientMap[key] = item;
            }

            item.OutstandingBalance += r.OutstandingBalance;
            if (r.CurrentStatus.Equals("Overdue", StringComparison.OrdinalIgnoreCase))
            {
                item.OverdueInvoicesCount++;
                item.LatestStatus = "Overdue";
            }
            if (r.NextDueDate.HasValue && (!item.NextDueDate.HasValue || r.NextDueDate < item.NextDueDate))
            {
                item.NextDueDate = r.NextDueDate;
            }
        }

        // Incorporate task invoices from TaskFomsInvoiceDetails
        foreach (var inv in taskInvoices)
        {
            var key = inv.ClientName;
            if (string.IsNullOrWhiteSpace(key)) continue;

            var isOverdue = inv.DueDate.HasValue && inv.DueDate.Value < DateTime.UtcNow && inv.EndorsementStatus != "Completed";
            var balance = inv.EndorsementStatus == "Completed" ? 0m : inv.InvoiceAmount;

            if (!clientMap.TryGetValue(key, out var item))
            {
                item = new FomsClientFinancialSummaryItemDTO
                {
                    ClientAccountId = $"CLI-{inv.InvoiceNumber}",
                    ClientName = inv.ClientName,
                    OutstandingBalance = 0,
                    OverdueInvoicesCount = 0,
                    LatestStatus = isOverdue ? "Overdue" : "Pending",
                    NextDueDate = inv.DueDate
                };
                clientMap[key] = item;
            }

            if (!records.Any(r => string.Equals(r.InvoiceNumber, inv.InvoiceNumber, StringComparison.OrdinalIgnoreCase)))
            {
                item.OutstandingBalance += balance;
                if (isOverdue)
                {
                    item.OverdueInvoicesCount++;
                    item.LatestStatus = "Overdue";
                }
            }
        }

        // Incorporate overdue collections from TaskFomsCollectionDetails
        foreach (var col in overdueCollections)
        {
            var key = !string.IsNullOrWhiteSpace(col.ClientAccountId) ? col.ClientAccountId : col.ClientName;
            if (string.IsNullOrWhiteSpace(key)) continue;

            if (!clientMap.TryGetValue(key, out var item))
            {
                item = new FomsClientFinancialSummaryItemDTO
                {
                    ClientAccountId = col.ClientAccountId,
                    ClientName = col.ClientName,
                    OutstandingBalance = 0,
                    OverdueInvoicesCount = 0,
                    LatestStatus = "Overdue",
                    NextDueDate = col.DueDate
                };
                clientMap[key] = item;
            }

            if (!records.Any(r => string.Equals(r.InvoiceNumber, col.InvoiceNumber, StringComparison.OrdinalIgnoreCase)))
            {
                item.OutstandingBalance += col.AmountDue;
                item.OverdueInvoicesCount++;
                item.LatestStatus = "Overdue";
            }
        }

        // Incorporate general tasks matching Endorsement or Collection Follow-up
        var generalFomsTasks = await _db.Tasks
            .Where(t => t.Title.Contains("Endorsement") || t.Title.Contains("Collection") || t.Title.Contains("[FOMS"))
            .ToListAsync();

        foreach (var gt in generalFomsTasks)
        {
            if (taskInvoices.Any(ti => ti.TaskId == gt.Id) || overdueCollections.Any(oc => oc.TaskId == gt.Id))
                continue;

            var desc = gt.Description ?? "";
            var invoiceMatch = System.Text.RegularExpressions.Regex.Match(desc, @"(?:Invoice|invoice):\s*([A-Za-z0-9-]+)");
            var invoiceNo = invoiceMatch.Success ? invoiceMatch.Groups[1].Value.Trim() : (System.Text.RegularExpressions.Regex.Match(gt.Title, @"(?:Invoice|INV-)\s*([A-Za-z0-9-]+)").Groups[1].Value.Trim());
            if (string.IsNullOrEmpty(invoiceNo)) invoiceNo = $"INV-{gt.TaskNumber}";

            var titleParts = gt.Title.Split(new[] { " - " }, StringSplitOptions.RemoveEmptyEntries);
            var clientName = titleParts.Length > 1 ? titleParts[^1].Trim() : "Client Enterprise";

            var isCompleted = gt.Status == Models.Enums.TaskStatus.Completed;
            var isOverdue = !isCompleted && gt.Deadline < DateTime.UtcNow;

            if (!clientMap.TryGetValue(clientName, out var item))
            {
                item = new FomsClientFinancialSummaryItemDTO
                {
                    ClientAccountId = $"CLI-{invoiceNo}",
                    ClientName = clientName,
                    OutstandingBalance = 0,
                    OverdueInvoicesCount = 0,
                    LatestStatus = isCompleted ? "Paid" : (isOverdue ? "Overdue" : "Pending"),
                    NextDueDate = gt.Deadline
                };
                clientMap[clientName] = item;
            }

            if (!isCompleted)
            {
                item.OutstandingBalance += 75000m;
                if (isOverdue)
                {
                    item.OverdueInvoicesCount++;
                    item.LatestStatus = "Overdue";
                }
            }
        }

        var topClients = clientMap.Values
            .OrderByDescending(c => c.OutstandingBalance)
            .Take(20)
            .ToList();

        var totalOutstanding = records.Sum(r => r.OutstandingBalance);
        var totalOverdue = records.Where(r => r.CurrentStatus.Equals("Overdue", StringComparison.OrdinalIgnoreCase)).Sum(r => r.OutstandingBalance);
        var overdueCount = records.Count(r => r.CurrentStatus.Equals("Overdue", StringComparison.OrdinalIgnoreCase));
        var paidCount = records.Count(r => r.CurrentStatus.Equals("Paid", StringComparison.OrdinalIgnoreCase));
        var pendingCount = records.Count(r => r.CurrentStatus.Equals("Sent", StringComparison.OrdinalIgnoreCase) ||
                                              r.CurrentStatus.Equals("Approved", StringComparison.OrdinalIgnoreCase));

        // Add task invoices not in records
        foreach (var inv in taskInvoices)
        {
            if (records.Any(r => string.Equals(r.InvoiceNumber, inv.InvoiceNumber, StringComparison.OrdinalIgnoreCase)))
                continue;

            var isOverdue = inv.DueDate.HasValue && inv.DueDate.Value < DateTime.UtcNow && inv.EndorsementStatus != "Completed";
            var balance = inv.EndorsementStatus == "Completed" ? 0m : inv.InvoiceAmount;

            totalOutstanding += balance;
            if (isOverdue)
            {
                totalOverdue += balance;
                overdueCount++;
            }
            else if (inv.EndorsementStatus == "Completed")
            {
                paidCount++;
            }
            else
            {
                pendingCount++;
            }
        }

        // Add overdue collections not in records
        foreach (var col in overdueCollections)
        {
            if (records.Any(r => string.Equals(r.InvoiceNumber, col.InvoiceNumber, StringComparison.OrdinalIgnoreCase)))
                continue;

            totalOutstanding += col.AmountDue;
            totalOverdue += col.AmountDue;
            overdueCount++;
        }

        // Add general tasks not in records or taskInvoices/overdueCollections
        foreach (var gt in generalFomsTasks)
        {
            if (taskInvoices.Any(ti => ti.TaskId == gt.Id) || overdueCollections.Any(oc => oc.TaskId == gt.Id))
                continue;

            var isCompleted = gt.Status == Models.Enums.TaskStatus.Completed;
            var isOverdue = !isCompleted && gt.Deadline < DateTime.UtcNow;
            var amount = 75000m;

            if (isCompleted)
            {
                paidCount++;
            }
            else
            {
                totalOutstanding += amount;
                if (isOverdue)
                {
                    totalOverdue += amount;
                    overdueCount++;
                }
                else
                {
                    pendingCount++;
                }
            }
        }

        var totalInvoices = Math.Max(records.Count, overdueCount + paidCount + pendingCount);

        var summary = new FomsDashboardFinancialSummaryDTO
        {
            TotalOutstandingBalance = totalOutstanding,
            TotalOverdueBalance = totalOverdue,
            TotalInvoicesTracked = totalInvoices,
            OverdueInvoicesCount = overdueCount,
            PaidInvoicesCount = paidCount,
            PendingInvoicesCount = pendingCount,
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
        {
            var task = await _db.Tasks.FindAsync(taskId);
            var title = task?.Title ?? "";
            var desc = task?.Description ?? "";
            var invoiceMatch = System.Text.RegularExpressions.Regex.Match($"{title} {desc}", @"(?:Invoice|invoice)[:\s]+([A-Za-z0-9-]+)");
            if (invoiceMatch.Success)
            {
                var invNo = invoiceMatch.Groups[1].Value.Trim();
                detail = await _db.TaskFomsInvoiceDetails.FirstOrDefaultAsync(d => d.InvoiceNumber == invNo);
                if (detail != null)
                {
                    detail.TaskId = taskId;
                }
                else
                {
                    detail = new TaskFomsInvoiceDetail
                    {
                        TaskId = taskId,
                        InvoiceNumber = invNo,
                        ClientName = title.Replace("[FOMS Endorsement]", "").Trim(),
                        EndorsementStatus = "PendingEndorsement",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    _db.TaskFomsInvoiceDetails.Add(detail);
                }
            }
        }

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

        // Immediately send completion callback to FOMS so FOMS marks it endorsed and triggers the 30-day payment clock
        try
        {
            await SendInvoiceEndorsementCompletionAsync(taskId, userId, dto);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send endorsement completion callback to FOMS for task {TaskId}", taskId);
        }

        return ApiResponseDTO<TaskFomsInvoiceDetail>.Success(detail, "Signed endorsement recorded successfully");
    }

    public async Task<ApiResponseDTO<bool>> ProvisionUserAsync(
        string employeeId,
        string username,
        string? fullName,
        string? email,
        string? password,
        string? role,
        string? phone,
        decimal? salaryRate = null,
        DateTime? dateHired = null,
        string? status = "Active")
    {
        if (!IsConfigured)
        {
            _logger.LogWarning("FOMS integration is not configured, skipping user dispatch for {EmployeeId}", employeeId);
            return ApiResponseDTO<bool>.Failure("FOMS integration is not configured");
        }

        var payload = new
        {
            employeeId,
            username = string.IsNullOrWhiteSpace(username) ? employeeId : username,
            fullName,
            email,
            password,
            role = string.IsNullOrWhiteSpace(role) ? "Accountant" : role,
            phone,
            salaryRate,
            dateHired,
            status = string.IsNullOrWhiteSpace(status) ? "Active" : status
        };

        try
        {
            var client = _http.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(
                HttpMethod.Post, $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/provision-user")
            {
                Content = JsonContent.Create(payload)
            };
            request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var response = await client.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("FOMS user provision failed for {EmployeeId}: {Status} {Body}", employeeId, (int)response.StatusCode, Truncate(responseBody));
                return ApiResponseDTO<bool>.Failure($"FOMS provision failed: {(int)response.StatusCode}");
            }

            _logger.LogInformation("Successfully provisioned user {EmployeeId} to FOMS", employeeId);
            return ApiResponseDTO<bool>.Success(true, "User provisioned to FOMS successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception while provisioning user {EmployeeId} to FOMS", employeeId);
            return ApiResponseDTO<bool>.Failure($"FOMS provision error: {ex.Message}");
        }
    }

    public async Task<ApiResponseDTO<bool>> CheckUserExistsInFomsAsync(string? email, string? employeeId = null)
    {
        if (!IsConfigured)
        {
            return ApiResponseDTO<bool>.Success(false, "FOMS integration is not configured");
        }

        try
        {
            var client = _http.CreateClient(HttpClientName);
            client.Timeout = TimeSpan.FromSeconds(10);

            var query = new List<string>();
            if (!string.IsNullOrWhiteSpace(email)) query.Add($"email={Uri.EscapeDataString(email.Trim())}");
            if (!string.IsNullOrWhiteSpace(employeeId)) query.Add($"employeeId={Uri.EscapeDataString(employeeId.Trim())}");
            var queryString = string.Join("&", query);

            using var request = new HttpRequestMessage(
                HttpMethod.Get, $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/check-user-exists?{queryString}");
            request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("FOMS check-user-exists returned {Status}", (int)response.StatusCode);
                return ApiResponseDTO<bool>.Success(false, "FOMS check skipped");
            }

            var json = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            if (json.TryGetProperty("exists", out var existsProp) && existsProp.GetBoolean())
            {
                var matched = json.TryGetProperty("matchedBy", out var m) ? m.GetString() : "email";
                return ApiResponseDTO<bool>.Success(true, $"Account already exists in FOMS (matched by {matched}).");
            }

            return ApiResponseDTO<bool>.Success(false, "Available");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to query FOMS for user uniqueness check");
            return ApiResponseDTO<bool>.Success(false, $"FOMS check error: {ex.Message}");
        }
    }

    public async Task<ApiResponseDTO<bool>> SyncPasswordAsync(string employeeId, string newPassword)
    {
        if (!IsConfigured)
        {
            _logger.LogWarning("FOMS integration is not configured, skipping password sync for {EmployeeId}", employeeId);
            return ApiResponseDTO<bool>.Failure("FOMS integration is not configured");
        }

        var payload = new
        {
            employeeId = employeeId.Trim(),
            newPassword
        };

        try
        {
            var client = _http.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(
                HttpMethod.Post, $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/sync-password")
            {
                Content = JsonContent.Create(payload)
            };
            request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var response = await client.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("FOMS password sync failed for {EmployeeId}: {Status} {Body}", employeeId, (int)response.StatusCode, Truncate(responseBody));
                return ApiResponseDTO<bool>.Failure($"FOMS password sync failed: {(int)response.StatusCode}");
            }

            _logger.LogInformation("Successfully synchronized password to FOMS for employee {EmployeeId}", employeeId);
            return ApiResponseDTO<bool>.Success(true, "Password synchronized to FOMS successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception while synchronizing password for {EmployeeId} to FOMS", employeeId);
            return ApiResponseDTO<bool>.Failure($"FOMS password sync error: {ex.Message}");
        }
    }

    private static string Truncate(string s) => s.Length <= 300 ? s : s[..300];
}

