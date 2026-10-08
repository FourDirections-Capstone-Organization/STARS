using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.AuthenticationAndCredentials;

public interface IEmailVerificationService
{
    Task<ApiResponseDTO<bool>> VerifyEmailAsync(string token);
    Task<ApiResponseDTO<bool>> ResendVerificationAsync(Guid? employeeId, string? email, string verificationUrl, string? identifier = null);
    Task<ApiResponseDTO<EmailVerificationStatusDTO>> GetVerificationStatusAsync(Guid userId);
    System.Threading.Tasks.Task SendVerificationEmailForUserAsync(Guid userId, string verificationUrl);
}
