namespace Backend.Models.DTOs;

/// <summary>
/// Task Completion Report — counts assigned/completed/in-progress/pending-review/overdue
/// tasks within a date range, optionally filtered by employee, priority, status and category,
/// along with granular task completion records (who did it, when, was it late).
/// </summary>
public class TaskCompletionReportDTO
{
    public int TotalTasksAssigned { get; set; }
    public int TotalTasksCompleted { get; set; }
    public int TotalTasksInProgress { get; set; }
    public int TotalTasksPendingReview { get; set; }
    public int TotalOverdueTasks { get; set; }
    public double TaskCompletionRate { get; set; }
    public double OverallOnTimeRate { get; set; }
    public double AverageTaskCompletionTimeHours { get; set; }
    public List<TaskCompletionEmployeeSummaryDTO> EmployeePerformanceSummary { get; set; } = new();
    public List<TaskCompletionItemDTO> Tasks { get; set; } = new();
}

public class TaskCompletionItemDTO
{
    public Guid TaskId { get; set; }
    public string TaskReferenceNumber { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string AssignedEmployee { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public string Classification { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime Deadline { get; set; }
    public DateTime? RevisedDeadline { get; set; }
    public DateTime? CompletedAt { get; set; }
    public double DurationHours { get; set; }
    public bool IsOnTime { get; set; }
    public double OverdueHours { get; set; }
    public string Status { get; set; } = string.Empty;
}

public class TaskCompletionEmployeeSummaryDTO
{
    public string EmployeeName { get; set; } = string.Empty;
    public int TotalAssigned { get; set; }
    public int TotalCompleted { get; set; }
    public double CompletionRate { get; set; }
    public double AverageCompletionTimeHours { get; set; }
}

public class TaskCompletionExportRequestDTO
{
    public DateTime? DateRangeStart { get; set; }
    public DateTime? DateRangeEnd { get; set; }
    public Guid? EmployeeId { get; set; }
    public string? TaskPriorityLevel { get; set; }
    public string? TaskStatus { get; set; }
    public string? TaskCategory { get; set; }
    public Backend.Models.Enums.ExportFormat ExportFormat { get; set; } = Backend.Models.Enums.ExportFormat.Excel;
}

/// <summary>
/// Operational Summary Report — overall task workload, SLA breach rate, and completion overview
/// grouped by team/department, category, and priority.
/// </summary>
public class OperationalSummaryReportDTO
{
    public int TotalTasks { get; set; }
    public int CompletedTasks { get; set; }
    public int PendingTasks { get; set; }
    public int OverdueTasks { get; set; }
    public double TaskCompletionRate { get; set; }
    public double OverallOnTimeRate { get; set; }
    public double OverallSlaBreachRate { get; set; }
    public List<DepartmentOperationalSummaryDTO> DepartmentSummaries { get; set; } = new();
    public List<OperationalEmployeePerformanceDTO> EmployeePerformanceSummary { get; set; } = new();
    public List<ReportWorkloadItemDTO> WorkloadByCategory { get; set; } = new();
    public List<ReportWorkloadItemDTO> WorkloadByDepartment { get; set; } = new();
    public List<ReportWorkloadItemDTO> WorkloadByPriority { get; set; } = new();
}

public class DepartmentOperationalSummaryDTO
{
    public Guid? DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public int TotalTasks { get; set; }
    public int CompletedTasks { get; set; }
    public int ActiveTasks { get; set; }
    public int SlaBreachedTasks { get; set; }
    public int AtRiskTasks { get; set; }
    public double OnTimeRate { get; set; }
    public double SlaBreachRate { get; set; }
    public double TasksPerMember { get; set; }
    public string WorkloadBalanceStatus { get; set; } = "Balanced"; // Balanced, Moderate, Overloaded
}

public class OperationalEmployeePerformanceDTO
{
    public string EmployeeName { get; set; } = string.Empty;
    public int Assigned { get; set; }
    public int Completed { get; set; }
    public int Overdue { get; set; }
    public double CompletionRate { get; set; }
}

public class ReportWorkloadItemDTO
{
    public string CategoryName { get; set; } = string.Empty;
    public int TaskCount { get; set; }
    public double Percentage { get; set; }
}

/// <summary>
/// Financial Report (FOMS) — Invoices, revenue, balances, and collection tracking.
/// </summary>
public class FinancialReportDTO
{
    public decimal TotalBilled { get; set; }
    public decimal TotalCollected { get; set; }
    public decimal TotalOutstanding { get; set; }
    public double CollectionRate { get; set; }
    public int TotalInvoices { get; set; }
    public int OverdueInvoicesCount { get; set; }
    public string FiscalPeriod { get; set; } = string.Empty;
    public DateTime DateRangeStart { get; set; }
    public DateTime DateRangeEnd { get; set; }
    public List<FinancialInvoiceItemDTO> Invoices { get; set; } = new();
}

public class FinancialInvoiceItemDTO
{
    public string InvoiceNumber { get; set; } = string.Empty;
    public string FomsReference { get; set; } = string.Empty;
    public string ClientAccount { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public DateTime BillingDate { get; set; }
    public DateTime DueDate { get; set; }
    public DateTime? PaymentDate { get; set; }
    public string Currency { get; set; } = "PHP";
    public decimal AmountBilled { get; set; }
    public decimal AmountPaid { get; set; }
    public decimal OutstandingBalance { get; set; }
    public string PaymentStatus { get; set; } = "Pending"; // Paid, Partially Paid, Pending, Overdue
    public string PaymentMethod { get; set; } = "Bank Transfer";
    public string FiscalPeriod { get; set; } = string.Empty;
}

public class FinancialReportFilterDTO
{
    public DateTime? DateRangeStart { get; set; }
    public DateTime? DateRangeEnd { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? EmployeeId { get; set; }
    public string? FiscalPeriod { get; set; }
    public Backend.Models.Enums.ExportFormat ExportFormat { get; set; } = Backend.Models.Enums.ExportFormat.Excel;
}

/// <summary>
/// Filter dropdown options for the reports (departments and employees).
/// </summary>
public class ReportFilterOptionsDTO
{
    public List<ReportFilterOptionDTO> Departments { get; set; } = new();
    public List<ReportFilterOptionDTO> Employees { get; set; } = new();
}

public class ReportFilterOptionDTO
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
}
