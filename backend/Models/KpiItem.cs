using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class KpiItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid KpiConfigurationId { get; set; }
    public KpiConfiguration? KpiConfiguration { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string MetricCode { get; set; } = string.Empty; // e.g., "OTIF", "ORDER_ACCURACY", "COMPLETION_RATE", "AHT"

    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Weight percentage (0 to 100). The sum of all active item weights in a configuration should equal 100.
    /// </summary>
    public double Weight { get; set; }

    [MaxLength(20)]
    public string Unit { get; set; } = "%";

    public double TargetValue { get; set; }

    /// <summary>
    /// Threshold for Good / Green performance level.
    /// </summary>
    public double GreenThreshold { get; set; }

    /// <summary>
    /// Threshold for Warning / Amber performance level.
    /// </summary>
    public double AmberThreshold { get; set; }

    /// <summary>
    /// Threshold for Critical / Red performance level.
    /// </summary>
    public double RedThreshold { get; set; }

    /// <summary>
    /// When true, lower values are better (e.g. AHT in hours).
    /// When false, higher values are better (e.g. OTIF rate %, Order Accuracy %, Task Completion %).
    /// </summary>
    public bool IsLowerBetter { get; set; } = false;

    public bool IsCustomFormula { get; set; } = false;

    [MaxLength(1000)]
    public string? CustomFormula { get; set; }

    public int Order { get; set; } = 1;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
