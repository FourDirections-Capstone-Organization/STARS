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
        Assert.Equal(85.0, config.OverallGreenThreshold);
        Assert.Equal(70.0, config.OverallAmberThreshold);
        Assert.Equal(60.0, config.OverallRedThreshold);
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

    [Fact]
    public async System.Threading.Tasks.Task AppDbContext_KpiConfiguration_PersistsCustomOverallThresholds()
    {
        using var db = CreateInMemoryDbContext();

        var customConfig = new KpiConfiguration
        {
            Id = Guid.NewGuid(),
            Title = "Custom Threshold Config",
            OverallGreenThreshold = 90.0,
            OverallAmberThreshold = 80.0,
            OverallRedThreshold = 65.0,
            IsActive = true
        };

        db.KpiConfigurations.Add(customConfig);
        await db.SaveChangesAsync();

        var retrieved = await db.KpiConfigurations.FirstOrDefaultAsync(c => c.Id == customConfig.Id);

        Assert.NotNull(retrieved);
        Assert.Equal(90.0, retrieved.OverallGreenThreshold);
        Assert.Equal(80.0, retrieved.OverallAmberThreshold);
        Assert.Equal(65.0, retrieved.OverallRedThreshold);
    }

    [Fact]
    public void AppDbContext_KpiConfiguration_HasOverallThresholdPropertiesConfigured()
    {
        using var db = CreateInMemoryDbContext();
        var entityType = db.Model.FindEntityType(typeof(KpiConfiguration));

        Assert.NotNull(entityType);
        Assert.NotNull(entityType.FindProperty(nameof(KpiConfiguration.OverallGreenThreshold)));
        Assert.NotNull(entityType.FindProperty(nameof(KpiConfiguration.OverallAmberThreshold)));
        Assert.NotNull(entityType.FindProperty(nameof(KpiConfiguration.OverallRedThreshold)));
    }

    [Fact]
    public void StartupDdl_ValidateKpiDdl_FailsWithoutThresholdColumnsAndMigrations()
    {
        // Regression test: the legacy faulty startup DDL omitted threshold columns and migration entries
        const string legacyFaultyDdl = @"
            CREATE TABLE IF NOT EXISTS ""KpiConfigurations"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""Title"" character varying(150) NOT NULL,
                ""Description"" character varying(500) NULL,
                ""TargetRole"" character varying(50) NULL,
                ""DepartmentId"" uuid NULL REFERENCES ""Departments"" (""Id"") ON DELETE SET NULL,
                ""EffectiveStartDate"" timestamp with time zone NOT NULL,
                ""EffectiveEndDate"" timestamp with time zone NULL,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedById"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NOT NULL
            );
            INSERT INTO ""__EFMigrationsHistory"" (""MigrationId"", ""ProductVersion"")
            VALUES ('20261016061728_AddTaskFomsIntegrationModels', '9.0.0')
            ON CONFLICT (""MigrationId"") DO NOTHING;
        ";

        var errors = DatabaseStartupDdl.ValidateKpiDdl(legacyFaultyDdl);

        Assert.NotEmpty(errors);
        Assert.Contains(errors, e => e.Contains("OverallGreenThreshold"));
        Assert.Contains(errors, e => e.Contains("OverallAmberThreshold"));
        Assert.Contains(errors, e => e.Contains("OverallRedThreshold"));
        Assert.Contains(errors, e => e.Contains("20261029101146_AddKpiConfigurationAndItems"));
        Assert.Contains(errors, e => e.Contains("20261029111153_AddOverallThresholdsToKpiConfiguration"));
    }

    [Fact]
    public void StartupDdl_ValidateKpiDdl_PassesWithThresholdColumnsAndMigrations()
    {
        var errors = DatabaseStartupDdl.ValidateKpiDdl(DatabaseStartupDdl.StartupDdlSql);

        Assert.Empty(errors);
    }

    [Fact]
    public void StartupDdl_ContainsExplicitCreateAlterAndMigrationEntries()
    {
        var ddl = DatabaseStartupDdl.StartupDdlSql;

        // Verify table creation includes threshold column defaults
        Assert.Contains("\"OverallGreenThreshold\" double precision NOT NULL DEFAULT 85.0", ddl);
        Assert.Contains("\"OverallAmberThreshold\" double precision NOT NULL DEFAULT 70.0", ddl);
        Assert.Contains("\"OverallRedThreshold\" double precision NOT NULL DEFAULT 60.0", ddl);

        // Verify idempotent ALTER TABLE column additions for existing deployed databases
        Assert.Contains("ALTER TABLE \"KpiConfigurations\" ADD COLUMN IF NOT EXISTS \"OverallGreenThreshold\" double precision NOT NULL DEFAULT 85.0;", ddl);
        Assert.Contains("ALTER TABLE \"KpiConfigurations\" ADD COLUMN IF NOT EXISTS \"OverallAmberThreshold\" double precision NOT NULL DEFAULT 70.0;", ddl);
        Assert.Contains("ALTER TABLE \"KpiConfigurations\" ADD COLUMN IF NOT EXISTS \"OverallRedThreshold\" double precision NOT NULL DEFAULT 60.0;", ddl);

        // Verify both KPI migrations are recorded to prevent relation-exists crashes during MigrateAsync
        Assert.Contains("20261029101146_AddKpiConfigurationAndItems", ddl);
        Assert.Contains("20261029111153_AddOverallThresholdsToKpiConfiguration", ddl);
    }

    [Fact]
    public async System.Threading.Tasks.Task KpiDefaultSeeder_RepairsZeroThresholds_OnExistingRecord()
    {
        using var db = CreateInMemoryDbContext();

        // Simulate an existing configuration created without thresholds (all zero)
        var unconfigured = new KpiConfiguration
        {
            Id = KpiDefaultSeeder.DefaultConfigurationId,
            Title = "Default Logistics Operations KPI",
            OverallGreenThreshold = 0.0,
            OverallAmberThreshold = 0.0,
            OverallRedThreshold = 0.0,
            EffectiveStartDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            IsActive = true
        };

        db.KpiConfigurations.Add(unconfigured);
        await db.SaveChangesAsync();

        // Run seeder
        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);

        var refreshed = await db.KpiConfigurations.FirstOrDefaultAsync(c => c.Id == KpiDefaultSeeder.DefaultConfigurationId);
        Assert.NotNull(refreshed);
        Assert.Equal(85.0, refreshed.OverallGreenThreshold);
        Assert.Equal(70.0, refreshed.OverallAmberThreshold);
        Assert.Equal(60.0, refreshed.OverallRedThreshold);
    }
}
