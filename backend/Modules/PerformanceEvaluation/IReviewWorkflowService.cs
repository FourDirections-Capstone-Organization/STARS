using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.PerformanceEvaluation;

/// <summary>
/// Server-side workflow transition service for performance reviews.
/// Enforces business state transitions (Draft -> SelfAssessment -> ManagerReview -> HrReview -> Acknowledgment -> Finalized)
/// and triggers scoring freezing when reviews are finalized.
/// </summary>
public interface IReviewWorkflowService
{
    /// <summary>
    /// Transitions a performance review to a target workflow status.
    /// Returns 422 for illegal state transitions, 404 if not found.
    /// When target status is Finalized, freezes scores via IPerformanceReviewScoringService.
    /// </summary>
    Task<WorkflowTransitionResult> TransitionStatusAsync(
        Guid reviewId,
        ReviewWorkflowStatus targetStatus,
        Guid userId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Validates if a transition from currentStatus to targetStatus is permitted.
    /// </summary>
    bool CanTransition(ReviewWorkflowStatus currentStatus, ReviewWorkflowStatus targetStatus);

    /// <summary>
    /// Returns the list of permitted next workflow statuses from the current status.
    /// </summary>
    IReadOnlyList<ReviewWorkflowStatus> GetAllowedNextStatuses(ReviewWorkflowStatus currentStatus);
}

