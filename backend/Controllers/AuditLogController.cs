using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
[Route("api/audit-logs")]
[Authorize]
public class AuditLogController : ControllerBase
{
    private readonly IAuditLogService _auditLogService;

    public AuditLogController(IAuditLogService auditLogService)
    {
        _auditLogService = auditLogService;
    }

    [HttpGet("my")]
    public async Task<IActionResult> GetMyLogs(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10)
    {
        var userId = GetUserIdFromClaims();
        if (!userId.HasValue)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user"));

        var filters = new AuditLogFilterDTO { UserId = userId.Value };
        var result = await _auditLogService.GetAllAsync(pageNumber, pageSize, filters);
        return Ok(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] DateTime? dateRangeStart = null,
        [FromQuery] DateTime? dateRangeEnd = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] AuditActionType? actionType = null,
        [FromQuery] string? module = null,
        [FromQuery] string? targetEntity = null)
    {
        var requestUserId = GetUserIdFromClaims();
        var ipAddress = GetIpAddress();
        var userRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (userRole != UserRole.Manager.ToString() && userRole != UserRole.Coordinator.ToString())
        {
            if (requestUserId.HasValue)
                await _auditLogService.LogAccessDeniedAsync(requestUserId.Value, ipAddress, "AuditLog");
            return StatusCode(403, ApiResponseDTO<object>.Failure("Access denied. Only Managers and Coordinators can view audit logs."));
        }

        if (requestUserId.HasValue)
            await _auditLogService.LogAccessAsync(requestUserId.Value, ipAddress);

        var filters = new AuditLogFilterDTO
        {
            DateRangeStart = dateRangeStart,
            DateRangeEnd = dateRangeEnd,
            UserId = userId,
            ActionType = actionType,
            Module = module,
            TargetEntity = targetEntity
        };

        var result = await _auditLogService.GetAllAsync(pageNumber, pageSize, filters);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var requestUserId = GetUserIdFromClaims();
        var ipAddress = GetIpAddress();
        var userRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (userRole != UserRole.Manager.ToString() && userRole != UserRole.Coordinator.ToString())
        {
            if (requestUserId.HasValue)
                await _auditLogService.LogAccessDeniedAsync(requestUserId.Value, ipAddress, "AuditLog");
            return StatusCode(403, ApiResponseDTO<object>.Failure("Access denied. Only Managers and Coordinators can view audit logs."));
        }

        if (requestUserId.HasValue)
            await _auditLogService.LogAccessAsync(requestUserId.Value, ipAddress);

        var result = await _auditLogService.GetByIdAsync(id);
        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CanAccessAuditLogs)]
    public async Task<IActionResult> AttemptUpdate(Guid id)
    {
        var requestUserId = GetUserIdFromClaims();
        var ipAddress = GetIpAddress();

        await _auditLogService.LogBlockedModificationAsync(
            requestUserId, ipAddress, "edit", id);

        return StatusCode(403, ApiResponseDTO<object>.Failure(
            "Audit records are immutable and cannot be edited, deleted, or exported."));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CanAccessAuditLogs)]
    public async Task<IActionResult> AttemptDelete(Guid id)
    {
        var requestUserId = GetUserIdFromClaims();
        var ipAddress = GetIpAddress();

        await _auditLogService.LogBlockedModificationAsync(
            requestUserId, ipAddress, "delete", id);

        return StatusCode(403, ApiResponseDTO<object>.Failure(
            "Audit records are immutable and cannot be edited, deleted, or exported."));
    }

    [HttpPost("{id:guid}/export")]
    [Authorize(Policy = AuthorizationPolicies.CanAccessAuditLogs)]
    public async Task<IActionResult> AttemptExport(Guid id)
    {
        var requestUserId = GetUserIdFromClaims();
        var ipAddress = GetIpAddress();

        await _auditLogService.LogBlockedModificationAsync(
            requestUserId, ipAddress, "export", id);

        return StatusCode(403, ApiResponseDTO<object>.Failure(
            "Audit records are immutable and cannot be edited, deleted, or exported."));
    }

    private Guid? GetUserIdFromClaims()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var userIdGuid))
            return null;
        return userIdGuid;
    }

    private string? GetIpAddress()
    {
        var forwardedFor = HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrEmpty(forwardedFor))
            return forwardedFor.Split(',').First().Trim();

        return HttpContext.Connection.RemoteIpAddress?.ToString();
    }
}
