using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class ForgotPasswordDTO
{
    [Required(ErrorMessage = "Email address is required.")]
    [EmailAddress(ErrorMessage = "Please provide a valid email address.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Employee number is required.")]
    public string EmployeeNumber { get; set; } = string.Empty;
}