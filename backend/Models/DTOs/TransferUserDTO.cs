using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class TransferUserDTO
{
    [Required]
    public Guid NewDepartmentId { get; set; }
    
    public Guid? NewJobPositionId { get; set; }

    [Required]
    public DateTime EffectiveDate { get; set; } = DateTime.UtcNow.Date;

    [Required]
    public bool Confirmed { get; set; } = true;

    public string? Reason { get; set; }
}
