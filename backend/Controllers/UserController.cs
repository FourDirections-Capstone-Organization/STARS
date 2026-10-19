using System.Security.Claims;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Modules.RoleBasedAccessControl;
using Backend.Modules.UserAccountManagement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;


namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UserController : ControllerBase
{
    private readonly IUserService _userService;

    public UserController(IUserService userService)
    {
        _userService = userService;
    }

    [HttpPost("register")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> Register(RegisterUserDTO dto)
    {
        var result = await _userService.RegisterAsync(dto);
        if (!result.IsSuccess)
            return BadRequest(result);

        return CreatedAtAction(nameof(GetById), new { id = result.Data!.Id }, result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        [FromQuery] string? role = null,
        [FromQuery] Guid? departmentId = null,
        [FromQuery] string? status = null
    )
    {
        var result = await _userService.GetAllAsync(pageNumber, pageSize, search, role, departmentId, status);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _userService.GetByIdAsync(id);
        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpGet("employee-number/{employeeNumber}")]
    public async Task<IActionResult> GetByEmployeeNumber(string employeeNumber)
    {
        var result = await _userService.GetByEmployeeNumberAsync(employeeNumber);
        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateUserDTO dto)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid? requestUserId = Guid.TryParse(userId, out var guid) ? guid : null;

        var result = await _userService.UpdateAsync(id, dto, requestUserId);
        if (!result.IsSuccess)
        {
            if (result.Message.Contains("not found"))
                return NotFound(result);

            if (result.Message.Contains("permission"))
                return StatusCode(403, ApiResponseDTO<object>.Failure("You don't have permission to perform this action"));

            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpPatch("{id:guid}/deactivate")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid? requestUserId = Guid.TryParse(userId, out var guid) ? guid : null;

        var result = await _userService.DeactivateAsync(id, requestUserId);
        if (!result.IsSuccess)
        {
            if (result.Message.Contains("not found"))
                return NotFound(result);
            
            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpPatch("{id:guid}/activate")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> Activate(Guid id)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid? requestUserId = Guid.TryParse(userId, out var guid) ? guid : null;

        var result = await _userService.ActivateAsync(id, requestUserId);
        if (!result.IsSuccess)
        {
            if (result.Message.Contains("not found"))
                return NotFound(result);

            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpGet("next-employee-number")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> GetNextEmployeeNumber()
    {
        var result = await _userService.GenerateEmployeeNumberAsync();
        return Ok(result);
    }
}
