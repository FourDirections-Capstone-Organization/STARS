namespace Backend.Modules.TaskManagement.Groq;

public class GroqSettings
{
    public const string SectionName = "GroqSettings";

    /// <summary>
    /// Groq API key. If empty, falls back to the GROQ_API_KEY environment variable.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Groq model identifier (e.g. llama-3.3-70b-versatile).
    /// </summary>
    public string Model { get; set; } = "llama-3.3-70b-versatile";

    /// <summary>
    /// Groq OpenAI-compatible Chat Completions API endpoint.
    /// </summary>
    public string Endpoint { get; set; } = "https://api.groq.com/openai/v1/chat/completions";

    /// <summary>
    /// Duration in minutes to cache evaluation responses for identical task/candidate fingerprints.
    /// </summary>
    public int CacheDurationMinutes { get; set; } = 60;

    /// <summary>
    /// Sampling temperature (low temperature for deterministic, metric-grounded evaluations).
    /// </summary>
    public double Temperature { get; set; } = 0.2;

    /// <summary>
    /// Maximum tokens for the completion.
    /// </summary>
    public int MaxTokens { get; set; } = 1024;

    /// <summary>
    /// Resolves the API key from configuration or GROQ_API_KEY environment variable.
    /// </summary>
    public string GetEffectiveApiKey()
    {
        if (!string.IsNullOrWhiteSpace(ApiKey))
        {
            return ApiKey.Trim();
        }

        var envKey = Environment.GetEnvironmentVariable("GROQ_API_KEY");
        if (!string.IsNullOrWhiteSpace(envKey))
        {
            return envKey.Trim();
        }

        return string.Empty;
    }

    /// <summary>
    /// Indicates whether a valid API key is available.
    /// </summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(GetEffectiveApiKey());
}
