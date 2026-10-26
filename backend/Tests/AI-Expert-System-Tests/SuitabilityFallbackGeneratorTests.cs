using Backend.Modules.TaskManagement;
using Backend.Modules.TaskManagement.Groq;
using FluentAssertions;
using Xunit;

namespace Backend.Tests;

public class SuitabilityFallbackGeneratorTests
{
    [Fact]
    public void GenerateRationale_WhenWorkloadIsZeroAndHasNoRatings_GeneratesTransparentPlainLanguage()
    {
        var metrics = new GroqCandidateMetrics
        {
            EmployeeId = Guid.NewGuid(),
            FullName = "Carlos Dalisay",
            Workload = 0,
            RoutineExperience = 6,
            SpecialExperience = 2,
            TimelinessRating = 0,
            WorkQualityRating = 0,
            CommunicationRating = 0
        };

        // Routine task (classification 0)
        var rationale = SuitabilityFallbackGenerator.GenerateRationale(metrics, classification: 0);

        rationale.Should().Contain("Has full capacity with no active tasks");
        rationale.Should().Contain("extensive experience across 6 completed routine tasks");
        rationale.Should().Contain("Building initial performance rating history.");
        // Never output vague template or numeric scores
        rationale.Should().NotContain("Heuristic evaluation based on");
        rationale.Should().NotContain("score");
    }

    [Fact]
    public void GenerateRationale_ForSpecialTask_UsesSpecialExperience()
    {
        var metrics = new GroqCandidateMetrics
        {
            EmployeeId = Guid.NewGuid(),
            FullName = "Elena Ramos",
            Workload = 1,
            RoutineExperience = 10,
            SpecialExperience = 4,
            TimelinessRating = 4.8,
            WorkQualityRating = 4.7,
            CommunicationRating = 4.9
        };

        // Special task (classification 1)
        var rationale = SuitabilityFallbackGenerator.GenerateRationale(metrics, classification: 1);

        rationale.Should().Contain("Has high capacity with only 1 active task");
        rationale.Should().Contain("solid experience across 4 completed special tasks");
        rationale.Should().Contain("backed by exceptional performance ratings");
        rationale.Should().Contain("4.8/5.0 avg");
        rationale.Should().NotContain("routine");
        rationale.Should().NotContain("Heuristic evaluation based on");
    }

    [Fact]
    public void GenerateRationale_ModerateWorkloadAndSingleExperience_PhrasedAccurately()
    {
        var metrics = new GroqCandidateMetrics
        {
            EmployeeId = Guid.NewGuid(),
            FullName = "David Cruz",
            Workload = 2,
            RoutineExperience = 1,
            SpecialExperience = 0,
            TimelinessRating = 3.8,
            WorkQualityRating = 3.6,
            CommunicationRating = 4.0
        };

        var rationale = SuitabilityFallbackGenerator.GenerateRationale(metrics, classification: 0);

        rationale.Should().Contain("Maintains a balanced workload with 2 active tasks");
        rationale.Should().Contain("and 1 completed routine task");
        rationale.Should().Contain("supported by strong performance ratings (3.8/5.0 avg)");
    }

    [Fact]
    public void GenerateRationale_HeavyWorkloadAndNoPriorExperience_PhrasedAccurately()
    {
        var metrics = new GroqCandidateMetrics
        {
            EmployeeId = Guid.NewGuid(),
            FullName = "Grace Lim",
            Workload = 5,
            RoutineExperience = 0,
            SpecialExperience = 0,
            TimelinessRating = 3.0,
            WorkQualityRating = 3.0,
            CommunicationRating = 3.0
        };

        var rationale = SuitabilityFallbackGenerator.GenerateRationale(metrics, classification: 0);

        rationale.Should().Contain("Currently managing 5 active tasks");
        rationale.Should().Contain("and is ready to take on routine assignments");
        rationale.Should().Contain("with consistent rating history (3.0/5.0 avg)");
    }

    [Fact]
    public void GenerateFactors_ProducesStructuredBreakdowns()
    {
        var metrics = new GroqCandidateMetrics
        {
            EmployeeId = Guid.NewGuid(),
            FullName = "Ana Reyes",
            Workload = 1,
            RoutineExperience = 3,
            SpecialExperience = 2,
            TimelinessRating = 4.5,
            WorkQualityRating = 4.2,
            CommunicationRating = 4.8
        };

        var factors = SuitabilityFallbackGenerator.GenerateFactors(metrics, classification: 0);

        factors.Should().NotBeNull();
        factors.Workload.Should().Be("1 active task (low workload)");
        factors.Experience.Should().Be("3 completed routine tasks");
        factors.Ratings.Should().Contain("4.5/5.0 avg across timeliness, quality, and communication");
    }

    [Fact]
    public void GenerateFactors_WhenNoExperienceOrRatings_HandlesZeroGracefully()
    {
        var metrics = new GroqCandidateMetrics
        {
            EmployeeId = Guid.NewGuid(),
            FullName = "Ben Santos",
            Workload = 0,
            RoutineExperience = 0,
            SpecialExperience = 0,
            TimelinessRating = 0,
            WorkQualityRating = 0,
            CommunicationRating = 0
        };

        var factors = SuitabilityFallbackGenerator.GenerateFactors(metrics, classification: 1);

        factors.Should().NotBeNull();
        factors.Workload.Should().Be("0 active tasks (full capacity)");
        factors.Experience.Should().Be("0 completed special tasks");
        factors.Ratings.Should().Be("No recorded peer recommendations yet");
    }
}
