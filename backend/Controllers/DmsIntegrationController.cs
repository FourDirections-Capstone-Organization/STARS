using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Modules.DmsIntegration;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
public class DmsIntegrationController : ControllerBase
{
    private readonly IDmsIntegrationService _dmsService;
    private readonly DmsIntegrationSettings _settings;

    public DmsIntegrationController(
        IDmsIntegrationService dmsService,
        IOptions<DmsIntegrationSettings> settings)
    {
        _dmsService = dmsService;
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
            return StatusCode(503, ApiResponseDTO<object>.Failure("DMS integration is not configured on this server."));

        var key = Request.Headers[DmsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        return DmsIntegrationService.ValidateApiKey(key, _settings.InboundApiKey)
            ? null
            : Unauthorized(ApiResponseDTO<object>.Failure("Invalid or missing API key."));
    }

    // ─── STARS User Endpoints (JWT Guarded) ───────────────────────────────────

    /// <summary>
    /// Attach or update recipient and delivery address details for a task.
    /// </summary>
    [HttpPut("api/dms-integration/tasks/{taskId:guid}/delivery-details")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> UpsertDeliveryDetail(Guid taskId, [FromBody] UpsertTaskDeliveryDetailDTO dto)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _dmsService.UpsertDeliveryDetailAsync(taskId, dto, userId.Value);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Retrieve delivery recipient details and DMS tracking sync state for a task.
    /// </summary>
    [HttpGet("api/dms-integration/tasks/{taskId:guid}/delivery-details")]
    [Authorize]
    public async Task<IActionResult> GetDeliveryDetail(Guid taskId)
    {
        var result = await _dmsService.GetDeliveryDetailAsync(taskId);
        return result.IsSuccess ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Manually trigger or retry sending a task's delivery order to DMS.
    /// </summary>
    [HttpPost("api/dms-integration/tasks/{taskId:guid}/resend")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> ResendToDms(Guid taskId)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _dmsService.CreateDeliveryOrderForTaskAsync(taskId, userId.Value);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    // ─── Machine-to-Machine Endpoints (API Key Guarded) ──────────────────────

    /// <summary>
    /// Integration 2: DMS pushes real-time delivery status updates / POD completion to STARS.
    /// </summary>
    [HttpPost("api/integration/dms/status")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveStatusUpdate([FromBody] DmsStatusWebhookDTO dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessStatusUpdateAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 3: DMS pushes scheduled batch delivery completion records for performance analytics.
    /// </summary>
    [HttpPost("api/integration/dms/performance-batch")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceivePerformanceBatch([FromBody] DmsPerformanceBatchDTO batch)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessPerformanceBatchAsync(batch);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Merged performance summary reporting on-time vs late delivery rates.
    /// Accessible via API Key (machine-to-machine) or Manager/Coordinator JWT.
    /// </summary>
    [HttpGet("api/integration/dms/performance-summary")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPerformanceSummary([FromQuery] string? driverId)
    {
        // Allow access if valid API key is present OR user is authenticated as Coordinator/Manager
        var apiKey = Request.Headers[DmsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        bool hasApiKey = DmsIntegrationService.ValidateApiKey(apiKey, _settings.InboundApiKey);

        if (!hasApiKey)
        {
            var isUserAuth = User.Identity?.IsAuthenticated == true &&
                (User.IsInRole("Manager") || User.IsInRole("Coordinator"));

            if (!isUserAuth)
                return Unauthorized(ApiResponseDTO<object>.Failure("Authentication required (valid API key or Coordinator/Manager session)."));
        }

        var result = await _dmsService.GetPerformanceSummaryAsync(driverId);
        return Ok(result);
    }
}
