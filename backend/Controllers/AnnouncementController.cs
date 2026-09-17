using System.Security.Claims;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Notifications;
using Backend.Modules.RoleBasedAccessControl;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AnnouncementController : ControllerBase
{
    private readonly IAnnouncementService _announcementService;

    public AnnouncementController(IAnnouncementService announcementService)
    {
        _announcementService = announcementService;
    }

    [HttpPost]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Create([FromForm] CreateAnnouncementDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var creatorId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _announcementService.CreateAsync(dto, creatorId);
        if (!result.IsSuccess) return BadRequest(result);
        return Ok(result);
    }

    [HttpGet("active")]
    public async Task<IActionResult> GetActive()
    {
        var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid? currentUserId = Guid.TryParse(userId, out var uid) ? uid : null;

        var result = await _announcementService.GetActiveAsync(userRole, currentUserId);
        return Ok(result);
    }

    [HttpGet("all")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetAll()
    {
        var result = await _announcementService.GetAllAsync();
        return Ok(result);
    }

    [HttpGet("{id:guid}/attachment")]
    public async Task<IActionResult> DownloadAttachment(Guid id)
    {
        var attachment = await _announcementService.GetAttachmentAsync(id);
        if (attachment is null)
            return NotFound(ApiResponseDTO<object>.Failure("Attachment not found"));

        return File(attachment.Value.FileBytes, attachment.Value.ContentType, attachment.Value.FileName);
    }

    [HttpPost("{id:guid}/acknowledge")]
    public async Task<IActionResult> Acknowledge(Guid id)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var uid))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _announcementService.AcknowledgeAsync(id, uid);
        if (!result.IsSuccess) return BadRequest(result);
        return Ok(result);
    }

    [HttpPost("{id:guid}/comments")]
    public async Task<IActionResult> AddComment(Guid id, [FromBody] AddCommentDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var uid))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _announcementService.AddCommentAsync(id, uid, dto.Content);
        if (!result.IsSuccess) return BadRequest(result);
        return Ok(result);
    }
}

