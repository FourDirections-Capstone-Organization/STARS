using Backend.Models.Enums;

namespace Backend.Models.DTOs;

public class PerformanceReportDTO
{
    public ReportPeriod Period { get; set; }
    public DateTime DateRangeStart { get; set; }
    public DateTime DateRangeEnd { get; set; }
    public string? DepartmentName { get; set; }
    public string? EmployeeName { get; set; }
    public int TotalAssignedTasks { get; set; }
    public int TotalCompletedTasks { get; set; }
    public double OverallCompletionRate { get; set; }
    public double OverallOnTimeRate { get; set; }
    public double OverallLateRate { get; set; }
    public double OverallSlaBreachRate { get; set; }
    public double OverallReworkRate { get; set; }
    public List<EmployeePerformanceDTO> EmployeeBreakdown { get; set; } = new();
}

public class EmployeePerformanceDTO
{
    public Guid EmployeeId { get; set; }
    public string EmployeeName { get; set; } = string.Empty;
    public string EmployeeNumber { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public int TotalAssigned { get; set; }
    public int TotalCompleted { get; set; }
    public int OnTimeCount { get; set; }
    public int LateCount { get; set; }
    public int SlaBreachCount { get; set; }
    public int ReworkCount { get; set; }
    public double CompletionRate { get; set; }
    public double OnTimeRate { get; set; }
    public double LateRate { get; set; }
    public double SlaBreachRate { get; set; }
    public double ReworkRate { get; set; }
}
