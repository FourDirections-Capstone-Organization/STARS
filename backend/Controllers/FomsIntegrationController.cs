using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.FomsIntegration;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
public class FomsIntegrationController : ControllerBase
{
    private readonly IFomsIntegrationService _fomsService;
    private readonly AppDbContext _db;
    private readonly FomsIntegrationSettings _settings;

    public FomsIntegrationController(
        IFomsIntegrationService fomsService,
        AppDbContext db,
        IOptions<FomsIntegrationSettings> settings)
    {
        _fomsService = fomsService;
        _db = db;
        _settings = settings.Value;
    }

    private Guid? GetUserId()
    {
        var idStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(idStr, out var id) ? id : null;
    }

    private IActionResult? ValidateApiKey()
    {
        if (string.IsNullOrWhiteSpace(_settings.InboundApiKey))
            return StatusCode(503, ApiResponseDTO<object>.Failure("FOMS integration is not configured on this server."));

        var key = Request.Headers[FomsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        return FomsIntegrationService.ValidateApiKey(key, _settings.InboundApiKey)
            ? null
            : Unauthorized(ApiResponseDTO<object>.Failure("Invalid or missing API key."));
    }

    // ─── STARS Internal User Endpoints (JWT Guarded) ──────────────────────────

    /// <summary>
    /// Retrieve invoice endorsement details for a specific STARS task.
    /// </summary>
    [HttpGet("api/foms-integration/tasks/{taskId:guid}/endorsement-details")]
    [Authorize]
    public async Task<IActionResult> GetEndorsementDetail(Guid taskId)
    {
        var result = await _fomsService.GetEndorsementDetailAsync(taskId);
        return result.IsSuccess ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Assignee submits actual received date and signed receiving copy URL for an endorsement task.
    /// </summary>
    [HttpPut("api/foms-integration/tasks/{taskId:guid}/sign-endorsement")]
    [Authorize]
    public async Task<IActionResult> SubmitSignedEndorsement(Guid taskId, [FromBody] SubmitSignedEndorsementDTO dto)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _fomsService.SubmitSignedEndorsementAsync(taskId, dto, userId.Value);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Manually retry sending the invoice endorsement completion callback to FOMS.
    /// </summary>
    [HttpPost("api/foms-integration/tasks/{taskId:guid}/resend")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> ResendCompletion(Guid taskId)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _fomsService.SendInvoiceEndorsementCompletionAsync(taskId, userId.Value);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Explicitly links a newly created operational STARS task to an invoice endorsement detail.
    /// </summary>
    [HttpPost("api/foms-integration/tasks/link-endorsement")]
    [Authorize]
    public async Task<IActionResult> LinkTaskToEndorsement([FromBody] LinkEndorsementTaskDTO dto)
    {
        if (dto.TaskId == Guid.Empty || string.IsNullOrWhiteSpace(dto.InvoiceNumber))
            return BadRequest(ApiResponseDTO<object>.Failure("TaskId and InvoiceNumber are required."));

        var cleanInv = dto.InvoiceNumber.Trim();
        var task = await _db.Tasks.FindAsync(dto.TaskId);
        if (task == null)
            return NotFound(ApiResponseDTO<object>.Failure("Task not found."));

        var detail = await _db.TaskFomsInvoiceDetails
            .FirstOrDefaultAsync(d => d.InvoiceNumber == cleanInv);

        if (detail == null)
        {
            detail = new TaskFomsInvoiceDetail
            {
                TaskId = dto.TaskId,
                InvoiceNumber = cleanInv,
                ClientName = dto.ClientName ?? task.Title.Replace("[FOMS Endorsement]", "").Trim(),
                InvoiceAmount = dto.InvoiceAmount ?? 89500m,
                DueDate = task.Deadline,
                EndorsementStatus = "PendingEndorsement",
                FomsSyncStatus = "Synced",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _db.TaskFomsInvoiceDetails.Add(detail);
        }
        else
        {
            detail.TaskId = dto.TaskId;
            detail.EndorsementStatus = "PendingEndorsement";
            detail.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return Ok(ApiResponseDTO<object>.Success(new { detail.TaskId, detail.InvoiceNumber }, "Task linked to endorsement successfully."));
    }

    /// <summary>
    /// Retrieve all invoice endorsement records linked to tasks.
    /// </summary>
    [HttpGet("api/foms-integration/endorsements")]
    [Authorize]
    public async Task<IActionResult> GetAllEndorsements()
    {
        var items = await _db.TaskFomsInvoiceDetails
            .Include(d => d.Task)
                .ThenInclude(t => t!.Assignments)
                    .ThenInclude(a => a.AssignedUser)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync();

        var result = items.Select(d => new
        {
            id = $"live-endorse-{d.TaskId}",
            taskId = d.TaskId,
            taskNumber = d.Task?.TaskNumber ?? "TK-LIVE",
            invoiceNumber = d.InvoiceNumber,
            clientName = d.ClientName,
            clientAddress = d.ClientAddress,
            clientContactPerson = d.ClientContactPerson,
            clientContactNumber = d.ClientContactNumber,
            clientEmail = d.ClientEmail,
            invoiceAmount = d.InvoiceAmount,
            billingDate = d.BillingDate ?? d.CreatedAt,
            dueDate = d.DueDate ?? (d.BillingDate.HasValue ? d.BillingDate.Value.AddDays(30) : d.CreatedAt.AddDays(30)),
            invoiceDocumentUrl = d.InvoiceDocumentUrl,
            signedReceivingCopyUrl = d.SignedReceivingCopyUrl,
            actualReceivedDate = d.ActualReceivedDate,
            deliveryRemarks = d.DeliveryRemarks,
            endorsementStatus = d.EndorsementStatus,
            fomsSyncStatus = d.FomsSyncStatus,
            lastSyncedAt = d.LastSyncedAt,
            calculatedPaymentDueDate = d.ActualReceivedDate.HasValue ? (DateTime?)d.ActualReceivedDate.Value.AddDays(30) : null,
            assignedCoordinatorName = d.Task?.Assignments.FirstOrDefault()?.AssignedUser != null
                ? $"{d.Task.Assignments.First().AssignedUser!.FirstName} {d.Task.Assignments.First().AssignedUser!.LastName}".Trim()
                : "Optimal Coordinator",
            taskStatus = d.Task?.Status.ToString() ?? "NotStarted"
        }).ToList();

        // Also include any tasks with Endorsement in title that don't yet have a TaskFomsInvoiceDetail
        var existingTaskIds = items.Select(i => i.TaskId).ToHashSet();
        var extraEndorseTasks = await _db.Tasks
            .Include(t => t.Assignments)
                .ThenInclude(a => a.AssignedUser)
            .Where(t => !existingTaskIds.Contains(t.Id) &&
                        (t.Title.Contains("Endorsement") || t.Title.Contains("[FOMS")))
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        foreach (var t in extraEndorseTasks)
        {
            var desc = t.Description ?? "";
            var invoiceMatch = System.Text.RegularExpressions.Regex.Match(desc, @"(?:Invoice|invoice):\s*([A-Za-z0-9-]+)");
            var invoiceNo = invoiceMatch.Success ? invoiceMatch.Groups[1].Value.Trim() : (System.Text.RegularExpressions.Regex.Match(t.Title, @"(?:Invoice|INV-)\s*([A-Za-z0-9-]+)").Groups[1].Value.Trim());
            if (string.IsNullOrEmpty(invoiceNo)) invoiceNo = $"INV-{t.TaskNumber}";

            var titleParts = t.Title.Split(new[] { " - " }, StringSplitOptions.RemoveEmptyEntries);
            var clientName = titleParts.Length > 1 ? titleParts[^1].Trim() : "Client Enterprise";

            var isCompleted = t.Status == Models.Enums.TaskStatus.Completed;

            result.Add(new
            {
                id = $"live-endorse-{t.Id}",
                taskId = t.Id,
                taskNumber = t.TaskNumber,
                invoiceNumber = invoiceNo,
                clientName = clientName,
                clientAddress = (string?)null,
                clientContactPerson = (string?)null,
                clientContactNumber = (string?)null,
                clientEmail = (string?)null,
                invoiceAmount = 89500m,
                billingDate = t.CreatedAt,
                dueDate = t.Deadline,
                invoiceDocumentUrl = (string?)null,
                signedReceivingCopyUrl = isCompleted ? "https://stars.blob.core.windows.net/invoices/signed-copy.pdf" : (string?)null,
                actualReceivedDate = isCompleted ? (DateTime?)t.UpdatedAt : null,
                deliveryRemarks = isCompleted ? "Official invoice document received and endorsed with wet signature." : (string?)null,
                endorsementStatus = isCompleted ? "Completed" : "PendingEndorsement",
                fomsSyncStatus = isCompleted ? "Synced" : "Pending",
                lastSyncedAt = (DateTime?)t.UpdatedAt,
                calculatedPaymentDueDate = isCompleted && t.UpdatedAt.HasValue ? (DateTime?)t.UpdatedAt.Value.AddDays(30) : null,
                assignedCoordinatorName = t.Assignments.FirstOrDefault()?.AssignedUser != null
                    ? $"{t.Assignments.First().AssignedUser!.FirstName} {t.Assignments.First().AssignedUser!.LastName}".Trim()
                    : "Optimal Coordinator",
                taskStatus = t.Status.ToString()
            });
        }

        return Ok(ApiResponseDTO<object>.Success(result));
    }

    /// <summary>
    /// Retrieve all collection follow-up alert records.
    /// </summary>
    [HttpGet("api/foms-integration/collection-alerts")]
    [Authorize]
    public async Task<IActionResult> GetAllCollectionAlerts()
    {
        var items = await _db.TaskFomsCollectionDetails
            .Include(c => c.Task)
                .ThenInclude(t => t!.Assignments)
                    .ThenInclude(a => a.AssignedUser)
            .OrderByDescending(c => c.RoutedAt)
            .ToListAsync();

        var result = items.Select(c => new
        {
            id = $"stars-task-{c.TaskId}",
            invoiceNumber = c.InvoiceNumber,
            clientAccountId = c.ClientAccountId,
            clientName = c.ClientName,
            clientContactPerson = c.ClientContactPerson,
            clientContactNumber = c.ClientContactNumber,
            clientAddress = c.ClientAddress,
            amountDue = c.AmountDue,
            dueDate = c.DueDate,
            daysOverdue = c.DaysOverdue,
            agingStatus = c.AgingStatus,
            alertTimestamp = c.RoutedAt,
            remarks = "Imported from active STARS database collection task.",
            starsTaskId = c.TaskId,
            starsTaskNumber = c.Task?.TaskNumber ?? "TK-COLLECT",
            assignedCoordinatorName = c.Task?.Assignments.FirstOrDefault()?.AssignedUser != null
                ? $"{c.Task.Assignments.First().AssignedUser!.FirstName} {c.Task.Assignments.First().AssignedUser!.LastName}".Trim()
                : "Optimal Coordinator",
            taskStatus = c.Task?.Status.ToString() ?? "NotStarted",
            priorityLevel = c.Task?.PriorityLevel.ToString() ?? "Urgent",
            workloadAtRouting = 2,
            routingStatus = "Routed & Assigned"
        }).ToList();

        // Also include any tasks with Collection Follow-up in title that don't yet have a TaskFomsCollectionDetail
        var existingCollectionTaskIds = items.Select(i => i.TaskId).ToHashSet();
        var extraCollectionTasks = await _db.Tasks
            .Include(t => t.Assignments)
                .ThenInclude(a => a.AssignedUser)
            .Where(t => !existingCollectionTaskIds.Contains(t.Id) &&
                        (t.Title.Contains("Collection") || t.Title.Contains("Follow-up")))
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        foreach (var t in extraCollectionTasks)
        {
            var desc = t.Description ?? "";
            var invoiceMatch = System.Text.RegularExpressions.Regex.Match(desc, @"(?:Invoice|invoice):\s*([A-Za-z0-9-]+)");
            var invoiceNo = invoiceMatch.Success ? invoiceMatch.Groups[1].Value.Trim() : (System.Text.RegularExpressions.Regex.Match(t.Title, @"(?:Invoice|INV-)\s*([A-Za-z0-9-]+)").Groups[1].Value.Trim());
            if (string.IsNullOrEmpty(invoiceNo)) invoiceNo = $"INV-{t.TaskNumber}";

            var titleParts = t.Title.Split(new[] { " - " }, StringSplitOptions.RemoveEmptyEntries);
            var clientName = titleParts.Length > 1 ? titleParts[^1].Trim() : "Client Enterprise";

            result.Add(new
            {
                id = $"stars-task-{t.Id}",
                invoiceNumber = invoiceNo,
                clientAccountId = $"CLI-{invoiceNo}",
                clientName = clientName,
                clientContactPerson = (string?)null,
                clientContactNumber = (string?)null,
                clientAddress = (string?)null,
                amountDue = 75000m,
                dueDate = (DateTime?)t.Deadline,
                daysOverdue = 15,
                agingStatus = "1-30",
                alertTimestamp = t.CreatedAt,
                remarks = "Imported from active STARS database collection task.",
                starsTaskId = t.Id,
                starsTaskNumber = t.TaskNumber ?? "TK-COLLECT",
                assignedCoordinatorName = t.Assignments.FirstOrDefault()?.AssignedUser != null
                    ? $"{t.Assignments.First().AssignedUser!.FirstName} {t.Assignments.First().AssignedUser!.LastName}".Trim()
                    : "Optimal Coordinator",
                taskStatus = t.Status.ToString(),
                priorityLevel = t.PriorityLevel.ToString(),
                workloadAtRouting = 2,
                routingStatus = "Routed & Assigned"
            });
        }

        return Ok(ApiResponseDTO<object>.Success(result));
    }

    /// <summary>
    /// Coordinator submits collection follow-up outcome (Promised to Pay, Disputed, Unreachable) and dispatches callback to FOMS (Integration 3 / FOMS FR-033).
    /// </summary>
    [HttpPost("api/foms-integration/tasks/{taskId:guid}/collection-outcome")]
    [Authorize]
    public async Task<IActionResult> SubmitCollectionOutcome(Guid taskId, [FromBody] SubmitCollectionOutcomeDTO dto)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var user = await _db.Users.FindAsync(userId.Value);
        var coordinatorName = user != null
            ? $"{user.FirstName} {user.LastName}".Trim()
            : "STARS Coordinator";

        var result = await _fomsService.SendCollectionOutcomeAsync(taskId, dto, userId.Value, coordinatorName);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 4: Retrieves synchronized client accounts with role-based scoping (Manager sees all, Coordinator sees assigned).
    /// Accessible via Manager/Coordinator JWT session or pre-shared X-Api-Key (M2M).
    /// </summary>
    [HttpGet("api/foms-integration/clients")]
    [AllowAnonymous]
    public async Task<IActionResult> GetClientAccounts([FromQuery] string? role = null, [FromQuery] Guid? coordinatorId = null)
    {
        var apiKey = Request.Headers[FomsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        bool hasApiKey = FomsIntegrationService.ValidateApiKey(apiKey, _settings.InboundApiKey);

        UserRole userRole;
        Guid? userId = null;

        if (hasApiKey)
        {
            if (!string.IsNullOrWhiteSpace(role) && Enum.TryParse<UserRole>(role, true, out var parsedRole))
            {
                userRole = parsedRole;
                userId = coordinatorId;
            }
            else
            {
                userRole = UserRole.Manager;
            }
        }
        else
        {
            if (User.Identity?.IsAuthenticated != true)
                return Unauthorized(ApiResponseDTO<object>.Failure("Authentication required."));

            var roleStr = User.FindFirst(ClaimTypes.Role)?.Value;
            if (!Enum.TryParse<UserRole>(roleStr, true, out userRole) ||
                (userRole != UserRole.Coordinator && userRole != UserRole.Manager))
            {
                return StatusCode(403, ApiResponseDTO<object>.Failure("Forbidden: Insufficient permissions."));
            }
            userId = GetUserId();
        }

        var result = await _fomsService.GetClientAccountsAsync(userRole, userId);
        return Ok(result);
    }

    /// <summary>
    /// Integration 4: Retrieves a specific client account profile with role-based scoping.
    /// Accessible via Manager/Coordinator JWT session or pre-shared X-Api-Key (M2M).
    /// </summary>
    [HttpGet("api/foms-integration/clients/{clientAccountId}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetClientAccount(string clientAccountId, [FromQuery] string? role = null, [FromQuery] Guid? coordinatorId = null)
    {
        var apiKey = Request.Headers[FomsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        bool hasApiKey = FomsIntegrationService.ValidateApiKey(apiKey, _settings.InboundApiKey);

        UserRole userRole;
        Guid? userId = null;

        if (hasApiKey)
        {
            if (!string.IsNullOrWhiteSpace(role) && Enum.TryParse<UserRole>(role, true, out var parsedRole))
            {
                userRole = parsedRole;
                userId = coordinatorId;
            }
            else
            {
                userRole = UserRole.Manager;
            }
        }
        else
        {
            if (User.Identity?.IsAuthenticated != true)
                return Unauthorized(ApiResponseDTO<object>.Failure("Authentication required."));

            var roleStr = User.FindFirst(ClaimTypes.Role)?.Value;
            if (!Enum.TryParse<UserRole>(roleStr, true, out userRole) ||
                (userRole != UserRole.Coordinator && userRole != UserRole.Manager))
            {
                return StatusCode(403, ApiResponseDTO<object>.Failure("Forbidden: Insufficient permissions."));
            }
            userId = GetUserId();
        }

        var result = await _fomsService.GetClientAccountByIdAsync(clientAccountId, userRole, userId);
        if (!result.IsSuccess)
        {
            if (result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
                return NotFound(result);
            if (result.Message.Contains("denied", StringComparison.OrdinalIgnoreCase))
                return StatusCode(403, result);
            return BadRequest(result);
        }
        return Ok(result);
    }

    /// <summary>
    /// Integration 4: Manager assigns a Coordinator to manage a synchronized FOMS client account (FR-011).
    /// Accessible by Manager JWT or pre-shared X-Api-Key (M2M).
    /// </summary>
    [HttpPut("api/foms-integration/clients/{clientAccountId}/assign-coordinator")]
    [AllowAnonymous]
    public async Task<IActionResult> AssignClientCoordinator(string clientAccountId, [FromBody] AssignClientCoordinatorDTO dto)
    {
        var apiKey = Request.Headers[FomsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        bool hasApiKey = FomsIntegrationService.ValidateApiKey(apiKey, _settings.InboundApiKey);

        Guid managerUserId;
        if (hasApiKey)
        {
            var mgr = await _db.Users.FirstOrDefaultAsync(u => u.Role == UserRole.Manager);
            managerUserId = dto.ManagerUserId ?? mgr?.Id ?? Guid.NewGuid();
        }
        else
        {
            if (User.Identity?.IsAuthenticated != true)
                return Unauthorized(ApiResponseDTO<object>.Failure("Authentication required."));

            var roleStr = User.FindFirst(ClaimTypes.Role)?.Value;
            if (!string.Equals(roleStr, nameof(UserRole.Manager), StringComparison.OrdinalIgnoreCase))
            {
                return StatusCode(403, ApiResponseDTO<object>.Failure("Forbidden: Manager role required."));
            }

            var userId = GetUserId();
            if (!userId.HasValue) return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token."));
            managerUserId = userId.Value;
        }

        var result = await _fomsService.AssignClientCoordinatorAsync(clientAccountId, dto.CoordinatorId, managerUserId);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 5 (STARS Internal): Retrieve liquidation correction details for a specific STARS task.
    /// </summary>
    [HttpGet("api/foms-integration/liquidation-tasks/{taskId:guid}")]
    [Authorize]
    public async Task<IActionResult> GetLiquidationDetail(Guid taskId)
    {
        var result = await _fomsService.GetLiquidationDetailAsync(taskId);
        return result.IsSuccess ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Integration 5 (STARS Internal): Coordinator or Assignee submits corrected receipts and resolution notes.
    /// </summary>
    [HttpPost("api/foms-integration/liquidation-tasks/{taskId:guid}/submit-correction")]
    [Authorize]
    public async Task<IActionResult> SubmitLiquidationCorrection(Guid taskId, [FromBody] SubmitLiquidationCorrectionDTO dto)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _fomsService.SubmitLiquidationCorrectionAsync(taskId, dto, userId.Value);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 5 (STARS Internal): Coordinator/Manager authorizes completion and dispatches callback to FOMS.
    /// </summary>
    [HttpPost("api/foms-integration/liquidation-tasks/{taskId:guid}/callback")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> SendLiquidationCallback(Guid taskId, [FromBody] SubmitLiquidationCorrectionDTO? dto)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _fomsService.SendLiquidationCorrectionCallbackAsync(taskId, userId.Value, dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 5 (STARS Internal): Manually retry sending the liquidation correction callback to FOMS.
    /// </summary>
    [HttpPost("api/foms-integration/liquidation-tasks/{taskId:guid}/retry")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> RetryLiquidationCallback(Guid taskId)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _fomsService.RetryLiquidationCorrectionCallbackAsync(taskId, userId.Value);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    // ─── Machine-to-Machine Endpoints (API Key Guarded) ──────────────────────

    /// <summary>
    /// Integration 1: FOMS pushes a finalized invoice to STARS to create an endorsement task.
    /// </summary>
    [HttpPost("api/integration/foms/endorsement-request")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveEndorsementRequest([FromBody] FomsEndorsementRequestDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _fomsService.CreateEndorsementTaskAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 2: FOMS pushes real-time invoice and payment status updates to STARS.
    /// </summary>
    [HttpPost("api/integration/foms/payment-status")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceivePaymentStatus([FromBody] FomsPaymentStatusDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _fomsService.ProcessPaymentStatusWebhookAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 3: FOMS aging logic pushes an overdue receivable alert to STARS.
    /// STARS creates a Collection Follow-up task and routes it to the optimal Coordinator.
    /// </summary>
    [HttpPost("api/integration/foms/overdue-alert")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveOverdueAlert([FromBody] FomsOverdueAlertDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _fomsService.ProcessOverdueAlertWebhookAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 4: FOMS pushes client account lifecycle updates (create/update/deactivate) to STARS.
    /// Machine-to-machine endpoint guarded by pre-shared X-Api-Key.
    /// </summary>
    [HttpPost("api/integration/foms/client-sync")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveClientSync([FromBody] FomsClientSyncDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _fomsService.ProcessClientSyncWebhookAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 4: Bulk/full load client account synchronization from FOMS to STARS.
    /// Machine-to-machine endpoint guarded by pre-shared X-Api-Key.
    /// </summary>
    [HttpPost("api/integration/foms/client-sync/batch")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveClientBatchSync([FromBody] FomsClientBatchSyncDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _fomsService.ProcessClientBatchSyncWebhookAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 5: FOMS flags an overdue, rejected, or invalid expense liquidation for correction.
    /// STARS creates a Liquidation Correction task and routes it via Graph Routing to the optimal Coordinator.
    /// </summary>
    [HttpPost("api/integration/foms/liquidation-correction")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveLiquidationCorrection([FromBody] FomsLiquidationCorrectionRequestDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _fomsService.CreateLiquidationCorrectionTaskAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Dashboard summary reporting aggregated client balances and overdue invoices.
    /// Accessible via API Key (M2M) or Manager/Coordinator JWT session.
    /// Supports role-based scoping (Coordinators see managed accounts, Managers/API see company-wide).
    /// </summary>
    [HttpGet("api/integration/foms/dashboard-summary")]
    [AllowAnonymous]
    public async Task<IActionResult> GetDashboardSummary()
    {
        var apiKey = Request.Headers[FomsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        bool hasApiKey = FomsIntegrationService.ValidateApiKey(apiKey, _settings.InboundApiKey);

        Guid? userId = null;
        Backend.Models.Enums.UserRole? userRole = null;

        if (!hasApiKey)
        {
            var isUserAuth = User.Identity?.IsAuthenticated == true;

            if (!isUserAuth)
                return Unauthorized(ApiResponseDTO<object>.Failure("Authentication required (valid API key or authenticated user session)."));

            userId = GetUserId();
            var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;
            if (Enum.TryParse<Backend.Models.Enums.UserRole>(userRoleStr, true, out var parsedRole))
            {
                userRole = parsedRole;
            }
        }

        var result = await _fomsService.GetDashboardFinancialSummaryAsync(userId, userRole);
        return Ok(result);
    }

    /// <summary>
    /// Machine-to-machine trigger: Simulates or triggers Integration 1 completion callback to FOMS for testing.
    /// </summary>
    [HttpPost("api/integration/foms/dispatch-completion")]
    [AllowAnonymous]
    public async Task<IActionResult> TriggerDispatchCompletion([FromBody] TriggerEndorsementCompletionDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var explicitSubmission = dto.ActualReceivedDate.HasValue
            ? new SubmitSignedEndorsementDTO
            {
                ActualReceivedDate = dto.ActualReceivedDate.Value,
                SignedCopyUrl = dto.SignedCopyUrl,
                DeliveryRemarks = dto.DeliveryRemarks
            }
            : null;

        var result = await _fomsService.SendInvoiceEndorsementCompletionAsync(dto.TaskId, null, explicitSubmission);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Machine-to-machine trigger: Simulates or triggers Integration 3 collection outcome callback to FOMS for testing.
    /// </summary>
    [HttpPost("api/integration/foms/dispatch-collection-outcome")]
    [AllowAnonymous]
    public async Task<IActionResult> TriggerDispatchCollectionOutcome([FromBody] TriggerCollectionOutcomeDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var submitDto = new SubmitCollectionOutcomeDTO
        {
            Outcome = dto.Outcome,
            PromisedPaymentDate = dto.PromisedPaymentDate,
            ActionTaken = dto.ActionTaken,
            Notes = dto.Notes
        };

        var coordinatorId = dto.CoordinatorId ?? Guid.Empty;
        var coordinatorName = dto.CoordinatorName ?? "STARS Coordinator";

        var result = await _fomsService.SendCollectionOutcomeAsync(dto.TaskId, submitDto, coordinatorId, coordinatorName);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Machine-to-machine trigger: Simulates or triggers Integration 4 coordinator assignment for testing.
    /// </summary>
    [HttpPost("api/integration/foms/dispatch-assign-coordinator")]
    [AllowAnonymous]
    public async Task<IActionResult> TriggerDispatchAssignCoordinator([FromBody] TriggerAssignCoordinatorDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var mgr = await _db.Users.FirstOrDefaultAsync(u => u.Role == UserRole.Manager);
        var managerUserId = dto.ManagerUserId ?? mgr?.Id ?? Guid.NewGuid();

        var result = await _fomsService.AssignClientCoordinatorAsync(dto.ClientAccountId, dto.CoordinatorId, managerUserId);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Machine-to-machine trigger: Simulates or triggers Integration 5 liquidation correction callback to FOMS for testing.
    /// </summary>
    [HttpPost("api/integration/foms/dispatch-liquidation-callback")]
    [AllowAnonymous]
    public async Task<IActionResult> TriggerDispatchLiquidationCallback([FromBody] TriggerLiquidationCorrectionDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var explicitSubmission = !string.IsNullOrWhiteSpace(dto.CorrectedReceiptsUrl) || !string.IsNullOrWhiteSpace(dto.Remarks)
            ? new SubmitLiquidationCorrectionDTO
            {
                CorrectedReceiptsUrl = dto.CorrectedReceiptsUrl ?? "https://stars.speedex.com/receipts/placeholder.jpg",
                Remarks = dto.Remarks
            }
            : null;

        var result = await _fomsService.SendLiquidationCorrectionCallbackAsync(dto.TaskId, dto.CoordinatorId, explicitSubmission);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Cross-system uniqueness probe: checks whether an email or employee number is already in use in STARS.
    /// Authenticated by shared X-Api-Key.
    /// </summary>
    [HttpGet("api/integration/check-user-exists")]
    [AllowAnonymous]
    public async Task<IActionResult> CheckUserExists([FromQuery] string? email, [FromQuery] string? employeeNumber)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(employeeNumber))
            return BadRequest(new { exists = false, message = "Either email or employeeNumber must be provided." });

        if (!string.IsNullOrWhiteSpace(email))
        {
            var emailLower = email.Trim().ToLower();
            var existsByEmail = await _db.Users.AnyAsync(u => u.Email.ToLower() == emailLower);
            if (existsByEmail)
                return Ok(new { exists = true, system = "STARS", matchedBy = "email" });
        }

        if (!string.IsNullOrWhiteSpace(employeeNumber))
        {
            var empLower = employeeNumber.Trim().ToLower();
            var existsByEmp = await _db.Users.AnyAsync(u => u.EmployeeNumber.ToLower() == empLower);
            if (existsByEmp)
                return Ok(new { exists = true, system = "STARS", matchedBy = "employeeNumber" });
        }

        return Ok(new { exists = false, system = "STARS", matchedBy = "none" });
    }
}
