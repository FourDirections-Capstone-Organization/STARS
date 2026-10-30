using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Backend.Models.DTOs;
using Microsoft.Extensions.Options;
using Backend.Data;
using Backend.Models;
using Backend.Models.Enums;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Task = System.Threading.Tasks.Task;

namespace Backend.Modules.Analytics;

public class BiomarkerScanService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IOptions<BiomarkerThresholds> _thresholds;
    private readonly ILogger<BiomarkerScanService> _logger;

    public BiomarkerScanService(IServiceScopeFactory scopeFactory, IOptions<BiomarkerThresholds> thresholds, ILogger<BiomarkerScanService> logger)
    {
        _scopeFactory = scopeFactory;
        _thresholds = thresholds;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Biomarker scan service starting");

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTime.UtcNow;
            var nextMidnight = now.Date.AddDays(1);
            var delay = nextMidnight - now;

            if (delay > TimeSpan.Zero)
                await Task.Delay(delay, stoppingToken);

            if (stoppingToken.IsCancellationRequested)
                break;

            await RunBiomarkerScanAsync(DateTime.UtcNow.Date, stoppingToken);
        }
    }

    public async Task RunBiomarkerScanAsync(DateTime scanDate, CancellationToken cancellationToken = default)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var kpiEngine = scope.ServiceProvider.GetService<IKpiCalculationEngine>()
                ?? new KpiCalculationEngine(db, scope.ServiceProvider.GetService<ILogger<KpiCalculationEngine>>() ?? Microsoft.Extensions.Logging.Abstractions.NullLogger<KpiCalculationEngine>.Instance);

            _logger.LogInformation("Running biomarker scan for {ScanDate}", scanDate.ToString("yyyy-MM-dd"));

            var alerts = new List<BiomarkerAlert>();
            var now = DateTime.UtcNow;
            var th = _thresholds.Value;
            var scanDateTime = now;

            var normalizedScanDate = scanDate.Kind == DateTimeKind.Utc ? scanDate : DateTime.SpecifyKind(scanDate, DateTimeKind.Utc);
            var kpiEndDate = normalizedScanDate.Date.AddDays(1);
            var kpiStartDate = kpiEndDate.AddDays(-30);

            var activeConfigs = await db.KpiConfigurations
                .Where(c => c.IsActive)
                .ToDictionaryAsync(c => c.Id, cancellationToken);

            // ─── Department-level metrics ───
            var departments = await db.Departments.Where(d => d.IsActive).ToListAsync();

            foreach (var dept in departments)
            {
                var deptTasks = await db.Tasks
                    .Where(t => t.AssignedDepartmentId == dept.Id)
                    .ToListAsync();

                if (deptTasks.Count == 0)
                    continue;

                var completedTasks = deptTasks.Where(t => t.Status == Models.Enums.TaskStatus.Completed).ToList();
                var completedLast24h = completedTasks.Where(t => (t.UpdatedAt ?? t.CreatedAt) >= scanDate.AddDays(-1)).ToList();
                var onTimeCount = completedLast24h.Count(IsTaskOnTime);
                var lateCount = completedLast24h.Count(IsTaskLate);
                var totalCompleted24h = completedLast24h.Count;

                // On-time rate check
                if (totalCompleted24h > 0)
                {
                    var onTimeRate = (double)onTimeCount / totalCompleted24h;
                    if (onTimeRate < th.MinOnTimeRate)
                    {
                        alerts.Add(new BiomarkerAlert
                        {
                            ScanDateTime = scanDateTime,
                            ScanDate = scanDate,
                            DepartmentId = dept.Id,
                            DepartmentName = dept.Name,
                            MetricName = "OnTimeRate",
                            CurrentValue = Math.Round(onTimeRate * 100, 2),
                            ThresholdValue = th.MinOnTimeRate * 100,
                            Severity = "Warning",
                            Description = $"Department {dept.Name} has {Math.Round(onTimeRate * 100, 1)}% on-time rate (threshold: {th.MinOnTimeRate * 100}%)"
                        });
                    }
                }

                // Overdue backlog check
                var overdueCount = deptTasks.Count(t =>
                    (t.RevisedDeadline ?? t.Deadline) < now
                    && t.Status != Models.Enums.TaskStatus.Completed
                    && t.Status != Models.Enums.TaskStatus.Cancelled);

                if (overdueCount > th.MaxOverdueBacklog)
                {
                    alerts.Add(new BiomarkerAlert
                    {
                        ScanDateTime = scanDateTime,
                        ScanDate = scanDate,
                        DepartmentId = dept.Id,
                        DepartmentName = dept.Name,
                        MetricName = "OverdueBacklog",
                        CurrentValue = overdueCount,
                        ThresholdValue = th.MaxOverdueBacklog,
                        Severity = overdueCount > th.MaxOverdueBacklog * 2 ? "Critical" : "Warning",
                        Description = $"Department {dept.Name} has {overdueCount} overdue tasks (threshold: {th.MaxOverdueBacklog})"
                    });
                }

                // Stuck tasks check
                var stuckTasks = deptTasks.Count(t =>
                    t.Status == Models.Enums.TaskStatus.InProgress
                    && (now - (t.UpdatedAt ?? t.CreatedAt)).TotalHours > th.StuckTaskHours);

                if (stuckTasks > 0)
                {
                    alerts.Add(new BiomarkerAlert
                    {
                        ScanDateTime = scanDateTime,
                        ScanDate = scanDate,
                        DepartmentId = dept.Id,
                        DepartmentName = dept.Name,
                        MetricName = "StuckTasks",
                        CurrentValue = stuckTasks,
                        ThresholdValue = 0,
                        Severity = "Warning",
                        Description = $"Department {dept.Name} has {stuckTasks} task(s) stuck InProgress for >{th.StuckTaskHours}h"
                    });
                }

                // ─── Configurable Department KPI Red-Zone Evaluation ───
                try
                {
                    var deptKpi = await kpiEngine.CalculateDepartmentKpiAsync(dept.Id, kpiStartDate, kpiEndDate, cancellationToken: cancellationToken);
                    if (deptKpi.TotalAssignedTasks > 0)
                    {
                        foreach (var m in deptKpi.Metrics)
                        {
                            bool isEvaluatable = (m.MetricCode == "COMPLETION_RATE" || m.MetricCode == "TASK_COMPLETION_RATE")
                                ? deptKpi.TotalAssignedTasks >= 3
                                : deptKpi.CompletedTasksCount > 0;

                            if (isEvaluatable && m.Rating == "Red")
                            {
                                alerts.Add(new BiomarkerAlert
                                {
                                    ScanDateTime = scanDateTime,
                                    ScanDate = scanDate,
                                    DepartmentId = dept.Id,
                                    DepartmentName = dept.Name,
                                    MetricName = m.MetricCode,
                                    CurrentValue = m.ActualValue,
                                    ThresholdValue = m.RedThreshold,
                                    Severity = "Critical",
                                    Description = $"Department {dept.Name} breached red-zone threshold for {m.Name} ({m.MetricCode}): {m.ActualValue}{m.Unit} (Red threshold: {m.RedThreshold}{m.Unit})"
                                });
                            }
                        }

                        if (deptKpi.CompletedTasksCount > 0 && deptKpi.OverallRating == "Red")
                        {
                            double deptRedThresh = deptKpi.ConfigurationId.HasValue && activeConfigs.TryGetValue(deptKpi.ConfigurationId.Value, out var dcfg)
                                ? dcfg.OverallRedThreshold
                                : 60.0;

                            alerts.Add(new BiomarkerAlert
                            {
                                ScanDateTime = scanDateTime,
                                ScanDate = scanDate,
                                DepartmentId = dept.Id,
                                DepartmentName = dept.Name,
                                MetricName = "DepartmentKpiOverallScore",
                                CurrentValue = deptKpi.OverallScore,
                                ThresholdValue = deptRedThresh,
                                Severity = "Critical",
                                Description = $"Department {dept.Name} overall KPI score ({deptKpi.OverallScore}) is in the Critical red zone (threshold: {deptRedThresh})"
                            });
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to evaluate KPI red zones for department {DeptName}", dept.Name);
                }
            }

            // ─── Employee-level metrics ───
            var employees = await db.Users
                .Where(u => u.IsActive && !u.IsDeactivated
                    && u.Role != UserRole.Manager && u.Role != UserRole.Coordinator)
                .Include(u => u.Department)
                .ToListAsync();

            foreach (var emp in employees)
            {
                var empAssignments = await db.TaskAssignments
                    .Where(a => a.AssignedUserId == emp.Id)
                    .Include(a => a.Task)
                    .ToListAsync();

                var empCompletedTasks = empAssignments
                    .Where(a => a.Task != null && a.Task.Status == Models.Enums.TaskStatus.Completed)
                    .Select(a => a.Task!)
                    .ToList();

                var empCompletedLast7d = empCompletedTasks
                    .Where(t => (t.UpdatedAt ?? t.CreatedAt) >= now.AddDays(-7))
                    .ToList();

                // Inactive employee check
                if (empCompletedLast7d.Count == 0 && empAssignments.Count > 0)
                {
                    alerts.Add(new BiomarkerAlert
                    {
                        ScanDateTime = scanDateTime,
                        ScanDate = scanDate,
                        DepartmentId = emp.DepartmentId,
                        DepartmentName = emp.Department?.Name ?? "Unknown",
                        EmployeeName = $"{emp.FirstName} {emp.LastName}",
                        EmployeeNumber = emp.EmployeeNumber,
                        MetricName = "InactiveEmployee",
                        CurrentValue = 0,
                        ThresholdValue = 1,
                        Severity = "Info",
                        Description = $"Employee {emp.EmployeeNumber} ({emp.FirstName} {emp.LastName}) has 0 completed tasks in last 7 days"
                    });
                }

                // Late rate check
                if (empCompletedTasks.Count >= 3)
                {
                    var lateCount = empCompletedTasks.Count(IsTaskLate);
                    var lateRate = (double)lateCount / empCompletedTasks.Count;
                    if (lateRate > th.MaxLateRatePerEmployee)
                    {
                        alerts.Add(new BiomarkerAlert
                        {
                            ScanDateTime = scanDateTime,
                            ScanDate = scanDate,
                            DepartmentId = emp.DepartmentId,
                            DepartmentName = emp.Department?.Name ?? "Unknown",
                            EmployeeName = $"{emp.FirstName} {emp.LastName}",
                            EmployeeNumber = emp.EmployeeNumber,
                            MetricName = "EmployeeLateRate",
                            CurrentValue = Math.Round(lateRate * 100, 2),
                            ThresholdValue = th.MaxLateRatePerEmployee * 100,
                            Severity = "Warning",
                            Description = $"Employee {emp.EmployeeNumber} has {Math.Round(lateRate * 100, 1)}% late rate (threshold: {th.MaxLateRatePerEmployee * 100}%)"
                        });
                    }
                }

                // Workload check
                var activeAssignments = empAssignments.Count(a =>
                    a.Task != null
                    && a.Task.Status != Models.Enums.TaskStatus.Completed
                    && a.Task.Status != Models.Enums.TaskStatus.Cancelled);

                if (activeAssignments > th.MaxWorkloadPerEmployee)
                {
                    alerts.Add(new BiomarkerAlert
                    {
                        ScanDateTime = scanDateTime,
                        ScanDate = scanDate,
                        DepartmentId = emp.DepartmentId,
                        DepartmentName = emp.Department?.Name ?? "Unknown",
                        EmployeeName = $"{emp.FirstName} {emp.LastName}",
                        EmployeeNumber = emp.EmployeeNumber,
                        MetricName = "HighWorkload",
                        CurrentValue = activeAssignments,
                        ThresholdValue = th.MaxWorkloadPerEmployee,
                        Severity = "Warning",
                        Description = $"Employee {emp.EmployeeNumber} has {activeAssignments} active tasks (threshold: {th.MaxWorkloadPerEmployee})"
                    });
                }

                // ─── Configurable Employee KPI Red-Zone Evaluation ───
                try
                {
                    var empKpi = await kpiEngine.CalculateEmployeeKpiAsync(emp.Id, kpiStartDate, kpiEndDate, cancellationToken: cancellationToken);
                    if (empKpi.TotalAssignedTasks > 0)
                    {
                        foreach (var m in empKpi.Metrics)
                        {
                            bool isEvaluatable = (m.MetricCode == "COMPLETION_RATE" || m.MetricCode == "TASK_COMPLETION_RATE")
                                ? empKpi.TotalAssignedTasks >= 3
                                : empKpi.CompletedTasksCount > 0;

                            if (isEvaluatable && m.Rating == "Red")
                            {
                                alerts.Add(new BiomarkerAlert
                                {
                                    ScanDateTime = scanDateTime,
                                    ScanDate = scanDate,
                                    DepartmentId = emp.DepartmentId,
                                    DepartmentName = emp.Department?.Name ?? "Unknown",
                                    EmployeeName = $"{emp.FirstName} {emp.LastName}",
                                    EmployeeNumber = emp.EmployeeNumber,
                                    MetricName = m.MetricCode,
                                    CurrentValue = m.ActualValue,
                                    ThresholdValue = m.RedThreshold,
                                    Severity = "Critical",
                                    Description = $"Employee {emp.EmployeeNumber} ({emp.FirstName} {emp.LastName}) breached red-zone threshold for {m.Name} ({m.MetricCode}): {m.ActualValue}{m.Unit} (Red threshold: {m.RedThreshold}{m.Unit})"
                                });
                            }
                        }

                        if (empKpi.CompletedTasksCount > 0 && empKpi.OverallRating == "Red")
                        {
                            double empRedThresh = empKpi.ConfigurationId.HasValue && activeConfigs.TryGetValue(empKpi.ConfigurationId.Value, out var ecfg)
                                ? ecfg.OverallRedThreshold
                                : 60.0;

                            alerts.Add(new BiomarkerAlert
                            {
                                ScanDateTime = scanDateTime,
                                ScanDate = scanDate,
                                DepartmentId = emp.DepartmentId,
                                DepartmentName = emp.Department?.Name ?? "Unknown",
                                EmployeeName = $"{emp.FirstName} {emp.LastName}",
                                EmployeeNumber = emp.EmployeeNumber,
                                MetricName = "EmployeeKpiOverallScore",
                                CurrentValue = empKpi.OverallScore,
                                ThresholdValue = empRedThresh,
                                Severity = "Critical",
                                Description = $"Employee {emp.EmployeeNumber} ({emp.FirstName} {emp.LastName}) overall KPI score ({empKpi.OverallScore}) is in the Critical red zone (threshold: {empRedThresh})"
                            });
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to evaluate KPI red zones for employee {EmployeeNumber}", emp.EmployeeNumber);
                }
            }

            // ─── System-level metrics ───
            var totalActiveTasks = await db.Tasks.CountAsync(t =>
                t.Status != Models.Enums.TaskStatus.Completed
                && t.Status != Models.Enums.TaskStatus.Cancelled);

            var totalCompletedEver = await db.Tasks.CountAsync(t => t.Status == Models.Enums.TaskStatus.Completed);
            var totalOnTimeEver = await db.Tasks.CountAsync(t => t.Status == Models.Enums.TaskStatus.Completed && (t.UpdatedAt ?? t.CreatedAt) <= (t.RevisedDeadline ?? t.Deadline));
            var overallSlaCompliance = CalculateOverallSlaCompliance(totalOnTimeEver, totalCompletedEver);

            if (overallSlaCompliance < th.MinOnTimeRate * 100)
            {
                alerts.Add(new BiomarkerAlert
                {
                    ScanDateTime = scanDateTime,
                    ScanDate = scanDate,
                    MetricName = "OverallSlaCompliance",
                    CurrentValue = Math.Round(overallSlaCompliance, 2),
                    ThresholdValue = th.MinOnTimeRate * 100,
                    Severity = overallSlaCompliance < 50 ? "Critical" : "Warning",
                    Description = $"Overall SLA compliance is {Math.Round(overallSlaCompliance, 1)}% (threshold: {th.MinOnTimeRate * 100}%)"
                });
            }

            // ─── Persist alerts ───
            if (alerts.Count > 0)
            {
                db.BiomarkerAlerts.AddRange(alerts);
                await db.SaveChangesAsync();
                _logger.LogInformation("Biomarker scan generated {Count} alerts", alerts.Count);
            }
            else
            {
                _logger.LogInformation("Biomarker scan completed — no alerts generated");
            }

            // ─── Generate PDF summary ───
            await GenerateDailyPdfAsync(scanDate, db, alerts);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Biomarker scan failed");
        }
    }

    private async Task GenerateDailyPdfAsync(DateTime scanDate, AppDbContext db, List<BiomarkerAlert> alerts)
    {
        try
        {
            var pdfDir = Path.Combine(Directory.GetCurrentDirectory(), "Reports", "Biomarker");
            Directory.CreateDirectory(pdfDir);

            var fileName = $"daily-summary-{scanDate:yyyyMMdd}.pdf";
            var filePath = Path.Combine(pdfDir, fileName);

            Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(40);
                    page.DefaultTextStyle(x => x.FontSize(10));

                    page.Header().Element(c => c.Column(col =>
                    {
                        col.Item().Text($"STARS Biomarker Scan Report — {scanDate:yyyy-MM-dd}").SemiBold().FontSize(16);
                        col.Item().Text($"Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC").FontSize(9).FontColor(Colors.Grey.Medium);
                    }));

                    page.Content().Element(c => c.Column(col =>
                    {
                        if (alerts.Count == 0)
                        {
                            col.Item().PaddingTop(20).Text("No alerts generated. All metrics within normal ranges.").FontColor(Colors.Green.Medium);
                            return;
                        }

                        var bySeverity = alerts.GroupBy(a => a.Severity);
                        foreach (var group in bySeverity)
                        {
                            var color = group.Key switch
                            {
                                "Critical" => Colors.Red.Medium,
                                "Warning" => Colors.Orange.Medium,
                                _ => Colors.Blue.Medium
                            };

                            col.Item().PaddingTop(15).Text($"{group.Key} Alerts ({group.Count()})").SemiBold().FontSize(13).FontColor(color);

                            foreach (var alert in group.Take(20))
                            {
                                col.Item().PaddingLeft(10).PaddingTop(5).Element(r => r.Column(c2 =>
                                {
                                    c2.Item().Text($"{alert.MetricName} — {alert.DepartmentName}").SemiBold().FontSize(10);
                                    c2.Item().Text($"{alert.Description}").FontSize(9).FontColor(Colors.Grey.Darken1);
                                    c2.Item().Text($"Value: {alert.CurrentValue} | Threshold: {alert.ThresholdValue}").FontSize(8).FontColor(Colors.Grey.Medium);
                                }));
                            }
                        }
                    }));
                });
            }).GeneratePdf(filePath);

            _logger.LogInformation("Daily biomarker PDF generated: {Path}", filePath);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate daily biomarker PDF");
        }
    }

    /// <summary>
    /// Evaluates if a completed task was finished on or before its effective deadline (RevisedDeadline ?? Deadline).
    /// </summary>
    public static bool IsTaskOnTime(Models.Task task)
    {
        var completedAt = task.UpdatedAt ?? task.CreatedAt;
        var effectiveDeadline = task.RevisedDeadline ?? task.Deadline;
        return completedAt <= effectiveDeadline;
    }

    /// <summary>
    /// Evaluates if a completed task was finished after its effective deadline (RevisedDeadline ?? Deadline).
    /// </summary>
    public static bool IsTaskLate(Models.Task task)
    {
        var completedAt = task.UpdatedAt ?? task.CreatedAt;
        var effectiveDeadline = task.RevisedDeadline ?? task.Deadline;
        return completedAt > effectiveDeadline;
    }

    /// <summary>
    /// Calculates the on-time rate [0.0 - 1.0] for a collection of completed tasks based on effective deadlines.
    /// Returns 1.0 if the collection is empty.
    /// </summary>
    public static double CalculateOnTimeRate(IEnumerable<Models.Task> completedTasks)
    {
        var list = completedTasks.ToList();
        if (list.Count == 0) return 1.0;
        var onTimeCount = list.Count(IsTaskOnTime);
        return (double)onTimeCount / list.Count;
    }

    /// <summary>
    /// Calculates the late rate [0.0 - 1.0] for an employee's completed tasks based on effective deadlines.
    /// Returns 0.0 if the collection is empty.
    /// </summary>
    public static double CalculateEmployeeLateRate(IEnumerable<Models.Task> completedTasks)
    {
        var list = completedTasks.ToList();
        if (list.Count == 0) return 0.0;
        var lateCount = list.Count(IsTaskLate);
        return (double)lateCount / list.Count;
    }

    /// <summary>
    /// Calculates overall SLA compliance percentage [0 - 100].
    /// Returns 100.0 if totalCompletedCount is 0.
    /// </summary>
    public static double CalculateOverallSlaCompliance(int onTimeCount, int totalCompletedCount)
    {
        if (totalCompletedCount <= 0) return 100.0;
        return (double)onTimeCount / totalCompletedCount * 100.0;
    }
}

