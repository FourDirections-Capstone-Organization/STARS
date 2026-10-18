using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
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
    /// Dashboard summary reporting aggregated client balances and overdue invoices.
    /// Accessible via API Key (M2M) or Manager/Coordinator JWT session.
    /// </summary>
    [HttpGet("api/integration/foms/dashboard-summary")]
    [AllowAnonymous]
    public async Task<IActionResult> GetDashboardSummary()
    {
        var apiKey = Request.Headers[FomsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        bool hasApiKey = FomsIntegrationService.ValidateApiKey(apiKey, _settings.InboundApiKey);

        if (!hasApiKey)
        {
            var isUserAuth = User.Identity?.IsAuthenticated == true &&
                (User.IsInRole("Manager") || User.IsInRole("Coordinator"));

            if (!isUserAuth)
                return Unauthorized(ApiResponseDTO<object>.Failure("Authentication required (valid API key or Coordinator/Manager session)."));
        }

        var result = await _fomsService.GetDashboardFinancialSummaryAsync();
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
