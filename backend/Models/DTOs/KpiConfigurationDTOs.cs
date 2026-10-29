using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class KpiItemRequestDTO : IValidatableObject
{
    public Guid? Id { get; set; }

    [Required(ErrorMessage = "Item name is required.")]
    [MaxLength(100, ErrorMessage = "Item name cannot exceed 100 characters.")]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Metric code is required.")]
    [MaxLength(50, ErrorMessage = "Metric code cannot exceed 50 characters.")]
    public string MetricCode { get; set; } = string.Empty;

    [MaxLength(500, ErrorMessage = "Description cannot exceed 500 characters.")]
    public string? Description { get; set; }

    [Range(0.0, 100.0, ErrorMessage = "Weight must be between 0 and 100.")]
    public double Weight { get; set; }

    [MaxLength(20)]
    public string Unit { get; set; } = "%";

    public double TargetValue { get; set; }

    public double GreenThreshold { get; set; }
    public double AmberThreshold { get; set; }
    public double RedThreshold { get; set; }

    public bool IsLowerBetter { get; set; } = false;

    public bool IsCustomFormula { get; set; } = false;

    [MaxLength(1000)]
    public string? CustomFormula { get; set; }

    public int Order { get; set; } = 1;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (TargetValue < 0)
        {
            yield return new ValidationResult(
                $"Target value for '{Name}' cannot be negative.",
                new[] { nameof(TargetValue) });
        }

        if (IsLowerBetter)
        {
            if (GreenThreshold > AmberThreshold || AmberThreshold > RedThreshold)
            {
                yield return new ValidationResult(
                    $"For metric '{Name}' (lower is better), Green threshold ({GreenThreshold}) must be <= Amber threshold ({AmberThreshold}), and Amber must be <= Red threshold ({RedThreshold}).",
                    new[] { nameof(GreenThreshold), nameof(AmberThreshold), nameof(RedThreshold) });
            }
        }
        else
        {
            if (GreenThreshold < AmberThreshold || AmberThreshold < RedThreshold)
            {
                yield return new ValidationResult(
                    $"For metric '{Name}', Green threshold ({GreenThreshold}) must be >= Amber threshold ({AmberThreshold}), and Amber must be >= Red threshold ({RedThreshold}).",
                    new[] { nameof(GreenThreshold), nameof(AmberThreshold), nameof(RedThreshold) });
            }
        }
    }
}

public class KpiItemResponseDTO
{
    public Guid Id { get; set; }
    public Guid KpiConfigurationId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string MetricCode { get; set; } = string.Empty;
    public string? Description { get; set; }
    public double Weight { get; set; }
    public string Unit { get; set; } = "%";
    public double TargetValue { get; set; }
    public double GreenThreshold { get; set; }
    public double AmberThreshold { get; set; }
    public double RedThreshold { get; set; }
    public bool IsLowerBetter { get; set; }
    public bool IsCustomFormula { get; set; }
    public string? CustomFormula { get; set; }
    public int Order { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class KpiConfigurationRequestDTO : IValidatableObject
{
    [Required(ErrorMessage = "Title is required.")]
    [MaxLength(150, ErrorMessage = "Title cannot exceed 150 characters.")]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500, ErrorMessage = "Description cannot exceed 500 characters.")]
    public string? Description { get; set; }

    [MaxLength(50)]
    public string? TargetRole { get; set; }

    public Guid? DepartmentId { get; set; }

    [Required(ErrorMessage = "Effective start date is required.")]
    public DateTime EffectiveStartDate { get; set; } = DateTime.UtcNow;

    public DateTime? EffectiveEndDate { get; set; }

    public bool IsActive { get; set; } = true;

    [Range(0.0, 100.0, ErrorMessage = "Overall Green threshold must be between 0 and 100.")]
    public double OverallGreenThreshold { get; set; } = 85.0;

    [Range(0.0, 100.0, ErrorMessage = "Overall Amber threshold must be between 0 and 100.")]
    public double OverallAmberThreshold { get; set; } = 70.0;

    [Range(0.0, 100.0, ErrorMessage = "Overall Red threshold must be between 0 and 100.")]
    public double OverallRedThreshold { get; set; } = 60.0;

    public List<KpiItemRequestDTO> Items { get; set; } = new();

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        // 1. Prospective dates validation
        if (EffectiveEndDate.HasValue && EffectiveEndDate.Value <= EffectiveStartDate)
        {
            yield return new ValidationResult(
                "Effective end date must be strictly after the effective start date.",
                new[] { nameof(EffectiveEndDate), nameof(EffectiveStartDate) });
        }

        // 2. Overall score threshold hierarchy (higher score is better)
        if (OverallGreenThreshold < OverallAmberThreshold || OverallAmberThreshold < OverallRedThreshold)
        {
            yield return new ValidationResult(
                $"Overall Green threshold ({OverallGreenThreshold}) must be >= Amber threshold ({OverallAmberThreshold}), and Amber must be >= Red threshold ({OverallRedThreshold}).",
                new[] { nameof(OverallGreenThreshold), nameof(OverallAmberThreshold), nameof(OverallRedThreshold) });
        }

        // 3. Items validation
        if (Items == null || Items.Count == 0)
        {
            yield return new ValidationResult(
                "At least one KPI item is required in the configuration.",
                new[] { nameof(Items) });
        }
        else
        {
            // 4. Weight sum validation (must sum to 100%)
            double totalWeight = Math.Round(Items.Sum(i => i.Weight), 2);
            if (Math.Abs(totalWeight - 100.0) > 0.01)
            {
                yield return new ValidationResult(
                    $"Total item weights must sum to 100% (current sum: {totalWeight}%).",
                    new[] { nameof(Items) });
            }

            // Check metric code uniqueness within configuration
            var duplicateCodes = Items
                .GroupBy(i => i.MetricCode, StringComparer.OrdinalIgnoreCase)
                .Where(g => g.Count() > 1)
                .Select(g => g.Key)
                .ToList();

            if (duplicateCodes.Count > 0)
            {
                yield return new ValidationResult(
                    $"Duplicate metric codes found: {string.Join(", ", duplicateCodes)}.",
                    new[] { nameof(Items) });
            }

            // Validate each item nested validation
            for (int i = 0; i < Items.Count; i++)
            {
                var item = Items[i];
                var itemResults = item.Validate(validationContext);
                foreach (var res in itemResults)
                {
                    yield return new ValidationResult(
                        $"Item[{i}] ({item.Name}): {res.ErrorMessage}",
                        res.MemberNames);
                }
            }
        }
    }
}

public class KpiConfigurationResponseDTO
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? TargetRole { get; set; }
    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public DateTime EffectiveStartDate { get; set; }
    public DateTime? EffectiveEndDate { get; set; }
    public bool IsActive { get; set; }
    public double OverallGreenThreshold { get; set; }
    public double OverallAmberThreshold { get; set; }
    public double OverallRedThreshold { get; set; }
    public Guid? CreatedById { get; set; }
    public string? CreatedByName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<KpiItemResponseDTO> Items { get; set; } = new();
}

