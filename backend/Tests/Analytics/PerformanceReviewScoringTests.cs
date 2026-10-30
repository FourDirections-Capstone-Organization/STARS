using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using Backend.Modules.PerformanceEvaluation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Backend.Tests.Analytics;

public class PerformanceReviewScoringTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static EvaluationTemplate CreateSampleTemplate()
    {
        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Logistics Performance Review Template",
            IsActive = true,
            IsAiEnabled = true
        };

        var standardSection = new EvaluationSection
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Operational Excellence",
            Weight = 60.0,
            Order = 1,
            IsKpiSection = false,
            Criteria = new List<EvaluationCriterion>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Delivery Execution",
                    Weight = 60.0,
                    Order = 1,
                    CriterionType = CriterionType.Standard
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Process Compliance",
                    Weight = 40.0,
                    Order = 2,
                    CriterionType = CriterionType.Standard
                }
            }
        };

        var kpiSection = new EvaluationSection
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "System KPIs",
            Weight = 40.0,
            Order = 2,
            IsKpiSection = true,
            Criteria = new List<EvaluationCriterion>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "OTIF Rate",
                    Weight = 50.0,
                    Order = 1,
                    CriterionType = CriterionType.KpiLinked,
                    MetricCode = "OTIF"
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Order Accuracy",
                    Weight = 50.0,
                    Order = 2,
                    CriterionType = CriterionType.KpiLinked,
                    MetricCode = "ACCURACY"
                }
            }
        };

        var ratingBands = new List<RatingBand>
        {
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Outstanding", MinScore = 90.0, MaxScore = 100.0, Order = 1, Color = "#10B981" },
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Exceeds Expectations", MinScore = 75.0, MaxScore = 89.99, Order = 2, Color = "#3B82F6" },
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Meets Expectations", MinScore = 60.0, MaxScore = 74.99, Order = 3, Color = "#F59E0B" },
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Needs Improvement", MinScore = 40.0, MaxScore = 59.99, Order = 4, Color = "#EF4444" },
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Unsatisfactory", MinScore = 0.0, MaxScore = 39.99, Order = 5, Color = "#6B7280" }
        };

        template.Sections = new List<EvaluationSection> { standardSection, kpiSection };
        template.RatingBands = ratingBands;

        return template;
    }

    private static User CreateSampleUser(string name = "Courier Juan", string empNum = "EMP-001")
    {
        return new User
        {
            Id = Guid.NewGuid(),
            FirstName = name.Split(' ')[0],
            LastName = name.Split(' ').Length > 1 ? name.Split(' ')[1] : "User",
            EmployeeNumber = empNum,
            Email = $"{empNum.ToLowerInvariant()}@speedex.com",
            Role = UserRole.Courier,
            Department = new Department { Name = "Operations" },
            JobPosition = new JobPosition { Name = "Lead Courier" }
        };
    }

    [Fact]
    public void StandardScoring_CalculatesNormalizedScoreAndRatingBand_Correctly()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var kpiMock = new Mock<IKpiCalculationEngine>();
        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var employee = CreateSampleUser("Juan Dela Cruz", "EMP-001");
        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Standard Review",
            Sections = new List<EvaluationSection>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Section A",
                    Weight = 50.0,
                    Order = 1,
                    IsKpiSection = false,
                    Criteria = new List<EvaluationCriterion>
                    {
                        new() { Id = Guid.NewGuid(), Title = "A1", Weight = 60.0, Order = 1, CriterionType = CriterionType.Standard },
                        new() { Id = Guid.NewGuid(), Title = "A2", Weight = 40.0, Order = 2, CriterionType = CriterionType.Standard }
                    }
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Section B",
                    Weight = 50.0,
                    Order = 2,
                    IsKpiSection = false,
                    Criteria = new List<EvaluationCriterion>
                    {
                        new() { Id = Guid.NewGuid(), Title = "B1", Weight = 100.0, Order = 1, CriterionType = CriterionType.Standard }
                    }
                }
            },
            RatingBands = new List<RatingBand>
            {
                new() { Label = "Outstanding", MinScore = 90.0, MaxScore = 100.0, Order = 1 },
                new() { Label = "Exceeds Expectations", MinScore = 75.0, MaxScore = 89.99, Order = 2 },
                new() { Label = "Meets Expectations", MinScore = 60.0, MaxScore = 74.99, Order = 3 }
            }
        };

        var critA1 = template.Sections.First().Criteria.First();
        var critA2 = template.Sections.First().Criteria.Last();
        var critB1 = template.Sections.Last().Criteria.First();

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Template = template,
            TemplateId = template.Id,
            Employee = employee,
            EmployeeId = employee.Id,
            Status = ReviewWorkflowStatus.ManagerReview,
            Ratings = new List<CriterionRating>
            {
                // Section A: raw = (5.0*60 + 4.0*40)/100 = 4.6 -> normalized = (4.6/5.0)*100 = 92.0
                new() { CriterionId = critA1.Id, EmployeeId = employee.Id, ManagerScore = 5.0, SelfScore = 5.0 },
                new() { CriterionId = critA2.Id, EmployeeId = employee.Id, ManagerScore = 4.0, SelfScore = 4.0 },
                // Section B: raw = 3.0 -> normalized = (3.0/5.0)*100 = 60.0
                new() { CriterionId = critB1.Id, EmployeeId = employee.Id, ManagerScore = 3.0, SelfScore = 3.0 }
            }
        };

        // Act
        var result = service.CalculateReviewScore(review);

        // Assert
        Assert.Single(result.Employees);
        var empScore = result.Employees[0];
        Assert.Equal(92.0, empScore.Sections[0].Score);
        Assert.Equal(60.0, empScore.Sections[1].Score);

        // Weighted final = (92.0 * 50 + 60.0 * 50) / 100 = 76.0
        Assert.Equal(76.0, empScore.FinalScore);
        Assert.Equal("Exceeds Expectations", empScore.RatingLabel);
        Assert.Equal(76.0, result.OverallScore);
        Assert.Equal("Exceeds Expectations", result.OverallRating);
    }

    [Fact]
    public async System.Threading.Tasks.Task KpiPassthrough_UsesKpiCalculationEngineOverallScore_ForKpiSection()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var template = CreateSampleTemplate();
        var employee = CreateSampleUser("Maria Santos", "EMP-002");

        var kpiResult = new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = employee.Id,
            OverallScore = 85.0,
            Metrics = new List<KpiMetricValueDTO>
            {
                new() { MetricCode = "OTIF", ActualValue = 88.0 },
                new() { MetricCode = "ACCURACY", ActualValue = 82.0 }
            }
        };

        var kpiMock = new Mock<IKpiCalculationEngine>();
        kpiMock.Setup(e => e.CalculateEmployeeKpiAsync(
                employee.Id,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(kpiResult);

        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var stdSection = template.Sections.First(s => !s.IsKpiSection);
        var crit1 = stdSection.Criteria.First();
        var crit2 = stdSection.Criteria.Last();

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Template = template,
            TemplateId = template.Id,
            Employee = employee,
            EmployeeId = employee.Id,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow,
            Status = ReviewWorkflowStatus.ManagerReview,
            Ratings = new List<CriterionRating>
            {
                // Standard section: raw = (5.0*60 + 5.0*40)/100 = 5.0 -> normalized = 100.0
                new() { CriterionId = crit1.Id, EmployeeId = employee.Id, ManagerScore = 5.0, SelfScore = 5.0 },
                new() { CriterionId = crit2.Id, EmployeeId = employee.Id, ManagerScore = 5.0, SelfScore = 5.0 }
            }
        };

        // Act
        var result = await service.CalculateReviewScoreAsync(review);

        // Assert
        var empScore = result.Employees[0];
        var scoredKpiSection = empScore.Sections.First(s => s.IsKpiSection);

        // KPI Section score passes through engine OverallScore (85.0)
        Assert.Equal(85.0, scoredKpiSection.Score);

        // Individual KPI criteria pull metric values
        var otifCriterion = scoredKpiSection.Criteria.First(c => c.MetricCode == "OTIF");
        Assert.Equal(88.0, otifCriterion.Score);

        // Final score: (100.0 * 60 + 85.0 * 40) / 100 = (6000 + 3400) / 100 = 94.0
        Assert.Equal(94.0, empScore.FinalScore);
        Assert.Equal("Outstanding", empScore.RatingLabel);
    }

    [Fact]
    public void Outlier_FlagsCriteriaWithScoreDiscrepancyGreaterOrEqualToTwo()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var kpiMock = new Mock<IKpiCalculationEngine>();
        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var employee = CreateSampleUser();
        var template = CreateSampleTemplate();
        var stdSection = template.Sections.First(s => !s.IsKpiSection);
        var c1 = stdSection.Criteria.First();
        var c2 = stdSection.Criteria.Last();

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Template = template,
            TemplateId = template.Id,
            Employee = employee,
            EmployeeId = employee.Id,
            Ratings = new List<CriterionRating>
            {
                // Discrepancy = |5.0 - 3.0| = 2.0 -> Outlier!
                new() { CriterionId = c1.Id, EmployeeId = employee.Id, SelfScore = 5.0, ManagerScore = 3.0 },
                // Discrepancy = |4.0 - 3.0| = 1.0 -> Not an outlier
                new() { CriterionId = c2.Id, EmployeeId = employee.Id, SelfScore = 4.0, ManagerScore = 3.0 }
            }
        };

        // Act
        var result = service.CalculateReviewScore(review);

        // Assert
        var evaluatedCriteria = result.Employees[0].Sections.First(s => !s.IsKpiSection).Criteria;
        var crit1Score = evaluatedCriteria.First(c => c.CriterionId == c1.Id);
        var crit2Score = evaluatedCriteria.First(c => c.CriterionId == c2.Id);

        Assert.True(crit1Score.IsOutlier);
        Assert.Equal(2.0, crit1Score.Gap);

        Assert.False(crit2Score.IsOutlier);
        Assert.Equal(1.0, crit2Score.Gap);

        Assert.Equal(1, result.Employees[0].OutlierCount);
    }

    [Theory]
    [InlineData(100.0, "Outstanding")]
    [InlineData(90.0, "Outstanding")]
    [InlineData(89.99, "Exceeds Expectations")]
    [InlineData(75.0, "Exceeds Expectations")]
    [InlineData(74.99, "Meets Expectations")]
    [InlineData(60.0, "Meets Expectations")]
    [InlineData(59.99, "Needs Improvement")]
    [InlineData(40.0, "Needs Improvement")]
    [InlineData(39.99, "Unsatisfactory")]
    [InlineData(0.0, "Unsatisfactory")]
    public void BandBoundary_MatchesExactBoundaryValues_Correctly(double targetScore, string expectedBandLabel)
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var kpiMock = new Mock<IKpiCalculationEngine>();
        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var template = CreateSampleTemplate();
        // Give template a single section with weight 100
        template.Sections = new List<EvaluationSection>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TemplateId = template.Id,
                Title = "General",
                Weight = 100.0,
                IsKpiSection = true
            }
        };

        var employee = CreateSampleUser();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Template = template,
            TemplateId = template.Id,
            Employee = employee,
            EmployeeId = employee.Id
        };

        var kpiDict = new Dictionary<Guid, EmployeeKpiEvaluationResultDTO>
        {
            [employee.Id] = new() { EmployeeId = employee.Id, OverallScore = targetScore }
        };

        // Act
        var result = service.CalculateReviewScore(review, kpiDict);

        // Assert
        Assert.Equal(targetScore, result.Employees[0].FinalScore);
        Assert.Equal(expectedBandLabel, result.Employees[0].RatingLabel);
    }

    [Fact]
    public void FrozenBypass_ReturnsFrozenScoresJsonDirectly_WhenFinalized()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var kpiMock = new Mock<IKpiCalculationEngine>();
        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var employee = CreateSampleUser();
        var template = CreateSampleTemplate();

        var frozenResult = new ReviewResultDTO
        {
            ReviewId = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Frozen Review Title",
            Status = ReviewWorkflowStatus.Finalized,
            IsFinalized = true,
            FinalizedAt = DateTime.UtcNow.AddDays(-10),
            OverallScore = 99.99,
            OverallRating = "Outstanding",
            Employees = new List<EmployeeReviewScoreDTO>
            {
                new()
                {
                    EmployeeId = employee.Id,
                    EmployeeName = "Frozen Name",
                    FinalScore = 99.99,
                    RatingLabel = "Outstanding"
                }
            }
        };

        var frozenJson = service.SerializeScores(frozenResult);

        var review = new PerformanceReview
        {
            Id = frozenResult.ReviewId,
            Template = template,
            TemplateId = template.Id,
            Employee = employee,
            EmployeeId = employee.Id,
            Status = ReviewWorkflowStatus.Finalized,
            FrozenScoresJson = frozenJson,
            // Even if ratings contain low scores or are completely empty, frozen snapshot takes precedence
            Ratings = new List<CriterionRating>()
        };

        // Act
        var result = service.CalculateReviewScore(review);

        // Assert
        Assert.Equal(99.99, result.OverallScore);
        Assert.Equal("Outstanding", result.OverallRating);
        Assert.True(result.IsFinalized);
        Assert.Equal("Frozen Name", result.Employees[0].EmployeeName);
        Assert.Equal(99.99, result.Employees[0].FinalScore);
    }

    [Fact]
    public void ZeroWeight_HandlesZeroCriterionOrSectionWeight_WithoutDivideByZero()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var kpiMock = new Mock<IKpiCalculationEngine>();
        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var employee = CreateSampleUser();
        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Zero Weight Template",
            Sections = new List<EvaluationSection>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Zero Weight Section",
                    Weight = 0.0,
                    IsKpiSection = false,
                    Criteria = new List<EvaluationCriterion>
                    {
                        new() { Id = Guid.NewGuid(), Title = "Zero Weight Criterion", Weight = 0.0, CriterionType = CriterionType.Standard }
                    }
                }
            },
            RatingBands = new List<RatingBand>
            {
                new() { Label = "Unrated", MinScore = 0.0, MaxScore = 100.0, Order = 1 }
            }
        };

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Template = template,
            TemplateId = template.Id,
            Employee = employee,
            EmployeeId = employee.Id,
            Ratings = new List<CriterionRating>
            {
                new() { CriterionId = template.Sections.First().Criteria.First().Id, EmployeeId = employee.Id, ManagerScore = 5.0 }
            }
        };

        // Act
        var result = service.CalculateReviewScore(review);

        // Assert
        Assert.Equal(0.0, result.Employees[0].FinalScore);
        Assert.Equal(0.0, result.Employees[0].Sections[0].Score);
    }

    [Fact]
    public void MissingRatings_HandlesNullOrMissingRatings_Safely()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var kpiMock = new Mock<IKpiCalculationEngine>();
        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var employee = CreateSampleUser();
        var template = CreateSampleTemplate();
        var stdSection = template.Sections.First(s => !s.IsKpiSection);
        var c1 = stdSection.Criteria.First();
        var c2 = stdSection.Criteria.Last();

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Template = template,
            TemplateId = template.Id,
            Employee = employee,
            EmployeeId = employee.Id,
            Ratings = new List<CriterionRating>
            {
                // C1 has null manager score, null self score
                new() { CriterionId = c1.Id, EmployeeId = employee.Id, ManagerScore = null, SelfScore = null }
                // C2 has no rating row at all in database
            }
        };

        // Act
        var result = service.CalculateReviewScore(review);

        // Assert
        var empScore = result.Employees[0];
        var scoredCriteria = empScore.Sections.First(s => !s.IsKpiSection).Criteria;

        var crit1 = scoredCriteria.First(c => c.CriterionId == c1.Id);
        var crit2 = scoredCriteria.First(c => c.CriterionId == c2.Id);

        Assert.Null(crit1.ManagerScore);
        Assert.Null(crit1.Gap);
        Assert.False(crit1.IsOutlier);

        Assert.Null(crit2.ManagerScore);
        Assert.Null(crit2.Gap);
        Assert.False(crit2.IsOutlier);

        Assert.Equal(0.0, empScore.Sections.First(s => !s.IsKpiSection).Score);
        Assert.Equal(0, empScore.OutlierCount);
    }

    [Fact]
    public void MultiEmployee_CalculatesScoresForEachEmployeeInScope()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var kpiMock = new Mock<IKpiCalculationEngine>();
        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var emp1 = CreateSampleUser("Juan Dela Cruz", "EMP-001");
        var emp2 = CreateSampleUser("Maria Santos", "EMP-002");
        var emp3 = CreateSampleUser("Pedro Penduko", "EMP-003");

        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Team Review Template",
            Sections = new List<EvaluationSection>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Performance",
                    Weight = 100.0,
                    IsKpiSection = false,
                    Criteria = new List<EvaluationCriterion>
                    {
                        new() { Id = Guid.NewGuid(), Title = "Output", Weight = 100.0, CriterionType = CriterionType.Standard }
                    }
                }
            },
            RatingBands = new List<RatingBand>
            {
                new() { Label = "Outstanding", MinScore = 90.0, MaxScore = 100.0, Order = 1 },
                new() { Label = "Exceeds Expectations", MinScore = 75.0, MaxScore = 89.99, Order = 2 },
                new() { Label = "Meets Expectations", MinScore = 60.0, MaxScore = 74.99, Order = 3 }
            }
        };

        var critId = template.Sections.First().Criteria.First().Id;

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Template = template,
            TemplateId = template.Id,
            Scope = ReviewScope.Team,
            Status = ReviewWorkflowStatus.ManagerReview,
            Ratings = new List<CriterionRating>
            {
                // Emp 1: Manager score 5.0 -> 100.0 (Outstanding)
                new() { CriterionId = critId, Employee = emp1, EmployeeId = emp1.Id, ManagerScore = 5.0, SelfScore = 5.0 },
                // Emp 2: Manager score 4.0 -> 80.0 (Exceeds Expectations)
                new() { CriterionId = critId, Employee = emp2, EmployeeId = emp2.Id, ManagerScore = 4.0, SelfScore = 4.0 },
                // Emp 3: Manager score 3.0 -> 60.0 (Meets Expectations)
                new() { CriterionId = critId, Employee = emp3, EmployeeId = emp3.Id, ManagerScore = 3.0, SelfScore = 3.0 }
            }
        };

        // Act
        var result = service.CalculateReviewScore(review);

        // Assert
        Assert.Equal(3, result.Employees.Count);

        var score1 = result.Employees.First(e => e.EmployeeId == emp1.Id);
        var score2 = result.Employees.First(e => e.EmployeeId == emp2.Id);
        var score3 = result.Employees.First(e => e.EmployeeId == emp3.Id);

        Assert.Equal(100.0, score1.FinalScore);
        Assert.Equal("Outstanding", score1.RatingLabel);

        Assert.Equal(80.0, score2.FinalScore);
        Assert.Equal("Exceeds Expectations", score2.RatingLabel);

        Assert.Equal(60.0, score3.FinalScore);
        Assert.Equal("Meets Expectations", score3.RatingLabel);

        // Overall score = average(100, 80, 60) = 80.0
        Assert.Equal(80.0, result.OverallScore);
        Assert.Equal("Exceeds Expectations", result.OverallRating);

        // Distribution
        Assert.Equal(1, result.RatingDistribution["Outstanding"]);
        Assert.Equal(1, result.RatingDistribution["Exceeds Expectations"]);
        Assert.Equal(1, result.RatingDistribution["Meets Expectations"]);
    }

    [Fact]
    public void CriterionTypeExtensibility_KpiLinkedCriterion_PullsSpecificMetricCode()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var kpiMock = new Mock<IKpiCalculationEngine>();
        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var employee = CreateSampleUser();
        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Sections = new List<EvaluationSection>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Hybrid Section",
                    Weight = 100.0,
                    IsKpiSection = false,
                    Criteria = new List<EvaluationCriterion>
                    {
                        new()
                        {
                            Id = Guid.NewGuid(),
                            Title = "Custom Metric OTIF",
                            Weight = 100.0,
                            CriterionType = CriterionType.KpiLinked,
                            MetricCode = "OTIF"
                        }
                    }
                }
            },
            RatingBands = new List<RatingBand>
            {
                new() { Label = "Standard Band", MinScore = 0.0, MaxScore = 100.0, Order = 1 }
            }
        };

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Template = template,
            TemplateId = template.Id,
            Employee = employee,
            EmployeeId = employee.Id
        };

        var kpiData = new Dictionary<Guid, EmployeeKpiEvaluationResultDTO>
        {
            [employee.Id] = new()
            {
                EmployeeId = employee.Id,
                OverallScore = 75.0,
                Metrics = new List<KpiMetricValueDTO>
                {
                    new() { MetricCode = "OTIF", ActualValue = 95.5 }
                }
            }
        };

        // Act
        var result = service.CalculateReviewScore(review, kpiData);

        // Assert
        var critScore = result.Employees[0].Sections[0].Criteria[0];
        Assert.Equal(95.5, critScore.Score);
    }

    [Fact]
    public async System.Threading.Tasks.Task FreezeReviewScoresAsync_PersistsCalculatedJsonToDatabase()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var kpiMock = new Mock<IKpiCalculationEngine>();
        var service = new PerformanceReviewScoringService(context, kpiMock.Object, NullLogger<PerformanceReviewScoringService>.Instance);

        var employee = CreateSampleUser("Freeze Test", "EMP-FREEZE");
        var template = CreateSampleTemplate();
        await context.EvaluationTemplates.AddAsync(template);
        await context.Users.AddAsync(employee);

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Title = "Review To Freeze",
            TemplateId = template.Id,
            EmployeeId = employee.Id,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow,
            Status = ReviewWorkflowStatus.ManagerReview
        };
        await context.PerformanceReviews.AddAsync(review);
        await context.SaveChangesAsync();

        // Act
        var frozenJson = await service.FreezeReviewScoresAsync(review.Id);

        // Assert
        Assert.False(string.IsNullOrWhiteSpace(frozenJson));
        var dbReview = await context.PerformanceReviews.FindAsync(review.Id);
        Assert.NotNull(dbReview);
        Assert.Equal(frozenJson, dbReview.FrozenScoresJson);

        var deserialized = service.DeserializeScores(frozenJson);
        Assert.NotNull(deserialized);
        Assert.True(deserialized.IsFinalized);
        Assert.Equal(review.Id, deserialized.ReviewId);
    }
}
