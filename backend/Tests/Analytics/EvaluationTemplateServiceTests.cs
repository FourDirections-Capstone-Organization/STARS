using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.PerformanceEvaluation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using Task = System.Threading.Tasks.Task;

namespace Backend.Tests.Analytics;

public class EvaluationTemplateServiceTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static (EvaluationTemplateService service, AppDbContext context) CreateService()
    {
        var context = CreateInMemoryDbContext();
        var service = new EvaluationTemplateService(
            context,
            NullLogger<EvaluationTemplateService>.Instance);

        return (service, context);
    }

    private static EvaluationTemplate CreateValidTemplate()
    {
        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Engineering Performance Evaluation",
            Description = "Standard annual engineering review template",
            TargetRole = "Software Engineer",
            IsActive = true,
            IsAiEnabled = true
        };

        var standardSection = new EvaluationSection
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Technical Execution",
            Weight = 60.0,
            Order = 1,
            IsKpiSection = false,
            Criteria = new List<EvaluationCriterion>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Code Quality & Architecture",
                    Weight = 60.0,
                    Order = 1,
                    CriterionType = CriterionType.Standard
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Problem Solving & Delivery",
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
            Title = "System Metric Targets",
            Weight = 40.0,
            Order = 2,
            IsKpiSection = true,
            Criteria = new List<EvaluationCriterion>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Deployment Reliability",
                    Weight = 50.0,
                    Order = 1,
                    CriterionType = CriterionType.KpiLinked,
                    MetricCode = "DEPLOY_RATE"
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "SLA Compliance",
                    Weight = 50.0,
                    Order = 2,
                    CriterionType = CriterionType.KpiLinked,
                    MetricCode = "SLA_COMPLIANCE"
                }
            }
        };

        var bands = new List<RatingBand>
        {
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Outstanding", MinScore = 90.0, MaxScore = 100.0, Order = 1 },
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Exceeds Expectations", MinScore = 75.0, MaxScore = 89.99, Order = 2 },
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Meets Expectations", MinScore = 60.0, MaxScore = 74.99, Order = 3 },
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Needs Improvement", MinScore = 40.0, MaxScore = 59.99, Order = 4 },
            new() { Id = Guid.NewGuid(), TemplateId = template.Id, Label = "Unsatisfactory", MinScore = 0.0, MaxScore = 39.99, Order = 5 }
        };

        template.Sections = new List<EvaluationSection> { standardSection, kpiSection };
        template.RatingBands = bands;

        return template;
    }

    [Fact]
    public void ValidateTemplate_ValidTemplate_ReturnsSuccess()
    {
        // Arrange
        var (service, _) = CreateService();
        var template = CreateValidTemplate();

        // Act
        var result = service.ValidateTemplate(template);

        // Assert
        Assert.True(result.IsValid);
        Assert.Empty(result.Errors);
    }

    [Theory]
    [InlineData(90.0, false)]  // 90% sum (< 99.5%)
    [InlineData(110.0, false)] // 110% sum (> 100.5%)
    [InlineData(99.4, false)]  // Just below lower tolerance
    [InlineData(100.6, false)] // Just above upper tolerance
    [InlineData(99.5, true)]   // Exactly on lower tolerance boundary
    [InlineData(100.5, true)]  // Exactly on upper tolerance boundary
    [InlineData(99.8, true)]   // Within tolerance
    [InlineData(100.2, true)]  // Within tolerance
    public void ValidateTemplate_SectionWeightsTolerance_Enforces100PercentPlusMinusHalfPercent(
        double secondSectionWeight, bool expectedValid)
    {
        // Arrange
        var (service, _) = CreateService();
        var template = CreateValidTemplate();

        // Section 1 is 50.0; Section 2 is adjusted so sum = 50 + (secondSectionWeight - 50)
        template.Sections.First().Weight = 50.0;
        template.Sections.Last().Weight = secondSectionWeight - 50.0;

        // Act
        var result = service.ValidateTemplate(template);

        // Assert
        Assert.Equal(expectedValid, result.IsValid);
        if (!expectedValid)
        {
            Assert.Contains(result.Errors, e => e.Contains("Total section weight must sum to 100%"));
        }
    }

    [Theory]
    [InlineData(80.0, false)]  // 80% criteria sum (< 99.5%)
    [InlineData(115.0, false)] // 115% criteria sum (> 100.5%)
    [InlineData(99.8, true)]   // Within tolerance
    public void ValidateTemplate_CriterionWeightsTolerance_Enforces100PercentPlusMinusHalfPercent(
        double criterionSum, bool expectedValid)
    {
        // Arrange
        var (service, _) = CreateService();
        var template = CreateValidTemplate();

        var standardSection = template.Sections.First(s => !s.IsKpiSection);
        standardSection.Criteria.First().Weight = 50.0;
        standardSection.Criteria.Last().Weight = criterionSum - 50.0;

        // Act
        var result = service.ValidateTemplate(template);

        // Assert
        Assert.Equal(expectedValid, result.IsValid);
        if (!expectedValid)
        {
            Assert.Contains(result.Errors, e => e.Contains("Criterion weights in section"));
        }
    }

    [Fact]
    public void ValidateTemplate_MultipleKpiSections_FailsValidation()
    {
        // Arrange
        var (service, _) = CreateService();
        var template = CreateValidTemplate();

        // Mark second section as KPI as well (now 2 KPI sections)
        template.Sections.First().IsKpiSection = true;

        // Act
        var result = service.ValidateTemplate(template);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("At most one KPI section is permitted"));
    }

    [Fact]
    public void ValidateTemplate_OverlappingRatingBands_FailsValidation()
    {
        // Arrange
        var (service, _) = CreateService();
        var template = CreateValidTemplate();

        // Make Band 1 (50-100) overlap with Band 2 (0-60)
        template.RatingBands = new List<RatingBand>
        {
            new() { Label = "Top Band", MinScore = 50.0, MaxScore = 100.0, Order = 1 },
            new() { Label = "Low Band", MinScore = 0.0, MaxScore = 60.0, Order = 2 }
        };

        // Act
        var result = service.ValidateTemplate(template);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("Rating bands overlap"));
    }

    [Fact]
    public void ValidateTemplate_InvertedRatingBandRange_FailsValidation()
    {
        // Arrange
        var (service, _) = CreateService();
        var template = CreateValidTemplate();

        template.RatingBands = new List<RatingBand>
        {
            new() { Label = "Inverted Band", MinScore = 80.0, MaxScore = 50.0, Order = 1 }
        };

        // Act
        var result = service.ValidateTemplate(template);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("invalid range: MinScore"));
    }

    [Fact]
    public void ValidateTemplate_MissingTitleOrSections_FailsValidation()
    {
        // Arrange
        var (service, _) = CreateService();
        var template = new EvaluationTemplate
        {
            Title = "",
            Sections = new List<EvaluationSection>()
        };

        // Act
        var result = service.ValidateTemplate(template);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("Template title is required"));
        Assert.Contains(result.Errors, e => e.Contains("must contain at least one evaluation section"));
    }

    [Fact]
    public async Task CreateTemplateAsync_ValidTemplate_SucceedsAndPersists()
    {
        // Arrange
        var (service, context) = CreateService();
        var template = CreateValidTemplate();
        var userId = Guid.NewGuid();

        // Act
        var result = await service.CreateTemplateAsync(template, userId);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(200, result.StatusCode);
        Assert.NotNull(result.Data);

        var persisted = await context.EvaluationTemplates
            .Include(t => t.Sections)
                .ThenInclude(s => s.Criteria)
            .Include(t => t.RatingBands)
            .FirstOrDefaultAsync(t => t.Id == template.Id);

        Assert.NotNull(persisted);
        Assert.Equal("Engineering Performance Evaluation", persisted.Title);
        Assert.Equal(2, persisted.Sections.Count);
        Assert.Equal(5, persisted.RatingBands.Count);
    }

    [Fact]
    public async Task CreateTemplateAsync_InvalidWeights_Returns422()
    {
        // Arrange
        var (service, _) = CreateService();
        var template = CreateValidTemplate();
        template.Sections.First().Weight = 20.0; // Total section weight = 20 + 40 = 60 != 100
        var userId = Guid.NewGuid();

        // Act
        var result = await service.CreateTemplateAsync(template, userId);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal(422, result.StatusCode);
        Assert.NotEmpty(result.Errors);
    }

    [Fact]
    public async Task UpdateTemplateAsync_TemplateInUseByNonDraftReview_BlocksUpdateWith422()
    {
        // Arrange
        var (service, context) = CreateService();
        var template = CreateValidTemplate();
        var userId = Guid.NewGuid();

        await context.EvaluationTemplates.AddAsync(template);
        await context.PerformanceReviews.AddAsync(new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Title = "Active Mid-Year Review",
            TemplateId = template.Id,
            Status = ReviewWorkflowStatus.ManagerReview // Non-Draft
        });
        await context.SaveChangesAsync();

        var updated = CreateValidTemplate();
        updated.Title = "Updated Title";

        // Act
        var result = await service.UpdateTemplateAsync(template.Id, updated, userId);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal(422, result.StatusCode);
        Assert.Contains("currently in use by active or finalized performance reviews", result.Message);
    }

    [Fact]
    public async Task UpdateTemplateAsync_TemplateInUseByDraftReviewOnly_AllowsUpdate()
    {
        // Arrange
        var (service, context) = CreateService();
        var template = CreateValidTemplate();
        var userId = Guid.NewGuid();

        await context.EvaluationTemplates.AddAsync(template);
        await context.PerformanceReviews.AddAsync(new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Title = "Draft Annual Review",
            TemplateId = template.Id,
            Status = ReviewWorkflowStatus.Draft // Draft only
        });
        await context.SaveChangesAsync();

        var updated = CreateValidTemplate();
        updated.Title = "Updated Engineering Evaluation Template";

        // Act
        var result = await service.UpdateTemplateAsync(template.Id, updated, userId);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(200, result.StatusCode);

        var persisted = await context.EvaluationTemplates.FindAsync(template.Id);
        Assert.NotNull(persisted);
        Assert.Equal("Updated Engineering Evaluation Template", persisted.Title);
    }

    [Fact]
    public async Task DeleteTemplateAsync_TemplateInUseByNonDraftReview_BlocksDeletion()
    {
        // Arrange
        var (service, context) = CreateService();
        var template = CreateValidTemplate();

        await context.EvaluationTemplates.AddAsync(template);
        await context.PerformanceReviews.AddAsync(new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Title = "Finalized Annual Review",
            TemplateId = template.Id,
            Status = ReviewWorkflowStatus.Finalized
        });
        await context.SaveChangesAsync();

        // Act
        var result = await service.DeleteTemplateAsync(template.Id);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal(422, result.StatusCode);
    }

    [Fact]
    public async Task DeleteTemplateAsync_TemplateInUseByDraftReview_DeactivatesTemplate()
    {
        // Arrange
        var (service, context) = CreateService();
        var template = CreateValidTemplate();

        await context.EvaluationTemplates.AddAsync(template);
        await context.PerformanceReviews.AddAsync(new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Title = "Draft Review",
            TemplateId = template.Id,
            Status = ReviewWorkflowStatus.Draft
        });
        await context.SaveChangesAsync();

        // Act
        var result = await service.DeleteTemplateAsync(template.Id);

        // Assert
        Assert.True(result.IsSuccess);
        var persisted = await context.EvaluationTemplates.FindAsync(template.Id);
        Assert.NotNull(persisted);
        Assert.False(persisted.IsActive);
    }
}
