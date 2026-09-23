using Backend.Models.Enums;

namespace Backend.Models.DTOs;

public class UserResponseDTO
{
    public Guid Id { get; set; }
    public string EmployeeNumber { get; set; } = string.Empty;
    public string? Username { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
    public string? Suffix { get; set; }
    public string? ContactNumber { get; set; }
    public UserRole Role { get; set; }
    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public Guid? JobPositionId { get; set; }
    public string? JobPositionName { get; set; }
    public bool IsActive { get; set; }
    public bool IsDeactivated { get; set; }
    public bool IsEmailVerified { get; set; }
    public bool IsPasswordChanged { get; set; }
    public DateTime? HireDate { get; set; }
    public string? EmploymentStatus { get; set; }
    public DateTime CreatedAt { get; set; }
    public string FullName { get; set; } = string.Empty;
    /// <summary>Online/Offline derived from the user's active session activity.</summary>
    public string PresenceStatus { get; set; } = "Offline";
}
