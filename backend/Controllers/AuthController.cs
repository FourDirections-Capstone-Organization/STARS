using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Models.DTOs;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Models;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly string _frontendUrl;

    public AuthController(IAuthService authService, IConfiguration configuration)
    {
        _authService = authService;
        _frontendUrl = configuration["AppSettings:FrontendUrl"]
            ?? throw new InvalidOperationException("FrontendUrl not configured");
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginDTO dto)
    {
        var ipAddress = GetIpAddress();
        var result = await _authService.LoginAsync(dto, ipAddress);
        return Ok(result);
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordDTO dto)
    {
        var resetUrl = $"{_frontendUrl}/reset-password";
        var result = await _authService.ForgotPasswordAsync(dto, resetUrl);
        
        // Always return success to prevent email enumeration
        return Ok(result);
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordDTO dto)
    {
        var result = await _authService.ResetPasswordAsync(dto);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var userId = GetUserIdFromClaims();
        if (userId.HasValue)
        {
            await _authService.LogoutAsync(userId.Value);
        }
        return Ok(new { message = "Logged out successfully" });
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordDTO dto)
    {
        var userId = GetUserIdFromClaims();
        if (!userId.HasValue)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user"));

        var result = await _authService.ChangePasswordAsync(userId.Value, dto);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [HttpPost("refresh-token")]
    public async Task<IActionResult> RefreshToken(RefreshTokenDTO dto)
    {
        var result = await _authService.RefreshTokenAsync(dto.RefreshToken);
        if (!result.IsSuccess)
            return Unauthorized(result);

        return Ok(result);
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetCurrentUser()
    {
        var userId = GetUserIdFromClaims();
        if (!userId.HasValue)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user"));

        var result = await _authService.GetCurrentUserAsync(userId.Value);
        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [Authorize]
    [HttpPost("verify-password")]
    public async Task<IActionResult> VerifyPassword(VerifyPasswordDTO dto)
    {
        var result = await _authService.VerifyPasswordAsync(dto);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [Authorize]
    [HttpPost("accept-terms")]
    public async Task<IActionResult> AcceptTerms(AcceptTermsDTO dto)
    {
        var userId = GetUserIdFromClaims();
        if (!userId.HasValue)
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user"));

        var result = await _authService.AcceptTermsAsync(userId.Value, dto.TermsVersion);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
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
