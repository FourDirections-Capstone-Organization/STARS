using System.ComponentModel.DataAnnotations;
using Backend.Models.DTOs;

namespace Backend.Modules.Analytics;

public static class KpiConfigurationValidator
{
    private const double Epsilon = 0.01;

    public static (bool IsValid, List<string> Errors) ValidateConfiguration(
        KpiConfigurationRequestDTO dto,
        bool requireProspectiveFutureStart = false,
        DateTime? referenceUtcNow = null)
    {
        var errors = new List<string>();

        if (dto == null)
        {
            errors.Add("Configuration request cannot be null.");
            return (false, errors);
        }

        var validationContext = new ValidationContext(dto);
        var annotationResults = new List<ValidationResult>();
        Validator.TryValidateObject(dto, validationContext, annotationResults, validateAllProperties: true);

        foreach (var result in annotationResults)
        {
            if (!string.IsNullOrWhiteSpace(result.ErrorMessage))
            {
                errors.Add(result.ErrorMessage);
            }
        }

        // Prospective dates validation
        var now = referenceUtcNow ?? DateTime.UtcNow;
        if (requireProspectiveFutureStart && dto.EffectiveStartDate < now.Date)
        {
            errors.Add("Prospective configuration effective start date cannot be in the past.");
        }

        if (dto.EffectiveEndDate.HasValue && dto.EffectiveEndDate.Value <= dto.EffectiveStartDate)
        {
            errors.Add("Effective end date must be strictly after the effective start date.");
        }

        // Overall score threshold hierarchy (0 to 100, Green >= Amber >= Red)
        if (dto.OverallGreenThreshold < dto.OverallAmberThreshold || dto.OverallAmberThreshold < dto.OverallRedThreshold)
        {
            errors.Add($"Overall Green threshold ({dto.OverallGreenThreshold}) must be >= Amber threshold ({dto.OverallAmberThreshold}), and Amber must be >= Red threshold ({dto.OverallRedThreshold}).");
        }

        // Items validation
        if (dto.Items == null || dto.Items.Count == 0)
        {
            errors.Add("At least one KPI item is required in the configuration.");
            return (errors.Count == 0, errors);
        }

        // 100% weight sum validation
        double totalWeight = Math.Round(dto.Items.Sum(i => i.Weight), 2);
        if (Math.Abs(totalWeight - 100.0) > Epsilon)
        {
            errors.Add($"Total item weights must sum to exactly 100% (current sum: {totalWeight}%).");
        }

        // Unique metric codes
        var duplicateCodes = dto.Items
            .GroupBy(i => i.MetricCode, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        if (duplicateCodes.Count > 0)
        {
            errors.Add($"Duplicate metric codes found: {string.Join(", ", duplicateCodes)}.");
        }

        // Item level validation
        var parser = new SafeFormulaParser();
        var registry = new KpiVariableRegistry();
        var allowedVars = registry.GetAllowedVariableNames();

        for (int i = 0; i < dto.Items.Count; i++)
        {
            var item = dto.Items[i];
            var itemContext = new ValidationContext(item);
            var itemAnnotationResults = new List<ValidationResult>();
            Validator.TryValidateObject(item, itemContext, itemAnnotationResults, validateAllProperties: true);

            foreach (var r in itemAnnotationResults)
            {
                if (!string.IsNullOrWhiteSpace(r.ErrorMessage))
                {
                    errors.Add($"Item[{i}] '{item.Name}': {r.ErrorMessage}");
                }
            }

            var customItemErrors = item.Validate(itemContext);
            foreach (var r in customItemErrors)
            {
                if (!string.IsNullOrWhiteSpace(r.ErrorMessage))
                {
                    errors.Add($"Item[{i}] '{item.Name}': {r.ErrorMessage}");
                }
            }

            if (item.IsCustomFormula)
            {
                if (string.IsNullOrWhiteSpace(item.CustomFormula))
                {
                    errors.Add($"Item[{i}] '{item.Name}': Custom formula is required when IsCustomFormula is enabled.");
                }
                else
                {
                    var formulaResult = parser.Validate(item.CustomFormula, allowedVars);
                    if (!formulaResult.IsValid)
                    {
                        errors.Add($"Item[{i}] '{item.Name}': Custom formula error: {formulaResult.ErrorMessage}");
                    }
                }
            }
        }

        var distinctErrors = errors.Distinct().ToList();
        return (distinctErrors.Count == 0, distinctErrors);
    }
}

