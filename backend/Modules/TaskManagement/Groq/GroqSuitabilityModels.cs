using System.Text.Json.Serialization;

namespace Backend.Modules.TaskManagement.Groq;

/// <summary>
/// Metric indicators for a candidate employee used to ground Groq suitability evaluation.
/// Contains only verified system metrics (no sensitive PII).
/// </summary>
public class GroqCandidateMetrics
{
    public Guid EmployeeId { get; set; }
    public string EmployeeNumber { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;

    /// <summary>
    /// Count of active tasks currently assigned (Pending, Assigned, InProgress, OnHold).
    /// </summary>
    public int Workload { get; set; }

    /// <summary>
    /// Count of completed routine daily tasks.
    /// </summary>
    public int RoutineExperience { get; set; }

    /// <summary>
    /// Count of completed special tasks.
    /// </summary>
    public int SpecialExperience { get; set; }

    /// <summary>
    /// Historical timeliness rating average (0.0 - 5.0).
    /// </summary>
    public double TimelinessRating { get; set; }

    /// <summary>
    /// Historical work quality rating average (0.0 - 5.0).
    /// </summary>
    public double WorkQualityRating { get; set; }

    /// <summary>
    /// Historical communication rating average (0.0 - 5.0).
    /// </summary>
    public double CommunicationRating { get; set; }
}

/// <summary>
/// Contextual attributes of the task being evaluated for employee assignment.
/// </summary>
public class GroqTaskContext
{
    public Guid TaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Classification { get; set; } // 0 = RoutineDailyTask, 1 = SpecialTask
    public int Priority { get; set; } // 0 = Low, 1 = Medium, 2 = High, 3 = Urgent
    public string? RequiredRole { get; set; }
}

/// <summary>
/// Recommendation result for an individual candidate produced by Groq evaluation.
/// </summary>
public class GroqCandidateRecommendation
{
    [JsonPropertyName("employeeId")]
    public Guid EmployeeId { get; set; }

    [JsonPropertyName("rank")]
    public int Rank { get; set; }

    [JsonPropertyName("score")]
    public double Score { get; set; }

    [JsonPropertyName("rationale")]
    public string Rationale { get; set; } = string.Empty;
}

/// <summary>
/// Overall result of suitability evaluation including cache status.
/// </summary>
public class GroqSuitabilityResult
{
    public string CacheKey { get; set; } = string.Empty;
    public bool FromCache { get; set; }
    public List<GroqCandidateRecommendation> Recommendations { get; set; } = new();
}

/// <summary>
/// Expected JSON payload envelope returned by the Groq model.
/// </summary>
public class GroqSuitabilityEnvelope
{
    [JsonPropertyName("recommendations")]
    public List<GroqCandidateRecommendation> Recommendations { get; set; } = new();
}

public class GroqChatRequest
{
    [JsonPropertyName("model")]
    public string Model { get; set; } = "llama-3.3-70b-versatile";

    [JsonPropertyName("messages")]
    public List<GroqChatMessage> Messages { get; set; } = new();

    [JsonPropertyName("temperature")]
    public double Temperature { get; set; } = 0.2;

    [JsonPropertyName("max_tokens")]
    public int MaxTokens { get; set; } = 1024;

    [JsonPropertyName("response_format")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public GroqResponseFormat? ResponseFormat { get; set; }
}

public class GroqChatMessage
{
    [JsonPropertyName("role")]
    public string Role { get; set; } = "user";

    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;
}

public class GroqResponseFormat
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "json_object";
}

public class GroqChatResponse
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("choices")]
    public List<GroqChatChoice> Choices { get; set; } = new();
}

public class GroqChatChoice
{
    [JsonPropertyName("message")]
    public GroqChatMessage Message { get; set; } = new();

    [JsonPropertyName("finish_reason")]
    public string? FinishReason { get; set; }
}
