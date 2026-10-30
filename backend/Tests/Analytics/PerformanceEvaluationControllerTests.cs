using System.Security.Claims;
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

public class PerformanceEvaluationControllerTests
{
    private static (PerformanceEvaluationController controller, AppDbContext context) CreateController(
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

        var context = existingContext ?? new AppDbContext(
            new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options);

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

        var controller = new PerformanceEvaluationController(
            templateService,
            workflowService,
            scoringService,
            context,
            NullLogger<PerformanceEvaluationController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = principal }
            }
        };

        return (controller, context);
    }

    private static EvaluationTemplate CreateValidTemplate(string title = "Annual Logistics Review")
    {
        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = title,
            Description = "Standard operational and performance review template",
            IsActive = true,
            IsAiEnabled = true
        };

        var sec1 = new EvaluationSection
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Core Competencies",
            Weight = 60.0,
            Order = 1
        };
        sec1.Criteria.Add(new EvaluationCriterion
        {
            Id = Guid.NewGuid(),
            SectionId = sec1.Id,
            Title = "Accuracy & Detail",
            Weight = 50.0,
            Order = 1
        });
        sec1.Criteria.Add(new EvaluationCriterion
        {
            Id = Guid.NewGuid(),
            SectionId = sec1.Id,
            Title = "Delivery Punctuality",
            Weight = 50.0,
            Order = 2
        });

        var sec2 = new EvaluationSection
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Operational KPIs",
            Weight = 40.0,
            Order = 2,
            IsKpiSection = true
        };

        template.Sections.Add(sec1);
        template.Sections.Add(sec2);

        template.RatingBands.Add(new RatingBand
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Label = "Needs Improvement",
            MinScore = 0.0,
            MaxScore = 59.99,
            Order = 1
        });
        template.RatingBands.Add(new RatingBand
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Label = "Meets Expectations",
            MinScore = 60.0,
            MaxScore = 84.99,
            Order = 2
        });
        template.RatingBands.Add(new RatingBand
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Label = "Exceeds Expectations",
            MinScore = 85.0,
            MaxScore = 100.0,
            Order = 3
        });

        return template;
    }

    #region CRUD Round-Trip Tests

    [Fact]
    public async Task CreateTemplate_ValidPayload_Returns201Created()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate("Engineering Excellence Template");

        var actionResult = await controller.CreateTemplate(template);

        var createdResult = actionResult.Should().BeOfType<CreatedAtActionResult>().Subject;
        createdResult.StatusCode.Should().Be(StatusCodes.Status201Created);

        var response = createdResult.Value.Should().BeOfType<ApiResponseDTO<EvaluationTemplate>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.Title.Should().Be("Engineering Excellence Template");

        // Verify persisted in DB
        var persisted = await context.EvaluationTemplates.FindAsync(template.Id);
        persisted.Should().NotBeNull();
    }

    [Fact]
    public async Task GetTemplateById_ExistingTemplate_Returns200Ok()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate("Ops Template");
        context.EvaluationTemplates.Add(template);
        await context.SaveChangesAsync();

        var actionResult = await controller.GetTemplateById(template.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        okResult.StatusCode.Should().Be(StatusCodes.Status200OK);

        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EvaluationTemplate>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.Id.Should().Be(template.Id);
    }

    [Fact]
    public async Task GetAllTemplates_ReturnsAllTemplates()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var t1 = CreateValidTemplate("Template A");
        var t2 = CreateValidTemplate("Template B");
        context.EvaluationTemplates.AddRange(t1, t2);
        await context.SaveChangesAsync();

        var actionResult = await controller.GetAllTemplates(null, null, null);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<IReadOnlyList<EvaluationTemplate>>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().HaveCountGreaterThanOrEqualTo(2);
    }

    [Fact]
    public async Task UpdateTemplate_ValidChanges_Returns200Ok()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate("Initial Title");
        context.EvaluationTemplates.Add(template);
        await context.SaveChangesAsync();

        template.Title = "Updated Title";
        var actionResult = await controller.UpdateTemplate(template.Id, template);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EvaluationTemplate>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.Title.Should().Be("Updated Title");
    }

    [Fact]
    public async Task DeleteTemplate_UnusedTemplate_Returns200Ok()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate("Template to Delete");
        context.EvaluationTemplates.Add(template);
        await context.SaveChangesAsync();

        var actionResult = await controller.DeleteTemplate(template.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<bool>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().BeTrue();
    }

    [Fact]
    public async Task CreateReview_ValidIndividualScope_Returns201Created()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var employee = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Alice",
            LastName = "Courier",
            Username = "alice.courier",
            Email = "alice@example.com",
            Role = UserRole.Courier
        };
        context.EvaluationTemplates.Add(template);
        context.Users.Add(employee);
        await context.SaveChangesAsync();

        var request = new CreatePerformanceReviewDTO
        {
            TemplateId = template.Id,
            Title = "Q4 Individual Review - Alice",
            Scope = ReviewScope.Individual,
            PeriodStart = new DateTime(2026, 10, 1),
            PeriodEnd = new DateTime(2026, 10, 31),
            EmployeeId = employee.Id
        };

        var actionResult = await controller.CreateReview(request);

        var createdResult = actionResult.Should().BeOfType<CreatedAtActionResult>().Subject;
        createdResult.StatusCode.Should().Be(StatusCodes.Status201Created);

        var response = createdResult.Value.Should().BeOfType<ApiResponseDTO<PerformanceReviewSummaryDTO>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.Title.Should().Be("Q4 Individual Review - Alice");
        response.Data.Status.Should().Be(ReviewWorkflowStatus.Draft);
        response.Data.EmployeeId.Should().Be(employee.Id);
    }

    [Fact]
    public async Task CreateReview_InvalidDateRange_Returns400BadRequest()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        context.EvaluationTemplates.Add(template);
        await context.SaveChangesAsync();

        var request = new CreatePerformanceReviewDTO
        {
            TemplateId = template.Id,
            Title = "Invalid Date Review",
            Scope = ReviewScope.Individual,
            PeriodStart = new DateTime(2026, 10, 31),
            PeriodEnd = new DateTime(2026, 10, 1), // End earlier than start
            EmployeeId = Guid.NewGuid()
        };

        var actionResult = await controller.CreateReview(request);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        badRequestResult.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
    }

    [Fact]
    public async Task GetReviews_ManagerFilterByStatus_ReturnsFilteredList()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        context.EvaluationTemplates.Add(template);

        var r1 = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Draft Review",
            Status = ReviewWorkflowStatus.Draft,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        var r2 = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "SelfAssessment Review",
            Status = ReviewWorkflowStatus.SelfAssessment,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.PerformanceReviews.AddRange(r1, r2);
        await context.SaveChangesAsync();

        var filter = new PerformanceReviewFilterDTO { Status = ReviewWorkflowStatus.Draft };
        var actionResult = await controller.GetReviews(filter);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<List<PerformanceReviewSummaryDTO>>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().ContainSingle(r => r.Title == "Draft Review");
    }

    [Fact]
    public async Task GetReviewById_Manager_Returns200WithReviewResultDTO()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var employee = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Bob",
            LastName = "Encoder",
            Username = "bob.encoder",
            Role = UserRole.Encoder
        };
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Bob's Review",
            Scope = ReviewScope.Individual,
            Status = ReviewWorkflowStatus.ManagerReview,
            EmployeeId = employee.Id,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };

        context.EvaluationTemplates.Add(template);
        context.Users.Add(employee);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var actionResult = await controller.GetReviewById(review.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<ReviewResultDTO>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.ReviewId.Should().Be(review.Id);
        response.Data.Employees.Should().ContainSingle(e => e.EmployeeId == employee.Id);
    }

    [Fact]
    public async Task GetReviewScore_Returns200Ok()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var employee = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Charlie",
            LastName = "Courier",
            Username = "charlie.courier",
            Role = UserRole.Courier
        };
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Charlie's Review",
            Scope = ReviewScope.Individual,
            Status = ReviewWorkflowStatus.ManagerReview,
            EmployeeId = employee.Id,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };

        context.EvaluationTemplates.Add(template);
        context.Users.Add(employee);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var actionResult = await controller.GetReviewScore(review.Id, employee.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeReviewScoreDTO>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.EmployeeId.Should().Be(employee.Id);
    }

    #endregion

    #region Cross-Employee Security & 403 Forbidden Tests

    [Fact]
    public async Task GetReviews_NonManagerFilteringOtherEmployee_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var (controller, _) = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId);

        var filter = new PerformanceReviewFilterDTO { EmployeeId = otherUserId };
        var actionResult = await controller.GetReviews(filter);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task GetReviewById_NonManagerAccessingOtherEmployeeReview_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var (managerCtrl, context) = CreateController(callerRole: UserRole.Manager);

        var template = CreateValidTemplate();
        var otherUser = new User
        {
            Id = otherUserId,
            FirstName = "Other",
            LastName = "Employee",
            Username = "other.emp",
            Role = UserRole.Courier
        };
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Other's Individual Review",
            Scope = ReviewScope.Individual,
            Status = ReviewWorkflowStatus.SelfAssessment,
            EmployeeId = otherUserId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };

        context.EvaluationTemplates.Add(template);
        context.Users.Add(otherUser);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        // Non-manager attempts to access other employee's review
        var (courierCtrl, _) = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId, existingContext: context);

        var actionResult = await courierCtrl.GetReviewById(review.Id);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task GetReviewById_NonManagerAccessingOwnReview_Returns200OkWithOnlyOwnScore()
    {
        var myUserId = Guid.NewGuid();
        var (_, context) = CreateController(callerRole: UserRole.Manager);

        var template = CreateValidTemplate();
        var myUser = new User
        {
            Id = myUserId,
            FirstName = "My",
            LastName = "Self",
            Username = "my.self",
            Role = UserRole.Courier
        };
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "My Review",
            Scope = ReviewScope.Individual,
            Status = ReviewWorkflowStatus.SelfAssessment,
            EmployeeId = myUserId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };

        context.EvaluationTemplates.Add(template);
        context.Users.Add(myUser);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var (courierCtrl, _) = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId, existingContext: context);

        var actionResult = await courierCtrl.GetReviewById(review.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<ReviewResultDTO>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.Employees.Should().ContainSingle(e => e.EmployeeId == myUserId);
    }

    [Fact]
    public async Task GetReviewScore_NonManagerAccessingOtherEmployeeScore_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var (_, context) = CreateController(callerRole: UserRole.Manager);

        var template = CreateValidTemplate();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Team Review",
            Scope = ReviewScope.Team,
            Status = ReviewWorkflowStatus.ManagerReview,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var (courierCtrl, _) = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId, existingContext: context);

        var actionResult = await courierCtrl.GetReviewScore(review.Id, otherUserId);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task UpdateRatings_NonManagerSubmittingForOtherEmployee_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var (_, context) = CreateController(callerRole: UserRole.Manager);

        var template = CreateValidTemplate();
        var critId = template.Sections.First().Criteria.First().Id;
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Self Assessment Review",
            Scope = ReviewScope.Individual,
            Status = ReviewWorkflowStatus.SelfAssessment,
            EmployeeId = otherUserId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var (courierCtrl, _) = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId, existingContext: context);

        var submission = new SubmitReviewRatingsDTO
        {
            EmployeeId = otherUserId,
            Ratings = new List<CriterionRatingSubmissionDTO>
            {
                new() { CriterionId = critId, SelfScore = 4.0 }
            }
        };

        var actionResult = await courierCtrl.UpdateRatings(review.Id, submission);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task TransitionReviewStatus_NonManagerAttemptingOtherEmployeeReview_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var (_, context) = CreateController(callerRole: UserRole.Manager);

        var template = CreateValidTemplate();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Other's Review",
            Scope = ReviewScope.Individual,
            Status = ReviewWorkflowStatus.SelfAssessment,
            EmployeeId = otherUserId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var (courierCtrl, _) = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId, existingContext: context);

        var transition = new ReviewStatusTransitionDTO { TargetStatus = ReviewWorkflowStatus.ManagerReview };
        var actionResult = await courierCtrl.TransitionReviewStatus(review.Id, transition);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task TransitionReviewStatus_NonManagerAttemptingIllegalTransition_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var (_, context) = CreateController(callerRole: UserRole.Manager);

        var template = CreateValidTemplate();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "My Review",
            Scope = ReviewScope.Individual,
            Status = ReviewWorkflowStatus.Draft,
            EmployeeId = myUserId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var (courierCtrl, _) = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId, existingContext: context);

        // Regular employee cannot advance Draft -> SelfAssessment (only Manager can initiate review)
        var transition = new ReviewStatusTransitionDTO { TargetStatus = ReviewWorkflowStatus.SelfAssessment };
        var actionResult = await courierCtrl.TransitionReviewStatus(review.Id, transition);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    #endregion

    #region Workflow Enforcement & Ratings Validation Tests

    [Fact]
    public async Task UpdateRatings_ReviewInDraftStatus_Returns422UnprocessableEntity()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var critId = template.Sections.First().Criteria.First().Id;
        var empId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Draft Review",
            Status = ReviewWorkflowStatus.Draft,
            EmployeeId = empId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var submission = new SubmitReviewRatingsDTO
        {
            EmployeeId = empId,
            Ratings = new List<CriterionRatingSubmissionDTO>
            {
                new() { CriterionId = critId, SelfScore = 4.0 }
            }
        };

        var actionResult = await controller.UpdateRatings(review.Id, submission);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);
    }

    [Fact]
    public async Task UpdateRatings_SelfAssessmentStage_EmployeeSubmitsSelfScore_Returns200Ok()
    {
        var myUserId = Guid.NewGuid();
        var (_, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var critId = template.Sections.First().Criteria.First().Id;
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Self Assessment Review",
            Status = ReviewWorkflowStatus.SelfAssessment,
            EmployeeId = myUserId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var (courierCtrl, _) = CreateController(UserRole.Courier, myUserId, context);

        var submission = new SubmitReviewRatingsDTO
        {
            EmployeeId = myUserId,
            Ratings = new List<CriterionRatingSubmissionDTO>
            {
                new() { CriterionId = critId, SelfScore = 4.5, SelfComment = "Good progress" }
            }
        };

        var actionResult = await courierCtrl.UpdateRatings(review.Id, submission);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        okResult.StatusCode.Should().Be(StatusCodes.Status200OK);

        // Verify rating was persisted
        var rating = await context.CriterionRatings.FirstOrDefaultAsync(
            r => r.ReviewId == review.Id && r.EmployeeId == myUserId && r.CriterionId == critId);
        rating.Should().NotBeNull();
        rating!.SelfScore.Should().Be(4.5);
        rating.SelfComment.Should().Be("Good progress");
    }

    [Fact]
    public async Task UpdateRatings_SelfAssessmentStage_NonManagerSubmittingManagerScore_Returns400BadRequest()
    {
        var myUserId = Guid.NewGuid();
        var (_, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var critId = template.Sections.First().Criteria.First().Id;
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Self Assessment Review",
            Status = ReviewWorkflowStatus.SelfAssessment,
            EmployeeId = myUserId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var (courierCtrl, _) = CreateController(UserRole.Courier, myUserId, context);

        // Non-manager attempts to submit ManagerScore
        var submission = new SubmitReviewRatingsDTO
        {
            EmployeeId = myUserId,
            Ratings = new List<CriterionRatingSubmissionDTO>
            {
                new() { CriterionId = critId, SelfScore = 4.0, ManagerScore = 5.0 }
            }
        };

        var actionResult = await courierCtrl.UpdateRatings(review.Id, submission);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        badRequestResult.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
    }

    [Fact]
    public async Task UpdateRatings_ScoreOutOfBounds_Returns400BadRequest()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var critId = template.Sections.First().Criteria.First().Id;
        var empId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Manager Review",
            Status = ReviewWorkflowStatus.ManagerReview,
            EmployeeId = empId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var submission = new SubmitReviewRatingsDTO
        {
            EmployeeId = empId,
            Ratings = new List<CriterionRatingSubmissionDTO>
            {
                new() { CriterionId = critId, ManagerScore = 5.5 } // Scale is 1.0 - 5.0
            }
        };

        var actionResult = await controller.UpdateRatings(review.Id, submission);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        badRequestResult.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
    }

    [Fact]
    public async Task UpdateRatings_ManagerReviewStage_NonManagerAttemptingRatings_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var (_, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var critId = template.Sections.First().Criteria.First().Id;
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Manager Review",
            Status = ReviewWorkflowStatus.ManagerReview,
            EmployeeId = myUserId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var (courierCtrl, _) = CreateController(UserRole.Courier, myUserId, context);

        var submission = new SubmitReviewRatingsDTO
        {
            EmployeeId = myUserId,
            Ratings = new List<CriterionRatingSubmissionDTO>
            {
                new() { CriterionId = critId, ManagerScore = 4.0 }
            }
        };

        var actionResult = await courierCtrl.UpdateRatings(review.Id, submission);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task UpdateRatings_ManagerReviewStage_ManagerSubmitsScore_Returns200Ok()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var critId = template.Sections.First().Criteria.First().Id;
        var empId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Manager Review",
            Status = ReviewWorkflowStatus.ManagerReview,
            EmployeeId = empId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var submission = new SubmitReviewRatingsDTO
        {
            EmployeeId = empId,
            Ratings = new List<CriterionRatingSubmissionDTO>
            {
                new() { CriterionId = critId, ManagerScore = 4.2, ManagerComment = "Strong performance" }
            }
        };

        var actionResult = await controller.UpdateRatings(review.Id, submission);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        okResult.StatusCode.Should().Be(StatusCodes.Status200OK);

        var rating = await context.CriterionRatings.FirstOrDefaultAsync(
            r => r.ReviewId == review.Id && r.EmployeeId == empId && r.CriterionId == critId);
        rating.Should().NotBeNull();
        rating!.ManagerScore.Should().Be(4.2);
        rating.ManagerComment.Should().Be("Strong performance");
    }

    [Fact]
    public async Task TransitionReviewStatus_ValidProgression_Returns200Ok()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Draft Review",
            Status = ReviewWorkflowStatus.Draft,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var transition = new ReviewStatusTransitionDTO { TargetStatus = ReviewWorkflowStatus.SelfAssessment };
        var actionResult = await controller.TransitionReviewStatus(review.Id, transition);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        okResult.StatusCode.Should().Be(StatusCodes.Status200OK);

        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<WorkflowTransitionResult>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.NewStatus.Should().Be(ReviewWorkflowStatus.SelfAssessment);
    }

    [Fact]
    public async Task TransitionReviewStatus_IllegalSkip_Returns422UnprocessableEntity()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Draft Review",
            Status = ReviewWorkflowStatus.Draft,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        // Draft directly to Finalized is illegal
        var transition = new ReviewStatusTransitionDTO { TargetStatus = ReviewWorkflowStatus.Finalized };
        var actionResult = await controller.TransitionReviewStatus(review.Id, transition);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);
    }

    [Fact]
    public async Task UpdateRatings_FinalizedReview_Returns422UnprocessableEntity()
    {
        var (controller, context) = CreateController(UserRole.Manager);
        var template = CreateValidTemplate();
        var critId = template.Sections.First().Criteria.First().Id;
        var empId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Title = "Finalized Review",
            Status = ReviewWorkflowStatus.Finalized,
            EmployeeId = empId,
            PeriodStart = DateTime.UtcNow.AddMonths(-1),
            PeriodEnd = DateTime.UtcNow
        };
        context.EvaluationTemplates.Add(template);
        context.PerformanceReviews.Add(review);
        await context.SaveChangesAsync();

        var submission = new SubmitReviewRatingsDTO
        {
            EmployeeId = empId,
            Ratings = new List<CriterionRatingSubmissionDTO>
            {
                new() { CriterionId = critId, ManagerScore = 4.0 }
            }
        };

        var actionResult = await controller.UpdateRatings(review.Id, submission);

        var objectResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);
    }

    #endregion
}
