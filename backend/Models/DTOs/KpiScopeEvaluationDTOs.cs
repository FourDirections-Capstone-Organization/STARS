namespace Backend.Models.DTOs;

public class DepartmentKpiSummaryDTO
{
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public int TotalEmployees { get; set; }
    public int TotalTeams { get; set; }
    public int TotalAssignedTasks { get; set; }
    public int CompletedTasksCount { get; set; }
    public double OverallScore { get; set; }
    public string OverallRating { get; set; } = "Green";
}

public class TeamKpiSummaryDTO
{
    public Guid TeamId { get; set; }
    public string TeamName { get; set; } = string.Empty;
    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public Guid? TeamLeaderId { get; set; }
    public string? TeamLeaderName { get; set; }
    public int MemberCount { get; set; }
    public int TotalAssignedTasks { get; set; }
    public int CompletedTasksCount { get; set; }
    public double OverallScore { get; set; }
    public string OverallRating { get; set; } = "Green";
}

public class DepartmentKpiEvaluationResultDTO
{
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public string? RoleFilter { get; set; }
    public Guid? ConfigurationId { get; set; }
    public string? ConfigurationTitle { get; set; }
    public int TotalEmployees { get; set; }
    public int TotalTeams { get; set; }

    // Aggregated performance
    public int TotalAssignedTasks { get; set; }
    public int CompletedTasksCount { get; set; }
    public int OnTimeTasksCount { get; set; }
    public int InFullTasksCount { get; set; }
    public int OtifTasksCount { get; set; }
    public int ReworkTasksCount { get; set; }
    public int AccurateTasksCount { get; set; }
    public double TotalHandlingHours { get; set; }
    public double OverallScore { get; set; }
    public double AverageEmployeeScore { get; set; }
    public string OverallRating { get; set; } = "Green";
    public List<KpiMetricValueDTO> Metrics { get; set; } = new();

    // Hierarchical breakdown
    public List<TeamKpiSummaryDTO> Teams { get; set; } = new();
    public List<EmployeeKpiEvaluationResultDTO> Employees { get; set; } = new();
}

public class TeamKpiEvaluationResultDTO
{
    public Guid TeamId { get; set; }
    public string TeamName { get; set; } = string.Empty;
    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public Guid? TeamLeaderId { get; set; }
    public string? TeamLeaderName { get; set; }
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public string? RoleFilter { get; set; }
    public Guid? ConfigurationId { get; set; }
    public string? ConfigurationTitle { get; set; }
    public int TotalMembers { get; set; }

    // Aggregated performance
    public int TotalAssignedTasks { get; set; }
    public int CompletedTasksCount { get; set; }
    public int OnTimeTasksCount { get; set; }
    public int InFullTasksCount { get; set; }
    public int OtifTasksCount { get; set; }
    public int ReworkTasksCount { get; set; }
    public int AccurateTasksCount { get; set; }
    public double TotalHandlingHours { get; set; }
    public double OverallScore { get; set; }
    public double AverageEmployeeScore { get; set; }
    public string OverallRating { get; set; } = "Green";
    public List<KpiMetricValueDTO> Metrics { get; set; } = new();

    // Member evaluations
    public List<EmployeeKpiEvaluationResultDTO> Employees { get; set; } = new();
}

public class KpiHierarchyScopeResultDTO
{
    public string ScopeLevel { get; set; } = "Company"; // "Company", "Department", "Team", "Employee"
    public Guid? ScopeId { get; set; }
    public string ScopeName { get; set; } = string.Empty;
    public Guid? ParentScopeId { get; set; }
    public string? ParentScopeName { get; set; }
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public string? RoleFilter { get; set; }
    public Guid? ConfigurationId { get; set; }
    public string? ConfigurationTitle { get; set; }
    public int TotalDepartments { get; set; }
    public int TotalTeams { get; set; }
    public int TotalEmployees { get; set; }

    // Aggregated performance
    public int TotalAssignedTasks { get; set; }
    public int CompletedTasksCount { get; set; }
    public int OnTimeTasksCount { get; set; }
    public int InFullTasksCount { get; set; }
    public int OtifTasksCount { get; set; }
    public int ReworkTasksCount { get; set; }
    public int AccurateTasksCount { get; set; }
    public double TotalHandlingHours { get; set; }
    public double OverallScore { get; set; }
    public double AverageEmployeeScore { get; set; }
    public string OverallRating { get; set; } = "Green";
    public List<KpiMetricValueDTO> Metrics { get; set; } = new();

    // Drill-down collections
    public List<DepartmentKpiSummaryDTO> Departments { get; set; } = new();
    public List<TeamKpiSummaryDTO> Teams { get; set; } = new();
    public List<EmployeeKpiEvaluationResultDTO> Employees { get; set; } = new();
}

public class KpiScopeFilterDTO
{
    public Guid? DepartmentId { get; set; }
    public Guid? TeamId { get; set; }
    public Guid? EmployeeId { get; set; }
    public string? Role { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public Guid? ConfigurationId { get; set; }
}
