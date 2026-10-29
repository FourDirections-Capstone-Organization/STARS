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

    /// <summary>
    /// Overall score threshold for Good / Green performance level (default: 85.0).
    /// </summary>
    public double OverallGreenThreshold { get; set; } = 85.0;

    /// <summary>
    /// Overall score threshold for Warning / Amber performance level (default: 70.0).
    /// </summary>
    public double OverallAmberThreshold { get; set; } = 70.0;

    /// <summary>
    /// Overall score threshold for Critical / Red performance level (default: 60.0).
    /// </summary>
    public double OverallRedThreshold { get; set; } = 60.0;

    public Guid? CreatedById { get; set; }
    public User? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<KpiItem> Items { get; set; } = new List<KpiItem>();
}
