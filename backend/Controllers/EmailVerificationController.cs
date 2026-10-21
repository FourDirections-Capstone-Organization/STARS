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
    private readonly ILogger<EmailVerificationController> _logger;

    public EmailVerificationController(
        IEmailVerificationService verificationService,
        IConfiguration configuration,
        ILogger<EmailVerificationController> logger)
    {
        _verificationService = verificationService;
        _logger = logger;
        _frontendUrl = configuration["AppSettings:FrontendUrl"]
            ?? configuration["AppSettings__FrontendUrl"]
            ?? configuration["FrontendUrl"]
            ?? "https://stars-two-chi.vercel.app";
    }

    [HttpPost("verify")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailDTO? dto)
    {
        try
        {
            if (dto is null || string.IsNullOrWhiteSpace(dto.Token))
                return BadRequest(ApiResponseDTO<bool>.Failure("Verification token is required."));

            var result = await _verificationService.VerifyEmailAsync(dto.Token);
            if (!result.IsSuccess)
                return BadRequest(result);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in VerifyEmail");
            return StatusCode(500, ApiResponseDTO<bool>.Failure($"Verification failed: {ex.Message}"));
        }
    }

    [HttpPost("resend")]
    [AllowAnonymous]
    public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationDTO? dto)
    {
        try
        {
            if (dto is null)
                return BadRequest(ApiResponseDTO<bool>.Failure("Request payload cannot be empty."));

            var baseUrl = GetClientBaseUrl();
            var verificationUrl = $"{baseUrl}/verify-email";

            Guid? employeeGuid = null;
            string? identifier = dto.Identifier ?? dto.EmployeeNumber ?? dto.EmployeeID ?? dto.EmployeeId;
            if (!string.IsNullOrWhiteSpace(identifier) && Guid.TryParse(identifier, out var parsedGuid))
            {
                employeeGuid = parsedGuid;
            }
            else if (!string.IsNullOrWhiteSpace(dto.EmployeeId) && Guid.TryParse(dto.EmployeeId, out var parsedId))
            {
                employeeGuid = parsedId;
            }

            var result = await _verificationService.ResendVerificationAsync(
                employeeGuid, dto.Email, verificationUrl, identifier);

            if (!result.IsSuccess)
                return BadRequest(result);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in ResendVerification for identifier {Identifier}", dto?.Identifier ?? dto?.EmployeeNumber);
            return StatusCode(500, ApiResponseDTO<bool>.Failure($"Failed to send verification email: {ex.Message}"));
        }
    }

    [HttpGet("status/{userId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CanManageUsers)]
    public async Task<IActionResult> GetVerificationStatus(Guid userId)
    {
        try
        {
            var result = await _verificationService.GetVerificationStatusAsync(userId);
            if (!result.IsSuccess)
                return NotFound(result);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetVerificationStatus for user {UserId}", userId);
            return StatusCode(500, ApiResponseDTO<EmailVerificationStatusDTO>.Failure($"Failed to retrieve status: {ex.Message}"));
        }
    }

    private string GetClientBaseUrl()
    {
        try
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
        }
        catch
        {
            // fallback
        }

        return (_frontendUrl ?? "https://stars-two-chi.vercel.app").TrimEnd('/');
    }
}
