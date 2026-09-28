using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class AcceptTermsDTO
{
    [Required]
    [MaxLength(20)]
    public string TermsVersion { get; set; } = string.Empty;
}
