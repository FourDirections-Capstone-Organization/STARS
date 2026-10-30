using Xunit;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.Enums;

namespace Backend.Tests.Analytics;

public class PerformanceEvaluationDatabaseConfigurationTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    [Fact]
    public void AppDbContext_PerformanceEvaluationEntities_AreRegisteredInModel()
    {
        using var db = CreateInMemoryDbContext();

        Assert.NotNull(db.Model.FindEntityType(typeof(EvaluationTemplate)));
        Assert.NotNull(db.Model.FindEntityType(typeof(EvaluationSection)));
        Assert.NotNull(db.Model.FindEntityType(typeof(EvaluationCriterion)));
        Assert.NotNull(db.Model.FindEntityType(typeof(RatingBand)));
        Assert.NotNull(db.Model.FindEntityType(typeof(PerformanceReview)));
        Assert.NotNull(db.Model.FindEntityType(typeof(CriterionRating)));
        Assert.NotNull(db.Model.FindEntityType(typeof(AiRecommendation)));
        Assert.NotNull(db.Model.FindEntityType(typeof(DevelopmentPlanItem)));
    }

    [Fact]
    public void AppDbContext_CriterionRating_HasUniqueCompositeIndex()
    {
        using var db = CreateInMemoryDbContext();
        var entityType = db.Model.FindEntityType(typeof(CriterionRating));

        Assert.NotNull(entityType);
        var indexes = entityType.GetIndexes().ToList();

        var compositeIndex = indexes.FirstOrDefault(idx =>
            idx.Properties.Count == 3 &&
            idx.Properties.Any(p => p.Name == nameof(CriterionRating.ReviewId)) &&
            idx.Properties.Any(p => p.Name == nameof(CriterionRating.EmployeeId)) &&
            idx.Properties.Any(p => p.Name == nameof(CriterionRating.CriterionId)));

        Assert.NotNull(compositeIndex);
        Assert.True(compositeIndex.IsUnique);
    }

    [Fact]
    public void AppDbContext_PerformanceReview_HasStatusIndexAndFrozenScoresJsonAsText()
    {
        using var db = CreateInMemoryDbContext();
        var entityType = db.Model.FindEntityType(typeof(PerformanceReview));

        Assert.NotNull(entityType);

        // Verify status index
        var statusIndex = entityType.GetIndexes()
            .FirstOrDefault(idx => idx.Properties.Count == 1 && idx.Properties[0].Name == nameof(PerformanceReview.Status));
        Assert.NotNull(statusIndex);

        // Verify FrozenScoresJson column type
        var frozenScoresProp = entityType.FindProperty(nameof(PerformanceReview.FrozenScoresJson));
        Assert.NotNull(frozenScoresProp);
        var columnTypeAnnotation = frozenScoresProp.FindAnnotation("Relational:ColumnType")?.Value?.ToString();
        Assert.Equal("text", columnTypeAnnotation);
    }

    [Fact]
    public void AppDbContext_Relationships_HaveExpectedDeleteBehaviors()
    {
        using var db = CreateInMemoryDbContext();

        var templateType = db.Model.FindEntityType(typeof(EvaluationTemplate))!;
        var sectionType = db.Model.FindEntityType(typeof(EvaluationSection))!;
        var criterionType = db.Model.FindEntityType(typeof(EvaluationCriterion))!;
        var bandType = db.Model.FindEntityType(typeof(RatingBand))!;
        var reviewType = db.Model.FindEntityType(typeof(PerformanceReview))!;
        var ratingType = db.Model.FindEntityType(typeof(CriterionRating))!;
        var aiType = db.Model.FindEntityType(typeof(AiRecommendation))!;
        var planType = db.Model.FindEntityType(typeof(DevelopmentPlanItem))!;

        // Section -> Template (Cascade)
        var secToTpl = sectionType.GetForeignKeys().First(fk => fk.PrincipalEntityType == templateType);
        Assert.Equal(DeleteBehavior.Cascade, secToTpl.DeleteBehavior);

        // Criterion -> Section (Cascade)
        var critToSec = criterionType.GetForeignKeys().First(fk => fk.PrincipalEntityType == sectionType);
        Assert.Equal(DeleteBehavior.Cascade, critToSec.DeleteBehavior);

        // RatingBand -> Template (Cascade)
        var bandToTpl = bandType.GetForeignKeys().First(fk => fk.PrincipalEntityType == templateType);
        Assert.Equal(DeleteBehavior.Cascade, bandToTpl.DeleteBehavior);

        // Review -> Template (Restrict)
        var revToTpl = reviewType.GetForeignKeys().First(fk => fk.PrincipalEntityType == templateType);
        Assert.Equal(DeleteBehavior.Restrict, revToTpl.DeleteBehavior);

        // Rating -> Review (Cascade), Rating -> Criterion (Cascade)
        var ratToRev = ratingType.GetForeignKeys().First(fk => fk.PrincipalEntityType == reviewType);
        Assert.Equal(DeleteBehavior.Cascade, ratToRev.DeleteBehavior);
        var ratToCrit = ratingType.GetForeignKeys().First(fk => fk.PrincipalEntityType == criterionType);
        Assert.Equal(DeleteBehavior.Cascade, ratToCrit.DeleteBehavior);

        // AI -> Review (Cascade)
        var aiToRev = aiType.GetForeignKeys().First(fk => fk.PrincipalEntityType == reviewType);
        Assert.Equal(DeleteBehavior.Cascade, aiToRev.DeleteBehavior);

        // PlanItem -> Review (Cascade)
        var planToRev = planType.GetForeignKeys().First(fk => fk.PrincipalEntityType == reviewType);
        Assert.Equal(DeleteBehavior.Cascade, planToRev.DeleteBehavior);
    }

    [Fact]
    public void StartupDdl_ContainsPerformanceEvaluationTablesAndMigration()
    {
        var ddl = DatabaseStartupDdl.StartupDdlSql;

        // Verify table definitions
        Assert.Contains("CREATE TABLE IF NOT EXISTS \"EvaluationTemplates\"", ddl);
        Assert.Contains("CREATE TABLE IF NOT EXISTS \"EvaluationSections\"", ddl);
        Assert.Contains("CREATE TABLE IF NOT EXISTS \"EvaluationCriteria\"", ddl);
        Assert.Contains("CREATE TABLE IF NOT EXISTS \"RatingBands\"", ddl);
        Assert.Contains("CREATE TABLE IF NOT EXISTS \"PerformanceReviews\"", ddl);
        Assert.Contains("CREATE TABLE IF NOT EXISTS \"CriterionRatings\"", ddl);
        Assert.Contains("CREATE TABLE IF NOT EXISTS \"AiRecommendations\"", ddl);
        Assert.Contains("CREATE TABLE IF NOT EXISTS \"DevelopmentPlanItems\"", ddl);

        // Verify unique index
        Assert.Contains("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_CriterionRatings_ReviewId_EmployeeId_CriterionId\"", ddl);

        // Verify migration history entry
        Assert.Contains("20261030052606_AddPerformanceEvaluation", ddl);
    }

    [Fact]
    public async System.Threading.Tasks.Task AppDbContext_PerformanceEvaluationEntities_CanPersistAndQuery()
    {
        using var db = CreateInMemoryDbContext();

        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Annual Operations Review",
            Description = "Operations evaluation template",
            TargetRole = "Courier",
            IsActive = true,
            IsAiEnabled = true
        };

        var section = new EvaluationSection
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Operational Excellence",
            Weight = 60.0,
            Order = 1,
            IsKpiSection = false
        };

        var criterion = new EvaluationCriterion
        {
            Id = Guid.NewGuid(),
            SectionId = section.Id,
            Title = "Punctuality & Route Adherence",
            Weight = 50.0,
            CriterionType = CriterionType.Standard,
            Order = 1
        };

        var band = new RatingBand
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Label = "Exceeds Expectations",
            MinScore = 85.0,
            MaxScore = 100.0,
            Color = "#22c55e",
            Order = 1
        };

        var employeeId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Q4 Evaluation - Employee",
            Scope = ReviewScope.Individual,
            Status = ReviewWorkflowStatus.Draft,
            PeriodStart = DateTime.UtcNow.AddMonths(-3),
            PeriodEnd = DateTime.UtcNow,
            EmployeeId = employeeId
        };

        var rating = new CriterionRating
        {
            Id = Guid.NewGuid(),
            ReviewId = review.Id,
            EmployeeId = employeeId,
            CriterionId = criterion.Id,
            SelfScore = 4.5,
            ManagerScore = 4.0,
            SelfComment = "Completed all deliveries on time",
            ManagerComment = "Consistent high performance"
        };

        var aiRec = new AiRecommendation
        {
            Id = Guid.NewGuid(),
            ReviewId = review.Id,
            EmployeeId = employeeId,
            Status = AiRecommendationStatus.Pending,
            Summary = "High operational performer",
            StrengthsJson = "[\"Route efficiency\", \"Safe driving\"]"
        };

        var planItem = new DevelopmentPlanItem
        {
            Id = Guid.NewGuid(),
            ReviewId = review.Id,
            EmployeeId = employeeId,
            Description = "Advanced route optimization training",
            IsCompleted = false
        };

        db.EvaluationTemplates.Add(template);
        db.EvaluationSections.Add(section);
        db.EvaluationCriteria.Add(criterion);
        db.RatingBands.Add(band);
        db.PerformanceReviews.Add(review);
        db.CriterionRatings.Add(rating);
        db.AiRecommendations.Add(aiRec);
        db.DevelopmentPlanItems.Add(planItem);

        await db.SaveChangesAsync();

        var loadedReview = await db.PerformanceReviews
            .Include(r => r.Template)
            .Include(r => r.Ratings)
            .Include(r => r.AiRecommendations)
            .Include(r => r.DevelopmentPlanItems)
            .FirstOrDefaultAsync(r => r.Id == review.Id);

        Assert.NotNull(loadedReview);
        Assert.Equal("Annual Operations Review", loadedReview.Template?.Title);
        Assert.Single(loadedReview.Ratings);
        Assert.Single(loadedReview.AiRecommendations);
        Assert.Single(loadedReview.DevelopmentPlanItems);
        Assert.Equal(4.5, loadedReview.Ratings.First().SelfScore);
    }
}
