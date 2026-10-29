using Xunit;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;

namespace Backend.Tests.Analytics;

public class KpiDatabaseConfigurationTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    [Fact]
    public void AppDbContext_AuditLogEntity_HasCompositeIndexConfigured()
    {
        using var db = CreateInMemoryDbContext();
        var entityType = db.Model.FindEntityType(typeof(AuditLog));

        Assert.NotNull(entityType);
        var indexes = entityType.GetIndexes().ToList();

        var compositeIndex = indexes.FirstOrDefault(idx =>
            idx.Properties.Count == 4 &&
            idx.Properties.Any(p => p.Name == "TargetEntity") &&
            idx.Properties.Any(p => p.Name == "TargetEntityId") &&
            idx.Properties.Any(p => p.Name == "ActionType") &&
            idx.Properties.Any(p => p.Name == "Timestamp"));

        Assert.NotNull(compositeIndex);
    }

    [Fact]
    public void AppDbContext_KpiEntities_AreRegisteredInModel()
    {
        using var db = CreateInMemoryDbContext();

        var configType = db.Model.FindEntityType(typeof(KpiConfiguration));
        var itemType = db.Model.FindEntityType(typeof(KpiItem));

        Assert.NotNull(configType);
        Assert.NotNull(itemType);

        // Verify foreign key relationship
        var foreignKey = itemType.GetForeignKeys()
            .FirstOrDefault(fk => fk.PrincipalEntityType == configType);

        Assert.NotNull(foreignKey);
        Assert.Equal(DeleteBehavior.Cascade, foreignKey.DeleteBehavior);
    }

    [Fact]
    public async System.Threading.Tasks.Task KpiDefaultSeeder_SeedsFourDefaultMetrics_SummingTo100Percent()
    {
        using var db = CreateInMemoryDbContext();

        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);

        var config = await db.KpiConfigurations
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == KpiDefaultSeeder.DefaultConfigurationId);

        Assert.NotNull(config);
        Assert.True(config.IsActive);
        Assert.Equal(4, config.Items.Count);

        // Verify total weight equals 100%
        var totalWeight = config.Items.Sum(i => i.Weight);
        Assert.Equal(100.0, totalWeight);

        // Verify the 4 canonical metric codes
        var metricCodes = config.Items.Select(i => i.MetricCode).OrderBy(m => m).ToList();
        var expectedCodes = new List<string> { "AHT", "COMPLETION_RATE", "ORDER_ACCURACY", "OTIF" };
        Assert.Equal(expectedCodes, metricCodes);

        // Verify AHT is lower-is-better
        var ahtItem = config.Items.First(i => i.MetricCode == "AHT");
        Assert.True(ahtItem.IsLowerBetter);
        Assert.Equal("hours", ahtItem.Unit);
        Assert.Equal(24.0, ahtItem.GreenThreshold);
        Assert.Equal(48.0, ahtItem.AmberThreshold);
        Assert.Equal(72.0, ahtItem.RedThreshold);

        // Verify OTIF is higher-is-better
        var otifItem = config.Items.First(i => i.MetricCode == "OTIF");
        Assert.False(otifItem.IsLowerBetter);
        Assert.Equal("%", otifItem.Unit);
        Assert.Equal(90.0, otifItem.GreenThreshold);
        Assert.Equal(75.0, otifItem.AmberThreshold);
        Assert.Equal(60.0, otifItem.RedThreshold);
    }

    [Fact]
    public async System.Threading.Tasks.Task KpiDefaultSeeder_IsIdempotent_DoesNotDuplicateOnMultipleCalls()
    {
        using var db = CreateInMemoryDbContext();

        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);
        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);

        var configCount = await db.KpiConfigurations.CountAsync();
        var itemCount = await db.KpiItems.CountAsync();

        Assert.Equal(1, configCount);
        Assert.Equal(4, itemCount);
    }
}
