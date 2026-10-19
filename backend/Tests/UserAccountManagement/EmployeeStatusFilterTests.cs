using Backend.Models;
using Xunit;

namespace Backend.Tests.UserAccountManagement;

public class EmployeeStatusFilterTests
{
    private IEnumerable<User> ApplyStatusFilter(IEnumerable<User> users, string? status)
    {
        var query = users.AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (status.Equals("Active", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(u => u.IsActive && !u.IsDeactivated);
            }
            else if (status.Equals("Inactive", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(u => !u.IsActive && !u.IsDeactivated);
            }
            else if (status.Equals("Deactivated", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(u => u.IsDeactivated);
            }
        }
        return query.ToList();
    }

    [Fact]
    public void FilterByStatus_Active_ReturnsOnlyActiveNonDeactivatedUsers()
    {
        var users = new List<User>
        {
            new() { FirstName = "ActiveUser", IsActive = true, IsDeactivated = false },
            new() { FirstName = "InactiveUser", IsActive = false, IsDeactivated = false },
            new() { FirstName = "DeactivatedUser", IsActive = false, IsDeactivated = true },
            new() { FirstName = "DeactivatedActiveFlagUser", IsActive = true, IsDeactivated = true },
        };

        var filtered = ApplyStatusFilter(users, "Active").ToList();

        Assert.Single(filtered);
        Assert.Equal("ActiveUser", filtered[0].FirstName);
    }

    [Fact]
    public void FilterByStatus_Inactive_ReturnsOnlyInactiveNonDeactivatedUsers()
    {
        var users = new List<User>
        {
            new() { FirstName = "ActiveUser", IsActive = true, IsDeactivated = false },
            new() { FirstName = "InactiveUser1", IsActive = false, IsDeactivated = false },
            new() { FirstName = "InactiveUser2", IsActive = false, IsDeactivated = false },
            new() { FirstName = "DeactivatedUser", IsActive = false, IsDeactivated = true },
        };

        var filtered = ApplyStatusFilter(users, "Inactive").ToList();

        Assert.Equal(2, filtered.Count);
        Assert.All(filtered, u => Assert.False(u.IsActive));
        Assert.All(filtered, u => Assert.False(u.IsDeactivated));
    }

    [Fact]
    public void FilterByStatus_Deactivated_ReturnsOnlyDeactivatedUsers()
    {
        var users = new List<User>
        {
            new() { FirstName = "ActiveUser", IsActive = true, IsDeactivated = false },
            new() { FirstName = "InactiveUser", IsActive = false, IsDeactivated = false },
            new() { FirstName = "DeactivatedUser1", IsActive = false, IsDeactivated = true },
            new() { FirstName = "DeactivatedUser2", IsActive = true, IsDeactivated = true },
        };

        var filtered = ApplyStatusFilter(users, "Deactivated").ToList();

        Assert.Equal(2, filtered.Count);
        Assert.All(filtered, u => Assert.True(u.IsDeactivated));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void FilterByStatus_NullOrEmpty_ReturnsAllUsers(string? status)
    {
        var users = new List<User>
        {
            new() { FirstName = "ActiveUser", IsActive = true, IsDeactivated = false },
            new() { FirstName = "InactiveUser", IsActive = false, IsDeactivated = false },
            new() { FirstName = "DeactivatedUser", IsActive = false, IsDeactivated = true },
        };

        var filtered = ApplyStatusFilter(users, status).ToList();

        Assert.Equal(3, filtered.Count);
    }
}
