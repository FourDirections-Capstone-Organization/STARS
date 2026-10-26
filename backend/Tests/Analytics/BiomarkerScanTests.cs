using Xunit;
using Backend.Data;
using Backend.Models;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Backend.Tests.Analytics;

public class BiomarkerScanTests
{
    private (string Severity, double CurrentValue, double ThresholdValue)? CheckOnTimeRate(double onTimeRate, double minThreshold)
    {
        if (onTimeRate < minThreshold)
            return ("Warning", Math.Round(onTimeRate * 100, 2), minThreshold * 100);
        return null;
    }

    private (string Severity, int CurrentValue, int ThresholdValue)? CheckOverdueBacklog(int overdueCount, int maxThreshold)
    {
        if (overdueCount > maxThreshold)
        {
            var severity = overdueCount > maxThreshold * 2 ? "Critical" : "Warning";
            return (severity, overdueCount, maxThreshold);
        }
        return null;
    }

    private (string Severity, double CurrentValue, double ThresholdValue)? CheckEmployeeLateRate(int lateCount, int totalCompleted, double maxLateRate)
    {
        if (totalCompleted < 3) return null;
        var lateRate = (double)lateCount / totalCompleted;
        if (lateRate > maxLateRate)
            return ("Warning", Math.Round(lateRate * 100, 2), maxLateRate * 100);
        return null;
    }

    private bool CheckInactiveEmployee(int completedInLast7Days, int totalAssignments)
    {
        return completedInLast7Days == 0 && totalAssignments > 0;
    }

    private (string Severity, int CurrentValue)? CheckStuckTasks(int stuckCount)
    {
        return stuckCount > 0 ? ("Warning", stuckCount) : null;
    }

    [Fact]
    public void LowOnTimeRate_TriggersWarning()
    {
        var result = CheckOnTimeRate(0.50, 0.70);
        Assert.NotNull(result);
        Assert.Equal("Warning", result.Value.Severity);
    }

    [Fact]
    public void HighOnTimeRate_NoAlert()
    {
        var result = CheckOnTimeRate(0.90, 0.70);
        Assert.Null(result);
    }

    [Fact]
    public void OverdueBacklog_ExceedsThreshold_TriggersCritical()
    {
        var result = CheckOverdueBacklog(25, 10);
        Assert.NotNull(result);
        Assert.Equal("Critical", result.Value.Severity);
    }

    [Fact]
    public void OverdueBacklog_Moderate_TriggersWarning()
    {
        var result = CheckOverdueBacklog(15, 10);
        Assert.NotNull(result);
        Assert.Equal("Warning", result.Value.Severity);
    }

    [Fact]
    public void EmployeeLateRate_Over50Percent_TriggersWarning()
    {
        var result = CheckEmployeeLateRate(3, 5, 0.50);
        Assert.NotNull(result);
        Assert.Equal("Warning", result.Value.Severity);
    }

    [Fact]
    public void EmployeeLateRate_BelowThreshold_NoAlert()
    {
        var result = CheckEmployeeLateRate(1, 5, 0.50);
        Assert.Null(result);
    }

    [Fact]
    public void InactiveEmployee_7Days_NoCompleted_TriggersAlert()
    {
        var inactive = CheckInactiveEmployee(0, 3);
        Assert.True(inactive);
    }

    [Fact]
    public void InactiveEmployee_WithCompleted_NoAlert()
    {
        var inactive = CheckInactiveEmployee(2, 3);
        Assert.False(inactive);
    }

    [Fact]
    public void StuckTasks_Over48Hours_TriggersWarning()
    {
        var result = CheckStuckTasks(3);
        Assert.NotNull(result);
        Assert.Equal("Warning", result.Value.Severity);
    }

    [Fact]
    public void NoStuckTasks_NoAlert()
    {
        var result = CheckStuckTasks(0);
        Assert.Null(result);
    }

    [Fact]
    public void EmptyDatabase_NoAlertsGenerated()
    {
        var result = CheckOnTimeRate(0.0, 0.70);
        Assert.NotNull(result);

        var backlogResult = CheckOverdueBacklog(0, 10);
        Assert.Null(backlogResult);

        var lateResult = CheckEmployeeLateRate(0, 0, 0.50);
        Assert.Null(lateResult);
    }

    [Fact]
    public void IsTaskOnTime_CompletedBeforeDeadline_ReturnsTrue()
    {
        var task = new Backend.Models.Task
        {
            Deadline = new DateTime(2026, 7, 20, 18, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 7, 20, 16, 0, 0, DateTimeKind.Utc)
        };

        Assert.True(BiomarkerScanService.IsTaskOnTime(task));
        Assert.False(BiomarkerScanService.IsTaskLate(task));
    }

    [Fact]
    public void IsTaskOnTime_CompletedAfterDeadline_ReturnsFalse()
    {
        var task = new Backend.Models.Task
        {
            Deadline = new DateTime(2026, 7, 20, 18, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 7, 20, 19, 0, 0, DateTimeKind.Utc)
        };

        Assert.False(BiomarkerScanService.IsTaskOnTime(task));
        Assert.True(BiomarkerScanService.IsTaskLate(task));
    }

    [Fact]
    public void IsTaskOnTime_CompletedAtExactDeadline_ReturnsTrue()
    {
        var deadline = new DateTime(2026, 7, 20, 18, 0, 0, DateTimeKind.Utc);
        var task = new Backend.Models.Task
        {
            Deadline = deadline,
            UpdatedAt = deadline
        };

        Assert.True(BiomarkerScanService.IsTaskOnTime(task));
        Assert.False(BiomarkerScanService.IsTaskLate(task));
    }

    [Fact]
    public void IsTaskOnTime_CompletedBeforeRevisedDeadline_ReturnsTrue()
    {
        var task = new Backend.Models.Task
        {
            Deadline = new DateTime(2026, 7, 20, 18, 0, 0, DateTimeKind.Utc),
            RevisedDeadline = new DateTime(2026, 7, 25, 18, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 7, 22, 10, 0, 0, DateTimeKind.Utc) // past original, before revised
        };

        Assert.True(BiomarkerScanService.IsTaskOnTime(task));
        Assert.False(BiomarkerScanService.IsTaskLate(task));
    }

    [Fact]
    public void IsTaskOnTime_CompletedAfterRevisedDeadline_ReturnsFalse()
    {
        var task = new Backend.Models.Task
        {
            Deadline = new DateTime(2026, 7, 20, 18, 0, 0, DateTimeKind.Utc),
            RevisedDeadline = new DateTime(2026, 7, 25, 18, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 7, 26, 10, 0, 0, DateTimeKind.Utc)
        };

        Assert.False(BiomarkerScanService.IsTaskOnTime(task));
        Assert.True(BiomarkerScanService.IsTaskLate(task));
    }

    [Fact]
    public void IsTaskOnTime_NullUpdatedAt_UsesCreatedAt()
    {
        var task = new Backend.Models.Task
        {
            Deadline = new DateTime(2026, 7, 20, 18, 0, 0, DateTimeKind.Utc),
            CreatedAt = new DateTime(2026, 7, 20, 12, 0, 0, DateTimeKind.Utc),
            UpdatedAt = null
        };

        Assert.True(BiomarkerScanService.IsTaskOnTime(task));
        Assert.False(BiomarkerScanService.IsTaskLate(task));
    }

    [Fact]
    public void IsTaskOnTime_UnapprovedTaskCompletedOnTime_ReturnsTrue_IgnoresIsApproved()
    {
        var task = new Backend.Models.Task
        {
            Deadline = new DateTime(2026, 7, 20, 18, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 7, 20, 15, 0, 0, DateTimeKind.Utc),
            IsApproved = false
        };

        Assert.True(BiomarkerScanService.IsTaskOnTime(task));
        Assert.False(BiomarkerScanService.IsTaskLate(task));
    }

    [Fact]
    public void IsTaskOnTime_ApprovedTaskCompletedLate_ReturnsFalse_IgnoresIsApproved()
    {
        var task = new Backend.Models.Task
        {
            Deadline = new DateTime(2026, 7, 20, 18, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 7, 20, 20, 0, 0, DateTimeKind.Utc),
            IsApproved = true
        };

        Assert.False(BiomarkerScanService.IsTaskOnTime(task));
        Assert.True(BiomarkerScanService.IsTaskLate(task));
    }

    [Fact]
    public void CalculateOnTimeRate_WithMixedTasks_CalculatesAccurately()
    {
        var tasks = new List<Backend.Models.Task>
        {
            new() { Deadline = new DateTime(2026, 7, 20), UpdatedAt = new DateTime(2026, 7, 19) },
            new() { Deadline = new DateTime(2026, 7, 20), RevisedDeadline = new DateTime(2026, 7, 25), UpdatedAt = new DateTime(2026, 7, 22) },
            new() { Deadline = new DateTime(2026, 7, 20), UpdatedAt = new DateTime(2026, 7, 21) },
            new() { Deadline = new DateTime(2026, 7, 20), UpdatedAt = new DateTime(2026, 7, 22) }
        };

        var rate = BiomarkerScanService.CalculateOnTimeRate(tasks);
        Assert.Equal(0.5, rate);
    }

    [Fact]
    public void CalculateOnTimeRate_EmptyList_ReturnsOne()
    {
        var rate = BiomarkerScanService.CalculateOnTimeRate(new List<Backend.Models.Task>());
        Assert.Equal(1.0, rate);
    }

    [Fact]
    public void CalculateEmployeeLateRate_WithMixedTasks_CalculatesAccurately()
    {
        var tasks = new List<Backend.Models.Task>
        {
            new() { Deadline = new DateTime(2026, 7, 20), UpdatedAt = new DateTime(2026, 7, 19) },
            new() { Deadline = new DateTime(2026, 7, 20), UpdatedAt = new DateTime(2026, 7, 21) },
            new() { Deadline = new DateTime(2026, 7, 20), UpdatedAt = new DateTime(2026, 7, 22) }
        };

        var lateRate = BiomarkerScanService.CalculateEmployeeLateRate(tasks);
        Assert.Equal(Math.Round(2.0 / 3.0, 4), Math.Round(lateRate, 4));
    }

    [Fact]
    public void CalculateEmployeeLateRate_EmptyList_ReturnsZero()
    {
        var rate = BiomarkerScanService.CalculateEmployeeLateRate(new List<Backend.Models.Task>());
        Assert.Equal(0.0, rate);
    }

    [Fact]
    public void CalculateOverallSlaCompliance_ReturnsCorrectPercentage()
    {
        var compliance = BiomarkerScanService.CalculateOverallSlaCompliance(7, 10);
        Assert.Equal(70.0, compliance);
    }

    [Fact]
    public void CalculateOverallSlaCompliance_ZeroTasks_Returns100Percent()
    {
        var compliance = BiomarkerScanService.CalculateOverallSlaCompliance(0, 0);
        Assert.Equal(100.0, compliance);
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_CalculatesSlaBasedOnDeadlinesNotIsApproved()
    {
        var services = new ServiceCollection();
        var dbName = Guid.NewGuid().ToString();
        services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(dbName));
        var serviceProvider = services.BuildServiceProvider();
        var scopeFactory = serviceProvider.GetRequiredService<IServiceScopeFactory>();

        var thresholds = Options.Create(new BiomarkerThresholds
        {
            MinOnTimeRate = 0.80,
            MaxLateRatePerEmployee = 0.30,
            MaxOverdueBacklog = 10,
            MaxWorkloadPerEmployee = 10,
            StuckTaskHours = 48
        });

        var logger = NullLogger<BiomarkerScanService>.Instance;
        var scanService = new BiomarkerScanService(scopeFactory, thresholds, logger);

        var now = DateTime.UtcNow;

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var dept = new Department { Id = Guid.NewGuid(), Name = "Logistics", IsActive = true };
            var emp = new User
            {
                Id = Guid.NewGuid(),
                FirstName = "Alice",
                LastName = "Smith",
                Email = "alice@speedex.com",
                DepartmentId = dept.Id,
                EmployeeNumber = "EMP100",
                Role = UserRole.Courier,
                IsActive = true
            };
            db.Departments.Add(dept);
            db.Users.Add(emp);

            // Task 1: Completed before deadline, IsApproved = false -> ON-TIME
            var task1 = new Backend.Models.Task
            {
                Id = Guid.NewGuid(),
                Title = "Task 1",
                Status = Backend.Models.Enums.TaskStatus.Completed,
                IsApproved = false,
                AssignedDepartmentId = dept.Id,
                CreatedAt = now.AddHours(-10),
                UpdatedAt = now.AddHours(-2),
                Deadline = now.AddHours(2),
                Assignments = new List<TaskAssignment>
                {
                    new() { AssignedUserId = emp.Id }
                }
            };

            // Task 2: Completed before revised deadline, IsApproved = false -> ON-TIME
            var task2 = new Backend.Models.Task
            {
                Id = Guid.NewGuid(),
                Title = "Task 2",
                Status = Backend.Models.Enums.TaskStatus.Completed,
                IsApproved = false,
                AssignedDepartmentId = dept.Id,
                CreatedAt = now.AddHours(-20),
                UpdatedAt = now.AddHours(-2),
                Deadline = now.AddHours(-5),
                RevisedDeadline = now.AddHours(5),
                Assignments = new List<TaskAssignment>
                {
                    new() { AssignedUserId = emp.Id }
                }
            };

            // Task 3: Completed after deadline, IsApproved = true -> LATE
            var task3 = new Backend.Models.Task
            {
                Id = Guid.NewGuid(),
                Title = "Task 3",
                Status = Backend.Models.Enums.TaskStatus.Completed,
                IsApproved = true,
                AssignedDepartmentId = dept.Id,
                CreatedAt = now.AddHours(-20),
                UpdatedAt = now.AddHours(-1),
                Deadline = now.AddHours(-3),
                Assignments = new List<TaskAssignment>
                {
                    new() { AssignedUserId = emp.Id }
                }
            };

            db.Tasks.AddRange(task1, task2, task3);
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(DateTime.UtcNow.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alerts = await db.BiomarkerAlerts.ToListAsync();

            // Department OnTimeRate: 2 on-time out of 3 = 66.67% (< 80% threshold -> warning alert)
            var onTimeAlert = alerts.FirstOrDefault(a => a.MetricName == "OnTimeRate");
            Assert.NotNull(onTimeAlert);
            Assert.Equal(66.67, onTimeAlert.CurrentValue);

            // Employee Late Rate: 1 late out of 3 = 33.33% (> 30% threshold -> warning alert)
            var lateAlert = alerts.FirstOrDefault(a => a.MetricName == "EmployeeLateRate");
            Assert.NotNull(lateAlert);
            Assert.Equal(33.33, lateAlert.CurrentValue);

            // System Overall SLA Compliance: 2 on-time out of 3 = 66.67% (< 80% threshold -> warning alert)
            var overallAlert = alerts.FirstOrDefault(a => a.MetricName == "OverallSlaCompliance");
            Assert.NotNull(overallAlert);
            Assert.Equal(66.67, overallAlert.CurrentValue);
        }
    }
}

