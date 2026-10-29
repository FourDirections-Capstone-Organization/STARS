using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using BackendTask = Backend.Models.Task;

namespace Backend.Modules.Analytics;

public class KpiCalculationEngine : IKpiCalculationEngine
{
    private readonly AppDbContext _db;
    private readonly ILogger<KpiCalculationEngine> _logger;

    public KpiCalculationEngine(AppDbContext db, ILogger<KpiCalculationEngine> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async System.Threading.Tasks.Task<EmployeeKpiEvaluationResultDTO> CalculateEmployeeKpiAsync(
        Guid employeeId,
        DateTime startDate,
        DateTime endDate,
        Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedStart = DateTime.SpecifyKind(startDate, DateTimeKind.Utc);
        var normalizedEnd = DateTime.SpecifyKind(endDate, DateTimeKind.Utc);

        if (normalizedStart > normalizedEnd)
        {
            (normalizedStart, normalizedEnd) = (normalizedEnd, normalizedStart);
        }

        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == employeeId, cancellationToken);

        if (user == null)
        {
            throw new KeyNotFoundException($"Employee with ID '{employeeId}' was not found.");
        }

        // Resolve prospective KPI configuration
        var configuration = await ResolveConfigurationAsync(user, normalizedStart, normalizedEnd, configurationId, cancellationToken);

        // Fetch employee's assigned tasks relevant to the timeframe
        var tasks = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.Attachments)
            .Where(t => t.Assignments.Any(a => a.AssignedUserId == employeeId))
            .Where(t => (t.CreatedAt >= normalizedStart && t.CreatedAt <= normalizedEnd)
                     || ((t.UpdatedAt ?? t.CreatedAt) >= normalizedStart && (t.UpdatedAt ?? t.CreatedAt) <= normalizedEnd)
                     || t.Assignments.Any(a => a.AssignedUserId == employeeId && a.AssignedAt >= normalizedStart && a.AssignedAt <= normalizedEnd))
            .ToListAsync(cancellationToken);

        // Fetch rework audit logs for completed tasks
        var completedTasks = tasks.Where(t => t.Status == Backend.Models.Enums.TaskStatus.Completed).ToList();
        var completedTaskIds = completedTasks.Select(t => t.Id).ToList();

        var reworkTaskIds = new HashSet<Guid>();
        if (completedTaskIds.Count > 0)
        {
            var reworkLogs = await _db.AuditLogs
                .Where(a => a.TargetEntity == "Task"
                    && a.TargetEntityId.HasValue
                    && completedTaskIds.Contains(a.TargetEntityId.Value)
                    && a.ActionType == AuditActionType.StatusChange
                    && ((a.OldValue == "DonePendingReview" && a.NewValue == "InProgress")
                        || (a.Description != null && a.Description.Contains("rework"))))
                .Select(a => a.TargetEntityId!.Value)
                .Distinct()
                .ToListAsync(cancellationToken);

            foreach (var id in reworkLogs)
            {
                reworkTaskIds.Add(id);
            }
        }

        return CalculateFromTasks(user, tasks, reworkTaskIds, normalizedStart, normalizedEnd, configuration);
    }

    public EmployeeKpiEvaluationResultDTO CalculateFromTasks(
        User employee,
        IReadOnlyList<BackendTask> tasks,
        IReadOnlySet<Guid> reworkTaskIds,
        DateTime startDate,
        DateTime endDate,
        KpiConfiguration? configuration = null)
    {
        var config = configuration ?? CreateDefaultFallbackConfiguration();

        int totalAssigned = tasks.Count;
        var completedTasks = tasks.Where(t => t.Status == Backend.Models.Enums.TaskStatus.Completed).ToList();
        int completedCount = completedTasks.Count;

        int onTimeCount = 0;
        int inFullCount = 0;
        int otifCount = 0;
        int reworkCount = 0;
        double totalHandlingHours = 0.0;

        foreach (var task in completedTasks)
        {
            var completionTime = task.UpdatedAt ?? task.CreatedAt;
            var effectiveDeadline = task.RevisedDeadline ?? task.Deadline;
            bool isOnTime = completionTime <= effectiveDeadline;
            if (isOnTime) onTimeCount++;

            bool isInFull = task.Attachments != null && task.Attachments.Count > 0;
            if (isInFull) inFullCount++;

            if (isOnTime && isInFull) otifCount++;

            bool hasRework = reworkTaskIds.Contains(task.Id) || !string.IsNullOrWhiteSpace(task.PushBackComment);
            if (hasRework) reworkCount++;

            var assignment = task.Assignments?.FirstOrDefault(a => a.AssignedUserId == employee.Id);
            var startTime = assignment?.AssignedAt ?? task.CreatedAt;
            var endTime = task.UpdatedAt ?? task.CreatedAt;
            if (endTime < startTime) endTime = startTime;

            totalHandlingHours += (endTime - startTime).TotalHours;
        }

        int accurateCount = Math.Max(0, completedCount - reworkCount);

        // Core metric calculations
        double completionRate = totalAssigned == 0 ? 0.0 : Math.Round((double)completedCount / totalAssigned * 100.0, 2);
        double otifRate = completedCount == 0 ? 0.0 : Math.Round((double)otifCount / completedCount * 100.0, 2);
        double accuracyRate = completedCount == 0 ? 0.0 : Math.Round((double)accurateCount / completedCount * 100.0, 2);
        double ahtHours = completedCount == 0 ? 0.0 : Math.Round(totalHandlingHours / completedCount, 2);

        var metrics = new List<KpiMetricValueDTO>();
        var itemsToEvaluate = (config.Items != null && config.Items.Count > 0)
            ? config.Items.OrderBy(i => i.Order).ToList()
            : CreateDefaultFallbackConfiguration().Items.ToList();

        foreach (var item in itemsToEvaluate)
        {
            double actualValue = item.MetricCode.ToUpperInvariant() switch
            {
                "OTIF" => otifRate,
                "ORDER_ACCURACY" => accuracyRate,
                "COMPLETION_RATE" => completionRate,
                "AHT" => ahtHours,
                _ => 0.0
            };

            string rating = EvaluateThreshold(actualValue, item);
            double weightedScore = CalculateWeightedScore(actualValue, item);

            metrics.Add(new KpiMetricValueDTO
            {
                MetricCode = item.MetricCode,
                Name = item.Name,
                ActualValue = actualValue,
                Unit = item.Unit,
                TargetValue = item.TargetValue,
                Weight = item.Weight,
                GreenThreshold = item.GreenThreshold,
                AmberThreshold = item.AmberThreshold,
                RedThreshold = item.RedThreshold,
                IsLowerBetter = item.IsLowerBetter,
                Rating = rating,
                WeightedScore = weightedScore
            });
        }

        double overallScore = Math.Round(metrics.Sum(m => m.WeightedScore), 2);
        string overallRating = DetermineOverallRating(metrics, overallScore, totalAssigned, config.OverallGreenThreshold, config.OverallAmberThreshold);

        return new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = employee.Id,
            EmployeeName = $"{employee.FirstName} {employee.LastName}".Trim(),
            EmployeeNumber = employee.EmployeeNumber,
            DepartmentName = employee.Department?.Name,
            JobPositionTitle = employee.JobPosition?.Name,
            Role = employee.Role.ToString(),
            PeriodStart = startDate,
            PeriodEnd = endDate,
            ConfigurationId = config.Id,
            ConfigurationTitle = config.Title,
            TotalAssignedTasks = totalAssigned,
            CompletedTasksCount = completedCount,
            OnTimeTasksCount = onTimeCount,
            InFullTasksCount = inFullCount,
            OtifTasksCount = otifCount,
            ReworkTasksCount = reworkCount,
            AccurateTasksCount = accurateCount,
            TotalHandlingHours = Math.Round(totalHandlingHours, 2),
            OverallScore = overallScore,
            OverallRating = overallRating,
            Metrics = metrics
        };
    }

    private async System.Threading.Tasks.Task<KpiConfiguration> ResolveConfigurationAsync(
        User user,
        DateTime startDate,
        DateTime endDate,
        Guid? configurationId,
        CancellationToken cancellationToken)
    {
        if (configurationId.HasValue)
        {
            var specified = await _db.KpiConfigurations
                .Include(c => c.Items)
                .FirstOrDefaultAsync(c => c.Id == configurationId.Value, cancellationToken);

            if (specified != null) return specified;
        }

        var userRoleStr = user.Role.ToString();

        // 1. Prospective configuration matching role and department
        var activeConfigs = await _db.KpiConfigurations
            .Include(c => c.Items)
            .Where(c => c.IsActive && c.EffectiveStartDate <= endDate && (c.EffectiveEndDate == null || c.EffectiveEndDate >= startDate))
            .OrderByDescending(c => c.EffectiveStartDate)
            .ToListAsync(cancellationToken);

        var matched = activeConfigs.FirstOrDefault(c => c.DepartmentId == user.DepartmentId && string.Equals(c.TargetRole, userRoleStr, StringComparison.OrdinalIgnoreCase))
            ?? activeConfigs.FirstOrDefault(c => c.DepartmentId == user.DepartmentId && string.IsNullOrEmpty(c.TargetRole))
            ?? activeConfigs.FirstOrDefault(c => c.DepartmentId == null && string.Equals(c.TargetRole, userRoleStr, StringComparison.OrdinalIgnoreCase))
            ?? activeConfigs.FirstOrDefault(c => c.DepartmentId == null && string.IsNullOrEmpty(c.TargetRole));

        if (matched != null) return matched;

        // Fallback to default seeded configuration
        var defaultSeed = await _db.KpiConfigurations
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == KpiDefaultSeeder.DefaultConfigurationId, cancellationToken);

        return defaultSeed ?? CreateDefaultFallbackConfiguration();
    }

    private static string EvaluateThreshold(double actualValue, KpiItem item)
    {
        if (item.IsLowerBetter)
        {
            if (actualValue <= item.GreenThreshold)
                return "Green";
            if (actualValue <= item.AmberThreshold)
                return "Amber";
            return "Red";
        }

        if (actualValue >= item.GreenThreshold)
            return "Green";
        if (actualValue >= item.AmberThreshold)
            return "Amber";
        return "Red";
    }

    private static double CalculateWeightedScore(double actualValue, KpiItem item)
    {
        if (item.TargetValue <= 0 || item.Weight <= 0) return 0.0;

        if (item.IsLowerBetter)
        {
            if (actualValue <= 0) return item.Weight;
            if (actualValue <= item.TargetValue) return item.Weight;
            double ratio = Math.Max(0.0, item.TargetValue / actualValue);
            return Math.Round(Math.Min(1.0, ratio) * item.Weight, 2);
        }
        else
        {
            double ratio = Math.Max(0.0, actualValue / item.TargetValue);
            return Math.Round(Math.Min(1.0, ratio) * item.Weight, 2);
        }
    }

    public static string DetermineOverallRating(
        List<KpiMetricValueDTO> metrics,
        double overallScore,
        int totalAssigned,
        double greenThreshold = 85.0,
        double amberThreshold = 70.0)
    {
        if (totalAssigned == 0) return "Amber";

        if (metrics.Any(m => m.Rating == "Red") || overallScore < amberThreshold)
            return "Red";

        if (metrics.Any(m => m.Rating == "Amber") || overallScore < greenThreshold)
            return "Amber";

        return "Green";
    }

    public static KpiConfiguration CreateDefaultFallbackConfiguration()
    {
        return new KpiConfiguration
        {
            Id = KpiDefaultSeeder.DefaultConfigurationId,
            Title = "Default Logistics Operations KPI",
            Description = "Standard prospective evaluation configuration containing the 4 canonical logistics KPIs.",
            IsActive = true,
            EffectiveStartDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            OverallGreenThreshold = 85.0,
            OverallAmberThreshold = 70.0,
            OverallRedThreshold = 60.0,
            Items = new List<KpiItem>
            {
                new()
                {
                    Id = KpiDefaultSeeder.DefaultOtifItemId,
                    MetricCode = "OTIF",
                    Name = "On-Time In-Full Rate",
                    Weight = 25.0,
                    Unit = "%",
                    TargetValue = 95.0,
                    GreenThreshold = 90.0,
                    AmberThreshold = 75.0,
                    RedThreshold = 60.0,
                    IsLowerBetter = false,
                    Order = 1
                },
                new()
                {
                    Id = KpiDefaultSeeder.DefaultAccuracyItemId,
                    MetricCode = "ORDER_ACCURACY",
                    Name = "Order Accuracy Rate",
                    Weight = 25.0,
                    Unit = "%",
                    TargetValue = 98.0,
                    GreenThreshold = 95.0,
                    AmberThreshold = 85.0,
                    RedThreshold = 70.0,
                    IsLowerBetter = false,
                    Order = 2
                },
                new()
                {
                    Id = KpiDefaultSeeder.DefaultCompletionItemId,
                    MetricCode = "COMPLETION_RATE",
                    Name = "Task Completion Rate",
                    Weight = 25.0,
                    Unit = "%",
                    TargetValue = 95.0,
                    GreenThreshold = 90.0,
                    AmberThreshold = 80.0,
                    RedThreshold = 70.0,
                    IsLowerBetter = false,
                    Order = 3
                },
                new()
                {
                    Id = KpiDefaultSeeder.DefaultAhtItemId,
                    MetricCode = "AHT",
                    Name = "Average Handling Time",
                    Weight = 25.0,
                    Unit = "hours",
                    TargetValue = 4.0,
                    GreenThreshold = 4.0,
                    AmberThreshold = 8.0,
                    RedThreshold = 12.0,
                    IsLowerBetter = true,
                    Order = 4
                }
            }
        };
    }
}
