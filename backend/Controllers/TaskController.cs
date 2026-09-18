using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TaskController : ControllerBase
{
    private readonly ITaskService _taskService;
    private readonly ITaskWorkflowService _workflowService;
    private readonly AppDbContext _db;

    public TaskController(ITaskService taskService, ITaskWorkflowService workflowService, AppDbContext db)
    {
        _taskService = taskService;
        _workflowService = workflowService;
        _db = db;
    }

    [HttpPost]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Create(CreateTaskDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var creatorId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _taskService.CreateAsync(dto, creatorId, ipAddress);
        if (!result.IsSuccess)
            return BadRequest(result);

        return CreatedAtAction(nameof(GetById), new { id = result.Data!.Id }, result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] Models.Enums.TaskStatus? status = null,
        [FromQuery] PriorityLevel? priority = null,
        [FromQuery] TaskClassification? classification = null,
        [FromQuery] Guid? assignedToUserId = null,
        [FromQuery] Guid? departmentId = null,
        [FromQuery] string? search = null,
        [FromQuery] Models.Enums.TaskStatus? excludeStatus = null,
        [FromQuery] string? excludeStatuses = null)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        List<Models.Enums.TaskStatus>? excludedList = null;
        if (!string.IsNullOrEmpty(excludeStatuses))
        {
            excludedList = new List<Models.Enums.TaskStatus>();
            var parts = excludeStatuses.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var part in parts)
            {
                if (int.TryParse(part, out var intVal) && Enum.IsDefined(typeof(Models.Enums.TaskStatus), intVal))
                    excludedList.Add((Models.Enums.TaskStatus)intVal);
                else if (Enum.TryParse<Models.Enums.TaskStatus>(part, true, out var enumVal))
                    excludedList.Add(enumVal);
            }
        }

        var result = await _taskService.GetAllAsync(
            requestUserId, requestUserRole, requestUserDepartmentId,
            pageNumber, pageSize,
            status, priority, classification, assignedToUserId, departmentId, search, excludeStatus, excludedList);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        var result = await _taskService.GetByIdAsync(id, requestUserId, requestUserRole);
        if (!result.IsSuccess)
        {
            if (result.Message.Contains("Access denied"))
                return StatusCode(403, result);

            return NotFound(result);
        }

        return Ok(result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Update(Guid id, UpdateTaskDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _taskService.UpdateAsync(id, dto, requestUserId, ipAddress);
        if (!result.IsSuccess)
        {
            if (result.Message.Contains("not found"))
                return NotFound(result);

            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpGet("assignable-users")]
    public async Task<IActionResult> GetAssignableUsers(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10)
    {
        var result = await _taskService.GetAssignableUsersAsync(pageNumber, pageSize);
        return Ok(result);
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, TaskStatusUpdateDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var parsedUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _workflowService.UpdateStatusAsync(id, dto, parsedUserId, ipAddress);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [HttpPatch("{id:guid}/progress")]
    public async Task<IActionResult> UpdateProgress(Guid id, TaskProgressUpdateDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var parsedUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _workflowService.UpdateProgressAsync(id, dto, parsedUserId, ipAddress);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [HttpPatch("{id:guid}/review")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Review(Guid id, ReviewTaskDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var reviewerId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _workflowService.ReviewTaskAsync(id, dto, reviewerId, ipAddress);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [HttpPatch("{id:guid}/hold")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> PlaceOnHold(Guid id, PlaceOnHoldDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var coordinatorId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _workflowService.PlaceOnHoldAsync(id, dto, coordinatorId, ipAddress);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [HttpPatch("{id:guid}/resume")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Resume(Guid id, ResumeTaskDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var coordinatorId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _workflowService.ResumeTaskAsync(id, dto, coordinatorId, ipAddress);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [HttpPatch("{id:guid}/cancel")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Cancel(Guid id, CancelTaskDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var coordinatorId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var ipAddress = GetIpAddress();
        var result = await _workflowService.CancelTaskAsync(id, dto, coordinatorId, ipAddress);
        if (!result.IsSuccess)
            return BadRequest(result);

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
