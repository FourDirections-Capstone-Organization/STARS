using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.PerformanceEvaluation;

/// <summary>
/// Service interface for generating and managing AI-driven performance recommendations.
/// Enforces de-identification, schema validation, fallback on Groq failure, and guards against
/// unauthorized score/workflow mutation.
/// </summary>
public interface IAiRecommendationGenerationService
{
    /// <summary>
    /// Generates or regenerates an AI recommendation for a specific employee within a performance review.
    /// If template has IsAiEnabled == false, returns 422 failure.
    /// If Groq service call fails or schema is invalid, persists fallback recommendation with Status = ManualOverride.
    /// If Groq service succeeds, persists recommendation with Status = Pending.
    /// </summary>
    Task<AiRecommendationServiceResult> GenerateRecommendationAsync(
        Guid reviewId,
        Guid employeeId,
        Guid managerId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates an existing recommendation (approval, rejection, manual override, editing).
    /// Does NOT mutate review scores or review workflow status.
    /// </summary>
    Task<AiRecommendationServiceResult> UpdateRecommendationAsync(
        Guid reviewId,
        Guid employeeId,
        UpdateAiRecommendationDTO request,
        Guid reviewerId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Retrieves the AI recommendation for an employee within a review.
    /// </summary>
    Task<AiRecommendation?> GetRecommendationAsync(
        Guid reviewId,
        Guid employeeId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Builds the de-identified payload from review score data, strictly removing PII (names, numbers, IDs)
    /// and trimming evaluator/self comments to at most 500 characters.
    /// </summary>
    PerformanceAiPayload BuildPayload(EmployeeReviewScoreDTO scoreDto, IEnumerable<string>? extraComments = null);

    /// <summary>
    /// Builds the system prompt instructing Groq to output JSON conforming to PerformanceAiResponse,
    /// enforcing prompt injection defense and forbidding score/workflow changes.
    /// </summary>
    string BuildSystemPrompt();

    /// <summary>
    /// Builds the user prompt from the de-identified payload.
    /// </summary>
    string BuildUserPrompt(PerformanceAiPayload payload);

    /// <summary>
    /// Parses and validates the raw JSON response from Groq against the PerformanceAiResponse schema.
    /// Throws JsonException if required fields are missing or empty.
    /// </summary>
    PerformanceAiResponse ParseAndValidateResponse(string rawContent);
}

