using Backend.Modules.TaskManagement.Groq;

namespace Backend.Modules.TaskManagement;

/// <summary>
/// Generates transparent, metric-grounded plain-language rationales and structured factors
/// when Groq AI is unconfigured, unreachable, or in fallback mode.
/// </summary>
public static class SuitabilityFallbackGenerator
{
    /// <summary>
    /// Produces a concise 1-2 sentence plain-language rationale explaining suitability based on
    /// verified workload, relevant experience, and peer ratings without displaying redundant numeric scores.
    /// </summary>
    public static string GenerateRationale(GroqCandidateMetrics metrics, int classification)
    {
        var isRoutine = classification == 0;
        var relevantExp = isRoutine ? metrics.RoutineExperience : metrics.SpecialExperience;
        var expType = isRoutine ? "routine" : "special";

        // 1. Workload clause
        string workloadClause;
        if (metrics.Workload == 0)
        {
            workloadClause = "Has full capacity with no active tasks";
        }
        else if (metrics.Workload == 1)
        {
            workloadClause = "Has high capacity with only 1 active task";
        }
        else if (metrics.Workload <= 3)
        {
            workloadClause = $"Maintains a balanced workload with {metrics.Workload} active tasks";
        }
        else
        {
            workloadClause = $"Currently managing {metrics.Workload} active tasks";
        }

        // 2. Experience clause
        string expClause;
        if (relevantExp == 0)
        {
            expClause = $"and is ready to take on {expType} assignments";
        }
        else if (relevantExp == 1)
        {
            expClause = $"and 1 completed {expType} task";
        }
        else if (relevantExp >= 5)
        {
            expClause = $"and extensive experience across {relevantExp} completed {expType} tasks";
        }
        else
        {
            expClause = $"and solid experience across {relevantExp} completed {expType} tasks";
        }

        // 3. Ratings clause
        var totalRating = metrics.TimelinessRating + metrics.WorkQualityRating + metrics.CommunicationRating;
        var hasRatings = totalRating > 0;
        var avgRating = totalRating / 3.0;

        string ratingsClause;
        if (hasRatings)
        {
            if (avgRating >= 4.5)
            {
                ratingsClause = $", backed by exceptional performance ratings ({avgRating:F1}/5.0 avg).";
            }
            else if (avgRating >= 3.5)
            {
                ratingsClause = $", supported by strong performance ratings ({avgRating:F1}/5.0 avg).";
            }
            else
            {
                ratingsClause = $", with consistent rating history ({avgRating:F1}/5.0 avg).";
            }
        }
        else
        {
            ratingsClause = ". Building initial performance rating history.";
        }

        return $"{workloadClause} {expClause}{ratingsClause}";
    }

    /// <summary>
    /// Generates structured factor descriptions aligned with GroqCandidateFactors.
    /// </summary>
    public static GroqCandidateFactors GenerateFactors(GroqCandidateMetrics metrics, int classification)
    {
        var isRoutine = classification == 0;
        var relevantExp = isRoutine ? metrics.RoutineExperience : metrics.SpecialExperience;
        var expType = isRoutine ? "routine" : "special";

        string workloadDesc;
        if (metrics.Workload == 0)
        {
            workloadDesc = "0 active tasks (full capacity)";
        }
        else if (metrics.Workload == 1)
        {
            workloadDesc = "1 active task (low workload)";
        }
        else if (metrics.Workload <= 3)
        {
            workloadDesc = $"{metrics.Workload} active tasks (moderate workload)";
        }
        else
        {
            workloadDesc = $"{metrics.Workload} active tasks (heavy workload)";
        }

        string expDesc;
        if (relevantExp == 0)
        {
            expDesc = $"0 completed {expType} tasks";
        }
        else if (relevantExp == 1)
        {
            expDesc = $"1 completed {expType} task";
        }
        else
        {
            expDesc = $"{relevantExp} completed {expType} tasks";
        }

        var totalRating = metrics.TimelinessRating + metrics.WorkQualityRating + metrics.CommunicationRating;
        var hasRatings = totalRating > 0;
        var avgRating = totalRating / 3.0;
        string ratingsDesc = hasRatings
            ? $"{avgRating:F1}/5.0 avg across timeliness, quality, and communication"
            : "No recorded peer recommendations yet";

        return new GroqCandidateFactors
        {
            Workload = workloadDesc,
            Experience = expDesc,
            Ratings = ratingsDesc
        };
    }
}
