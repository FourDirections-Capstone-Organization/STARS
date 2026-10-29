namespace Backend.Modules.Analytics;

/// <summary>
/// Result of validating a custom KPI arithmetic formula.
/// </summary>
public class FormulaValidationResult
{
    public bool IsValid { get; set; }
    public string? ErrorMessage { get; set; }
    public IReadOnlyList<string> Variables { get; set; } = Array.Empty<string>();

    public static FormulaValidationResult Success(IReadOnlyList<string> variables) =>
        new() { IsValid = true, Variables = variables };

    public static FormulaValidationResult Failure(string errorMessage) =>
        new() { IsValid = false, ErrorMessage = errorMessage };
}

/// <summary>
/// Exception thrown when a formula violates syntax rules or contains invalid variables/operations.
/// </summary>
public class FormulaEvaluationException : Exception
{
    public FormulaEvaluationException(string message) : base(message) { }
    public FormulaEvaluationException(string message, Exception innerException) : base(message, innerException) { }
}

/// <summary>
/// Safe, tokenized arithmetic formula parser and evaluator for custom KPI calculations.
/// Guarantees zero dynamic code execution (no eval, no reflection) with whitelist tokens and division-by-zero safety.
/// </summary>
public interface ISafeFormulaParser
{
    FormulaValidationResult Validate(string? formula, IEnumerable<string>? allowedVariables = null);

    IReadOnlyList<string> ExtractVariables(string? formula);

    double Evaluate(
        string? formula,
        IReadOnlyDictionary<string, double>? variables = null,
        double divisionByZeroDefault = 0.0,
        bool throwOnDivisionByZero = false);
}

