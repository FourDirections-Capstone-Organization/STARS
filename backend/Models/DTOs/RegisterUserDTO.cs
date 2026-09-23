using System.ComponentModel.DataAnnotations;
using Backend.Models.Enums;

namespace Backend.Models.DTOs;

public class RegisterUserDTO
{
    [Required]
    [MaxLength(20)]
    public string EmployeeNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string FirstName { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? MiddleName { get; set; }

    [Required]
    [MaxLength(50)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(20)]
    public string? Suffix { get; set; }

    [MaxLength(20)]
    public string? ContactNumber { get; set; }

    [Required]
    public UserRole Role { get; set; }

    public Guid? DepartmentId { get; set; }

    public Guid? JobPositionId { get; set; }

    public DateTime? HireDate { get; set; }

    [MaxLength(50)]
    public string? EmploymentStatus { get; set; }
}
