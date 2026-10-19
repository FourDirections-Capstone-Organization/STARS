using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class CompleteOnboardingDTO
{
    [Required]
    public string EmployeeNumber { get; set; } = string.Empty;

    [Required]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required]
    public string NewPassword { get; set; } = string.Empty;

    public string? FirstName { get; set; }
    public string? MiddleName { get; set; }
    public string? LastName { get; set; }
    public string? Suffix { get; set; }
    public string? ContactNumber { get; set; }
}
