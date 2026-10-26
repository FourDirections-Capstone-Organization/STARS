namespace Backend.Modules.TaskManagement.Groq;

public class GroqSettings
{
    public const string SectionName = "GroqSettings";

    /// <summary>
    /// Groq API key. If empty, falls back to the GROQ_API_KEY environment variable.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Groq model identifier (e.g. openai/gpt-oss-120b).
    /// </summary>
    public string Model { get; set; } = "openai/gpt-oss-120b";

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
    /// Optional explicit path to a .env file. If null, standard directory search is used.
    /// </summary>
    public string? DotEnvFilePath { get; set; }

    /// <summary>
    /// When true, skips searching for local .env files.
    /// </summary>
    public bool DisableDotEnvResolution { get; set; }

    /// <summary>
    /// Resolves the API key with the following precedence:
    /// 1. Explicit ApiKey configured in settings/appsettings.json
    /// 2. Azure App Service environment variables: Groq__ApiKey, GroqSettings__ApiKey, GroqSettings:ApiKey
    /// 3. Standard environment variables: GROQ_API_KEY, GROQ_KEY
    /// 4. Local .env file (searching current directory and parent hierarchy, or AppContext.BaseDirectory)
    /// </summary>
    public string GetEffectiveApiKey(string? customEnvFilePath = null)
    {
        if (!string.IsNullOrWhiteSpace(ApiKey))
        {
            return ApiKey.Trim();
        }

        // Check Azure App Service and standard environment variables
        var envVars = new[]
        {
            "Groq__ApiKey",
            "GROQ_API_KEY",
            "GroqSettings__ApiKey",
            "GroqSettings:ApiKey",
            "GROQ_KEY"
        };

        foreach (var envVar in envVars)
        {
            var val = Environment.GetEnvironmentVariable(envVar);
            if (!string.IsNullOrWhiteSpace(val))
            {
                return val.Trim();
            }
        }

        // Check local .env file fallback unless explicitly disabled
        if (!DisableDotEnvResolution &&
            Environment.GetEnvironmentVariable("STARS_DISABLE_DOTENV") != "1")
        {
            var dotEnvKey = TryResolveFromDotEnv(customEnvFilePath ?? DotEnvFilePath);
            if (!string.IsNullOrWhiteSpace(dotEnvKey))
            {
                return dotEnvKey.Trim();
            }
        }

        return string.Empty;
    }

    /// <summary>
    /// Attempts to read the Groq API key from a .env file.
    /// </summary>
    public static string? TryResolveFromDotEnv(string? customEnvFilePath = null)
    {
        try
        {
            var filePath = customEnvFilePath;
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            {
                filePath = FindDotEnvFile();
            }

            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            {
                return null;
            }

            var keysToLookFor = new[] { "GROQ_API_KEY", "Groq__ApiKey", "GroqSettings__ApiKey", "GROQ_KEY", "ApiKey" };
            foreach (var line in File.ReadAllLines(filePath))
            {
                var trimmed = line.Trim();
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith('#'))
                {
                    continue;
                }

                var separatorIndex = trimmed.IndexOf('=');
                if (separatorIndex <= 0)
                {
                    continue;
                }

                var key = trimmed[..separatorIndex].Trim();
                var value = trimmed[(separatorIndex + 1)..].Trim();

                if (keysToLookFor.Any(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase)))
                {
                    // Strip enclosing quotes if present
                    if ((value.StartsWith('"') && value.EndsWith('"') && value.Length >= 2) ||
                        (value.StartsWith('\'') && value.EndsWith('\'') && value.Length >= 2))
                    {
                        value = value[1..^1].Trim();
                    }

                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        return value;
                    }
                }
            }
        }
        catch
        {
            // Fallback should not throw exceptions if file reading fails
        }

        return null;
    }

    /// <summary>
    /// Searches directory hierarchy upwards from current working directory and AppContext.BaseDirectory for .env file.
    /// </summary>
    public static string? FindDotEnvFile()
    {
        var checkedDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // 1. Current working directory and parents
        try
        {
            var current = new DirectoryInfo(Directory.GetCurrentDirectory());
            while (current != null && checkedDirs.Add(current.FullName))
            {
                var envPath = Path.Combine(current.FullName, ".env");
                if (File.Exists(envPath))
                {
                    return envPath;
                }
                current = current.Parent;
            }
        }
        catch { }

        // 2. Base directory and parents
        try
        {
            var baseDir = new DirectoryInfo(AppContext.BaseDirectory);
            while (baseDir != null && checkedDirs.Add(baseDir.FullName))
            {
                var envPath = Path.Combine(baseDir.FullName, ".env");
                if (File.Exists(envPath))
                {
                    return envPath;
                }
                baseDir = baseDir.Parent;
            }
        }
        catch { }

        return null;
    }

    /// <summary>
    /// Indicates whether a valid API key is available.
    /// </summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(GetEffectiveApiKey());
}
