using Backend.Modules.Analytics;
using FluentAssertions;
using Xunit;

namespace Backend.Tests.Analytics;

public class KpiVariableRegistryTests
{
    private readonly KpiVariableRegistry _registry = new();

    [Fact]
    public void GetAllVariables_ReturnsExpectedVariablesWithCompleteMetadata()
    {
        var variables = _registry.GetAllVariables();

        variables.Should().NotBeEmpty();
        variables.Should().HaveCountGreaterThanOrEqualTo(10);

        foreach (var v in variables)
        {
            v.Name.Should().NotBeNullOrWhiteSpace();
            v.DisplayName.Should().NotBeNullOrWhiteSpace();
            v.Description.Should().NotBeNullOrWhiteSpace();
            v.Category.Should().NotBeNullOrWhiteSpace();
            v.Unit.Should().NotBeNullOrWhiteSpace();
            v.DefaultSampleValue.Should().BeGreaterThanOrEqualTo(0.0);
        }

        var names = variables.Select(v => v.Name).ToList();
        names.Should().Contain(new[]
        {
            "completed_tasks",
            "total_assigned_tasks",
            "on_time_tasks",
            "in_full_tasks",
            "otif_tasks",
            "rework_tasks",
            "accurate_tasks",
            "total_handling_hours",
            "completion_rate",
            "otif_rate",
            "accuracy_rate",
            "aht_hours"
        });
    }

    [Theory]
    [InlineData("completed_tasks", true)]
    [InlineData("COMPLETED_TASKS", true)]
    [InlineData("Completed_Tasks", true)]
    [InlineData("total_assigned_tasks", true)]
    [InlineData("total_tasks", true)] // alias
    [InlineData("total_assigned", true)] // alias
    [InlineData("task_completion_rate", true)] // alias
    [InlineData("order_accuracy_rate", true)] // alias
    [InlineData("aht", true)] // alias
    [InlineData("aht_hours", true)]
    [InlineData("unknown_var", false)]
    [InlineData("sql_injection", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsVariableAllowed_ValidatesWhitelistAccurately(string? variableName, bool expected)
    {
        bool allowed = _registry.IsVariableAllowed(variableName);
        allowed.Should().Be(expected);
    }

    [Fact]
    public void GetVariable_ResolvesBothCanonicalNamesAndAliases()
    {
        var canonical = _registry.GetVariable("total_assigned_tasks");
        var alias = _registry.GetVariable("total_tasks");

        canonical.Should().NotBeNull();
        alias.Should().NotBeNull();
        alias!.Name.Should().Be(canonical!.Name);
        alias.DisplayName.Should().Be("Total Assigned Tasks");
    }

    [Fact]
    public void GetVariable_WhenNotFound_ReturnsNull()
    {
        var result = _registry.GetVariable("non_existent_metric");
        result.Should().BeNull();
    }

    [Fact]
    public void GetAllowedVariableNames_ReturnsCanonicalAndAliases()
    {
        var allowed = _registry.GetAllowedVariableNames();

        allowed.Should().Contain("completed_tasks");
        allowed.Should().Contain("total_tasks");
        allowed.Should().Contain("aht");
        allowed.Should().Contain("otif_rate");
    }

    [Fact]
    public void GetDefaultSampleValues_ReturnsPositiveSamplesForTesting()
    {
        var samples = _registry.GetDefaultSampleValues();

        samples.Should().NotBeEmpty();
        samples["completed_tasks"].Should().Be(45.0);
        samples["total_assigned_tasks"].Should().Be(50.0);
        samples["total_tasks"].Should().Be(50.0);
        samples["otif_tasks"].Should().Be(38.0);
        samples["aht_hours"].Should().Be(2.67);
    }

    [Fact]
    public void ResolveVariableValues_WithStandardStats_CalculatesAllMappedMetrics()
    {
        // 50 assigned, 40 completed, 35 on-time, 36 in-full, 32 otif, 4 rework, 36 accurate, 80 handling hours
        var values = _registry.ResolveVariableValues(
            totalAssigned: 50,
            completedCount: 40,
            onTimeCount: 35,
            inFullCount: 36,
            otifCount: 32,
            reworkCount: 4,
            accurateCount: 36,
            totalHandlingHours: 80.0);

        values["total_assigned_tasks"].Should().Be(50);
        values["total_tasks"].Should().Be(50);
        values["completed_tasks"].Should().Be(40);
        values["on_time_tasks"].Should().Be(35);
        values["in_full_tasks"].Should().Be(36);
        values["otif_tasks"].Should().Be(32);
        values["rework_tasks"].Should().Be(4);
        values["accurate_tasks"].Should().Be(36);
        values["late_tasks"].Should().Be(5);
        values["total_handling_hours"].Should().Be(80.0);

        // Completion: 40 / 50 * 100 = 80.0%
        values["completion_rate"].Should().Be(80.0);
        values["task_completion_rate"].Should().Be(80.0);

        // OTIF: 32 / 40 * 100 = 80.0%
        values["otif_rate"].Should().Be(80.0);

        // Accuracy: 36 / 40 * 100 = 90.0%
        values["accuracy_rate"].Should().Be(90.0);
        values["order_accuracy_rate"].Should().Be(90.0);

        // Rework: 4 / 40 * 100 = 10.0%
        values["rework_rate"].Should().Be(10.0);

        // AHT: 80 / 40 = 2.0 hours
        values["aht_hours"].Should().Be(2.0);
        values["aht"].Should().Be(2.0);
    }

    [Fact]
    public void ResolveVariableValues_WhenNoTasksAssignedOrCompleted_GuardsAgainstDivisionByZero()
    {
        var values = _registry.ResolveVariableValues(
            totalAssigned: 0,
            completedCount: 0,
            onTimeCount: 0,
            inFullCount: 0,
            otifCount: 0,
            reworkCount: 0,
            accurateCount: 0,
            totalHandlingHours: 0.0);

        values["total_assigned_tasks"].Should().Be(0);
        values["completed_tasks"].Should().Be(0);
        values["completion_rate"].Should().Be(0.0);
        values["otif_rate"].Should().Be(0.0);
        values["accuracy_rate"].Should().Be(0.0);
        values["rework_rate"].Should().Be(0.0);
        values["aht_hours"].Should().Be(0.0);
    }
}
