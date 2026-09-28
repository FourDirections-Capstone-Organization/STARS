using Backend.Models.Enums;

namespace Backend.Models.DTOs;

public class AuthResponseDTO
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string EmployeeNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public bool IsPasswordChanged { get; set; }
    public bool IsEmailVerified { get; set; }
    public bool HasAcceptedTerms { get; set; }
    public string? TermsVersionAccepted { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime RefreshTokenExpiresAt { get; set; }
}