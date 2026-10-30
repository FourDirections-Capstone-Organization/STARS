using System.Text.Json.Serialization;

namespace Backend.Models.DTOs;

public class EmployeeKpiEvaluationResultDTO
{
    public Guid EmployeeId { get; set; }
    public string EmployeeName { get; set; } = string.Empty;
    public string EmployeeNumber { get; set; } = string.Empty;
    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public string? JobPositionTitle { get; set; }
    public string? Role { get; set; }

    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }

    public Guid? ConfigurationId { get; set; }
    public string? ConfigurationTitle { get; set; }

    public int TotalAssignedTasks { get; set; }
    public int CompletedTasksCount { get; set; }
    public int OnTimeTasksCount { get; set; }
    public int InFullTasksCount { get; set; }
    public int OtifTasksCount { get; set; }
    public int ReworkTasksCount { get; set; }
    public int AccurateTasksCount { get; set; }
    public double TotalHandlingHours { get; set; }

    public double OverallScore { get; set; }
    public string OverallRating { get; set; } = "Green";

    public List<KpiMetricValueDTO> Metrics { get; set; } = new();
}

public class KpiMetricValueDTO
{
    public string MetricCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public double ActualValue { get; set; }
    public string Unit { get; set; } = "%";
    public double TargetValue { get; set; }
    public double Weight { get; set; }
    public double GreenThreshold { get; set; }
    public double AmberThreshold { get; set; }
    public double RedThreshold { get; set; }
    public bool IsLowerBetter { get; set; }
    public bool IsCustomFormula { get; set; } = false;
    public string? CustomFormula { get; set; }
    public string Rating { get; set; } = "Green"; // "Green", "Amber", "Red"
    public double WeightedScore { get; set; }

    [JsonPropertyName("metricName")]
    public string MetricName { get => Name; set => Name = value; }

    [JsonPropertyName("value")]
    public double Value { get => ActualValue; set => ActualValue = value; }

    [JsonPropertyName("target")]
    public double Target { get => TargetValue; set => TargetValue = value; }

    [JsonPropertyName("score")]
    public double Score { get => WeightedScore; set => WeightedScore = value; }
}

public class KpiEvaluationRequestDTO
{
    public Guid? EmployeeId { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public Guid? ConfigurationId { get; set; }
}
