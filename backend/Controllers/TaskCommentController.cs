using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;

namespace Backend.Controllers;

[ApiController]
[Route("api/tasks/{taskId:guid}/comments")]
[Authorize]
public class TaskCommentController : ControllerBase
{
    private readonly ITaskCommentService _commentService;

    public TaskCommentController(ITaskCommentService commentService)
    {
        _commentService = commentService;
    }

    private (Guid? UserId, UserRole? Role) GetUserIdentity()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId) ||
            string.IsNullOrEmpty(roleClaim) || !Enum.TryParse<UserRole>(roleClaim, true, out var userRole))
        {
            return (null, null);
        }

        return (userId, userRole);
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        Guid taskId,
        [FromForm] string? content = null,
        [FromForm] List<IFormFile>? attachments = null)
    {
        var (authorId, role) = GetUserIdentity();
        if (!authorId.HasValue || !role.HasValue)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var access = await _commentService.CanUserAccessTaskCommentsAsync(taskId, authorId.Value, role.Value);
        if (!access.IsSuccess)
            return StatusCode(403, ApiResponseDTO<object>.Failure(access.Message));

        var result = await _commentService.CreateAsync(taskId, content, attachments, authorId.Value);
        if (!result.IsSuccess)
            return BadRequest(result);

        return CreatedAtAction(nameof(GetByTask), new { taskId }, result);
    }

    [HttpGet("{commentId:guid}/attachments/{attachmentId:guid}/download")]
    public async Task<IActionResult> DownloadAttachment(Guid taskId, Guid commentId, Guid attachmentId)
    {
        var (userId, role) = GetUserIdentity();
        if (!userId.HasValue || !role.HasValue)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var access = await _commentService.CanUserAccessTaskCommentsAsync(taskId, userId.Value, role.Value);
        if (!access.IsSuccess)
            return StatusCode(403, ApiResponseDTO<object>.Failure(access.Message));

        var result = await _commentService.GetAttachmentAsync(commentId, attachmentId);
        if (!result.IsSuccess)
            return NotFound(result);

        var attachment = result.Data!;

        if (!System.IO.File.Exists(attachment.FilePath))
            return NotFound(ApiResponseDTO<object>.Failure("File not found on disk"));

        var fileBytes = await System.IO.File.ReadAllBytesAsync(attachment.FilePath);
        return File(fileBytes, "application/octet-stream", attachment.FileName);
    }

    [HttpGet("{commentId:guid}/attachment/download")]
    public async Task<IActionResult> DownloadLegacyAttachment(Guid taskId, Guid commentId)
    {
        var (userId, role) = GetUserIdentity();
        if (!userId.HasValue || !role.HasValue)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var access = await _commentService.CanUserAccessTaskCommentsAsync(taskId, userId.Value, role.Value);
        if (!access.IsSuccess)
            return StatusCode(403, ApiResponseDTO<object>.Failure(access.Message));

        // Backward compatibility: comments created before multi-file attachments
        // store a single file directly on the comment row.
        var result = await _commentService.GetLegacyAttachmentAsync(commentId);
        if (!result.IsSuccess)
            return NotFound(result);

        var comment = result.Data!;
        var fileName = string.IsNullOrEmpty(comment.AttachmentFileName)
            ? Path.GetFileName(comment.AttachmentFilePath!)
            : comment.AttachmentFileName;

        var fileBytes = await System.IO.File.ReadAllBytesAsync(comment.AttachmentFilePath!);
        return File(fileBytes, "application/octet-stream", fileName);
    }

    [HttpGet]
    public async Task<IActionResult> GetByTask(
        Guid taskId,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10)
    {
        var (userId, role) = GetUserIdentity();
        if (!userId.HasValue || !role.HasValue)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var access = await _commentService.CanUserAccessTaskCommentsAsync(taskId, userId.Value, role.Value);
        if (!access.IsSuccess)
            return StatusCode(403, ApiResponseDTO<object>.Failure(access.Message));

        var result = await _commentService.GetByTaskIdAsync(taskId, pageNumber, pageSize);
        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpPut("{commentId:guid}")]
    public async Task<IActionResult> Update(Guid taskId, Guid commentId, UpdateTaskCommentDTO dto)
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var parsedUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _commentService.UpdateAsync(commentId, dto.Content, parsedUserId);
        if (!result.IsSuccess)
        {
            if (result.Message.Contains("Unauthorized"))
                return StatusCode(403, result);

            if (result.Message.Contains("not found"))
                return NotFound(result);

            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpDelete("{commentId:guid}")]
    public async Task<IActionResult> Delete(Guid taskId, Guid commentId)
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var parsedUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _commentService.DeleteAsync(commentId, parsedUserId);
        if (!result.IsSuccess)
        {
            if (result.Message.Contains("Unauthorized"))
                return StatusCode(403, result);

            if (result.Message.Contains("not found"))
                return NotFound(result);

            return BadRequest(result);
        }

        return Ok(result);
    }
}
