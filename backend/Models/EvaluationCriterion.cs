using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Backend.Models.Enums;

namespace Backend.Models;

public class EvaluationCriterion
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SectionId { get; set; }
    [JsonIgnore]
    public EvaluationSection? Section { get; set; }

    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Weight percentage (0 to 100). The sum of criterion weights within a section should equal 100.
    /// </summary>
    public double Weight { get; set; }

    public CriterionType CriterionType { get; set; } = CriterionType.Standard;

    [MaxLength(50)]
    public string? MetricCode { get; set; }

    public int Order { get; set; } = 1;

    [JsonIgnore]
    public ICollection<CriterionRating> Ratings { get; set; } = new List<CriterionRating>();
}

