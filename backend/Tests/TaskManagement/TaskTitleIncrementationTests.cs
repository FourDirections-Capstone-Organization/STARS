using Backend.Modules.TaskManagement;
using Xunit;

namespace Backend.Tests.TaskManagement;

public class TaskTitleIncrementationTests
{
    [Fact]
    public void ResolveIncrementalTitle_NoExistingTasks_ReturnsOriginalTitle()
    {
        var result = TaskService.ResolveIncrementalTitle("Custom Invoice", new List<string>());
        Assert.Equal("Custom Invoice", result);
    }

    [Fact]
    public void ResolveIncrementalTitle_ExactDuplicateExists_AppendsOne()
    {
        var existing = new List<string> { "Custom Invoice" };
        var result = TaskService.ResolveIncrementalTitle("Custom Invoice", existing);
        Assert.Equal("Custom Invoice 1", result);
    }

    [Fact]
    public void ResolveIncrementalTitle_DuplicateAndOneExist_AppendsTwo()
    {
        var existing = new List<string> { "Custom Invoice", "Custom Invoice 1" };
        var result = TaskService.ResolveIncrementalTitle("Custom Invoice", existing);
        Assert.Equal("Custom Invoice 2", result);
    }

    [Fact]
    public void ResolveIncrementalTitle_SequenceUpToTwo_AppendsThree()
    {
        var existing = new List<string> { "Custom Invoice", "Custom Invoice 1", "Custom Invoice 2" };
        var result = TaskService.ResolveIncrementalTitle("Custom Invoice", existing);
        Assert.Equal("Custom Invoice 3", result);
    }

    [Fact]
    public void ResolveIncrementalTitle_CaseInsensitive_AppendsNumber()
    {
        var existing = new List<string> { "custom invoice", "CUSTOM INVOICE 1" };
        var result = TaskService.ResolveIncrementalTitle("Custom Invoice", existing);
        Assert.Equal("Custom Invoice 2", result);
    }

    [Fact]
    public void ResolveIncrementalTitle_IgnoresUnrelatedTitlesWithSimilarPrefix()
    {
        var existing = new List<string> { "Custom Invoice Details", "Custom Invoice_Backup", "Custom Invoices" };
        var result = TaskService.ResolveIncrementalTitle("Custom Invoice", existing);
        Assert.Equal("Custom Invoice", result);
    }

    [Fact]
    public void ResolveIncrementalTitle_HandlesSpecialCharactersInTitle()
    {
        var existing = new List<string> { "Monthly Report [Finance] (v1.0)" };
        var result = TaskService.ResolveIncrementalTitle("Monthly Report [Finance] (v1.0)", existing);
        Assert.Equal("Monthly Report [Finance] (v1.0) 1", result);
    }

    [Fact]
    public void ResolveIncrementalTitle_FillsFirstAvailableGap()
    {
        var existing = new List<string> { "Custom Invoice", "Custom Invoice 2", "Custom Invoice 3" };
        var result = TaskService.ResolveIncrementalTitle("Custom Invoice", existing);
        Assert.Equal("Custom Invoice 1", result);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void ResolveIncrementalTitle_EmptyOrWhitespace_ReturnsAsIs(string input)
    {
        var result = TaskService.ResolveIncrementalTitle(input, new List<string> { "Task" });
        Assert.Equal(input, result);
    }
}
