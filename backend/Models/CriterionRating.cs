using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Backend.Models;

public class CriterionRating
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ReviewId { get; set; }
    [JsonIgnore]
    public PerformanceReview? Review { get; set; }

    public Guid EmployeeId { get; set; }
    public User? Employee { get; set; }

    public Guid CriterionId { get; set; }
    [JsonIgnore]
    public EvaluationCriterion? Criterion { get; set; }

    /// <summary>
    /// Rating submitted by employee during SelfAssessment stage (scale: 1.0 - 5.0).
    /// </summary>
    public double? SelfScore { get; set; }

    /// <summary>
    /// Rating submitted by manager during ManagerReview stage (scale: 1.0 - 5.0).
    /// </summary>
    public double? ManagerScore { get; set; }

    [MaxLength(1000)]
    public string? SelfComment { get; set; }

    [MaxLength(1000)]
    public string? ManagerComment { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

