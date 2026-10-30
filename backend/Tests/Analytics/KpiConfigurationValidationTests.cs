using System.ComponentModel.DataAnnotations;
using Backend.Models.DTOs;
using Backend.Modules.Analytics;
using FluentAssertions;
using Xunit;

namespace Backend.Tests.Analytics;

public class KpiConfigurationValidationTests
{
    private static KpiConfigurationRequestDTO CreateValidConfigurationRequest()
    {
        return new KpiConfigurationRequestDTO
        {
            Title = "2026 Q4 Operations KPI Configuration",
            Description = "Standard weighted evaluation for courier operations",
            TargetRole = "Courier",
            EffectiveStartDate = DateTime.UtcNow.AddDays(1),
            EffectiveEndDate = DateTime.UtcNow.AddMonths(3),
            IsActive = true,
            OverallGreenThreshold = 85.0,
            OverallAmberThreshold = 70.0,
            OverallRedThreshold = 60.0,
            Items = new List<KpiItemRequestDTO>
            {
                new()
                {
                    Name = "On-Time In-Full (OTIF)",
                    MetricCode = "OTIF",
                    Weight = 30.0,
                    TargetValue = 95.0,
                    GreenThreshold = 95.0,
                    AmberThreshold = 85.0,
                    RedThreshold = 75.0,
                    IsLowerBetter = false
                },
                new()
                {
                    Name = "Order Accuracy",
                    MetricCode = "ORDER_ACCURACY",
                    Weight = 25.0,
                    TargetValue = 98.0,
                    GreenThreshold = 98.0,
                    AmberThreshold = 90.0,
                    RedThreshold = 80.0,
                    IsLowerBetter = false
                },
                new()
                {
                    Name = "Task Completion Rate",
                    MetricCode = "COMPLETION_RATE",
                    Weight = 25.0,
                    TargetValue = 90.0,
                    GreenThreshold = 90.0,
                    AmberThreshold = 80.0,
                    RedThreshold = 70.0,
                    IsLowerBetter = false
                },
                new()
                {
                    Name = "Average Handling Time",
                    MetricCode = "AHT",
                    Unit = "hours",
                    Weight = 20.0,
                    TargetValue = 2.0,
                    GreenThreshold = 2.0,
                    AmberThreshold = 4.0,
                    RedThreshold = 6.0,
                    IsLowerBetter = true
                }
            }
        };
    }

    #region Weight Sum Validation Tests

    [Fact]
    public void Validate_WhenWeightsSumTo100Percent_Succeeds()
    {
        var request = CreateValidConfigurationRequest();

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
        errors.Should().BeEmpty();
    }

    [Fact]
    public void Validate_WhenWeightsUseDecimalsSummingTo100Percent_Succeeds()
    {
        var request = CreateValidConfigurationRequest();
        request.Items = new List<KpiItemRequestDTO>
        {
            new() { Name = "Metric 1", MetricCode = "M1", Weight = 33.33, GreenThreshold = 90, AmberThreshold = 80, RedThreshold = 70 },
            new() { Name = "Metric 2", MetricCode = "M2", Weight = 33.33, GreenThreshold = 90, AmberThreshold = 80, RedThreshold = 70 },
            new() { Name = "Metric 3", MetricCode = "M3", Weight = 33.34, GreenThreshold = 90, AmberThreshold = 80, RedThreshold = 70 },
        };

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
        errors.Should().BeEmpty();
    }

    [Fact]
    public void Validate_WhenWeightsSumToLessThan100Percent_Fails()
    {
        var request = CreateValidConfigurationRequest();
        // Sum = 30 + 25 + 25 = 80%
        request.Items.RemoveAt(3);

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("100%"));
    }

    [Fact]
    public void Validate_WhenWeightsSumToMoreThan100Percent_Fails()
    {
        var request = CreateValidConfigurationRequest();
        // Sum = 30 + 25 + 25 + 20 + 10 = 110%
        request.Items.Add(new KpiItemRequestDTO
        {
            Name = "Bonus Metric",
            MetricCode = "BONUS",
            Weight = 10.0,
            GreenThreshold = 90,
            AmberThreshold = 80,
            RedThreshold = 70
        });

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("100%"));
    }

    [Fact]
    public void Validate_WhenItemsListIsEmpty_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.Items.Clear();

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("At least one KPI item is required"));
    }

    [Fact]
    public void Validate_WhenItemWeightIsNegative_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.Items[0].Weight = -10.0;
        request.Items[1].Weight = 65.0; // sum still 100

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Weight must be between 0 and 100"));
    }

    [Fact]
    public void Validate_WhenItemWeightExceeds100_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.Items[0].Weight = 105.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Weight must be between 0 and 100"));
    }

    #endregion

    #region Threshold Validation Tests

    [Fact]
    public void Validate_WhenOverallThresholdsValid_Succeeds()
    {
        var request = CreateValidConfigurationRequest();
        request.OverallGreenThreshold = 85.0;
        request.OverallAmberThreshold = 70.0;
        request.OverallRedThreshold = 60.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
        errors.Should().BeEmpty();
    }

    [Fact]
    public void Validate_WhenOverallGreenLessThanAmber_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.OverallGreenThreshold = 65.0;
        request.OverallAmberThreshold = 70.0;
        request.OverallRedThreshold = 60.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Overall Green threshold"));
    }

    [Fact]
    public void Validate_WhenOverallAmberLessThanRed_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.OverallGreenThreshold = 85.0;
        request.OverallAmberThreshold = 55.0;
        request.OverallRedThreshold = 60.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Overall Green threshold"));
    }

    [Fact]
    public void Validate_WhenOverallThresholdsEqual_Succeeds()
    {
        var request = CreateValidConfigurationRequest();
        request.OverallGreenThreshold = 70.0;
        request.OverallAmberThreshold = 70.0;
        request.OverallRedThreshold = 70.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenOverallThresholdExceeds100_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.OverallGreenThreshold = 105.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("between 0 and 100"));
    }

    [Fact]
    public void Validate_WhenItemHigherIsBetterThresholdsValid_Succeeds()
    {
        var request = CreateValidConfigurationRequest();
        var otif = request.Items.First(i => i.MetricCode == "OTIF");
        otif.IsLowerBetter = false;
        otif.GreenThreshold = 95.0;
        otif.AmberThreshold = 85.0;
        otif.RedThreshold = 75.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenItemHigherIsBetterThresholdsInverted_Fails()
    {
        var request = CreateValidConfigurationRequest();
        var otif = request.Items.First(i => i.MetricCode == "OTIF");
        otif.IsLowerBetter = false;
        otif.GreenThreshold = 75.0;
        otif.AmberThreshold = 85.0;
        otif.RedThreshold = 95.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("must be >= Amber threshold"));
    }

    [Fact]
    public void Validate_WhenItemLowerIsBetterThresholdsValid_Succeeds()
    {
        var request = CreateValidConfigurationRequest();
        var aht = request.Items.First(i => i.MetricCode == "AHT");
        aht.IsLowerBetter = true;
        aht.GreenThreshold = 2.0;
        aht.AmberThreshold = 4.0;
        aht.RedThreshold = 6.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenItemLowerIsBetterThresholdsInverted_Fails()
    {
        var request = CreateValidConfigurationRequest();
        var aht = request.Items.First(i => i.MetricCode == "AHT");
        aht.IsLowerBetter = true;
        aht.GreenThreshold = 6.0;
        aht.AmberThreshold = 4.0;
        aht.RedThreshold = 2.0;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("lower is better"));
    }

    #endregion

    #region Prospective Dates Validation Tests

    [Fact]
    public void Validate_WhenEffectiveDatesAreProspectiveAndChronological_Succeeds()
    {
        var request = CreateValidConfigurationRequest();
        request.EffectiveStartDate = DateTime.UtcNow.AddDays(7);
        request.EffectiveEndDate = DateTime.UtcNow.AddMonths(6);

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
        errors.Should().BeEmpty();
    }

    [Fact]
    public void Validate_WhenEffectiveEndDateIsNull_Succeeds()
    {
        var request = CreateValidConfigurationRequest();
        request.EffectiveStartDate = DateTime.UtcNow.AddDays(1);
        request.EffectiveEndDate = null;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
        errors.Should().BeEmpty();
    }

    [Fact]
    public void Validate_WhenEffectiveEndDateBeforeStartDate_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.EffectiveStartDate = DateTime.UtcNow.AddDays(10);
        request.EffectiveEndDate = DateTime.UtcNow.AddDays(5);

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Effective end date must be strictly after the effective start date"));
    }

    [Fact]
    public void Validate_WhenEffectiveEndDateEqualsStartDate_Fails()
    {
        var request = CreateValidConfigurationRequest();
        var sameDate = DateTime.UtcNow.AddDays(5);
        request.EffectiveStartDate = sameDate;
        request.EffectiveEndDate = sameDate;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Effective end date must be strictly after the effective start date"));
    }

    [Fact]
    public void Validate_WhenRequireProspectiveFutureStartAndStartDateInPast_Fails()
    {
        var referenceNow = new DateTime(2026, 10, 29, 0, 0, 0, DateTimeKind.Utc);
        var request = CreateValidConfigurationRequest();
        request.EffectiveStartDate = referenceNow.AddDays(-5);
        request.EffectiveEndDate = referenceNow.AddDays(30);

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(
            request,
            requireProspectiveFutureStart: true,
            referenceUtcNow: referenceNow);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("cannot be in the past"));
    }

    [Fact]
    public void Validate_WhenRequireProspectiveFutureStartAndStartDateInFuture_Succeeds()
    {
        var referenceNow = new DateTime(2026, 10, 29, 0, 0, 0, DateTimeKind.Utc);
        var request = CreateValidConfigurationRequest();
        request.EffectiveStartDate = referenceNow.AddDays(2);
        request.EffectiveEndDate = referenceNow.AddDays(30);

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(
            request,
            requireProspectiveFutureStart: true,
            referenceUtcNow: referenceNow);

        isValid.Should().BeTrue();
        errors.Should().BeEmpty();
    }

    #endregion

    #region Additional Constraint Tests

    [Fact]
    public void Validate_WhenDuplicateMetricCodesExist_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.Items[1].MetricCode = request.Items[0].MetricCode; // duplicate "OTIF"

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Duplicate metric codes"));
    }

    [Fact]
    public void Validate_WhenTitleIsEmpty_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.Title = string.Empty;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Title is required"));
    }

    [Fact]
    public void Validate_DirectIValidatableObjectInvocation_YieldsExpectedValidationResults()
    {
        var request = CreateValidConfigurationRequest();
        request.Items.Clear(); // invalid items

        var context = new ValidationContext(request);
        var results = request.Validate(context).ToList();

        results.Should().NotBeEmpty();
        results.Should().Contain(r => r.ErrorMessage!.Contains("At least one KPI item is required"));
    }

    #endregion

    #region Custom Formula Validation Tests

    [Fact]
    public void Validate_WhenIsCustomFormulaIsTrueAndFormulaEmpty_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.Items[0].IsCustomFormula = true;
        request.Items[0].CustomFormula = "";

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Custom formula is required"));
    }

    [Fact]
    public void Validate_WhenIsCustomFormulaIsTrueAndSyntaxInvalid_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.Items[0].IsCustomFormula = true;
        request.Items[0].CustomFormula = "completed_tasks + * 2";

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("Custom formula") && (e.Contains("Syntax") || e.Contains("invalid") || e.Contains("Unexpected")));
    }

    [Fact]
    public void Validate_WhenIsCustomFormulaUsesUnapprovedVariable_Fails()
    {
        var request = CreateValidConfigurationRequest();
        request.Items[0].IsCustomFormula = true;
        request.Items[0].CustomFormula = "completed_tasks + unknown_variable";

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeFalse();
        errors.Should().Contain(e => e.Contains("unknown_variable") && e.Contains("not permitted"));
    }

    [Fact]
    public void Validate_WhenIsCustomFormulaIsValidArithmeticExpression_Succeeds()
    {
        var request = CreateValidConfigurationRequest();
        request.Items[0].IsCustomFormula = true;
        request.Items[0].CustomFormula = "(completed_tasks / total_assigned_tasks) * 100";

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
        errors.Should().BeEmpty();
    }

    [Fact]
    public void Validate_WhenIsCustomFormulaIsFalse_FormulaFieldNotRequired()
    {
        var request = CreateValidConfigurationRequest();
        request.Items[0].IsCustomFormula = false;
        request.Items[0].CustomFormula = null;

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);

        isValid.Should().BeTrue();
        errors.Should().BeEmpty();
    }

    #endregion
}

