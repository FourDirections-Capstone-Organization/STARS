using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Modules.RoleBasedAccessControl;
using Backend.Modules.TaskManagement;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TeamController : ControllerBase
{
    private readonly ITeamService _teamService;

    public TeamController(ITeamService teamService)
    {
        _teamService = teamService;
    }

    private Guid GetUserId()
    {
        var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(value, out var id) ? id : Guid.Empty;
    }

    [HttpGet]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetAll([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null, [FromQuery] bool includeInactive = false)
    {
        var result = await _teamService.GetAllAsync(pageNumber, pageSize, search, includeInactive);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _teamService.GetByIdAsync(id);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpPost]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Create(CreateTeamDTO dto)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _teamService.CreateAsync(dto, userId);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Update(Guid id, UpdateTeamDTO dto)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _teamService.UpdateAsync(id, dto, userId);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _teamService.DeleteAsync(id, userId);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:guid}/members")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> AddMembers(Guid id, AddTeamMembersDTO dto)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _teamService.AddMembersAsync(id, dto, userId);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:guid}/members/{memberUserId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberUserId)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _teamService.RemoveMemberAsync(id, memberUserId, userId);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpPut("members/{memberUserId:guid}/team/{newTeamId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> TransferMember(Guid memberUserId, Guid newTeamId)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _teamService.TransferMemberAsync(memberUserId, newTeamId, userId);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpGet("{id:guid}/tasks")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetTeamTasks(Guid id, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null, [FromQuery] int? status = null, [FromQuery] int? priority = null)
    {
        var result = await _teamService.GetTeamTasksAsync(id, pageNumber, pageSize, search, status, priority);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpGet("{id:guid}/workload")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetTeamWorkload(Guid id)
    {
        var result = await _teamService.GetTeamWorkloadAsync(id);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }
}
