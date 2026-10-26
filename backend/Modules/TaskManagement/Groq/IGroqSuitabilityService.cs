namespace Backend.Modules.TaskManagement.Groq;

public interface IGroqSuitabilityService
{
    /// <summary>
    /// Indicates whether a valid Groq API key is configured.
    /// </summary>
    bool IsConfigured { get; }

    /// <summary>
    /// Resolves the effective API key from configuration or environment variable.
    /// </summary>
    string GetEffectiveApiKey();

    /// <summary>
    /// Computes a deterministic SHA-256 fingerprint from task attributes and candidate metrics.
    /// </summary>
    string ComputeCacheKey(GroqTaskContext task, IEnumerable<GroqCandidateMetrics> candidates);

    /// <summary>
    /// Builds the strict system prompt grounding the model in verified system metrics and refusing off-topic requests.
    /// </summary>
    string BuildSystemPrompt();

    /// <summary>
    /// Formats task context and candidate metrics into the user prompt without exposing sensitive PII.
    /// </summary>
    string BuildUserPrompt(GroqTaskContext task, IEnumerable<GroqCandidateMetrics> candidates);

    /// <summary>
    /// Parses and strictly validates JSON output against the candidate schema and bounds.
    /// </summary>
    List<GroqCandidateRecommendation> ParseAndValidateResponse(string rawContent, IEnumerable<Guid> expectedCandidateIds);

    /// <summary>
    /// Evaluates suitability for a task and candidate list, using cached results when available.
    /// </summary>
    Task<GroqSuitabilityResult> EvaluateSuitabilityAsync(
        GroqTaskContext task,
        List<GroqCandidateMetrics> candidates,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Invalidates a specific cache entry by its SHA-256 key.
    /// </summary>
    void InvalidateCache(string cacheKey);

    /// <summary>
    /// Clears all tracked Groq suitability cache entries.
    /// </summary>
    void ClearCache();
}
