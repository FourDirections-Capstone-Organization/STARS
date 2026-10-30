using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Task = System.Threading.Tasks.Task;
using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.PerformanceEvaluation;
using Backend.Modules.TaskManagement.Groq;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Backend.Tests.Analytics;

public class AiRecommendationServiceTests
{
    private class MockHttpMessageHandler : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastRequestBody { get; private set; }
        public HttpStatusCode StatusCode { get; set; } = HttpStatusCode.OK;
        public string ResponseContent { get; set; }
        public bool ThrowException { get; set; }

        public MockHttpMessageHandler(string responseContent = "", HttpStatusCode statusCode = HttpStatusCode.OK)
        {
            ResponseContent = responseContent;
            StatusCode = statusCode;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            if (request.Content != null)
            {
                LastRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
            }

            if (ThrowException)
            {
                throw new HttpRequestException("Simulated network outage or timeout.");
            }

            var response = new HttpResponseMessage(StatusCode)
            {
                Content = new StringContent(ResponseContent, Encoding.UTF8, "application/json")
            };
            return response;
        }
    }

    private static string CreateValidGroqChatResponseJson(string? innerContentJson = null)
    {
        innerContentJson ??= """
        {
            "summary": "Employee demonstrated strong operational accuracy and consistent timeliness throughout the evaluation cycle.",
            "strengths": [
                "Exceptional quality adherence in task execution",
                "Reliable turnaround times on critical assignments"
            ],
            "improvementAreas": [
                "Proactive communication during workflow handoffs"
            ],
            "actionItems": [
                {
                    "description": "Lead the quarterly dispatch SOP refinement initiative.",
                    "successMeasure": "Reduce handoff latency by 15%",
                    "timeframe": "90 days"
                }
            ],
            "trainingTopics": [
                "Advanced Logistics Coordination",
                "Cross-Functional Stakeholder Communication"
            ]
        }
        """;

        var chatEnvelope = new
        {
            id = "chatcmpl-" + Guid.NewGuid(),
            choices = new[]
            {
                new
                {
                    message = new
                    {
                        role = "assistant",
                        content = innerContentJson
                    },
                    finish_reason = "stop"
                }
            }
        };

        return JsonSerializer.Serialize(chatEnvelope);
    }

    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: "AiRecTests_" + Guid.NewGuid())
            .Options;
        return new AppDbContext(options);
    }

    private static (AiRecommendationGenerationService Service, MockHttpMessageHandler Handler, AppDbContext Db, Mock<IPerformanceReviewScoringService> ScoringMock) CreateService(
        AppDbContext? db = null,
        GroqSettings? settings = null,
        string responseContent = "",
        HttpStatusCode statusCode = HttpStatusCode.OK)
    {
        db ??= CreateInMemoryDbContext();

        settings ??= new GroqSettings
        {
            ApiKey = "gsk_mock_valid_api_key_test_12345",
            Model = "openai/gpt-oss-120b",
            Endpoint = "https://api.groq.com/openai/v1/chat/completions",
            Temperature = 0.2,
            MaxTokens = 1024,
            DisableDotEnvResolution = true
        };

        var handler = new MockHttpMessageHandler(responseContent, statusCode);
        var httpClient = new HttpClient(handler);

        var mockFactory = new Mock<IHttpClientFactory>();
        mockFactory.Setup(f => f.CreateClient(GroqSuitabilityService.HttpClientName)).Returns(httpClient);

        var scoringMock = new Mock<IPerformanceReviewScoringService>();

        var service = new AiRecommendationGenerationService(
            db,
            scoringMock.Object,
            mockFactory.Object,
            Options.Create(settings),
            NullLogger<AiRecommendationGenerationService>.Instance);

        return (service, handler, db, scoringMock);
    }

    [Fact]
    public void BuildPayload_StrictlyExcludesPiiAndTrimsLongComments()
    {
        // Arrange
        var (service, _, _, _) = CreateService();

        var employeeId = Guid.NewGuid();
        var employeeName = "Johnathan Doe";
        var employeeNumber = "EMP-998877";

        var longComment = new string('A', 750); // 750 characters long

        var scoreDto = new EmployeeReviewScoreDTO
        {
            EmployeeId = employeeId,
            EmployeeName = employeeName,
            EmployeeNumber = employeeNumber,
            JobPositionTitle = "Senior Dispatch Specialist",
            Role = "Coordinator",
            FinalScore = 88.5,
            RatingLabel = "Exceeds Expectations",
            Sections = new List<SectionScoreDTO>
            {
                new()
                {
                    SectionId = Guid.NewGuid(),
                    SectionTitle = "Operational Execution",
                    Weight = 60,
                    Score = 90.0,
                    Criteria = new List<CriterionScoreDTO>
                    {
                        new()
                        {
                            CriterionId = Guid.NewGuid(),
                            CriterionTitle = "Punctuality & SLA",
                            Weight = 100,
                            SelfScore = 4.0,
                            ManagerScore = 4.5,
                            Gap = -0.5,
                            IsOutlier = false,
                            SelfComment = "Maintained excellent dispatch speed all quarter.",
                            ManagerComment = longComment
                        }
                    }
                },
                new()
                {
                    SectionId = Guid.NewGuid(),
                    SectionTitle = "Operational KPIs",
                    IsKpiSection = true,
                    Weight = 40,
                    Score = 85.0,
                    KpiMetrics = new List<KpiMetricValueDTO>
                    {
                        new()
                        {
                            MetricCode = "OTD",
                            Name = "On-Time Dispatch Rate",
                            ActualValue = 97.5,
                            TargetValue = 95.0,
                            WeightedScore = 85.0
                        }
                    }
                }
            }
        };

        // Act
        var payload = service.BuildPayload(scoreDto);
        var serializedPayload = JsonSerializer.Serialize(payload);

        // Assert - PII strictly excluded
        serializedPayload.Should().NotContain(employeeName, "Employee name must not be present in payload (PII violation)");
        serializedPayload.Should().NotContain(employeeNumber, "Employee number must not be present in payload (PII violation)");
        serializedPayload.Should().NotContain(employeeId.ToString(), "Employee GUID ID must not be present in payload (PII violation)");

        // Assert - Role title retained
        payload.RoleTitle.Should().Be("Senior Dispatch Specialist");
        payload.CriterionScores.Should().HaveCount(1);
        payload.CriterionScores[0].CriterionTitle.Should().Be("Punctuality & SLA");
        payload.CriterionScores[0].ManagerScore.Should().Be(4.5);

        // Assert - KPI snapshot retained
        payload.KpiSnapshot.Should().NotBeNull();
        payload.KpiSnapshot!.OverallScore.Should().Be(85.0);
        payload.KpiSnapshot.Metrics.Should().HaveCount(1);
        payload.KpiSnapshot.Metrics[0].MetricCode.Should().Be("OTD");

        // Assert - Comment trimmed to at most 500 characters
        payload.TrimmedComments.Should().HaveCount(2);
        var trimmedLong = payload.TrimmedComments.First(c => c.StartsWith("AAA"));
        trimmedLong.Length.Should().Be(500, "Comments exceeding 500 characters must be trimmed to exactly 500 characters");
    }

    [Fact]
    public void ParseAndValidateResponse_ValidJson_ReturnsParsedResponse()
    {
        // Arrange
        var (service, _, _, _) = CreateService();

        var json = """
        {
            "summary": "Consistent high performer in delivery scheduling.",
            "strengths": ["Route optimization", "Attention to detail"],
            "improvementAreas": ["Cross-team communications"],
            "actionItems": [
                {
                    "description": "Establish daily sync with warehouse leads.",
                    "successMeasure": "Zero communication bottlenecks",
                    "timeframe": "60 days"
                }
            ],
            "trainingTopics": ["Effective Team Alignment"]
        }
        """;

        // Act
        var result = service.ParseAndValidateResponse(json);

        // Assert
        result.Should().NotBeNull();
        result.Summary.Should().Be("Consistent high performer in delivery scheduling.");
        result.Strengths.Should().ContainSingle(s => s == "Route optimization");
        result.ImprovementAreas.Should().ContainSingle(a => a == "Cross-team communications");
        result.ActionItems.Should().HaveCount(1);
        result.ActionItems[0].Description.Should().Be("Establish daily sync with warehouse leads.");
        result.ActionItems[0].Timeframe.Should().Be("60 days");
        result.TrainingTopics.Should().Contain("Effective Team Alignment");
    }

    [Fact]
    public void ParseAndValidateResponse_MarkdownCodeFences_ParsesSuccessfully()
    {
        // Arrange
        var (service, _, _, _) = CreateService();

        var fenced = """
        ```json
        {
            "summary": "Solid progress across all criteria.",
            "strengths": ["Quick learner"],
            "improvementAreas": ["Documentation"],
            "actionItems": [
                {
                    "description": "Document daily escalation workflows.",
                    "successMeasure": "Published team runbook",
                    "timeframe": "30 days"
                }
            ],
            "trainingTopics": ["Technical Documentation"]
        }
        ```
        """;

        // Act
        var result = service.ParseAndValidateResponse(fenced);

        // Assert
        result.Summary.Should().Be("Solid progress across all criteria.");
        result.Strengths.Should().Contain("Quick learner");
    }

    [Theory]
    [InlineData("")]
    [InlineData("not json at all")]
    [InlineData("""{"strengths": ["S1"], "improvementAreas": ["I1"], "actionItems": [{"description":"D","successMeasure":"M","timeframe":"T"}], "trainingTopics": ["T1"]}""")] // missing summary
    [InlineData("""{"summary": "Sum", "strengths": [], "improvementAreas": ["I1"], "actionItems": [{"description":"D","successMeasure":"M","timeframe":"T"}], "trainingTopics": ["T1"]}""")] // empty strengths
    [InlineData("""{"summary": "Sum", "strengths": ["S1"], "improvementAreas": [], "actionItems": [{"description":"D","successMeasure":"M","timeframe":"T"}], "trainingTopics": ["T1"]}""")] // empty improvementAreas
    [InlineData("""{"summary": "Sum", "strengths": ["S1"], "improvementAreas": ["I1"], "actionItems": [], "trainingTopics": ["T1"]}""")] // empty actionItems
    [InlineData("""{"summary": "Sum", "strengths": ["S1"], "improvementAreas": ["I1"], "actionItems": [{"description":"D","successMeasure":"M","timeframe":"T"}], "trainingTopics": []}""")] // empty trainingTopics
    public void ParseAndValidateResponse_InvalidOrIncompleteJson_ThrowsJsonException(string invalidJson)
    {
        // Arrange
        var (service, _, _, _) = CreateService();

        // Act
        var act = () => service.ParseAndValidateResponse(invalidJson);

        // Assert
        act.Should().Throw<JsonException>();
    }

    [Fact]
    public async Task GenerateRecommendationAsync_SuccessfulGroqResponse_PersistsPendingRecommendationAndOverridesMaxTokens()
    {
        // Arrange
        var validResponse = CreateValidGroqChatResponseJson();
        var (service, handler, db, scoringMock) = CreateService(responseContent: validResponse);

        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Logistics Standard Evaluation",
            IsActive = true,
            IsAiEnabled = true
        };
        db.EvaluationTemplates.Add(template);

        var employeeId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Template = template,
            Title = "Q3 Evaluation",
            EmployeeId = employeeId,
            Status = ReviewWorkflowStatus.ManagerReview,
            PeriodStart = DateTime.UtcNow.AddMonths(-3),
            PeriodEnd = DateTime.UtcNow
        };
        db.PerformanceReviews.Add(review);
        await db.SaveChangesAsync();

        var scoreDto = new EmployeeReviewScoreDTO
        {
            EmployeeId = employeeId,
            EmployeeName = "Valid Employee",
            JobPositionTitle = "Fleet Coordinator",
            FinalScore = 84.0,
            Sections = new List<SectionScoreDTO>
            {
                new()
                {
                    SectionId = Guid.NewGuid(),
                    SectionTitle = "Core Competencies",
                    Criteria = new List<CriterionScoreDTO>
                    {
                        new()
                        {
                            CriterionId = Guid.NewGuid(),
                            CriterionTitle = "Punctuality",
                            ManagerScore = 4.5,
                            Weight = 100
                        }
                    }
                }
            }
        };

        var reviewResult = new ReviewResultDTO
        {
            ReviewId = review.Id,
            Employees = new List<EmployeeReviewScoreDTO> { scoreDto }
        };

        scoringMock.Setup(s => s.CalculateReviewScoreAsync(It.IsAny<PerformanceReview>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(reviewResult);

        var managerId = Guid.NewGuid();

        // Act
        var result = await service.GenerateRecommendationAsync(review.Id, employeeId, managerId);

        // Assert - Success result
        result.IsSuccess.Should().BeTrue();
        result.StatusCode.Should().Be(200);
        result.Recommendation.Should().NotBeNull();
        result.Recommendation!.Status.Should().Be(AiRecommendationStatus.Pending);
        result.Recommendation.Summary.Should().Contain("consistent timeliness");
        result.Recommendation.StrengthsJson.Should().Contain("Exceptional quality adherence");
        result.Recommendation.ImprovementAreasJson.Should().Contain("Proactive communication");
        result.Recommendation.ActionItemsJson.Should().Contain("Lead the quarterly dispatch");
        result.Recommendation.TrainingTopicsJson.Should().Contain("Advanced Logistics Coordination");

        // Verify HTTP request payload details
        handler.LastRequest.Should().NotBeNull();
        handler.LastRequestBody.Should().NotBeNull();

        using var doc = JsonDocument.Parse(handler.LastRequestBody!);
        var root = doc.RootElement;
        root.GetProperty("max_tokens").GetInt32().Should().Be(2048, "Plan requires overriding MaxTokens=2048");
        root.GetProperty("response_format").GetProperty("type").GetString().Should().Be("json_object");

        // Verify persistence in DB
        var persisted = await db.AiRecommendations.FirstOrDefaultAsync(r => r.ReviewId == review.Id && r.EmployeeId == employeeId);
        persisted.Should().NotBeNull();
        persisted!.Status.Should().Be(AiRecommendationStatus.Pending);
        persisted.Summary.Should().Be(result.Recommendation.Summary);
    }

    [Fact]
    public async Task GenerateRecommendationAsync_DisabledTemplate_Returns422UnprocessableEntity()
    {
        // Arrange
        var (service, handler, db, _) = CreateService();

        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Manual-Only Template",
            IsActive = true,
            IsAiEnabled = false // AI is disabled
        };
        db.EvaluationTemplates.Add(template);

        var employeeId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Template = template,
            Title = "Strictly Manual Review",
            EmployeeId = employeeId,
            Status = ReviewWorkflowStatus.ManagerReview
        };
        db.PerformanceReviews.Add(review);
        await db.SaveChangesAsync();

        // Act
        var result = await service.GenerateRecommendationAsync(review.Id, employeeId, Guid.NewGuid());

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.StatusCode.Should().Be(422, "Disabled template must return 422 Unprocessable Entity");
        result.ErrorMessage.Should().Contain("disabled for this evaluation template");

        // Groq HTTP client must never be called
        handler.LastRequest.Should().BeNull();
    }

    [Fact]
    public async Task GenerateRecommendationAsync_GroqHttpFailure_FallsBackToManualOverride()
    {
        // Arrange
        var (service, _, db, scoringMock) = CreateService(
            responseContent: "Internal Server Error from Groq",
            statusCode: HttpStatusCode.InternalServerError);

        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Standard Template",
            IsActive = true,
            IsAiEnabled = true
        };
        db.EvaluationTemplates.Add(template);

        var employeeId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Template = template,
            Title = "Resilient Review",
            EmployeeId = employeeId,
            Status = ReviewWorkflowStatus.ManagerReview
        };
        db.PerformanceReviews.Add(review);
        await db.SaveChangesAsync();

        var reviewResult = new ReviewResultDTO
        {
            ReviewId = review.Id,
            Employees = new List<EmployeeReviewScoreDTO>
            {
                new()
                {
                    EmployeeId = employeeId,
                    JobPositionTitle = "Driver",
                    Sections = new List<SectionScoreDTO>()
                }
            }
        };

        scoringMock.Setup(s => s.CalculateReviewScoreAsync(It.IsAny<PerformanceReview>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(reviewResult);

        // Act
        var result = await service.GenerateRecommendationAsync(review.Id, employeeId, Guid.NewGuid());

        // Assert
        result.IsSuccess.Should().BeTrue("HTTP failure must be caught and gracefully handled via fallback");
        result.Recommendation.Should().NotBeNull();
        result.Recommendation!.Status.Should().Be(AiRecommendationStatus.ManualOverride, "Must persist Status=ManualOverride on Groq failure");
        result.Recommendation.Summary.Should().Contain("unavailable");

        // Persisted in DB
        var persisted = await db.AiRecommendations.FirstOrDefaultAsync(r => r.ReviewId == review.Id && r.EmployeeId == employeeId);
        persisted.Should().NotBeNull();
        persisted!.Status.Should().Be(AiRecommendationStatus.ManualOverride);
    }

    [Fact]
    public async Task GenerateRecommendationAsync_NetworkException_FallsBackToManualOverride()
    {
        // Arrange
        var (service, handler, db, scoringMock) = CreateService();
        handler.ThrowException = true; // Simulates network dropout

        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Standard Template",
            IsActive = true,
            IsAiEnabled = true
        };
        db.EvaluationTemplates.Add(template);

        var employeeId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Template = template,
            Title = "Offline Review",
            EmployeeId = employeeId,
            Status = ReviewWorkflowStatus.ManagerReview
        };
        db.PerformanceReviews.Add(review);
        await db.SaveChangesAsync();

        var reviewResult = new ReviewResultDTO
        {
            ReviewId = review.Id,
            Employees = new List<EmployeeReviewScoreDTO>
            {
                new()
                {
                    EmployeeId = employeeId,
                    JobPositionTitle = "Dispatcher",
                    Sections = new List<SectionScoreDTO>()
                }
            }
        };

        scoringMock.Setup(s => s.CalculateReviewScoreAsync(It.IsAny<PerformanceReview>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(reviewResult);

        // Act
        var result = await service.GenerateRecommendationAsync(review.Id, employeeId, Guid.NewGuid());

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Recommendation.Should().NotBeNull();
        result.Recommendation!.Status.Should().Be(AiRecommendationStatus.ManualOverride);
    }

    [Fact]
    public async Task GenerateRecommendationAsync_MissingApiKey_FallsBackToManualOverride()
    {
        // Arrange
        var emptyKeySettings = new GroqSettings
        {
            ApiKey = "",
            DisableDotEnvResolution = true
        };
        var (service, handler, db, scoringMock) = CreateService(settings: emptyKeySettings);

        var template = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Standard Template",
            IsActive = true,
            IsAiEnabled = true
        };
        db.EvaluationTemplates.Add(template);

        var employeeId = Guid.NewGuid();
        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Template = template,
            Title = "Unconfigured API Review",
            EmployeeId = employeeId,
            Status = ReviewWorkflowStatus.ManagerReview
        };
        db.PerformanceReviews.Add(review);
        await db.SaveChangesAsync();

        var reviewResult = new ReviewResultDTO
        {
            ReviewId = review.Id,
            Employees = new List<EmployeeReviewScoreDTO>
            {
                new() { EmployeeId = employeeId, Sections = new List<SectionScoreDTO>() }
            }
        };

        scoringMock.Setup(s => s.CalculateReviewScoreAsync(It.IsAny<PerformanceReview>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(reviewResult);

        // Act
        var result = await service.GenerateRecommendationAsync(review.Id, employeeId, Guid.NewGuid());

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Recommendation.Should().NotBeNull();
        result.Recommendation!.Status.Should().Be(AiRecommendationStatus.ManualOverride);
        handler.LastRequest.Should().BeNull("Should not attempt HTTP call when API key is missing");
    }

    [Fact]
    public async Task UpdateRecommendationAsync_Approve_UpdatesStatusAndDoesNotMutateReviewScoresOrWorkflow()
    {
        // Arrange
        var (service, _, db, _) = CreateService();

        var reviewId = Guid.NewGuid();
        var employeeId = Guid.NewGuid();
        var managerId = Guid.NewGuid();

        var review = new PerformanceReview
        {
            Id = reviewId,
            TemplateId = Guid.NewGuid(),
            Title = "Status Integrity Test Review",
            Status = ReviewWorkflowStatus.ManagerReview,
            FrozenScoresJson = null
        };
        db.PerformanceReviews.Add(review);

        var recommendation = new AiRecommendation
        {
            Id = Guid.NewGuid(),
            ReviewId = reviewId,
            EmployeeId = employeeId,
            Status = AiRecommendationStatus.Pending,
            Summary = "Initial draft summary by AI.",
            StrengthsJson = "[\"Initial strength\"]",
            ImprovementAreasJson = "[\"Initial growth\"]",
            ActionItemsJson = "[]",
            TrainingTopicsJson = "[]"
        };
        db.AiRecommendations.Add(recommendation);
        await db.SaveChangesAsync();

        var updateDto = new UpdateAiRecommendationDTO
        {
            Status = AiRecommendationStatus.Approved,
            Summary = "Manager-approved executive summary.",
            Strengths = new List<string> { "Refined strength by manager" },
            ActionItems = new List<PerformanceAiActionItem>
            {
                new()
                {
                    Description = "Execute safety inspection checklist.",
                    SuccessMeasure = "100% compliance",
                    Timeframe = "30 days"
                }
            }
        };

        // Act
        var result = await service.UpdateRecommendationAsync(reviewId, employeeId, updateDto, managerId);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Recommendation.Should().NotBeNull();
        result.Recommendation!.Status.Should().Be(AiRecommendationStatus.Approved);
        result.Recommendation.Summary.Should().Be("Manager-approved executive summary.");
        result.Recommendation.ReviewedById.Should().Be(managerId);
        result.Recommendation.ReviewedAt.Should().NotBeNull();

        // Verify Security: Review status, frozen scores, and workflow remain strictly untouched
        var refetchedReview = await db.PerformanceReviews.FindAsync(reviewId);
        refetchedReview!.Status.Should().Be(ReviewWorkflowStatus.ManagerReview, "AI recommendation approval must not mutate review workflow status");
        refetchedReview.FrozenScoresJson.Should().BeNull("AI recommendation approval must not modify review scores or freeze JSON");
    }

    [Fact]
    public async Task UpdateRecommendationAsync_ManualOverride_SavesManualNotes()
    {
        // Arrange
        var (service, _, db, _) = CreateService();

        var reviewId = Guid.NewGuid();
        var employeeId = Guid.NewGuid();
        var managerId = Guid.NewGuid();

        var recommendation = new AiRecommendation
        {
            Id = Guid.NewGuid(),
            ReviewId = reviewId,
            EmployeeId = employeeId,
            Status = AiRecommendationStatus.Pending,
            Summary = "AI Summary"
        };
        db.AiRecommendations.Add(recommendation);
        await db.SaveChangesAsync();

        var updateDto = new UpdateAiRecommendationDTO
        {
            Status = AiRecommendationStatus.ManualOverride,
            Summary = "Custom manager evaluation without AI assistance.",
            ManualNotes = "Overridden due to specialized project requirements outside AI scope."
        };

        // Act
        var result = await service.UpdateRecommendationAsync(reviewId, employeeId, updateDto, managerId);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Recommendation!.Status.Should().Be(AiRecommendationStatus.ManualOverride);
        result.Recommendation.ManualNotes.Should().Be(updateDto.ManualNotes);
    }

    [Fact]
    public async Task Controller_GenerateAiRecommendation_ManagerPolicyAndDisabledTemplateEnforcement()
    {
        // Arrange
        var validResponse = CreateValidGroqChatResponseJson();
        var (aiService, _, db, scoringMock) = CreateService(responseContent: validResponse);

        var templateEnabled = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Enabled Template",
            IsActive = true,
            IsAiEnabled = true
        };
        var templateDisabled = new EvaluationTemplate
        {
            Id = Guid.NewGuid(),
            Title = "Disabled Template",
            IsActive = true,
            IsAiEnabled = false
        };
        db.EvaluationTemplates.AddRange(templateEnabled, templateDisabled);

        var employeeId = Guid.NewGuid();
        var reviewWithEnabled = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = templateEnabled.Id,
            Template = templateEnabled,
            Title = "Review AI Enabled",
            EmployeeId = employeeId,
            Status = ReviewWorkflowStatus.ManagerReview
        };
        var reviewWithDisabled = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = templateDisabled.Id,
            Template = templateDisabled,
            Title = "Review AI Disabled",
            EmployeeId = employeeId,
            Status = ReviewWorkflowStatus.ManagerReview
        };
        db.PerformanceReviews.AddRange(reviewWithEnabled, reviewWithDisabled);
        await db.SaveChangesAsync();

        var reviewResult = new ReviewResultDTO
        {
            ReviewId = reviewWithEnabled.Id,
            Employees = new List<EmployeeReviewScoreDTO>
            {
                new() { EmployeeId = employeeId, JobPositionTitle = "Fleet Analyst", Sections = new List<SectionScoreDTO>() }
            }
        };

        scoringMock.Setup(s => s.CalculateReviewScoreAsync(It.IsAny<PerformanceReview>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(reviewResult);

        var templateService = new EvaluationTemplateService(db, NullLogger<EvaluationTemplateService>.Instance);
        var workflowService = new ReviewWorkflowService(db, scoringMock.Object, NullLogger<ReviewWorkflowService>.Instance);

        var managerId = Guid.NewGuid();
        var managerPrincipal = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, managerId.ToString()),
            new Claim(ClaimTypes.Role, UserRole.Manager.ToString())
        }, "TestAuth"));

        var controller = new PerformanceEvaluationController(
            templateService,
            workflowService,
            scoringMock.Object,
            db,
            NullLogger<PerformanceEvaluationController>.Instance,
            aiService)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = managerPrincipal }
            }
        };

        // Act 1 - Generate on review with AI enabled -> 200 OK
        var okResult = await controller.GenerateAiRecommendation(reviewWithEnabled.Id, employeeId);
        okResult.Should().BeOfType<OkObjectResult>();
        var okObject = okResult as OkObjectResult;
        var apiResponse = okObject!.Value as ApiResponseDTO<AiRecommendationDTO>;
        apiResponse.Should().NotBeNull();
        apiResponse!.IsSuccess.Should().BeTrue();
        apiResponse.Data!.Status.Should().Be(AiRecommendationStatus.Pending);

        // Act 2 - Generate on review with AI disabled -> 422 UnprocessableEntity
        var disabledResult = await controller.GenerateAiRecommendation(reviewWithDisabled.Id, employeeId);
        disabledResult.Should().BeOfType<ObjectResult>();
        var statusObject = disabledResult as ObjectResult;
        statusObject!.StatusCode.Should().Be(422);

        // Act 3 - Update recommendation via PUT -> 200 OK
        var updatePayload = new UpdateAiRecommendationDTO
        {
            Status = AiRecommendationStatus.Approved,
            Summary = "Manager Approved Summary"
        };
        var putResult = await controller.UpdateAiRecommendation(reviewWithEnabled.Id, employeeId, updatePayload);
        putResult.Should().BeOfType<OkObjectResult>();
        var putOk = putResult as OkObjectResult;
        var putResponse = putOk!.Value as ApiResponseDTO<AiRecommendationDTO>;
        putResponse!.Data!.Status.Should().Be(AiRecommendationStatus.Approved);

        // Act 4 - Employee views their own approved recommendation via GET -> 200 OK
        var employeePrincipal = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, employeeId.ToString()),
            new Claim(ClaimTypes.Role, UserRole.Dispatcher.ToString())
        }, "TestAuth"));
        controller.ControllerContext.HttpContext.User = employeePrincipal;

        var getResult = await controller.GetAiRecommendation(reviewWithEnabled.Id, employeeId);
        getResult.Should().BeOfType<OkObjectResult>();

        // Act 5 - Another employee tries to view this employee's recommendation -> 403 Forbidden
        var otherEmployeePrincipal = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new Claim(ClaimTypes.Role, UserRole.Dispatcher.ToString())
        }, "TestAuth"));
        controller.ControllerContext.HttpContext.User = otherEmployeePrincipal;

        var forbiddenResult = await controller.GetAiRecommendation(reviewWithEnabled.Id, employeeId);
        forbiddenResult.Should().BeOfType<ForbidResult>();
    }
}
