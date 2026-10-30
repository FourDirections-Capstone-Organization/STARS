using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.PerformanceEvaluation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Task = System.Threading.Tasks.Task;

namespace Backend.Tests.Analytics;

public class ReviewWorkflowServiceTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static (ReviewWorkflowService service, AppDbContext context, Mock<IPerformanceReviewScoringService> scoringMock) CreateService()
    {
        var context = CreateInMemoryDbContext();
        var scoringMock = new Mock<IPerformanceReviewScoringService>();
        var service = new ReviewWorkflowService(
            context,
            scoringMock.Object,
            NullLogger<ReviewWorkflowService>.Instance);

        return (service, context, scoringMock);
    }

    private static async Task<PerformanceReview> SeedReviewAsync(
        AppDbContext context,
        ReviewWorkflowStatus status = ReviewWorkflowStatus.Draft)
    {
        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Standard Review Template",
            IsActive = true
        };

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            Title = "Q4 Annual Evaluation",
            TemplateId = template.Id,
            Template = template,
            Status = status,
            PeriodStart = DateTime.UtcNow.AddMonths(-3),
            PeriodEnd = DateTime.UtcNow
        };

        await context.EvaluationTemplates.AddAsync(template);
        await context.PerformanceReviews.AddAsync(review);
        await context.SaveChangesAsync();

        return review;
    }

    [Fact]
    public async Task TransitionStatusAsync_IllegalTransition_DraftToFinalized_Returns422()
    {
        // Arrange
        var (service, context, _) = CreateService();
        var review = await SeedReviewAsync(context, ReviewWorkflowStatus.Draft);
        var userId = Guid.NewGuid();

        // Act
        var result = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.Finalized, userId);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal(422, result.StatusCode);
        Assert.Contains("Illegal workflow transition", result.ErrorMessage);
    }

    [Fact]
    public async Task TransitionStatusAsync_IllegalTransition_ManagerReviewToFinalized_Returns422()
    {
        // Arrange
        var (service, context, _) = CreateService();
        var review = await SeedReviewAsync(context, ReviewWorkflowStatus.ManagerReview);
        var userId = Guid.NewGuid();

        // Act
        var result = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.Finalized, userId);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal(422, result.StatusCode);
        Assert.Contains("Illegal workflow transition", result.ErrorMessage);
    }

    [Fact]
    public async Task TransitionStatusAsync_IllegalTransition_FromFinalizedToDraft_Returns422()
    {
        // Arrange
        var (service, context, _) = CreateService();
        var review = await SeedReviewAsync(context, ReviewWorkflowStatus.Finalized);
        var userId = Guid.NewGuid();

        // Act
        var result = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.Draft, userId);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal(422, result.StatusCode);
        Assert.Contains("Illegal workflow transition", result.ErrorMessage);
    }

    [Fact]
    public async Task TransitionStatusAsync_SameStatus_Returns422()
    {
        // Arrange
        var (service, context, _) = CreateService();
        var review = await SeedReviewAsync(context, ReviewWorkflowStatus.SelfAssessment);
        var userId = Guid.NewGuid();

        // Act
        var result = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.SelfAssessment, userId);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal(422, result.StatusCode);
        Assert.Contains("already in 'SelfAssessment' status", result.ErrorMessage);
    }

    [Fact]
    public async Task TransitionStatusAsync_ReviewNotFound_Returns404()
    {
        // Arrange
        var (service, _, _) = CreateService();
        var nonExistentId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        // Act
        var result = await service.TransitionStatusAsync(nonExistentId, ReviewWorkflowStatus.SelfAssessment, userId);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal(404, result.StatusCode);
        Assert.Contains("not found", result.ErrorMessage);
    }

    [Fact]
    public async Task TransitionStatusAsync_ValidTransitions_LinearFlow_Succeeds()
    {
        // Arrange
        var (service, context, _) = CreateService();
        var review = await SeedReviewAsync(context, ReviewWorkflowStatus.Draft);
        var userId = Guid.NewGuid();

        // Act & Assert 1: Draft -> SelfAssessment
        var r1 = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.SelfAssessment, userId);
        Assert.True(r1.IsSuccess);
        Assert.Equal(200, r1.StatusCode);
        Assert.Equal(ReviewWorkflowStatus.SelfAssessment, r1.Review!.Status);

        // Act & Assert 2: SelfAssessment -> ManagerReview
        var r2 = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.ManagerReview, userId);
        Assert.True(r2.IsSuccess);
        Assert.Equal(200, r2.StatusCode);
        Assert.Equal(ReviewWorkflowStatus.ManagerReview, r2.Review!.Status);

        // Act & Assert 3: ManagerReview -> HrReview
        var r3 = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.HrReview, userId);
        Assert.True(r3.IsSuccess);
        Assert.Equal(200, r3.StatusCode);
        Assert.Equal(ReviewWorkflowStatus.HrReview, r3.Review!.Status);

        // Act & Assert 4: HrReview -> Acknowledgment
        var r4 = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.Acknowledgment, userId);
        Assert.True(r4.IsSuccess);
        Assert.Equal(200, r4.StatusCode);
        Assert.Equal(ReviewWorkflowStatus.Acknowledgment, r4.Review!.Status);
    }

    [Fact]
    public async Task TransitionStatusAsync_ValidBackwardTransitions_Succeed()
    {
        // Arrange
        var (service, context, _) = CreateService();
        var review = await SeedReviewAsync(context, ReviewWorkflowStatus.ManagerReview);
        var userId = Guid.NewGuid();

        // Act: ManagerReview -> SelfAssessment (recall)
        var result = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.SelfAssessment, userId);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(ReviewWorkflowStatus.SelfAssessment, result.Review!.Status);

        // Act: SelfAssessment -> Draft (retract)
        var result2 = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.Draft, userId);
        Assert.True(result2.IsSuccess);
        Assert.Equal(ReviewWorkflowStatus.Draft, result2.Review!.Status);
    }

    [Fact]
    public async Task TransitionStatusAsync_Finalize_FreezesScoresAndWritesNonNullJson()
    {
        // Arrange
        var (service, context, scoringMock) = CreateService();
        var review = await SeedReviewAsync(context, ReviewWorkflowStatus.Acknowledgment);
        var userId = Guid.NewGuid();
        const string mockFrozenJson = "{\"OverallScore\":87.5,\"RatingLabel\":\"Exceeds Expectations\",\"Employees\":[]}";

        scoringMock
            .Setup(s => s.FreezeReviewScoresAsync(review.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(mockFrozenJson);

        // Act
        var result = await service.TransitionStatusAsync(review.Id, ReviewWorkflowStatus.Finalized, userId);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(200, result.StatusCode);
        Assert.NotNull(result.Review);
        Assert.Equal(ReviewWorkflowStatus.Finalized, result.Review.Status);
        Assert.NotNull(result.Review.FinalizedAt);
        Assert.Equal(userId, result.Review.FinalizedById);
        Assert.False(string.IsNullOrWhiteSpace(result.Review.FrozenScoresJson));
        Assert.Equal(mockFrozenJson, result.Review.FrozenScoresJson);
        Assert.Equal(mockFrozenJson, result.FrozenScoresJson);

        // Verify scoring service was invoked exactly once
        scoringMock.Verify(s => s.FreezeReviewScoresAsync(review.Id, It.IsAny<CancellationToken>()), Times.Once);

        // Verify persisted state in DbContext
        var persisted = await context.PerformanceReviews.FindAsync(review.Id);
        Assert.NotNull(persisted);
        Assert.Equal(ReviewWorkflowStatus.Finalized, persisted.Status);
        Assert.Equal(mockFrozenJson, persisted.FrozenScoresJson);
    }

    [Theory]
    [InlineData(ReviewWorkflowStatus.Draft, ReviewWorkflowStatus.SelfAssessment, true)]
    [InlineData(ReviewWorkflowStatus.Draft, ReviewWorkflowStatus.Finalized, false)]
    [InlineData(ReviewWorkflowStatus.Draft, ReviewWorkflowStatus.ManagerReview, false)]
    [InlineData(ReviewWorkflowStatus.SelfAssessment, ReviewWorkflowStatus.ManagerReview, true)]
    [InlineData(ReviewWorkflowStatus.SelfAssessment, ReviewWorkflowStatus.Draft, true)]
    [InlineData(ReviewWorkflowStatus.SelfAssessment, ReviewWorkflowStatus.Finalized, false)]
    [InlineData(ReviewWorkflowStatus.ManagerReview, ReviewWorkflowStatus.HrReview, true)]
    [InlineData(ReviewWorkflowStatus.ManagerReview, ReviewWorkflowStatus.Finalized, false)]
    [InlineData(ReviewWorkflowStatus.HrReview, ReviewWorkflowStatus.Acknowledgment, true)]
    [InlineData(ReviewWorkflowStatus.HrReview, ReviewWorkflowStatus.ManagerReview, true)]
    [InlineData(ReviewWorkflowStatus.Acknowledgment, ReviewWorkflowStatus.Finalized, true)]
    [InlineData(ReviewWorkflowStatus.Acknowledgment, ReviewWorkflowStatus.HrReview, true)]
    [InlineData(ReviewWorkflowStatus.Finalized, ReviewWorkflowStatus.Draft, false)]
    [InlineData(ReviewWorkflowStatus.Finalized, ReviewWorkflowStatus.Acknowledgment, false)]
    public void CanTransition_ValidatesAllowedTransitions_Correctly(
        ReviewWorkflowStatus current, ReviewWorkflowStatus target, bool expected)
    {
        var (service, _, _) = CreateService();
        var allowed = service.CanTransition(current, target);
        Assert.Equal(expected, allowed);
    }

    [Fact]
    public void GetAllowedNextStatuses_FinalizedHasNoNextStatuses()
    {
        var (service, _, _) = CreateService();
        var nextStatuses = service.GetAllowedNextStatuses(ReviewWorkflowStatus.Finalized);
        Assert.Empty(nextStatuses);
    }
}
