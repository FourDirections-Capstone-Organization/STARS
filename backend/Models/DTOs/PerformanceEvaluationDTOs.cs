using System.ComponentModel.DataAnnotations;
using Backend.Models;
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

/// <summary>
/// Result of template validation containing validation outcome and error messages.
/// </summary>
public class TemplateValidationResult
{
    public bool IsValid => Errors.Count == 0;
    public List<string> Errors { get; set; } = new();

    public static TemplateValidationResult Success() => new();
    public static TemplateValidationResult Fail(string error) => new() { Errors = { error } };
    public static TemplateValidationResult Fail(IEnumerable<string> errors) => new() { Errors = errors.ToList() };
}

/// <summary>
/// Generic result wrapper for template service operations with HTTP-compatible status codes.
/// </summary>
public class TemplateServiceResult<T>
{
    public bool IsSuccess { get; set; }
    public int StatusCode { get; set; } = 200;
    public string? Message { get; set; }
    public List<string> Errors { get; set; } = new();
    public T? Data { get; set; }

    public static TemplateServiceResult<T> Success(T data, string message = "Success") =>
        new() { IsSuccess = true, StatusCode = 200, Data = data, Message = message };

    public static TemplateServiceResult<T> Failure(int statusCode, string message, IEnumerable<string>? errors = null) =>
        new() { IsSuccess = false, StatusCode = statusCode, Message = message, Errors = errors?.ToList() ?? new() };
}

/// <summary>
/// Result of a performance review workflow status transition.
/// </summary>
public class WorkflowTransitionResult
{
    public bool IsSuccess { get; set; }
    public int StatusCode { get; set; } = 200;
    public string? ErrorMessage { get; set; }
    public PerformanceReview? Review { get; set; }
    public ReviewWorkflowStatus? PreviousStatus { get; set; }
    public ReviewWorkflowStatus? NewStatus { get; set; }
    public string? FrozenScoresJson { get; set; }

    public static WorkflowTransitionResult Success(PerformanceReview review, ReviewWorkflowStatus prev, ReviewWorkflowStatus current, string? frozenScoresJson = null) =>
        new()
        {
            IsSuccess = true,
            StatusCode = 200,
            Review = review,
            PreviousStatus = prev,
            NewStatus = current,
            FrozenScoresJson = frozenScoresJson ?? review.FrozenScoresJson
        };

    public static WorkflowTransitionResult Failure(int statusCode, string errorMessage) =>
        new()
        {
            IsSuccess = false,
            StatusCode = statusCode,
            ErrorMessage = errorMessage
        };
}

/// <summary>
/// DTO for requesting a review workflow status transition.
/// </summary>
public class ReviewStatusTransitionDTO
{
    public ReviewWorkflowStatus TargetStatus { get; set; }
    public string? TransitionComment { get; set; }
}



/// <summary>
/// DTO for creating a new performance review.
/// </summary>
public class CreatePerformanceReviewDTO
{
    public Guid TemplateId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ReviewScope Scope { get; set; } = ReviewScope.Individual;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? TeamId { get; set; }
    public Guid? EmployeeId { get; set; }
    public Guid? ReviewerId { get; set; }
}

/// <summary>
/// Lightweight summary DTO for performance review listings.
/// </summary>
public class PerformanceReviewSummaryDTO
{
    public Guid Id { get; set; }
    public Guid TemplateId { get; set; }
    public string TemplateTitle { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ReviewScope Scope { get; set; }
    public ReviewWorkflowStatus Status { get; set; }
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public Guid? TeamId { get; set; }
    public string? TeamName { get; set; }
    public Guid? EmployeeId { get; set; }
    public string? EmployeeName { get; set; }
    public Guid? ReviewerId { get; set; }
    public string? ReviewerName { get; set; }
    public bool IsFinalized { get; set; }
    public DateTime? FinalizedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Submission DTO for an individual criterion score.
/// </summary>
public class CriterionRatingSubmissionDTO
{
    public Guid CriterionId { get; set; }
    public double? SelfScore { get; set; }
    public string? SelfComment { get; set; }
    public double? ManagerScore { get; set; }
    public string? ManagerComment { get; set; }
}

/// <summary>
/// DTO for updating ratings on a performance review.
/// Supports both batch submissions and single-criterion submissions.
/// </summary>
public class SubmitReviewRatingsDTO
{
    public Guid? EmployeeId { get; set; }
    public List<CriterionRatingSubmissionDTO> Ratings { get; set; } = new();

    // Direct single-criterion payload support
    public Guid? CriterionId { get; set; }
    public double? SelfScore { get; set; }
    public string? SelfComment { get; set; }
    public double? ManagerScore { get; set; }
    public string? ManagerComment { get; set; }

    public List<CriterionRatingSubmissionDTO> GetNormalizedRatings()
    {
        var list = new List<CriterionRatingSubmissionDTO>(Ratings);
        if (CriterionId.HasValue && CriterionId.Value != Guid.Empty && !list.Any(r => r.CriterionId == CriterionId.Value))
        {
            list.Add(new CriterionRatingSubmissionDTO
            {
                CriterionId = CriterionId.Value,
                SelfScore = SelfScore,
                SelfComment = SelfComment,
                ManagerScore = ManagerScore,
                ManagerComment = ManagerComment
            });
        }
        return list;
    }
}

/// <summary>
/// Filter criteria for querying performance reviews.
/// </summary>
public class PerformanceReviewFilterDTO
{
    public ReviewWorkflowStatus? Status { get; set; }
    public ReviewScope? Scope { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? TeamId { get; set; }
    public Guid? EmployeeId { get; set; }
}

/// <summary>
/// DTO representing an action or development plan item for an employee.
/// </summary>
public class DevelopmentPlanItemDTO
{
    public Guid Id { get; set; }
    public Guid ReviewId { get; set; }
    public string? ReviewTitle { get; set; }
    public Guid EmployeeId { get; set; }
    public string? EmployeeName { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? SuccessMeasure { get; set; }
    public string? Timeframe { get; set; }
    public DateTime? TargetCompletionDate { get; set; }
    public bool IsCompleted { get; set; }
    public DateTime? CompletedAt { get; set; }
    public Guid? CompletedById { get; set; }
    public string? CompletedByName { get; set; }
    public Guid? CreatedById { get; set; }
    public string? CreatedByName { get; set; }
    public string? ManagerNotes { get; set; }
    public string? EmployeeNotes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// DTO for creating an individual development plan item.
/// </summary>
public class CreateDevelopmentPlanItemDTO
{
    [Required]
    [MaxLength(500)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? SuccessMeasure { get; set; }

    [MaxLength(100)]
    public string? Timeframe { get; set; }

    public DateTime? TargetCompletionDate { get; set; }

    [MaxLength(1000)]
    public string? ManagerNotes { get; set; }
}

/// <summary>
/// Request payload for creating one or more development plan items.
/// Supports both single item payload and batch items list.
/// </summary>
public class CreateDevelopmentPlanRequestDTO
{
    public string? Description { get; set; }
    public string? SuccessMeasure { get; set; }
    public string? Timeframe { get; set; }
    public DateTime? TargetCompletionDate { get; set; }
    public string? ManagerNotes { get; set; }

    public List<CreateDevelopmentPlanItemDTO>? Items { get; set; }

    public List<CreateDevelopmentPlanItemDTO> GetNormalizedItems()
    {
        var result = new List<CreateDevelopmentPlanItemDTO>();
        if (Items != null && Items.Count > 0)
        {
            result.AddRange(Items.Where(i => !string.IsNullOrWhiteSpace(i.Description)));
        }

        if (!string.IsNullOrWhiteSpace(Description) && !result.Any(i => i.Description == Description))
        {
            result.Add(new CreateDevelopmentPlanItemDTO
            {
                Description = Description,
                SuccessMeasure = SuccessMeasure,
                Timeframe = Timeframe,
                TargetCompletionDate = TargetCompletionDate,
                ManagerNotes = ManagerNotes
            });
        }

        return result;
    }
}

/// <summary>
/// DTO for updating a development plan item.
/// </summary>
public class UpdateDevelopmentPlanItemDTO
{
    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(500)]
    public string? SuccessMeasure { get; set; }

    [MaxLength(100)]
    public string? Timeframe { get; set; }

    public DateTime? TargetCompletionDate { get; set; }

    public bool? IsCompleted { get; set; }

    [MaxLength(1000)]
    public string? ManagerNotes { get; set; }

    [MaxLength(1000)]
    public string? EmployeeNotes { get; set; }
}

/// <summary>
/// Extension methods for mapping DevelopmentPlanItem entity to DTO.
/// </summary>
public static class DevelopmentPlanMappingExtensions
{
    public static DevelopmentPlanItemDTO ToDTO(this DevelopmentPlanItem item)
    {
        return new DevelopmentPlanItemDTO
        {
            Id = item.Id,
            ReviewId = item.ReviewId,
            ReviewTitle = item.Review?.Title,
            EmployeeId = item.EmployeeId,
            EmployeeName = item.Employee != null
                ? $"{item.Employee.FirstName} {item.Employee.LastName}".Trim()
                : null,
            Description = item.Description,
            SuccessMeasure = item.SuccessMeasure,
            Timeframe = item.Timeframe,
            TargetCompletionDate = item.TargetCompletionDate,
            IsCompleted = item.IsCompleted,
            CompletedAt = item.CompletedAt,
            CompletedById = item.CompletedById,
            CompletedByName = item.CompletedBy != null
                ? $"{item.CompletedBy.FirstName} {item.CompletedBy.LastName}".Trim()
                : null,
            CreatedById = item.CreatedById,
            CreatedByName = item.CreatedBy != null
                ? $"{item.CreatedBy.FirstName} {item.CreatedBy.LastName}".Trim()
                : null,
            ManagerNotes = item.ManagerNotes,
            EmployeeNotes = item.EmployeeNotes,
            CreatedAt = item.CreatedAt,
            UpdatedAt = item.UpdatedAt
        };
    }
}
