using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.PerformanceEvaluation;

/// <summary>
/// Server-side workflow transition service for performance reviews.
/// Enforces business state transitions:
/// Draft -> SelfAssessment -> ManagerReview -> HrReview -> Acknowledgment -> Finalized
/// When a review enters Finalized status, automatically computes and freezes scores into immutable JSON.
/// </summary>
public class ReviewWorkflowService : IReviewWorkflowService
{
    private readonly AppDbContext _context;
    private readonly IPerformanceReviewScoringService _scoringService;
    private readonly ILogger<ReviewWorkflowService> _logger;

    /// <summary>
    /// Explicit mapping of allowed review workflow state transitions.
    /// Backward transitions represent recall/revision loops. Finalized is terminal.
    /// </summary>
    private static readonly Dictionary<ReviewWorkflowStatus, HashSet<ReviewWorkflowStatus>> AllowedTransitions = new()
    {
        [ReviewWorkflowStatus.Draft] = new()
        {
            ReviewWorkflowStatus.SelfAssessment
        },
        [ReviewWorkflowStatus.SelfAssessment] = new()
        {
            ReviewWorkflowStatus.ManagerReview,
            ReviewWorkflowStatus.Draft
        },
        [ReviewWorkflowStatus.ManagerReview] = new()
        {
            ReviewWorkflowStatus.HrReview,
            ReviewWorkflowStatus.SelfAssessment
        },
        [ReviewWorkflowStatus.HrReview] = new()
        {
            ReviewWorkflowStatus.Acknowledgment,
            ReviewWorkflowStatus.ManagerReview
        },
        [ReviewWorkflowStatus.Acknowledgment] = new()
        {
            ReviewWorkflowStatus.Finalized,
            ReviewWorkflowStatus.HrReview
        },
        [ReviewWorkflowStatus.Finalized] = new() // Terminal state: immutable
    };

    public ReviewWorkflowService(
        AppDbContext context,
        IPerformanceReviewScoringService scoringService,
        ILogger<ReviewWorkflowService> logger)
    {
        _context = context;
        _scoringService = scoringService;
        _logger = logger;
    }

    /// <inheritdoc />
    public bool CanTransition(ReviewWorkflowStatus currentStatus, ReviewWorkflowStatus targetStatus)
    {
        return AllowedTransitions.TryGetValue(currentStatus, out var nextStatuses) &&
               nextStatuses.Contains(targetStatus);
    }

    /// <inheritdoc />
    public IReadOnlyList<ReviewWorkflowStatus> GetAllowedNextStatuses(ReviewWorkflowStatus currentStatus)
    {
        if (AllowedTransitions.TryGetValue(currentStatus, out var statuses))
        {
            return statuses.ToList();
        }

        return Array.Empty<ReviewWorkflowStatus>();
    }

    /// <inheritdoc />
    public async Task<WorkflowTransitionResult> TransitionStatusAsync(
        Guid reviewId,
        ReviewWorkflowStatus targetStatus,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var review = await _context.PerformanceReviews
            .Include(r => r.Template)
            .FirstOrDefaultAsync(r => r.Id == reviewId, cancellationToken);

        if (review == null)
        {
            _logger.LogWarning("Review workflow transition aborted: Review {ReviewId} not found", reviewId);
            return WorkflowTransitionResult.Failure(404, $"Performance review with ID '{reviewId}' was not found.");
        }

        if (review.Status == targetStatus)
        {
            return WorkflowTransitionResult.Failure(
                422,
                $"Performance review '{review.Title}' is already in '{targetStatus}' status.");
        }

        if (!CanTransition(review.Status, targetStatus))
        {
            _logger.LogWarning(
                "Illegal review transition rejected: {ReviewId} from {CurrentStatus} to {TargetStatus}",
                review.Id, review.Status, targetStatus);

            return WorkflowTransitionResult.Failure(
                422,
                $"Illegal workflow transition from '{review.Status}' to '{targetStatus}'.");
        }

        var previousStatus = review.Status;

        // When transitioning to Finalized, freeze scores via scoring service
        if (targetStatus == ReviewWorkflowStatus.Finalized)
        {
            string frozenScoresJson;
            try
            {
                frozenScoresJson = await _scoringService.FreezeReviewScoresAsync(review.Id, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to freeze review scores during finalization of review {ReviewId}",
                    review.Id);
                return WorkflowTransitionResult.Failure(500, $"Failed to freeze review scores: {ex.Message}");
            }

            review.Status = ReviewWorkflowStatus.Finalized;
            review.FinalizedAt = DateTime.UtcNow;
            review.FinalizedById = userId;
            review.FrozenScoresJson = frozenScoresJson;
            review.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation(
                "Performance review {ReviewId} transitioned from {PreviousStatus} to Finalized and scores were frozen",
                review.Id, previousStatus);

            return WorkflowTransitionResult.Success(review, previousStatus, ReviewWorkflowStatus.Finalized, frozenScoresJson);
        }

        // Standard stage progression or recall
        review.Status = targetStatus;
        review.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Performance review {ReviewId} transitioned from {PreviousStatus} to {TargetStatus}",
            review.Id, previousStatus, targetStatus);

        return WorkflowTransitionResult.Success(review, previousStatus, targetStatus);
    }
}

