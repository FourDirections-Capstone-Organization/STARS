using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class AttachmentController : ControllerBase
{

    private readonly IAttachmentService _attachmentService;

    public AttachmentController(IAttachmentService attachmentService)
    {
        _attachmentService = attachmentService;
    }

    [HttpPost("tasks/{taskId:guid}/attachments")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Upload(
        Guid taskId,
        IFormFile file,
        [FromForm] string? description = null)
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var uploaderId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _attachmentService.UploadAsync(taskId, file, description, uploaderId, ipAddress);
        if (!result.IsSuccess)
            return BadRequest(result);

        return CreatedAtAction(nameof(GetById), new { id = result.Data!.Id }, result);
    }

    [HttpGet("tasks/{taskId:guid}/attachments")]
    public async Task<IActionResult> GetByTask(
        Guid taskId,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10)
    {
        var result = await _attachmentService.GetByTaskIdAsync(taskId, pageNumber, pageSize);
        return Ok(result);
    }

    [HttpGet("attachments/{id:guid}/download")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userIdStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var roleStr = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
        Enum.TryParse<UserRole>(roleStr, true, out var userRole);

        // SEC-05: Broken Object-Level Authorization (BOLA/IDOR) Check
        var accessCheck = await _attachmentService.CanUserAccessAttachmentAsync(id, userId, userRole);
        if (!accessCheck.IsSuccess)
        {
            if (accessCheck.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
                return NotFound(accessCheck);
            return StatusCode(403, ApiResponseDTO<object>.Failure("You do not have permission to download this attachment."));
        }

        var result = await _attachmentService.GetByIdAsync(id);
        if (!result.IsSuccess)
            return NotFound(result);

        var attachment = result.Data!;

        if (!System.IO.File.Exists(attachment.FilePath))
            return NotFound(ApiResponseDTO<object>.Failure("File not found on disk"));

        // Downloads the file
        var fileBytes = await System.IO.File.ReadAllBytesAsync(attachment.FilePath);
        return File(fileBytes, "application/octet-stream", attachment.FileName);
    }

    [HttpDelete("attachments/{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var parsedUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _attachmentService.DeleteAsync(id, parsedUserId, ipAddress);
        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    private string? GetIpAddress()
    {
        var forwardedFor = HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrEmpty(forwardedFor))
            return forwardedFor.Split(',').First().Trim();

        return HttpContext.Connection.RemoteIpAddress?.ToString();
    }
}
