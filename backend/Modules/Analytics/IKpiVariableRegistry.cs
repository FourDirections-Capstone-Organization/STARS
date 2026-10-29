namespace Backend.Modules.Analytics;

/// <summary>
/// Metadata describing a whitelisted variable available for custom KPI formulas.
/// </summary>
public class KpiVariableDefinition
{
    public string Name { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public double DefaultSampleValue { get; set; }
}

/// <summary>
/// Registry of approved, whitelisted variables available for custom KPI arithmetic formulas.
/// Prevents arbitrary identifier injection and provides variable catalog and resolution services.
/// </summary>
public interface IKpiVariableRegistry
{
    /// <summary>
    /// Gets all registered KPI variable definitions.
    /// </summary>
    IReadOnlyList<KpiVariableDefinition> GetAllVariables();

    /// <summary>
    /// Checks whether a variable name is in the approved whitelist (case-insensitive).
    /// </summary>
    bool IsVariableAllowed(string? variableName);

    /// <summary>
    /// Gets the definition for a specific variable name or alias (case-insensitive).
    /// </summary>
    KpiVariableDefinition? GetVariable(string? variableName);

    /// <summary>
    /// Returns a set of all allowed variable names and aliases (case-insensitive).
    /// </summary>
    IReadOnlySet<string> GetAllowedVariableNames();

    /// <summary>
    /// Gets default sample values for all registered variables for dry-run testing.
    /// </summary>
    IReadOnlyDictionary<string, double> GetDefaultSampleValues();

    /// <summary>
    /// Maps runtime task statistics into a dictionary of variable values keyed by variable name.
    /// </summary>
    IReadOnlyDictionary<string, double> ResolveVariableValues(
        int totalAssigned,
        int completedCount,
        int onTimeCount,
        int inFullCount,
        int otifCount,
        int reworkCount,
        int accurateCount,
        double totalHandlingHours);
}

