namespace Backend.Modules.Analytics;

/// <summary>
/// Default implementation of the KPI variable registry.
/// Maintains the whitelist of approved variables derived from task execution, rework audits, and completion stats.
/// </summary>
public class KpiVariableRegistry : IKpiVariableRegistry
{
    private static readonly List<KpiVariableDefinition> Definitions = new()
    {
        new KpiVariableDefinition
        {
            Name = "total_assigned_tasks",
            DisplayName = "Total Assigned Tasks",
            Description = "Total number of tasks assigned to the employee within the evaluation period.",
            Category = "Counts",
            Unit = "tasks",
            DefaultSampleValue = 50.0
        },
        new KpiVariableDefinition
        {
            Name = "completed_tasks",
            DisplayName = "Completed Tasks",
            Description = "Number of tasks completed by the employee within the evaluation period.",
            Category = "Counts",
            Unit = "tasks",
            DefaultSampleValue = 45.0
        },
        new KpiVariableDefinition
        {
            Name = "on_time_tasks",
            DisplayName = "On-Time Tasks",
            Description = "Number of tasks completed on or before their revised SLA deadline.",
            Category = "Counts",
            Unit = "tasks",
            DefaultSampleValue = 40.0
        },
        new KpiVariableDefinition
        {
            Name = "in_full_tasks",
            DisplayName = "In-Full Tasks",
            Description = "Number of tasks completed with required attachments and documentation.",
            Category = "Counts",
            Unit = "tasks",
            DefaultSampleValue = 42.0
        },
        new KpiVariableDefinition
        {
            Name = "otif_tasks",
            DisplayName = "OTIF Tasks",
            Description = "Number of tasks completed both on-time and in-full.",
            Category = "Counts",
            Unit = "tasks",
            DefaultSampleValue = 38.0
        },
        new KpiVariableDefinition
        {
            Name = "rework_tasks",
            DisplayName = "Rework Tasks",
            Description = "Number of completed tasks that underwent pushback or rework transitions.",
            Category = "Counts",
            Unit = "tasks",
            DefaultSampleValue = 3.0
        },
        new KpiVariableDefinition
        {
            Name = "accurate_tasks",
            DisplayName = "Accurate Tasks",
            Description = "Number of completed tasks executed accurately without rework transitions.",
            Category = "Counts",
            Unit = "tasks",
            DefaultSampleValue = 42.0
        },
        new KpiVariableDefinition
        {
            Name = "late_tasks",
            DisplayName = "Late Tasks",
            Description = "Number of completed tasks completed after their revised SLA deadline.",
            Category = "Counts",
            Unit = "tasks",
            DefaultSampleValue = 5.0
        },
        new KpiVariableDefinition
        {
            Name = "total_handling_hours",
            DisplayName = "Total Handling Hours",
            Description = "Total cycle hours spent across all completed tasks.",
            Category = "Duration",
            Unit = "hours",
            DefaultSampleValue = 120.0
        },
        new KpiVariableDefinition
        {
            Name = "completion_rate",
            DisplayName = "Completion Rate",
            Description = "Percentage of assigned tasks completed (completed / total * 100).",
            Category = "Rates",
            Unit = "%",
            DefaultSampleValue = 90.0
        },
        new KpiVariableDefinition
        {
            Name = "otif_rate",
            DisplayName = "OTIF Rate",
            Description = "Percentage of completed tasks that were both on-time and in-full.",
            Category = "Rates",
            Unit = "%",
            DefaultSampleValue = 84.44
        },
        new KpiVariableDefinition
        {
            Name = "accuracy_rate",
            DisplayName = "Accuracy Rate",
            Description = "Percentage of completed tasks executed without rework.",
            Category = "Rates",
            Unit = "%",
            DefaultSampleValue = 93.33
        },
        new KpiVariableDefinition
        {
            Name = "rework_rate",
            DisplayName = "Rework Rate",
            Description = "Percentage of completed tasks that required rework.",
            Category = "Rates",
            Unit = "%",
            DefaultSampleValue = 6.67
        },
        new KpiVariableDefinition
        {
            Name = "aht_hours",
            DisplayName = "Average Handling Time",
            Description = "Average hours required to complete a task (total hours / completed).",
            Category = "Duration",
            Unit = "hours",
            DefaultSampleValue = 2.67
        }
    };

    // Aliases mapped to canonical variable names
    private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        { "total_tasks", "total_assigned_tasks" },
        { "total_assigned", "total_assigned_tasks" },
        { "task_completion_rate", "completion_rate" },
        { "order_accuracy_rate", "accuracy_rate" },
        { "aht", "aht_hours" }
    };

    private static readonly Dictionary<string, KpiVariableDefinition> DefinitionMap =
        Definitions.ToDictionary(d => d.Name, d => d, StringComparer.OrdinalIgnoreCase);

    private static readonly HashSet<string> AllowedNames;

    static KpiVariableRegistry()
    {
        AllowedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var def in Definitions)
        {
            AllowedNames.Add(def.Name);
        }
        foreach (var alias in Aliases.Keys)
        {
            AllowedNames.Add(alias);
        }
    }

    public IReadOnlyList<KpiVariableDefinition> GetAllVariables() => Definitions.AsReadOnly();

    public bool IsVariableAllowed(string? variableName)
    {
        if (string.IsNullOrWhiteSpace(variableName)) return false;
        return AllowedNames.Contains(variableName.Trim());
    }

    public KpiVariableDefinition? GetVariable(string? variableName)
    {
        if (string.IsNullOrWhiteSpace(variableName)) return null;
        var trimmed = variableName.Trim();

        if (DefinitionMap.TryGetValue(trimmed, out var def))
        {
            return def;
        }

        if (Aliases.TryGetValue(trimmed, out var canonical) && DefinitionMap.TryGetValue(canonical, out var canonicalDef))
        {
            return canonicalDef;
        }

        return null;
    }

    public IReadOnlySet<string> GetAllowedVariableNames() => AllowedNames;

    public IReadOnlyDictionary<string, double> GetDefaultSampleValues()
    {
        var dict = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        foreach (var def in Definitions)
        {
            dict[def.Name] = def.DefaultSampleValue;
        }
        foreach (var alias in Aliases)
        {
            if (DefinitionMap.TryGetValue(alias.Value, out var target))
            {
                dict[alias.Key] = target.DefaultSampleValue;
            }
        }
        return dict;
    }

    public IReadOnlyDictionary<string, double> ResolveVariableValues(
        int totalAssigned,
        int completedCount,
        int onTimeCount,
        int inFullCount,
        int otifCount,
        int reworkCount,
        int accurateCount,
        double totalHandlingHours)
    {
        int lateCount = Math.Max(0, completedCount - onTimeCount);
        double completionRate = totalAssigned == 0 ? 0.0 : Math.Round((double)completedCount / totalAssigned * 100.0, 2);
        double otifRate = completedCount == 0 ? 0.0 : Math.Round((double)otifCount / completedCount * 100.0, 2);
        double accuracyRate = completedCount == 0 ? 0.0 : Math.Round((double)accurateCount / completedCount * 100.0, 2);
        double reworkRate = completedCount == 0 ? 0.0 : Math.Round((double)reworkCount / completedCount * 100.0, 2);
        double ahtHours = completedCount == 0 ? 0.0 : Math.Round(totalHandlingHours / completedCount, 2);

        var values = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
        {
            { "total_assigned_tasks", totalAssigned },
            { "total_tasks", totalAssigned },
            { "total_assigned", totalAssigned },
            { "completed_tasks", completedCount },
            { "on_time_tasks", onTimeCount },
            { "in_full_tasks", inFullCount },
            { "otif_tasks", otifCount },
            { "rework_tasks", reworkCount },
            { "accurate_tasks", accurateCount },
            { "late_tasks", lateCount },
            { "total_handling_hours", Math.Round(totalHandlingHours, 2) },
            { "completion_rate", completionRate },
            { "task_completion_rate", completionRate },
            { "otif_rate", otifRate },
            { "accuracy_rate", accuracyRate },
            { "order_accuracy_rate", accuracyRate },
            { "rework_rate", reworkRate },
            { "aht_hours", ahtHours },
            { "aht", ahtHours }
        };

        return values;
    }
}

