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

    /// <summary>
    /// Target System: "STARS" (default), "DMS", or "FOMS"
    /// </summary>
    [MaxLength(20)]
    public string? TargetSystem { get; set; }

    // ── DMS Provisioning Fields ──
    [MaxLength(50)]
    public string? DmsRole { get; set; }

    [MaxLength(50)]
    public string? DmsSystemAccess { get; set; }

    public List<string>? DmsAreas { get; set; }

    // ── FOMS Provisioning Fields ──
    [MaxLength(50)]
    public string? FomsRole { get; set; }

    public decimal? FomsSalaryRate { get; set; }
}
