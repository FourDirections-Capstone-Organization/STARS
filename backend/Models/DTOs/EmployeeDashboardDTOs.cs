namespace Backend.Models.DTOs;

public class EmployeeReportsToDTO
{
    public Guid? SupervisorId { get; set; }
    public string SupervisorName { get; set; } = string.Empty;
    public string SupervisorRole { get; set; } = string.Empty;
    public string? SupervisorEmployeeNumber { get; set; }
    public string ReportingRelation { get; set; } = string.Empty;
}

public class TaskStatusBreakdownItem
{
    public string Status { get; set; } = string.Empty;
    public int Count { get; set; }
    public double Percentage { get; set; }
}

public class TaskPriorityDistributionItem
{
    public string Priority { get; set; } = string.Empty;
    public int Count { get; set; }
}

public class TaskCompletionTrendItem
{
    public string Period { get; set; } = string.Empty;
    public int CompletedCount { get; set; }
}

public class EmployeeDashboardDTO
{
    // Profile Header
    public Guid EmployeeId { get; set; }
    public string EmployeeNumber { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string? DepartmentName { get; set; }
    public string? JobPositionName { get; set; }
    public string AvailabilityStatus { get; set; } = string.Empty;
    public string PresenceStatus { get; set; } = "Offline";
    public bool IsActive { get; set; } = true;

    // Supervisor Info
    public EmployeeReportsToDTO ReportsTo { get; set; } = new();
    public string SupervisorName { get; set; } = string.Empty;
    public string SupervisorRole { get; set; } = string.Empty;
    public string? SupervisorEmployeeNumber { get; set; }
    public string ReportingRelation { get; set; } = string.Empty;

    // KPI Totals
    public int TotalAssignedTasks { get; set; }
    public int TotalCreatedTasks { get; set; }
    public int CompletedCount { get; set; }
    public int InProgressCount { get; set; }
    public int PendingCount { get; set; }
    public int OverdueCount { get; set; }

    // Aggregated Breakdown Lists
    public List<TaskStatusBreakdownItem> StatusBreakdown { get; set; } = new();
    public List<TaskPriorityDistributionItem> PriorityDistribution { get; set; } = new();
    public List<TaskCompletionTrendItem> CompletionTrend { get; set; } = new();
}
