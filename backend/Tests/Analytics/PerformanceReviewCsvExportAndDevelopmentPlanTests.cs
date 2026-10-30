using System.Globalization;
using System.Security.Claims;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using Backend.Modules.PerformanceEvaluation;
using Task = System.Threading.Tasks.Task;

namespace Backend.Tests.Analytics;

public class PerformanceReviewCsvExportAndDevelopmentPlanTests
{
    #region Test Fixture Helpers

    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static (PerformanceEvaluationController controller, AppDbContext context, IPerformanceReviewCsvExportService csvService) CreateController(
        UserRole callerRole = UserRole.Manager,
        Guid? currentUserId = null,
        AppDbContext? existingContext = null)
    {
        var userId = currentUserId ?? Guid.NewGuid();
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Role, callerRole.ToString())
        };

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        var context = existingContext ?? CreateInMemoryDbContext();

        var kpiMock = new Mock<IKpiCalculationEngine>();
        kpiMock.Setup(k => k.CalculateEmployeeKpiAsync(
                It.IsAny<Guid>(), It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EmployeeKpiEvaluationResultDTO
            {
                OverallScore = 85.0,
                OverallRating = "Green"
            });

        var scoringService = new PerformanceReviewScoringService(
            context,
            kpiMock.Object,
            NullLogger<PerformanceReviewScoringService>.Instance);

        var workflowService = new ReviewWorkflowService(
            context,
            scoringService,
            NullLogger<ReviewWorkflowService>.Instance);

        var templateService = new EvaluationTemplateService(
            context,
            NullLogger<EvaluationTemplateService>.Instance);

        var csvExportService = new PerformanceReviewCsvExportService(scoringService);

        var controller = new PerformanceEvaluationController(
            templateService,
            workflowService,
            scoringService,
            context,
            NullLogger<PerformanceEvaluationController>.Instance,
            null,
            csvExportService)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = principal }
            }
        };

        return (controller, context, csvExportService);
    }

    private static (EvaluationTemplate template, User emp1, User emp2, PerformanceReview review) SeedSampleReview(
        AppDbContext context,
        ReviewScope scope = ReviewScope.Individual,
        ReviewWorkflowStatus status = ReviewWorkflowStatus.ManagerReview)
    {
        var dept = new Department { Id = Guid.NewGuid(), Name = "Logistics Operations" };
        context.Departments.Add(dept);

        var emp1 = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Alice",
            LastName = "Walker",
            EmployeeNumber = "EMP-001",
            Email = "alice@example.com",
            DepartmentId = dept.Id,
            Role = UserRole.Courier
        };

        var emp2 = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Bob",
            LastName = "Smith",
            EmployeeNumber = "EMP-002",
            Email = "bob@example.com",
            DepartmentId = dept.Id,
            Role = UserRole.Encoder
        };

        context.Users.AddRange(emp1, emp2);

        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Standard Logistics Review Template",
            IsActive = true,
            Sections = new List<EvaluationSection>
            {
                new EvaluationSection
                {
                    Id = Guid.NewGuid(),
                    Title = "Core Competencies",
                    Weight = 100.0,
                    Order = 1,
                    Criteria = new List<EvaluationCriterion>
                    {
                        new EvaluationCriterion
                        {
                            Id = Guid.NewGuid(),
                            Title = "Punctuality",
                            Weight = 50.0,
                            Order = 1,
                            CriterionType = CriterionType.Standard
                        },
                        new EvaluationCriterion
                        {
                            Id = Guid.NewGuid(),
                            Title = "Safety Protocol",
                            Weight = 50.0,
                            Order = 2,
                            CriterionType = CriterionType.Standard
                        }
                    }
                }
            },
            RatingBands = new List<RatingBand>
            {
                new RatingBand { Id = Guid.NewGuid(), Label = "Outstanding", MinScore = 90.0, MaxScore = 100.0, Order = 1 },
                new RatingBand { Id = Guid.NewGuid(), Label = "Meets Expectations", MinScore = 70.0, MaxScore = 89.99, Order = 2 },
                new RatingBand { Id = Guid.NewGuid(), Label = "Needs Improvement", MinScore = 0.0, MaxScore = 69.99, Order = 3 }
            }
        };

        context.EvaluationTemplates.Add(template);

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Q4 Annual Evaluation",
            Scope = scope,
            Status = status,
            EmployeeId = scope == ReviewScope.Individual ? emp1.Id : null,
            DepartmentId = dept.Id,
            PeriodStart = new DateTime(2026, 1, 1),
            PeriodEnd = new DateTime(2026, 3, 31)
        };

        context.PerformanceReviews.Add(review);

        var crit1 = template.Sections.First().Criteria.First();
        var crit2 = template.Sections.First().Criteria.Last();

        context.CriterionRatings.AddRange(
            new CriterionRating
            {
                Id = Guid.NewGuid(),
                ReviewId = review.Id,
                EmployeeId = emp1.Id,
                CriterionId = crit1.Id,
                SelfScore = 4.0,
                ManagerScore = 5.0,
                ManagerComment = "Excellent punctuality"
            },
            new CriterionRating
            {
                Id = Guid.NewGuid(),
                ReviewId = review.Id,
                EmployeeId = emp1.Id,
                CriterionId = crit2.Id,
                SelfScore = 5.0,
                ManagerScore = 3.0, // Gap = 2.0 -> Outlier!
                ManagerComment = "Needs more focus on PPE safety"
            }
        );

        if (scope == ReviewScope.Team)
        {
            context.CriterionRatings.AddRange(
                new CriterionRating
                {
                    Id = Guid.NewGuid(),
                    ReviewId = review.Id,
                    EmployeeId = emp2.Id,
                    CriterionId = crit1.Id,
                    SelfScore = 3.0,
                    ManagerScore = 3.0,
                    ManagerComment = "Consistent attendance"
                },
                new CriterionRating
                {
                    Id = Guid.NewGuid(),
                    ReviewId = review.Id,
                    EmployeeId = emp2.Id,
                    CriterionId = crit2.Id,
                    SelfScore = 4.0,
                    ManagerScore = 4.0,
                    ManagerComment = "Good compliance"
                }
            );
        }

        context.SaveChanges();
        return (template, emp1, emp2, review);
    }

    #endregion

    #region CSV Injection Guard & RFC 4180 Unit Tests

    [Theory]
    [InlineData("=SUM(1,2)", "'=SUM(1,2)")]
    [InlineData("+123456", "'+123456")]
    [InlineData("-cmd|' /C calc'!A0", "'-cmd|' /C calc'!A0")]
    [InlineData("@malicious_cmd", "'@malicious_cmd")]
    [InlineData("  =SUM(1,2)", "'  =SUM(1,2)")]
    [InlineData("'already_prefixed", "'already_prefixed")]
    [InlineData("Normal Text", "Normal Text")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void SanitizeCellValue_EnforcesFormulaInjectionGuard(string? input, string expected)
    {
        // Arrange
        var mockScoring = new Mock<IPerformanceReviewScoringService>();
        var service = new PerformanceReviewCsvExportService(mockScoring.Object);

        // Act
        var result = service.SanitizeCellValue(input);

        // Assert
        result.Should().Be(expected);
    }

    [Theory]
    [InlineData("StandardText", "StandardText")]
    [InlineData("Doe, John", "\"Doe, John\"")]
    [InlineData("He said \"Hello\"", "\"He said \"\"Hello\"\"\"")]
    [InlineData("Line1\r\nLine2", "\"Line1\r\nLine2\"")]
    [InlineData("Line1\nLine2", "\"Line1\nLine2\"")]
    [InlineData("Quote, with comma and \"quotes\"", "\"Quote, with comma and \"\"quotes\"\"\"")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void EscapeCsvField_EnforcesRfc4180Quoting(string? input, string expected)
    {
        // Arrange
        var mockScoring = new Mock<IPerformanceReviewScoringService>();
        var service = new PerformanceReviewCsvExportService(mockScoring.Object);

        // Act
        var result = service.EscapeCsvField(input);

        // Assert
        result.Should().Be(expected);
    }

    [Fact]
    public void GenerateCsv_IncludesRequiredColumns_AndExcludesAiText()
    {
        // Arrange
        var mockScoring = new Mock<IPerformanceReviewScoringService>();
        var service = new PerformanceReviewCsvExportService(mockScoring.Object);

        var reviewResult = new ReviewResultDTO
        {
            ReviewId = Guid.NewGuid(),
            Title = "Test Review",
            Employees = new List<EmployeeReviewScoreDTO>
            {
                new EmployeeReviewScoreDTO
                {
                    EmployeeId = Guid.NewGuid(),
                    EmployeeName = "Alice Walker",
                    EmployeeNumber = "EMP-001",
                    DepartmentName = "Operations",
                    JobPositionTitle = "Courier",
                    FinalScore = 80.0,
                    RatingLabel = "Meets Expectations",
                    Sections = new List<SectionScoreDTO>
                    {
                        new SectionScoreDTO
                        {
                            SectionTitle = "Performance",
                            Criteria = new List<CriterionScoreDTO>
                            {
                                new CriterionScoreDTO
                                {
                                    CriterionTitle = "Punctuality",
                                    SelfScore = 4.0,
                                    ManagerScore = 5.0,
                                    Gap = -1.0,
                                    IsOutlier = false,
                                    ManagerComment = "Good work"
                                }
                            }
                        }
                    }
                }
            }
        };

        // Act
        var csv = service.GenerateCsv(reviewResult);

        // Assert
        var expectedHeader = "Employee,EmployeeNumber,Department,JobPosition,Section,Criterion,SelfScore,ManagerScore,Gap,IsOutlier,ManagerComment,WeightedFinalScore,RatingLabel";
        csv.Should().StartWith(expectedHeader);

        // Required columns present
        csv.Should().Contain("Alice Walker");
        csv.Should().Contain("EMP-001");
        csv.Should().Contain("Operations");
        csv.Should().Contain("Courier");
        csv.Should().Contain("Performance");
        csv.Should().Contain("Punctuality");
        csv.Should().Contain("Good work");
        csv.Should().Contain("Meets Expectations");

        // AI fields strictly excluded
        csv.Should().NotContain("AiRecommendation");
        csv.Should().NotContain("StrengthsJson");
        csv.Should().NotContain("ImprovementAreasJson");
        csv.Should().NotContain("ActionItemsJson");
    }

    [Fact]
    public void GenerateCsv_WithFormulaInManagerComment_GuardsAndQuotesCorrectly()
    {
        // Arrange
        var mockScoring = new Mock<IPerformanceReviewScoringService>();
        var service = new PerformanceReviewCsvExportService(mockScoring.Object);

        var reviewResult = new ReviewResultDTO
        {
            ReviewId = Guid.NewGuid(),
            Title = "Security Review",
            Employees = new List<EmployeeReviewScoreDTO>
            {
                new EmployeeReviewScoreDTO
                {
                    EmployeeId = Guid.NewGuid(),
                    EmployeeName = "Charlie Root",
                    Sections = new List<SectionScoreDTO>
                    {
                        new SectionScoreDTO
                        {
                            SectionTitle = "Skills",
                            Criteria = new List<CriterionScoreDTO>
                            {
                                new CriterionScoreDTO
                                {
                                    CriterionTitle = "Formula Test",
                                    ManagerComment = "=SUM(1,2)"
                                }
                            }
                        }
                    }
                }
            }
        };

        // Act
        var csv = service.GenerateCsv(reviewResult);

        // Assert - Injection guard prefixes with ' and RFC-4180 wraps in quotes because of comma
        csv.Should().Contain("\"'=SUM(1,2)\"");
    }

    [Fact]
    public void ExportReviewToCsv_IncludesUtf8Bom()
    {
        // Arrange
        var mockScoring = new Mock<IPerformanceReviewScoringService>();
        var service = new PerformanceReviewCsvExportService(mockScoring.Object);
        var reviewResult = new ReviewResultDTO { Employees = new() };

        // Act
        var bytes = service.ExportReviewToCsv(reviewResult);

        // Assert
        var bom = Encoding.UTF8.GetPreamble();
        bytes.Take(bom.Length).Should().Equal(bom);
    }

    #endregion

    #region Live vs Frozen CSV Export Tests

    [Fact]
    public async Task ExportReviewCsv_LiveVsFrozenValues_FinalizedReturnsFrozenSnapshot()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var (_, emp1, _, review) = SeedSampleReview(context, ReviewScope.Individual, ReviewWorkflowStatus.ManagerReview);

        var (controller, _, csvService) = CreateController(UserRole.Manager, Guid.NewGuid(), context);
        var scoringService = new PerformanceReviewScoringService(context, Mock.Of<IKpiCalculationEngine>(), NullLogger<PerformanceReviewScoringService>.Instance);

        // 1. Calculate live score & export CSV while in ManagerReview
        var liveActionResult = await controller.ExportReviewCsv(review.Id);
        liveActionResult.Should().BeOfType<FileContentResult>();
        var liveFile = (FileContentResult)liveActionResult;
        var liveCsv = Encoding.UTF8.GetString(liveFile.FileContents);

        // Manager score was 5.0 and 3.0 -> Final score = 80.0 ("Meets Expectations")
        liveCsv.Should().Contain("80");
        liveCsv.Should().Contain("Meets Expectations");

        // 2. Transition and Finalize the review (freezes scores)
        review.Status = ReviewWorkflowStatus.Finalized;
        var frozenDto = new ReviewResultDTO
        {
            ReviewId = review.Id,
            OverallScore = 99.9,
            OverallRating = "FrozenSpecial",
            IsFinalized = true,
            Employees = new List<EmployeeReviewScoreDTO>
            {
                new EmployeeReviewScoreDTO
                {
                    EmployeeId = emp1.Id,
                    EmployeeName = "Alice Walker",
                    FinalScore = 99.9,
                    RatingLabel = "FrozenSpecial",
                    Sections = new List<SectionScoreDTO>
                    {
                        new SectionScoreDTO
                        {
                            SectionTitle = "FrozenSection",
                            Criteria = new List<CriterionScoreDTO>
                            {
                                new CriterionScoreDTO
                                {
                                    CriterionTitle = "FrozenCriterion",
                                    ManagerScore = 5.0,
                                    ManagerComment = "Frozen Comment",
                                    Gap = 0.0,
                                    IsOutlier = false
                                }
                            }
                        }
                    }
                }
            }
        };
        review.FrozenScoresJson = scoringService.SerializeScores(frozenDto);
        await context.SaveChangesAsync();

        // 3. Mutate underlying criterion ratings in DB after finalization
        var ratings = await context.CriterionRatings.Where(r => r.ReviewId == review.Id).ToListAsync();
        foreach (var r in ratings)
        {
            r.ManagerScore = 1.0;
            r.ManagerComment = "TAMPERED_AFTER_FINALIZATION";
        }
        await context.SaveChangesAsync();

        // 4. Export CSV again after finalization
        var frozenActionResult = await controller.ExportReviewCsv(review.Id);
        frozenActionResult.Should().BeOfType<FileContentResult>();
        var frozenFile = (FileContentResult)frozenActionResult;
        var frozenCsv = Encoding.UTF8.GetString(frozenFile.FileContents);

        // Assert: CSV reflects immutable frozen snapshot, NOT the tampered ratings
        frozenCsv.Should().Contain("FrozenSpecial");
        frozenCsv.Should().Contain("FrozenSection");
        frozenCsv.Should().Contain("FrozenCriterion");
        frozenCsv.Should().Contain("Frozen Comment");
        frozenCsv.Should().NotContain("TAMPERED_AFTER_FINALIZATION");
    }

    #endregion

    #region Development Plan Endpoint Tests & Security Guards

    [Fact]
    public async Task CreateDevelopmentPlan_BlockedWhenAiRecommendationPending_Returns422()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var (_, emp1, _, review) = SeedSampleReview(context);

        // Add an AI Recommendation with Status = Pending
        context.AiRecommendations.Add(new AiRecommendation
        {
            Id = Guid.NewGuid(),
            ReviewId = review.Id,
            EmployeeId = emp1.Id,
            Status = AiRecommendationStatus.Pending,
            Summary = "Pending AI draft"
        });
        await context.SaveChangesAsync();

        var (controller, _, _) = CreateController(UserRole.Manager, Guid.NewGuid(), context);

        var request = new CreateDevelopmentPlanRequestDTO
        {
            Description = "Enroll in safety workshop",
            Timeframe = "2 weeks"
        };

        // Act
        var result = await controller.CreateDevelopmentPlan(review.Id, emp1.Id, request);

        // Assert
        result.Should().BeOfType<ObjectResult>();
        var objectResult = (ObjectResult)result;
        objectResult.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);

        // Verify zero items created in DB
        var itemsInDb = await context.DevelopmentPlanItems.CountAsync();
        itemsInDb.Should().Be(0);
    }

    [Theory]
    [InlineData(AiRecommendationStatus.Approved)]
    [InlineData(AiRecommendationStatus.Rejected)]
    [InlineData(AiRecommendationStatus.ManualOverride)]
    public async Task CreateDevelopmentPlan_AllowedWhenAiRecommendationNotPending_Returns201(AiRecommendationStatus status)
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var (_, emp1, _, review) = SeedSampleReview(context);

        context.AiRecommendations.Add(new AiRecommendation
        {
            Id = Guid.NewGuid(),
            ReviewId = review.Id,
            EmployeeId = emp1.Id,
            Status = status,
            Summary = "Resolved AI recommendation"
        });
        await context.SaveChangesAsync();

        var (controller, _, _) = CreateController(UserRole.Manager, Guid.NewGuid(), context);

        var request = new CreateDevelopmentPlanRequestDTO
        {
            Description = "Shadow senior courier on safety protocol",
            SuccessMeasure = "Zero PPE infractions over 30 days",
            Timeframe = "1 month"
        };

        // Act
        var result = await controller.CreateDevelopmentPlan(review.Id, emp1.Id, request);

        // Assert
        result.Should().BeOfType<ObjectResult>();
        var objectResult = (ObjectResult)result;
        objectResult.StatusCode.Should().Be(StatusCodes.Status201Created);

        var items = await context.DevelopmentPlanItems.Where(i => i.ReviewId == review.Id).ToListAsync();
        items.Should().HaveCount(1);
        items[0].Description.Should().Be("Shadow senior courier on safety protocol");
        items[0].IsCompleted.Should().BeFalse();
    }

    [Fact]
    public async Task CreateDevelopmentPlan_WithoutPriorAiRecommendation_Returns201()
    {
        // Arrange - No AI recommendation exists
        var context = CreateInMemoryDbContext();
        var (_, emp1, _, review) = SeedSampleReview(context);

        var (controller, _, _) = CreateController(UserRole.Manager, Guid.NewGuid(), context);

        var request = new CreateDevelopmentPlanRequestDTO
        {
            Items = new List<CreateDevelopmentPlanItemDTO>
            {
                new() { Description = "Item 1", Timeframe = "Q1" },
                new() { Description = "Item 2", Timeframe = "Q2" }
            }
        };

        // Act
        var result = await controller.CreateDevelopmentPlan(review.Id, emp1.Id, request);

        // Assert
        result.Should().BeOfType<ObjectResult>();
        var objectResult = (ObjectResult)result;
        objectResult.StatusCode.Should().Be(StatusCodes.Status201Created);

        var items = await context.DevelopmentPlanItems.Where(i => i.ReviewId == review.Id).ToListAsync();
        items.Should().HaveCount(2);
    }

    [Fact]
    public async Task CreateDevelopmentPlan_NonManagerAttempt_Returns403Forbidden()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var (_, emp1, _, review) = SeedSampleReview(context);

        var (controller, _, _) = CreateController(UserRole.Courier, emp1.Id, context);

        var request = new CreateDevelopmentPlanRequestDTO
        {
            Description = "Self-prescribed goal"
        };

        // Act
        var result = await controller.CreateDevelopmentPlan(review.Id, emp1.Id, request);

        // Assert
        result.Should().BeOfType<ObjectResult>();
        var objectResult = (ObjectResult)result;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task UpdateDevelopmentPlanItem_EmployeeCompletesOwnItem_Succeeds()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var (_, emp1, _, review) = SeedSampleReview(context);

        var planItem = new DevelopmentPlanItem
        {
            Id = Guid.NewGuid(),
            ReviewId = review.Id,
            EmployeeId = emp1.Id,
            Description = "Complete hazardous material handling module",
            IsCompleted = false
        };
        context.DevelopmentPlanItems.Add(planItem);
        await context.SaveChangesAsync();

        // Employee 1 updates their own plan item
        var (controller, _, _) = CreateController(UserRole.Courier, emp1.Id, context);

        var updateRequest = new UpdateDevelopmentPlanItemDTO
        {
            IsCompleted = true,
            EmployeeNotes = "Finished course and certificate uploaded"
        };

        // Act
        var result = await controller.UpdateDevelopmentPlanItem(planItem.Id, updateRequest);

        // Assert
        result.Should().BeOfType<OkObjectResult>();
        var savedItem = await context.DevelopmentPlanItems.FindAsync(planItem.Id);
        savedItem!.IsCompleted.Should().BeTrue();
        savedItem.CompletedAt.Should().NotBeNull();
        savedItem.CompletedById.Should().Be(emp1.Id);
        savedItem.EmployeeNotes.Should().Be("Finished course and certificate uploaded");
    }

    [Fact]
    public async Task UpdateDevelopmentPlanItem_CrossEmployeeAttempt_Returns403Forbidden()
    {
        // Arrange - Plan item belongs to Employee 1
        var context = CreateInMemoryDbContext();
        var (_, emp1, emp2, review) = SeedSampleReview(context);

        var planItem = new DevelopmentPlanItem
        {
            Id = Guid.NewGuid(),
            ReviewId = review.Id,
            EmployeeId = emp1.Id,
            Description = "Item belonging to Employee 1",
            IsCompleted = false
        };
        context.DevelopmentPlanItems.Add(planItem);
        await context.SaveChangesAsync();

        // Employee 2 attempts to complete or update Employee 1's item
        var (controller, _, _) = CreateController(UserRole.Courier, emp2.Id, context);

        var updateRequest = new UpdateDevelopmentPlanItemDTO
        {
            IsCompleted = true,
            EmployeeNotes = "Attempted cross-employee update"
        };

        // Act
        var result = await controller.UpdateDevelopmentPlanItem(planItem.Id, updateRequest);

        // Assert
        result.Should().BeOfType<ObjectResult>();
        var objectResult = (ObjectResult)result;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);

        // Ensure database state was untouched
        var savedItem = await context.DevelopmentPlanItems.FindAsync(planItem.Id);
        savedItem!.IsCompleted.Should().BeFalse();
        savedItem.EmployeeNotes.Should().BeNull();
    }

    [Fact]
    public async Task GetReviewDevelopmentPlan_CrossEmployeeAttempt_Returns403Forbidden()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var (_, emp1, emp2, review) = SeedSampleReview(context);

        // Employee 2 attempts to get Employee 1's review development plan
        var (controller, _, _) = CreateController(UserRole.Courier, emp2.Id, context);

        // Act
        var result = await controller.GetReviewDevelopmentPlan(review.Id, emp1.Id);

        // Assert
        result.Should().BeOfType<ObjectResult>();
        var objectResult = (ObjectResult)result;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task GetEmployeeDevelopmentPlans_CrossEmployeeAttempt_Returns403Forbidden()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var (_, emp1, emp2, _) = SeedSampleReview(context);

        // Employee 2 attempts to get Employee 1's general development plans
        var (controller, _, _) = CreateController(UserRole.Courier, emp2.Id, context);

        // Act
        var result = await controller.GetEmployeeDevelopmentPlans(emp1.Id, null, null);

        // Assert
        result.Should().BeOfType<ObjectResult>();
        var objectResult = (ObjectResult)result;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task GetEmployeeDevelopmentPlans_OwnEmployeeAndManager_Succeeds()
    {
        // Arrange
        var context = CreateInMemoryDbContext();
        var (_, emp1, _, review) = SeedSampleReview(context);

        context.DevelopmentPlanItems.AddRange(
            new DevelopmentPlanItem
            {
                Id = Guid.NewGuid(),
                ReviewId = review.Id,
                EmployeeId = emp1.Id,
                Description = "Open item",
                IsCompleted = false
            },
            new DevelopmentPlanItem
            {
                Id = Guid.NewGuid(),
                ReviewId = review.Id,
                EmployeeId = emp1.Id,
                Description = "Done item",
                IsCompleted = true
            }
        );
        await context.SaveChangesAsync();

        // 1. Employee 1 views own items
        var (empController, _, _) = CreateController(UserRole.Courier, emp1.Id, context);
        var empResult = await empController.GetEmployeeDevelopmentPlans(emp1.Id, isCompleted: false, null);
        empResult.Should().BeOfType<OkObjectResult>();
        var empDto = ((OkObjectResult)empResult).Value as ApiResponseDTO<List<DevelopmentPlanItemDTO>>;
        empDto!.Data.Should().HaveCount(1);
        empDto.Data![0].Description.Should().Be("Open item");

        // 2. Manager views Employee 1 items
        var (mgrController, _, _) = CreateController(UserRole.Manager, Guid.NewGuid(), context);
        var mgrResult = await mgrController.GetEmployeeDevelopmentPlans(emp1.Id, null, null);
        mgrResult.Should().BeOfType<OkObjectResult>();
        var mgrDto = ((OkObjectResult)mgrResult).Value as ApiResponseDTO<List<DevelopmentPlanItemDTO>>;
        mgrDto!.Data.Should().HaveCount(2);
    }

    #endregion

    #region CSV Export Controller Permissions Tests

    [Fact]
    public async Task ExportReviewCsv_IndividualReview_CrossEmployeeAttempt_Returns403Forbidden()
    {
        // Arrange - Review belongs to Employee 1
        var context = CreateInMemoryDbContext();
        var (_, emp1, emp2, review) = SeedSampleReview(context, ReviewScope.Individual);

        // Employee 2 attempts to export Employee 1's review
        var (controller, _, _) = CreateController(UserRole.Courier, emp2.Id, context);

        // Act
        var result = await controller.ExportReviewCsv(review.Id);

        // Assert
        result.Should().BeOfType<ObjectResult>();
        var objectResult = (ObjectResult)result;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task ExportReviewCsv_IndividualReview_OwnEmployee_Succeeds()
    {
        // Arrange - Review belongs to Employee 1
        var context = CreateInMemoryDbContext();
        var (_, emp1, _, review) = SeedSampleReview(context, ReviewScope.Individual);

        // Employee 1 exports own review
        var (controller, _, _) = CreateController(UserRole.Courier, emp1.Id, context);

        // Act
        var result = await controller.ExportReviewCsv(review.Id);

        // Assert
        result.Should().BeOfType<FileContentResult>();
        var fileResult = (FileContentResult)result;
        fileResult.ContentType.Should().Be("text/csv; charset=utf-8");

        var csv = Encoding.UTF8.GetString(fileResult.FileContents);
        csv.Should().Contain("Alice Walker");
    }

    [Fact]
    public async Task ExportReviewCsv_TeamReview_ScopesToOwnRecordsForNonManager()
    {
        // Arrange - Team review includes Employee 1 and Employee 2
        var context = CreateInMemoryDbContext();
        var (_, emp1, emp2, review) = SeedSampleReview(context, ReviewScope.Team);

        // 1. Employee 1 exports team review
        var (empController, _, _) = CreateController(UserRole.Courier, emp1.Id, context);
        var empResult = await empController.ExportReviewCsv(review.Id);
        empResult.Should().BeOfType<FileContentResult>();
        var empFile = (FileContentResult)empResult;
        var empCsv = Encoding.UTF8.GetString(empFile.FileContents);

        // Must contain Employee 1, but NOT Employee 2
        empCsv.Should().Contain("Alice Walker");
        empCsv.Should().NotContain("Bob Smith");

        // 2. Manager exports team review
        var (mgrController, _, _) = CreateController(UserRole.Manager, Guid.NewGuid(), context);
        var mgrResult = await mgrController.ExportReviewCsv(review.Id);
        mgrResult.Should().BeOfType<FileContentResult>();
        var mgrFile = (FileContentResult)mgrResult;
        var mgrCsv = Encoding.UTF8.GetString(mgrFile.FileContents);

        // Must contain both employees
        mgrCsv.Should().Contain("Alice Walker");
        mgrCsv.Should().Contain("Bob Smith");
    }

    #endregion
}
