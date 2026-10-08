using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
[Route("api/email-verification")]
public class EmailVerificationController : ControllerBase
{
    private readonly IEmailVerificationService _verificationService;
    private readonly string _frontendUrl;

    public EmailVerificationController(
        IEmailVerificationService verificationService,
        IConfiguration configuration)
    {
        _verificationService = verificationService;
        _frontendUrl = configuration["AppSettings:FrontendUrl"]
            ?? throw new InvalidOperationException("FrontendUrl not configured");
    }

    [HttpPost("verify")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailDTO dto)
    {
        var result = await _verificationService.VerifyEmailAsync(dto.Token);
        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [HttpPost("resend")]
    [AllowAnonymous]
    public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationDTO dto)
    {
        var baseUrl = GetClientBaseUrl();
        var verificationUrl = $"{baseUrl}/verify-email";

        Guid? employeeGuid = null;
        string? identifier = dto.Identifier ?? dto.EmployeeNumber ?? dto.EmployeeID ?? dto.EmployeeId;
        if (!string.IsNullOrWhiteSpace(identifier) && Guid.TryParse(identifier, out var parsedGuid))
        {
            employeeGuid = parsedGuid;
        }

        var result = await _verificationService.ResendVerificationAsync(
            employeeGuid, dto.Email, verificationUrl, identifier);

        if (!result.IsSuccess)
            return BadRequest(result);

        return Ok(result);
    }

    [HttpGet("status/{userId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CanManageUsers)]
    public async Task<IActionResult> GetVerificationStatus(Guid userId)
    {
        var result = await _verificationService.GetVerificationStatusAsync(userId);
        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    private string GetClientBaseUrl()
    {
        if (Request.Headers.TryGetValue("Origin", out var origin) && !string.IsNullOrWhiteSpace(origin))
        {
            return origin.ToString().TrimEnd('/');
        }

        if (Request.Headers.TryGetValue("Referer", out var referer) && !string.IsNullOrWhiteSpace(referer))
        {
            if (Uri.TryCreate(referer.ToString(), UriKind.Absolute, out var uri))
            {
                return $"{uri.Scheme}://{uri.Authority}";
            }
        }

        return _frontendUrl.TrimEnd('/');
    }
}
