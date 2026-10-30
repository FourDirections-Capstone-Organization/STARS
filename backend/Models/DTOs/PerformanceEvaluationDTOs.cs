using Backend.Models.Enums;

namespace Backend.Models.DTOs;

/// <summary>
/// Detailed evaluation score and rating for an individual criterion.
/// </summary>
public class CriterionScoreDTO
{
    public Guid CriterionId { get; set; }
    public string CriterionTitle { get; set; } = string.Empty;
    public CriterionType CriterionType { get; set; } = CriterionType.Standard;
    public string? MetricCode { get; set; }
    public double Weight { get; set; }
    public int Order { get; set; } = 1;

    /// <summary>
    /// Self-assessment rating submitted by employee (scale: 1.0 - 5.0).
    /// </summary>
    public double? SelfScore { get; set; }

    /// <summary>
    /// Manager review rating submitted by evaluator (scale: 1.0 - 5.0).
    /// </summary>
    public double? ManagerScore { get; set; }

    /// <summary>
    /// Difference between self-score and manager-score (SelfScore - ManagerScore).
    /// </summary>
    public double? Gap { get; set; }

    /// <summary>
    /// True when the absolute discrepancy |SelfScore - ManagerScore| is >= 2.0.
    /// </summary>
    public bool IsOutlier { get; set; }

    /// <summary>
    /// Normalized criterion score on a 0 - 100 scale.
    /// </summary>
    public double Score { get; set; }

    public string? SelfComment { get; set; }
    public string? ManagerComment { get; set; }
}

/// <summary>
/// Aggregated score for an evaluation section.
/// </summary>
public class SectionScoreDTO
{
    public Guid SectionId { get; set; }
    public string SectionTitle { get; set; } = string.Empty;
    public double Weight { get; set; }
    public int Order { get; set; } = 1;

    /// <summary>
    /// True if evaluated via IKpiCalculationEngine rather than standard ratings.
    /// </summary>
    public bool IsKpiSection { get; set; }

    /// <summary>
    /// Normalized section score on a 0 - 100 scale.
    /// Non-KPI: Σ(managerScore × weight) / Σ(weight) normalized to 0 - 100.
    /// KPI: passthrough of IKpiCalculationEngine OverallScore.
    /// </summary>
    public double Score { get; set; }

    /// <summary>
    /// Weighted contribution of this section to the overall evaluation.
    /// </summary>
    public double WeightedScore { get; set; }

    public List<CriterionScoreDTO> Criteria { get; set; } = new();

    /// <summary>
    /// Operational KPI breakdown metrics if this is a KPI-linked section.
    /// </summary>
    public List<KpiMetricValueDTO>? KpiMetrics { get; set; }
}

/// <summary>
/// Complete evaluation score and rating band for a specific employee within a review.
/// </summary>
public class EmployeeReviewScoreDTO
{
    public Guid EmployeeId { get; set; }
    public string EmployeeName { get; set; } = string.Empty;
    public string? EmployeeNumber { get; set; }
    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public string? JobPositionTitle { get; set; }
    public string? Role { get; set; }

    public List<SectionScoreDTO> Sections { get; set; } = new();

    /// <summary>
    /// Weighted final score (0 - 100) = Σ(sectionScore × sectionWeight) / Σ(sectionWeight).
    /// </summary>
    public double FinalScore { get; set; }

    /// <summary>
    /// Performance rating label matched from template RatingBands.
    /// </summary>
    public string RatingLabel { get; set; } = "Unrated";

    public string? RatingBandColor { get; set; }
    public string? RatingBandDescription { get; set; }

    /// <summary>
    /// Count of criteria where |SelfScore - ManagerScore| >= 2.0.
    /// </summary>
    public int OutlierCount { get; set; }
}

/// <summary>
/// Server-side evaluation result for a performance review.
/// Single source of truth for UI, exports, and AI recommendations.
/// </summary>
public class ReviewResultDTO
{
    public Guid ReviewId { get; set; }
    public Guid TemplateId { get; set; }
    public string TemplateTitle { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ReviewScope Scope { get; set; } = ReviewScope.Individual;
    public ReviewWorkflowStatus Status { get; set; } = ReviewWorkflowStatus.Draft;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }

    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public Guid? TeamId { get; set; }
    public string? TeamName { get; set; }

    public Guid? ReviewerId { get; set; }
    public string? ReviewerName { get; set; }

    public bool IsFinalized { get; set; }
    public DateTime? FinalizedAt { get; set; }

    /// <summary>
    /// Average score across evaluated employees (0 - 100).
    /// </summary>
    public double OverallScore { get; set; }

    /// <summary>
    /// Overall rating band label for the review.
    /// </summary>
    public string OverallRating { get; set; } = "Unrated";

    /// <summary>
    /// Distribution of rating labels across evaluated employees.
    /// </summary>
    public Dictionary<string, int> RatingDistribution { get; set; } = new();

    /// <summary>
    /// Evaluated scores for each employee included in the review scope.
    /// </summary>
    public List<EmployeeReviewScoreDTO> Employees { get; set; } = new();
}

