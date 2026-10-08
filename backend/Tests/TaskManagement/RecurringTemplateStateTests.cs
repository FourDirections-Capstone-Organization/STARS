using Backend.Models.Enums;

namespace Backend.Tests.TaskManagement;

public class RecurringTemplateStateTests
{
    [Fact]
    public void NewTemplate_DefaultsToActive()
    {
        var template = new Backend.Models.TaskTemplate();
        Assert.True(template.IsActive);
    }

    [Fact]
    public void NewTemplate_HasGeneratedId()
    {
        var template = new Backend.Models.TaskTemplate();
        Assert.NotEqual(Guid.Empty, template.Id);
    }

    [Fact]
    public void NewTemplate_DefaultClassification_IsRoutineDailyTask()
    {
        var template = new Backend.Models.TaskTemplate();
        Assert.Equal(TaskClassification.RoutineDailyTask, template.DefaultClassification);
    }

    [Fact]
    public void NewTemplate_DefaultAssignmentScope_IsSingleEmployee()
    {
        var template = new Backend.Models.TaskTemplate();
        Assert.Equal(AssignmentScope.SingleEmployee, template.DefaultAssignmentScope);
    }

    [Fact]
    public void DeactivateTemplate_SetsIsActiveFalse()
    {
        var template = new Backend.Models.TaskTemplate();
        template.IsActive = false;
        Assert.False(template.IsActive);
    }

    [Fact]
    public void Template_UpdateLastGeneratedDate()
    {
        var template = new Backend.Models.TaskTemplate();
        var now = DateTime.UtcNow;
        template.LastGeneratedDate = now;
        Assert.Equal(now, template.LastGeneratedDate);
    }

    [Fact]
    public void Template_UpdateNextGenerationDate()
    {
        var template = new Backend.Models.TaskTemplate();
        var next = new DateTime(2026, 7, 11, 6, 0, 0);
        template.NextGenerationDate = next;
        Assert.Equal(next, template.NextGenerationDate);
    }

    // Regression: the frontend sends RecurrenceStartDate as a date-only string (Kind=Unspecified).
    // PostgreSQL timestamptz columns require Utc, so the stored dates must be normalized with
    // DateTime.SpecifyKind(..., DateTimeKind.Utc) before persisting (see TaskTemplateService).
    [Fact]
    public void DateOnlyStartDate_IsNormalizedToUtc()
    {
        var start = new DateTime(2026, 8, 7, 0, 0, 0, DateTimeKind.Unspecified);
        var normalized = DateTime.SpecifyKind(start, DateTimeKind.Utc);

        Assert.Equal(DateTimeKind.Utc, normalized.Kind);
        Assert.Equal(new DateTime(2026, 8, 7, 0, 0, 0, DateTimeKind.Utc), normalized);
    }

    [Fact]
    public void NormalizedStartDate_KeepsUtcKindAfterNextGenerationCalculation()
    {
        var start = DateTime.SpecifyKind(new DateTime(2026, 8, 7), DateTimeKind.Utc);
        var next = Backend.Modules.TaskManagement.TaskTemplateService
            .CalculateNextGenerationDate(start, RecurrenceRule.Weekly);

        Assert.Equal(DateTimeKind.Utc, next.Kind);
        Assert.Equal(start.AddDays(7), next);
    }

    [Theory]
    [InlineData(PriorityLevel.Urgent, 1, 0)] // 24 hours (1 day)
    [InlineData(PriorityLevel.High, 2, 0)]   // 2 days
    [InlineData(PriorityLevel.Medium, 7, 0)] // 7 days
    [InlineData(PriorityLevel.Low, 14, 0)]   // 14 days
    public void CalculateDeadline_AdheresToSLARules(PriorityLevel priority, int expectedDays, int expectedHours)
    {
        var createdAt = new DateTime(2026, 10, 8, 10, 0, 0, DateTimeKind.Utc);
        var deadline = Backend.Modules.TaskManagement.TaskTemplateService
            .CalculateDeadline(priority, createdAt);

        var expectedDeadline = expectedDays > 0 ? createdAt.AddDays(expectedDays) : createdAt.AddHours(expectedHours);
        Assert.Equal(expectedDeadline, deadline);
    }
}
