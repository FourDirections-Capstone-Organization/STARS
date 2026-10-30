using Microsoft.EntityFrameworkCore;
using Backend.Models;

namespace Backend.Data;

public static class KpiDefaultSeeder
{
    public static readonly Guid DefaultConfigurationId = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    public static readonly Guid DefaultOtifItemId = Guid.Parse("b0000000-0000-0000-0000-000000000001");
    public static readonly Guid DefaultAccuracyItemId = Guid.Parse("b0000000-0000-0000-0000-000000000002");
    public static readonly Guid DefaultCompletionItemId = Guid.Parse("b0000000-0000-0000-0000-000000000003");
    public static readonly Guid DefaultAhtItemId = Guid.Parse("b0000000-0000-0000-0000-000000000004");

    public static async System.Threading.Tasks.Task SeedDefaultKpiConfigurationAsync(AppDbContext db)
    {
        var existing = await db.KpiConfigurations
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == DefaultConfigurationId);

        if (existing != null)
        {
            var updated = false;
            // Ensure default threshold values are repaired if they were left at zero
            if (existing.OverallGreenThreshold == 0.0 && existing.OverallAmberThreshold == 0.0 && existing.OverallRedThreshold == 0.0)
            {
                existing.OverallGreenThreshold = 85.0;
                existing.OverallAmberThreshold = 70.0;
                existing.OverallRedThreshold = 60.0;
                updated = true;
            }

            if (updated)
            {
                existing.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
            return;
        }

        var defaultConfig = new KpiConfiguration
        {
            Id = DefaultConfigurationId,
            Title = "Default Logistics Operations KPI",
            Description = "Standard prospective evaluation configuration containing the 4 canonical logistics KPIs (OTIF, Order Accuracy, Task Completion Rate, and Average Handling Time).",
            TargetRole = null,
            DepartmentId = null,
            EffectiveStartDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            EffectiveEndDate = null,
            IsActive = true,
            OverallGreenThreshold = 85.0,
            OverallAmberThreshold = 70.0,
            OverallRedThreshold = 60.0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Items = new List<KpiItem>
            {
                new()
                {
                    Id = DefaultOtifItemId,
                    KpiConfigurationId = DefaultConfigurationId,
                    MetricCode = "OTIF",
                    Name = "On-Time In-Full Rate",
                    Description = "Percentage of tasks completed on or before deadline with required proof of delivery or attachments.",
                    Weight = 25.0,
                    Unit = "%",
                    TargetValue = 95.0,
                    GreenThreshold = 90.0,
                    AmberThreshold = 75.0,
                    RedThreshold = 60.0,
                    IsLowerBetter = false,
                    IsCustomFormula = false,
                    Order = 1,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                },
                new()
                {
                    Id = DefaultAccuracyItemId,
                    KpiConfigurationId = DefaultConfigurationId,
                    MetricCode = "ORDER_ACCURACY",
                    Name = "Order Accuracy Rate",
                    Description = "Percentage of completed tasks executed without rework or push-back transitions during review.",
                    Weight = 25.0,
                    Unit = "%",
                    TargetValue = 98.0,
                    GreenThreshold = 95.0,
                    AmberThreshold = 85.0,
                    RedThreshold = 70.0,
                    IsLowerBetter = false,
                    IsCustomFormula = false,
                    Order = 2,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                },
                new()
                {
                    Id = DefaultCompletionItemId,
                    KpiConfigurationId = DefaultConfigurationId,
                    MetricCode = "COMPLETION_RATE",
                    Name = "Task Completion Rate",
                    Description = "Percentage of total assigned tasks successfully completed within the evaluation period.",
                    Weight = 25.0,
                    Unit = "%",
                    TargetValue = 95.0,
                    GreenThreshold = 90.0,
                    AmberThreshold = 80.0,
                    RedThreshold = 70.0,
                    IsLowerBetter = false,
                    IsCustomFormula = false,
                    Order = 3,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                },
                new()
                {
                    Id = DefaultAhtItemId,
                    KpiConfigurationId = DefaultConfigurationId,
                    MetricCode = "AHT",
                    Name = "Average Handling Time",
                    Description = "Average hours elapsed from task creation/dispatch to final completion.",
                    Weight = 25.0,
                    Unit = "hours",
                    TargetValue = 24.0,
                    GreenThreshold = 24.0,
                    AmberThreshold = 48.0,
                    RedThreshold = 72.0,
                    IsLowerBetter = true,
                    IsCustomFormula = false,
                    Order = 4,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                }
            }
        };

        db.KpiConfigurations.Add(defaultConfig);
        await db.SaveChangesAsync();
    }
}
