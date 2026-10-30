using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class EvaluationSection
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TemplateId { get; set; }
    public EvaluationTemplate? Template { get; set; }

    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Weight percentage (0 to 100). The sum of all active section weights in a template should equal 100.
    /// </summary>
    public double Weight { get; set; }

    public int Order { get; set; } = 1;

    /// <summary>
    /// When true, this section is evaluated via the KPI calculation engine rather than manual manager/self scores.
    /// At most one KPI section is permitted per evaluation template.
    /// </summary>
    public bool IsKpiSection { get; set; } = false;

    public ICollection<EvaluationCriterion> Criteria { get; set; } = new List<EvaluationCriterion>();
}

