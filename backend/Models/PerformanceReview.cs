using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Backend.Models.Enums;

namespace Backend.Models;

public class PerformanceReview
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TemplateId { get; set; }
    public EvaluationTemplate? Template { get; set; }

    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public ReviewScope Scope { get; set; } = ReviewScope.Individual;

    public ReviewWorkflowStatus Status { get; set; } = ReviewWorkflowStatus.Draft;

    public DateTime PeriodStart { get; set; }

    public DateTime PeriodEnd { get; set; }

    public Guid? DepartmentId { get; set; }
    public Department? Department { get; set; }

    public Guid? TeamId { get; set; }
    public Team? Team { get; set; }

    public Guid? EmployeeId { get; set; }
    public User? Employee { get; set; }

    public Guid? ReviewerId { get; set; }
    public User? Reviewer { get; set; }

    public Guid? CreatedById { get; set; }
    public User? CreatedBy { get; set; }

    public Guid? FinalizedById { get; set; }
    public User? FinalizedBy { get; set; }

    public DateTime? FinalizedAt { get; set; }

    /// <summary>
    /// Immutable serialized JSON snapshot of calculated review scores captured when review is Finalized.
    /// Open reviews compute scores dynamically on load; finalized reviews load directly from this frozen snapshot.
    /// </summary>
    public string? FrozenScoresJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore]
    public ICollection<CriterionRating> Ratings { get; set; } = new List<CriterionRating>();
    [JsonIgnore]
    public ICollection<AiRecommendation> AiRecommendations { get; set; } = new List<AiRecommendation>();
    [JsonIgnore]
    public ICollection<DevelopmentPlanItem> DevelopmentPlanItems { get; set; } = new List<DevelopmentPlanItem>();
}

