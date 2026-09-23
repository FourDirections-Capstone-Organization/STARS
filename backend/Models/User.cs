using System.ComponentModel.DataAnnotations;
using Backend.Models.Enums;

namespace Backend.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(100)]
    public string EmployeeNumber { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Username { get; set; }

    [Required]
    [MaxLength(100)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string FirstName { get; set; } = string.Empty;

    [MaxLength]
    public string? MiddleName { get; set; }

    [Required]
    [MaxLength(50)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(20)]
    public string? Suffix { get; set; }

    [MaxLength(20)]
    public string? ContactNumber { get; set; }

    public UserRole Role { get; set; } = UserRole.Encoder;

    public AvailabilityStatus AvailabilityStatus { get; set; } = AvailabilityStatus.Active;

    // Foreign Keys
    public Guid? DepartmentId { get; set; }
    public Guid? JobPositionId { get; set; }

    // Employment details
    public DateTime? HireDate { get; set; }
    [MaxLength(50)]
    public string? EmploymentStatus { get; set; }

    // Nav properties
    public Department? Department { get; set; }
    public JobPosition? JobPosition { get; set; }

    // Status flags
    public bool IsActive { get; set; } = true;
    public bool IsDeactivated { get; set; } = false;
    public bool IsEmailVerified { get; set; } = false;
    public bool IsPasswordChanged { get; set; } = false;

    // Email verification
    public string? EmailVerificationToken { get; set; }
    public DateTime? EmailVerificationTokenExpiry { get; set; }

    // Password Reset
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetTokenExpiry { get; set; }

    // Refresh Token
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }

    // Session tracking
    public DateTime? LastActivityAt { get; set; }

    // Timestamps
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
