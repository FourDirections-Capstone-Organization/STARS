using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class VerifyEmailDTO
{
    [Required]
    public string Token { get; set; } = string.Empty;
}

public class ResendVerificationDTO
{
    public string? EmployeeId { get; set; }

    public string? EmployeeID { get; set; }

    public string? EmployeeNumber { get; set; }

    public string? Identifier { get; set; }

    public string? Email { get; set; }
}

public class EmailVerificationStatusDTO
{
    public Guid UserId { get; set; }
    public string EmployeeName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool IsEmailVerified { get; set; }
    public DateTime? TokenExpiry { get; set; }
    public bool IsTokenExpired { get; set; }
    public string Status { get; set; } = string.Empty;
}
