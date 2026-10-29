using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class KpiConfiguration
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(50)]
    public string? TargetRole { get; set; } // e.g., "Courier", "Encoder", null for all roles

    public Guid? DepartmentId { get; set; }
    public Department? Department { get; set; }

    public DateTime EffectiveStartDate { get; set; } = DateTime.UtcNow;

    public DateTime? EffectiveEndDate { get; set; }

    public bool IsActive { get; set; } = true;

    public Guid? CreatedById { get; set; }
    public User? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<KpiItem> Items { get; set; } = new List<KpiItem>();
}
