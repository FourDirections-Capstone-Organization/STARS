using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class UpdateUserDTO
{
    [MaxLength(50)]
    public string? FirstName { get; set; }

    [MaxLength(50)]
    public string? MiddleName { get; set; }

    [MaxLength(50)]
    public string? LastName { get; set; }

    [MaxLength(20)]
    public string? Suffix { get; set; }

    [MaxLength(20)]
    public string? ContactNumber { get; set; }

    [MaxLength(100)]
    [EmailAddress]
    public string? Email { get; set; }

    public DateTime? HireDate { get; set; }

    [MaxLength(50)]
    public string? EmploymentStatus { get; set; }
}
