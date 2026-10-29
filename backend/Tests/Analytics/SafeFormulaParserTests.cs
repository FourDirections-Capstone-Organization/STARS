using Backend.Modules.Analytics;
using Xunit;

namespace Backend.Tests.Analytics;

public class SafeFormulaParserTests
{
    private readonly SafeFormulaParser _parser = new();

    #region 1. Basic Arithmetic Operators (+, -, *, /) and Precedence

    [Theory]
    [InlineData("10 + 5", 15.0)]
    [InlineData("10 - 4", 6.0)]
    [InlineData("6 * 7", 42.0)]
    [InlineData("20 / 4", 5.0)]
    [InlineData("2.5 + 3.75", 6.25)]
    [InlineData("10.5 - 2.25", 8.25)]
    [InlineData("1.5 * 4", 6.0)]
    [InlineData("7.5 / 2.5", 3.0)]
    public void Evaluate_BasicArithmeticOperations_ReturnsExpectedResult(string formula, double expected)
    {
        var result = _parser.Evaluate(formula);
        Assert.Equal(expected, result, 4);
    }

    [Fact]
    public void Evaluate_OperatorPrecedence_MultiplicationAndDivisionBeforeAdditionAndSubtraction()
    {
        // 2 + 3 * 4 should be 14, not 20
        Assert.Equal(14.0, _parser.Evaluate("2 + 3 * 4"), 4);

        // 20 - 4 * 2 should be 12, not 32
        Assert.Equal(12.0, _parser.Evaluate("20 - 4 * 2"), 4);

        // 10 + 20 / 5 should be 14, not 6
        Assert.Equal(14.0, _parser.Evaluate("10 + 20 / 5"), 4);

        // 10 + 20 * 3 - 8 / 2 should be 10 + 60 - 4 = 66
        Assert.Equal(66.0, _parser.Evaluate("10 + 20 * 3 - 8 / 2"), 4);
    }

    [Fact]
    public void Evaluate_LeftAssociativity_SubtractionsAndDivisionsChainLeftToRight()
    {
        // (10 - 4) - 2 = 4 (NOT 10 - (4 - 2) = 8)
        Assert.Equal(4.0, _parser.Evaluate("10 - 4 - 2"), 4);

        // (100 / 10) / 2 = 5 (NOT 100 / (10 / 2) = 20)
        Assert.Equal(5.0, _parser.Evaluate("100 / 10 / 2"), 4);

        // 50 - 10 - 5 - 2 = 33
        Assert.Equal(33.0, _parser.Evaluate("50 - 10 - 5 - 2"), 4);
    }

    [Fact]
    public void Evaluate_UnaryOperators_HandlesPositiveAndNegativeNumbers()
    {
        Assert.Equal(-5.0, _parser.Evaluate("-5"), 4);
        Assert.Equal(5.0, _parser.Evaluate("+5"), 4);
        Assert.Equal(5.0, _parser.Evaluate("-5 + 10"), 4);
        Assert.Equal(-15.0, _parser.Evaluate("5 * -3"), 4);
        Assert.Equal(5.0, _parser.Evaluate("--5"), 4);
        Assert.Equal(-10.0, _parser.Evaluate("-(5 + 5)"), 4);
    }

    #endregion

    #region 2. Parentheses Handling

    [Fact]
    public void Evaluate_Parentheses_OverridesDefaultPrecedence()
    {
        // (2 + 3) * 4 = 20
        Assert.Equal(20.0, _parser.Evaluate("(2 + 3) * 4"), 4);

        // (20 - 4) / 2 = 8
        Assert.Equal(8.0, _parser.Evaluate("(20 - 4) / 2"), 4);

        // (10 + 5) * (8 - 4) = 60
        Assert.Equal(60.0, _parser.Evaluate("(10 + 5) * (8 - 4)"), 4);
    }

    [Fact]
    public void Evaluate_NestedParentheses_CalculatesCorrectly()
    {
        // ((10 + 2) * (5 - 3)) / 4 = (12 * 2) / 4 = 6
        Assert.Equal(6.0, _parser.Evaluate("((10 + 2) * (5 - 3)) / 4"), 4);

        // (((5 + 5))) = 10
        Assert.Equal(10.0, _parser.Evaluate("(((5 + 5)))"), 4);
    }

    [Theory]
    [InlineData("(10 + 5", "Expected ')'")]
    [InlineData("10 + 5)", "Unexpected closing parenthesis")]
    [InlineData("((10 + 5)", "Expected ')'")]
    [InlineData("()", "Empty parentheses")]
    [InlineData("10 + ()", "Empty parentheses")]
    public void Validate_UnmatchedOrEmptyParentheses_FailsValidation(string formula, string expectedErrorSubstr)
    {
        var result = _parser.Validate(formula);
        Assert.False(result.IsValid);
        Assert.Contains(expectedErrorSubstr, result.ErrorMessage);
    }

    #endregion

    #region 3. Variables and Whitelisted Tokens

    [Fact]
    public void Evaluate_WithVariables_ResolvesValuesCorrectly()
    {
        var variables = new Dictionary<string, double>
        {
            ["ON_TIME_TASKS"] = 18.0,
            ["TOTAL_TASKS"] = 20.0
        };

        // Standard KPI percentage formula
        var result = _parser.Evaluate("(ON_TIME_TASKS / TOTAL_TASKS) * 100", variables);
        Assert.Equal(90.0, result, 4);
    }

    [Fact]
    public void Evaluate_Variables_IsCaseInsensitive()
    {
        var variables = new Dictionary<string, double>
        {
            ["Total_Tasks"] = 50.0,
            ["completed_tasks"] = 45.0
        };

        var result = _parser.Evaluate("(COMPLETED_TASKS / TOTAL_TASKS) * 100", variables);
        Assert.Equal(90.0, result, 4);
    }

    [Fact]
    public void Evaluate_MissingVariableValue_ThrowsFormulaEvaluationException()
    {
        var variables = new Dictionary<string, double>
        {
            ["TOTAL_TASKS"] = 20.0
        };

        var ex = Assert.Throws<FormulaEvaluationException>(() =>
            _parser.Evaluate("(ON_TIME_TASKS / TOTAL_TASKS) * 100", variables));

        Assert.Contains("ON_TIME_TASKS", ex.Message);
        Assert.Contains("was not provided", ex.Message);
    }

    [Fact]
    public void ExtractVariables_ReturnsDistinctVariablesInOrder()
    {
        var vars = _parser.ExtractVariables("((ON_TIME_TASKS + REWORK_TASKS) / TOTAL_TASKS) * 100 - ON_TIME_TASKS");
        Assert.Equal(3, vars.Count);
        Assert.Equal("ON_TIME_TASKS", vars[0]);
        Assert.Equal("REWORK_TASKS", vars[1]);
        Assert.Equal("TOTAL_TASKS", vars[2]);
    }

    [Fact]
    public void Validate_AllowedVariablesWhitelist_PassesWhenAllWhitelisted()
    {
        var allowed = new[] { "TOTAL_TASKS", "COMPLETED_TASKS", "ON_TIME_TASKS" };
        var result = _parser.Validate("(COMPLETED_TASKS / TOTAL_TASKS) * 100", allowed);

        Assert.True(result.IsValid);
        Assert.Null(result.ErrorMessage);
        Assert.Equal(2, result.Variables.Count);
    }

    [Fact]
    public void Validate_AllowedVariablesWhitelist_FailsWhenVariableNotWhitelisted()
    {
        var allowed = new[] { "TOTAL_TASKS", "COMPLETED_TASKS" };
        var result = _parser.Validate("(UNKNOWN_METRIC / TOTAL_TASKS) * 100", allowed);

        Assert.False(result.IsValid);
        Assert.Contains("UNKNOWN_METRIC", result.ErrorMessage);
        Assert.Contains("not permitted", result.ErrorMessage);
    }

    [Theory]
    [InlineData("eval(1 + 2)", "Function calls")]
    [InlineData("Math.Abs(-5)", "Invalid character '.'")]
    [InlineData("System.Console.WriteLine(1)", "Invalid character '.'")]
    [InlineData("10 + 20; DROP TABLE Users", "Invalid character ';'")]
    [InlineData("$TOTAL_TASKS * 100", "Invalid character '$'")]
    [InlineData("10 + @Rate", "Invalid character '@'")]
    [InlineData("TOTAL_TASKS & 1", "Invalid character '&'")]
    public void Validate_InjectionAndDisallowedTokens_FailsValidation(string formula, string expectedErrorSubstr)
    {
        var result = _parser.Validate(formula);
        Assert.False(result.IsValid);
        Assert.Contains(expectedErrorSubstr, result.ErrorMessage);
    }

    #endregion

    #region 4. Division-by-Zero Safety

    [Fact]
    public void Evaluate_DirectDivisionByZero_ReturnsDefaultZeroWithoutCrashingOrNaN()
    {
        var result = _parser.Evaluate("10 / 0");
        Assert.Equal(0.0, result);
        Assert.False(double.IsNaN(result));
        Assert.False(double.IsInfinity(result));
    }

    [Fact]
    public void Evaluate_DivisionByZero_ReturnsCustomDefaultWhenProvided()
    {
        var result = _parser.Evaluate("50 / 0", null, divisionByZeroDefault: -1.0);
        Assert.Equal(-1.0, result);
    }

    [Fact]
    public void Evaluate_CalculatedZeroDenominator_ReturnsDefaultZero()
    {
        var variables = new Dictionary<string, double>
        {
            ["TOTAL"] = 5.0,
            ["OFFSET"] = 5.0
        };

        // Denominator (TOTAL - OFFSET) evaluates to 0
        var result = _parser.Evaluate("100 / (TOTAL - OFFSET)", variables);
        Assert.Equal(0.0, result);
    }

    [Fact]
    public void Evaluate_KpiFormulaWithZeroTasks_SafelyEvaluatesToZero()
    {
        var variables = new Dictionary<string, double>
        {
            ["ON_TIME_TASKS"] = 0.0,
            ["TOTAL_TASKS"] = 0.0
        };

        // (0 / 0) * 100 -> division by zero safely yields 0.0, multiplied by 100 is 0.0
        var result = _parser.Evaluate("(ON_TIME_TASKS / TOTAL_TASKS) * 100", variables);
        Assert.Equal(0.0, result);
        Assert.False(double.IsNaN(result));
        Assert.False(double.IsInfinity(result));
    }

    [Fact]
    public void Evaluate_ThrowOnDivisionByZero_ThrowsDivideByZeroExceptionWhenRequested()
    {
        Assert.Throws<DivideByZeroException>(() =>
            _parser.Evaluate("10 / 0", throwOnDivisionByZero: true));
    }

    #endregion

    #region 5. Syntax Error Handling and Edge Cases

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Validate_EmptyOrNullFormula_FailsValidation(string? formula)
    {
        var result = _parser.Validate(formula);
        Assert.False(result.IsValid);
        Assert.Contains("cannot be empty", result.ErrorMessage);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Evaluate_EmptyOrNullFormula_ThrowsFormulaEvaluationException(string? formula)
    {
        Assert.Throws<FormulaEvaluationException>(() => _parser.Evaluate(formula));
    }

    [Theory]
    [InlineData("10 +", "Unexpected end of formula")]
    [InlineData("10 * / 2", "Unexpected token '/'")]
    [InlineData("10 20", "Did you forget an operator")]
    [InlineData("1.2.3 + 4", "multiple decimal points")]
    public void Validate_MalformedFormulas_FailsValidationWithClearMessage(string formula, string expectedErrorSubstr)
    {
        var result = _parser.Validate(formula);
        Assert.False(result.IsValid);
        Assert.Contains(expectedErrorSubstr, result.ErrorMessage);
    }

    [Fact]
    public void StaticMethods_WorkIdenticallyToInstanceMethods()
    {
        var res1 = SafeFormulaParser.EvaluateFormula("10 + 20 * 2");
        var res2 = _parser.Evaluate("10 + 20 * 2");
        Assert.Equal(res1, res2);

        var val1 = SafeFormulaParser.ValidateFormula("TOTAL / 2", new[] { "TOTAL" });
        var val2 = _parser.Validate("TOTAL / 2", new[] { "TOTAL" });
        Assert.Equal(val1.IsValid, val2.IsValid);
        Assert.Equal(val1.Variables.Count, val2.Variables.Count);
    }

    #endregion
}

