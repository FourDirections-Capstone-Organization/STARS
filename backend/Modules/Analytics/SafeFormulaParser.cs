using System.Globalization;

namespace Backend.Modules.Analytics;

/// <summary>
/// Safe, tokenized arithmetic formula parser and evaluator for custom KPI calculations.
/// Guarantees zero dynamic code execution (no eval, no reflection) with whitelist tokens and division-by-zero safety.
/// </summary>
public class SafeFormulaParser : ISafeFormulaParser
{
    public FormulaValidationResult Validate(string? formula, IEnumerable<string>? allowedVariables = null)
    {
        return ValidateFormula(formula, allowedVariables);
    }

    public IReadOnlyList<string> ExtractVariables(string? formula)
    {
        return ExtractVariablesFromFormula(formula);
    }

    public double Evaluate(
        string? formula,
        IReadOnlyDictionary<string, double>? variables = null,
        double divisionByZeroDefault = 0.0,
        bool throwOnDivisionByZero = false)
    {
        return EvaluateFormula(formula, variables, divisionByZeroDefault, throwOnDivisionByZero);
    }

    /// <summary>
    /// Validates the formula syntax and ensures all referenced variables are in the allowed whitelist (if provided).
    /// </summary>
    public static FormulaValidationResult ValidateFormula(string? formula, IEnumerable<string>? allowedVariables = null)
    {
        if (string.IsNullOrWhiteSpace(formula))
        {
            return FormulaValidationResult.Failure("Formula cannot be empty.");
        }

        try
        {
            var tokens = Tokenize(formula);
            var parser = new Parser(tokens);
            var ast = parser.Parse();

            var varSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            ast.CollectVariables(varSet);

            var extracted = new List<string>();
            foreach (var token in tokens)
            {
                if (token.Type == TokenType.Identifier && !extracted.Contains(token.Value, StringComparer.OrdinalIgnoreCase))
                {
                    extracted.Add(token.Value);
                }
            }

            if (allowedVariables != null)
            {
                var allowedSet = new HashSet<string>(allowedVariables, StringComparer.OrdinalIgnoreCase);
                foreach (var v in extracted)
                {
                    if (!allowedSet.Contains(v))
                    {
                        return FormulaValidationResult.Failure($"Variable '{v}' is not permitted in KPI formulas.");
                    }
                }
            }

            return FormulaValidationResult.Success(extracted);
        }
        catch (FormulaEvaluationException ex)
        {
            return FormulaValidationResult.Failure(ex.Message);
        }
        catch (Exception ex)
        {
            return FormulaValidationResult.Failure($"Invalid formula syntax: {ex.Message}");
        }
    }

    /// <summary>
    /// Extracts all unique variable identifiers from the formula in order of appearance.
    /// </summary>
    public static IReadOnlyList<string> ExtractVariablesFromFormula(string? formula)
    {
        if (string.IsNullOrWhiteSpace(formula))
        {
            return Array.Empty<string>();
        }

        var tokens = Tokenize(formula);
        var parser = new Parser(tokens);
        var ast = parser.Parse();

        var extracted = new List<string>();
        foreach (var token in tokens)
        {
            if (token.Type == TokenType.Identifier && !extracted.Contains(token.Value, StringComparer.OrdinalIgnoreCase))
            {
                extracted.Add(token.Value);
            }
        }

        return extracted;
    }

    /// <summary>
    /// Evaluates the formula using provided variable values.
    /// Safely handles division by zero by returning divisionByZeroDefault instead of NaN or Infinity unless throwOnDivisionByZero is true.
    /// </summary>
    public static double EvaluateFormula(
        string? formula,
        IReadOnlyDictionary<string, double>? variables = null,
        double divisionByZeroDefault = 0.0,
        bool throwOnDivisionByZero = false)
    {
        if (string.IsNullOrWhiteSpace(formula))
        {
            throw new FormulaEvaluationException("Formula cannot be empty.");
        }

        var tokens = Tokenize(formula);
        var parser = new Parser(tokens);
        var ast = parser.Parse();

        var normalizedVariables = variables != null
            ? new Dictionary<string, double>(variables, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);

        var result = ast.Evaluate(normalizedVariables, divisionByZeroDefault, throwOnDivisionByZero);

        if (double.IsNaN(result) || double.IsInfinity(result))
        {
            if (throwOnDivisionByZero)
            {
                throw new DivideByZeroException("Formula evaluation resulted in an undefined or infinite value.");
            }
            return divisionByZeroDefault;
        }

        return result;
    }

    private static IReadOnlyList<FormulaToken> Tokenize(string formula)
    {
        var tokens = new List<FormulaToken>();
        int i = 0;
        int length = formula.Length;

        while (i < length)
        {
            char c = formula[i];

            if (char.IsWhiteSpace(c))
            {
                i++;
                continue;
            }

            if (char.IsDigit(c) || (c == '.' && i + 1 < length && char.IsDigit(formula[i + 1])))
            {
                int start = i;
                bool hasDot = false;

                while (i < length)
                {
                    char ch = formula[i];
                    if (char.IsDigit(ch))
                    {
                        i++;
                    }
                    else if (ch == '.')
                    {
                        if (hasDot)
                        {
                            throw new FormulaEvaluationException($"Malformed number with multiple decimal points at position {i}.");
                        }
                        hasDot = true;
                        i++;
                    }
                    else
                    {
                        break;
                    }
                }

                string numStr = formula.Substring(start, i - start);
                tokens.Add(new FormulaToken(TokenType.Number, numStr, start));
                continue;
            }

            if (char.IsLetter(c) || c == '_')
            {
                int start = i;
                while (i < length && (char.IsLetterOrDigit(formula[i]) || formula[i] == '_'))
                {
                    i++;
                }

                string idStr = formula.Substring(start, i - start);
                tokens.Add(new FormulaToken(TokenType.Identifier, idStr, start));
                continue;
            }

            switch (c)
            {
                case '+':
                    tokens.Add(new FormulaToken(TokenType.Plus, "+", i));
                    i++;
                    break;
                case '-':
                    tokens.Add(new FormulaToken(TokenType.Minus, "-", i));
                    i++;
                    break;
                case '*':
                    tokens.Add(new FormulaToken(TokenType.Multiply, "*", i));
                    i++;
                    break;
                case '/':
                    tokens.Add(new FormulaToken(TokenType.Divide, "/", i));
                    i++;
                    break;
                case '(':
                    tokens.Add(new FormulaToken(TokenType.OpenParen, "(", i));
                    i++;
                    break;
                case ')':
                    tokens.Add(new FormulaToken(TokenType.CloseParen, ")", i));
                    i++;
                    break;
                default:
                    throw new FormulaEvaluationException($"Invalid character '{c}' at position {i}. Only numbers, variables, arithmetic operators (+, -, *, /), and parentheses are allowed.");
            }
        }

        tokens.Add(new FormulaToken(TokenType.EndOfFile, string.Empty, length));
        return tokens;
    }

    private enum TokenType
    {
        Number,
        Identifier,
        Plus,
        Minus,
        Multiply,
        Divide,
        OpenParen,
        CloseParen,
        EndOfFile
    }

    private sealed record FormulaToken(TokenType Type, string Value, int Position);

    private abstract class ExpressionNode
    {
        public abstract double Evaluate(
            IReadOnlyDictionary<string, double> variables,
            double divisionByZeroDefault,
            bool throwOnDivisionByZero);

        public abstract void CollectVariables(ISet<string> variables);
    }

    private sealed class NumberNode : ExpressionNode
    {
        public double Value { get; }

        public NumberNode(double value) => Value = value;

        public override double Evaluate(
            IReadOnlyDictionary<string, double> variables,
            double divisionByZeroDefault,
            bool throwOnDivisionByZero) => Value;

        public override void CollectVariables(ISet<string> variables) { }
    }

    private sealed class VariableNode : ExpressionNode
    {
        public string Name { get; }
        public int Position { get; }

        public VariableNode(string name, int position)
        {
            Name = name;
            Position = position;
        }

        public override double Evaluate(
            IReadOnlyDictionary<string, double> variables,
            double divisionByZeroDefault,
            bool throwOnDivisionByZero)
        {
            if (variables.TryGetValue(Name, out double val))
            {
                return val;
            }

            throw new FormulaEvaluationException($"Variable '{Name}' value was not provided.");
        }

        public override void CollectVariables(ISet<string> variables) => variables.Add(Name);
    }

    private sealed class UnaryOpNode : ExpressionNode
    {
        public TokenType Operator { get; }
        public ExpressionNode Operand { get; }

        public UnaryOpNode(TokenType op, ExpressionNode operand)
        {
            Operator = op;
            Operand = operand;
        }

        public override double Evaluate(
            IReadOnlyDictionary<string, double> variables,
            double divisionByZeroDefault,
            bool throwOnDivisionByZero)
        {
            var val = Operand.Evaluate(variables, divisionByZeroDefault, throwOnDivisionByZero);
            return Operator == TokenType.Minus ? -val : val;
        }

        public override void CollectVariables(ISet<string> variables) => Operand.CollectVariables(variables);
    }

    private sealed class BinaryOpNode : ExpressionNode
    {
        public TokenType Operator { get; }
        public ExpressionNode Left { get; }
        public ExpressionNode Right { get; }
        public int Position { get; }

        public BinaryOpNode(TokenType op, ExpressionNode left, ExpressionNode right, int position)
        {
            Operator = op;
            Left = left;
            Right = right;
            Position = position;
        }

        public override double Evaluate(
            IReadOnlyDictionary<string, double> variables,
            double divisionByZeroDefault,
            bool throwOnDivisionByZero)
        {
            double l = Left.Evaluate(variables, divisionByZeroDefault, throwOnDivisionByZero);
            double r = Right.Evaluate(variables, divisionByZeroDefault, throwOnDivisionByZero);

            switch (Operator)
            {
                case TokenType.Plus:
                    return l + r;

                case TokenType.Minus:
                    return l - r;

                case TokenType.Multiply:
                    return l * r;

                case TokenType.Divide:
                    if (Math.Abs(r) < 1e-15 || double.IsNaN(r) || double.IsInfinity(r))
                    {
                        if (throwOnDivisionByZero)
                        {
                            throw new DivideByZeroException("Division by zero in formula evaluation.");
                        }
                        return divisionByZeroDefault;
                    }

                    double res = l / r;
                    if (double.IsNaN(res) || double.IsInfinity(res))
                    {
                        if (throwOnDivisionByZero)
                        {
                            throw new DivideByZeroException("Formula evaluation resulted in an undefined or infinite value.");
                        }
                        return divisionByZeroDefault;
                    }
                    return res;

                default:
                    throw new FormulaEvaluationException($"Unsupported operator '{Operator}' at position {Position}.");
            }
        }

        public override void CollectVariables(ISet<string> variables)
        {
            Left.CollectVariables(variables);
            Right.CollectVariables(variables);
        }
    }

    private sealed class Parser
    {
        private readonly IReadOnlyList<FormulaToken> _tokens;
        private int _current = 0;

        public Parser(IReadOnlyList<FormulaToken> tokens)
        {
            _tokens = tokens;
        }

        public ExpressionNode Parse()
        {
            if (IsAtEnd())
            {
                throw new FormulaEvaluationException("Formula cannot be empty.");
            }

            var expr = ParseExpression();
            if (!IsAtEnd())
            {
                var token = Peek();
                if (token.Type == TokenType.CloseParen)
                {
                    throw new FormulaEvaluationException($"Unexpected closing parenthesis ')' at position {token.Position}.");
                }
                throw new FormulaEvaluationException($"Unexpected token '{token.Value}' at position {token.Position}. Did you forget an operator?");
            }
            return expr;
        }

        private ExpressionNode ParseExpression()
        {
            var expr = ParseTerm();
            while (Match(TokenType.Plus, TokenType.Minus))
            {
                var opToken = Previous();
                var right = ParseTerm();
                expr = new BinaryOpNode(opToken.Type, expr, right, opToken.Position);
            }
            return expr;
        }

        private ExpressionNode ParseTerm()
        {
            var expr = ParseFactor();
            while (Match(TokenType.Multiply, TokenType.Divide))
            {
                var opToken = Previous();
                var right = ParseFactor();
                expr = new BinaryOpNode(opToken.Type, expr, right, opToken.Position);
            }
            return expr;
        }

        private ExpressionNode ParseFactor()
        {
            if (Match(TokenType.Minus, TokenType.Plus))
            {
                var opToken = Previous();
                var operand = ParseFactor();
                return new UnaryOpNode(opToken.Type, operand);
            }
            return ParsePrimary();
        }

        private ExpressionNode ParsePrimary()
        {
            if (Match(TokenType.Number))
            {
                var numToken = Previous();
                if (!double.TryParse(numToken.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out double val))
                {
                    throw new FormulaEvaluationException($"Invalid number '{numToken.Value}' at position {numToken.Position}.");
                }
                return new NumberNode(val);
            }

            if (Match(TokenType.Identifier))
            {
                var idToken = Previous();
                if (Peek().Type == TokenType.OpenParen)
                {
                    throw new FormulaEvaluationException($"Function calls such as '{idToken.Value}()' are not supported at position {idToken.Position}. Only arithmetic formulas with variables are allowed.");
                }
                return new VariableNode(idToken.Value, idToken.Position);
            }

            if (Match(TokenType.OpenParen))
            {
                var openParen = Previous();
                if (Peek().Type == TokenType.CloseParen)
                {
                    throw new FormulaEvaluationException($"Empty parentheses are not allowed at position {openParen.Position}.");
                }
                var expr = ParseExpression();
                if (!Match(TokenType.CloseParen))
                {
                    throw new FormulaEvaluationException($"Expected ')' matching opening parenthesis at position {openParen.Position}.");
                }
                return expr;
            }

            if (IsAtEnd())
            {
                if (_current > 0)
                {
                    var prev = Previous();
                    throw new FormulaEvaluationException($"Unexpected end of formula after '{prev.Value}' at position {prev.Position}.");
                }
                throw new FormulaEvaluationException("Formula cannot be empty.");
            }

            var current = Peek();
            throw new FormulaEvaluationException($"Unexpected token '{current.Value}' at position {current.Position}.");
        }

        private bool Match(params TokenType[] types)
        {
            foreach (var type in types)
            {
                if (Check(type))
                {
                    Advance();
                    return true;
                }
            }
            return false;
        }

        private bool Check(TokenType type)
        {
            if (IsAtEnd()) return type == TokenType.EndOfFile;
            return Peek().Type == type;
        }

        private FormulaToken Advance()
        {
            if (!IsAtEnd()) _current++;
            return Previous();
        }

        private bool IsAtEnd() => Peek().Type == TokenType.EndOfFile;

        private FormulaToken Peek() => _tokens[_current];

        private FormulaToken Previous() => _tokens[_current - 1];
    }
}

