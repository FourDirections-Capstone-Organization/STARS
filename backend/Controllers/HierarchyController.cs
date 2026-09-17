using System.Security.Claims;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Modules.OrganizationalStructure;
using Backend.Modules.RoleBasedAccessControl;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class HierarchyController : ControllerBase
{
    private readonly IHierarchyService _hierarchyService;

    public HierarchyController(IHierarchyService hierarchyService)
    {
        _hierarchyService = hierarchyService;
    }

    [HttpGet("structure")]
    public async Task<IActionResult> GetStructure()
    {
        var result = await _hierarchyService.GetHierarchyStructureAsync();
        return Ok(result);
    }

    [HttpGet("employee/{id:guid}")]
    public async Task<IActionResult> GetEmployee(Guid id)
    {
        var result = await _hierarchyService.GetEmployeeHierarchyAsync(id);
        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string query)
    {
        var result = await _hierarchyService.SearchEmployeesAsync(query);
        return Ok(result);
    }

    [HttpPost("map")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> MapEmployee([FromBody] MapHierarchyDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        var result = await _hierarchyService.MapEmployeeHierarchyAsync(dto, requestUserId);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }
}
