using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.AuthenticationAndCredentials;

public interface IAuthService
{
    Task<ApiResponseDTO<AuthResponseDTO>> LoginAsync(LoginDTO dto, string? ipAddress = null);
    Task<ApiResponseDTO<bool>> ForgotPasswordAsync(ForgotPasswordDTO dto, string resetUrl);
    Task<ApiResponseDTO<bool>> ResetPasswordAsync(ResetPasswordDTO dto);
    Task<ApiResponseDTO<bool>> ChangePasswordAsync(Guid userId, ChangePasswordDTO dto);
    Task<ApiResponseDTO<bool>> LogoutAsync(Guid userId);
    Task<ApiResponseDTO<AuthResponseDTO>> RefreshTokenAsync(string refreshToken);
    Task<ApiResponseDTO<UserResponseDTO>> GetCurrentUserAsync(Guid userId);
    Task<ApiResponseDTO<bool>> VerifyPasswordAsync(VerifyPasswordDTO dto);
    Task<ApiResponseDTO<bool>> AcceptTermsAsync(Guid userId, string termsVersion);
}