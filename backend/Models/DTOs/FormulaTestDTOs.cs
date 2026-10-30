using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

/// <summary>
/// Request payload to test and dry-run a custom arithmetic formula.
/// </summary>
public class FormulaTestRequestDTO
{
    [Required(ErrorMessage = "Formula is required.")]
    [MaxLength(1000, ErrorMessage = "Formula cannot exceed 1000 characters.")]
    public string Formula { get; set; } = string.Empty;

    /// <summary>
    /// Optional overrides for sample variable values during dry-run testing.
    /// If omitted, default registry values are used.
    /// </summary>
    public Dictionary<string, double>? SampleValues { get; set; }
}

/// <summary>
/// Result of evaluating a custom arithmetic formula dry-run.
/// </summary>
public class FormulaTestResponseDTO
{
    public bool IsValid { get; set; }
    public double? Result { get; set; }
    public string? ErrorMessage { get; set; }
    public IReadOnlyList<string> VariablesUsed { get; set; } = Array.Empty<string>();
    public IReadOnlyDictionary<string, double> ResolvedVariables { get; set; } = new Dictionary<string, double>();
}

