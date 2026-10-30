using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.PerformanceEvaluation;

/// <summary>
/// Server-side scoring service for performance reviews.
/// Acts as the single source of truth for evaluation scoring, rating bands,
/// outlier detection, and frozen historical score bypass.
/// </summary>
public interface IPerformanceReviewScoringService
{
    /// <summary>
    /// Calculates scores for a performance review by ID, retrieving entities from the database.
    /// If the review is Finalized and has FrozenScoresJson, deserializes and returns the frozen snapshot.
    /// </summary>
    Task<ReviewResultDTO> CalculateReviewScoreAsync(Guid reviewId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Calculates scores for a performance review instance. If the template contains a KPI section,
    /// queries IKpiCalculationEngine for each employee in the review scope.
    /// If the review is Finalized and has FrozenScoresJson, deserializes and returns the frozen snapshot.
    /// </summary>
    Task<ReviewResultDTO> CalculateReviewScoreAsync(PerformanceReview review, CancellationToken cancellationToken = default);

    /// <summary>
    /// Synchronous scoring calculation for in-memory or pre-loaded reviews.
    /// Uses pre-fetched employee KPI results if provided.
    /// If the review is Finalized and has FrozenScoresJson, deserializes and returns the frozen snapshot.
    /// </summary>
    ReviewResultDTO CalculateReviewScore(
        PerformanceReview review,
        IReadOnlyDictionary<Guid, EmployeeKpiEvaluationResultDTO>? employeeKpis = null);

    /// <summary>
    /// Serializes a ReviewResultDTO to JSON for immutable storage in PerformanceReview.FrozenScoresJson.
    /// </summary>
    string SerializeScores(ReviewResultDTO result);

    /// <summary>
    /// Deserializes a previously frozen JSON snapshot into ReviewResultDTO.
    /// </summary>
    ReviewResultDTO? DeserializeScores(string json);

    /// <summary>
    /// Computes live scores for a review, stores the JSON in PerformanceReview.FrozenScoresJson,
    /// and persists changes to the database.
    /// </summary>
    Task<string> FreezeReviewScoresAsync(Guid reviewId, CancellationToken cancellationToken = default);
}

