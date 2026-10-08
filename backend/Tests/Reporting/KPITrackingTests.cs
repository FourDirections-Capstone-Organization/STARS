using Xunit;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.Enums;
using Backend.Models.DTOs;
using Backend.Modules.TaskManagement;
using Moq;

namespace Backend.Tests.Reporting;

public class KPITrackingTests
{
    private static string ClassifyTask(DateTime? updatedAt, DateTime deadline, DateTime? revisedDeadline)
    {
        if (updatedAt is null)
            return "Late";

        var effectiveDeadline = revisedDeadline ?? deadline;
        return updatedAt.Value <= effectiveDeadline ? "On-Time" : "Late";
    }

    private static (double OnTimeRate, double LateRate) CalculateRates(int onTime, int late)
    {
        var total = onTime + late;
        if (total == 0)
            return (0, 0);

        return (
            Math.Round((double)onTime / total * 100, 1),
            Math.Round((double)late / total * 100, 1)
        );
    }

    [Fact]
    public void CompletedBeforeDeadline_ClassifiedOnTime()
    {
        var result = ClassifyTask(
            new DateTime(2026, 7, 10, 15, 0, 0),
            new DateTime(2026, 7, 10, 17, 0, 0),
            null);
        Assert.Equal("On-Time", result);
    }

    [Fact]
    public void CompletedAfterDeadline_ClassifiedLate()
    {
        var result = ClassifyTask(
            new DateTime(2026, 7, 11, 9, 0, 0),
            new DateTime(2026, 7, 10, 17, 0, 0),
            null);
        Assert.Equal("Late", result);
    }

    [Fact]
    public void CompletedAtExactDeadline_ClassifiedOnTime()
    {
        var result = ClassifyTask(
            new DateTime(2026, 7, 10, 17, 0, 0),
            new DateTime(2026, 7, 10, 17, 0, 0),
            null);
        Assert.Equal("On-Time", result);
    }

    [Fact]
    public void CompletedBeforeRevisedDeadline_ClassifiedOnTime()
    {
        var result = ClassifyTask(
            new DateTime(2026, 7, 14, 10, 0, 0),
            new DateTime(2026, 7, 10, 17, 0, 0),
            new DateTime(2026, 7, 15, 17, 0, 0));
        Assert.Equal("On-Time", result);
    }

    [Fact]
    public void CompletedAfterRevisedDeadline_ClassifiedLate()
    {
        var result = ClassifyTask(
            new DateTime(2026, 7, 16, 10, 0, 0),
            new DateTime(2026, 7, 10, 17, 0, 0),
            new DateTime(2026, 7, 15, 17, 0, 0));
        Assert.Equal("Late", result);
    }

    [Fact]
    public void NullUpdatedAt_ClassifiedLate()
    {
        var result = ClassifyTask(null, new DateTime(2026, 7, 10), null);
        Assert.Equal("Late", result);
    }

    [Fact]
    public void AllOnTime_RateIs100Percent()
    {
        var (onTimeRate, lateRate) = CalculateRates(10, 0);
        Assert.Equal(100.0, onTimeRate);
        Assert.Equal(0.0, lateRate);
    }

    [Fact]
    public void AllLate_RateIs100PercentLate()
    {
        var (onTimeRate, lateRate) = CalculateRates(0, 10);
        Assert.Equal(0.0, onTimeRate);
        Assert.Equal(100.0, lateRate);
    }

    [Fact]
    public void HalfOnTimeHalfLate_RatesAre50PercentEach()
    {
        var (onTimeRate, lateRate) = CalculateRates(5, 5);
        Assert.Equal(50.0, onTimeRate);
        Assert.Equal(50.0, lateRate);
    }

    [Fact]
    public void ZeroCompletedTasks_RatesAreZero()
    {
        var (onTimeRate, lateRate) = CalculateRates(0, 0);
        Assert.Equal(0.0, onTimeRate);
        Assert.Equal(0.0, lateRate);
    }

    [Fact]
    public void OnTimeAndLateRates_SumTo100Percent()
    {
        for (var onTime = 0; onTime <= 10; onTime++)
        {
            var late = 10 - onTime;
            var (onTimeRate, lateRate) = CalculateRates(onTime, late);
            var sum = Math.Round(onTimeRate + lateRate, 1);
            Assert.Equal(100.0, sum);
        }
    }

    [Fact]
    public void UnevenSplit_RateRoundsToOneDecimalPlace()
    {
        var (onTimeRate, lateRate) = CalculateRates(7, 3);
        Assert.Equal(70.0, onTimeRate);
        Assert.Equal(30.0, lateRate);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetKpiTrackingAsync_WithCompletedTasks_ReturnsAccurateMetrics()
    {
        var options = new DbContextOptionsBuilder<Backend.Data.AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        using var db = new Backend.Data.AppDbContext(options);

        var dept = new Backend.Models.Department { Id = Guid.NewGuid(), Name = "Logistics" };
        var user = new Backend.Models.User
        {
            Id = Guid.NewGuid(),
            FirstName = "John",
            LastName = "Doe",
            Email = "john.doe@speedex.com",
            DepartmentId = dept.Id,
            Department = dept,
            EmployeeNumber = "EMP001"
        };
        db.Departments.Add(dept);
        db.Users.Add(user);

        var onTimeTask = new Backend.Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "On-time task",
            Status = Backend.Models.Enums.TaskStatus.Completed,
            CreatedAt = new DateTime(2026, 10, 5, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 10, 6, 10, 0, 0, DateTimeKind.Utc),
            Deadline = new DateTime(2026, 10, 7, 18, 0, 0, DateTimeKind.Utc),
            CreatedById = user.Id,
            AssignedDepartmentId = dept.Id,
            Assignments = new List<Backend.Models.TaskAssignment>
            {
                new Backend.Models.TaskAssignment { AssignedUserId = user.Id, AssignedUser = user }
            }
        };

        var lateTask = new Backend.Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Late task",
            Status = Backend.Models.Enums.TaskStatus.Completed,
            CreatedAt = new DateTime(2026, 10, 5, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 10, 8, 10, 0, 0, DateTimeKind.Utc),
            Deadline = new DateTime(2026, 10, 7, 18, 0, 0, DateTimeKind.Utc),
            CreatedById = user.Id,
            AssignedDepartmentId = dept.Id,
            Assignments = new List<Backend.Models.TaskAssignment>
            {
                new Backend.Models.TaskAssignment { AssignedUserId = user.Id, AssignedUser = user }
            }
        };

        db.Tasks.AddRange(onTimeTask, lateTask);
        await db.SaveChangesAsync();

        var auditMock = new Mock<IAuditLogService>();
        var service = new Backend.Modules.TaskManagement.ReportService(db, auditMock.Object);

        var filters = new Backend.Models.DTOs.KpiFilterDTO
        {
            DateRangeStart = new DateTime(2026, 10, 1),
            DateRangeEnd = new DateTime(2026, 10, 31)
        };

        var result = await service.GetKpiTrackingAsync(user.Id, Backend.Models.Enums.UserRole.Manager, null, filters);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal(2, result.Data.TotalCompletedTasks);
        Assert.Equal(1, result.Data.TotalOnTimeTasks);
        Assert.Equal(1, result.Data.TotalLateTasks);
        Assert.Equal(50.0, result.Data.OverallOnTimeRate);
        Assert.Equal(50.0, result.Data.OverallLateRate);
        Assert.Single(result.Data.EmployeeKpis);
        Assert.Equal("John Doe", result.Data.EmployeeKpis[0].EmployeeName);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetKpiTrackingAsync_WithNoCompletedTasks_ReturnsSuccessWithZeroedStats()
    {
        var options = new DbContextOptionsBuilder<Backend.Data.AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        using var db = new Backend.Data.AppDbContext(options);
        var auditMock = new Mock<IAuditLogService>();
        var service = new Backend.Modules.TaskManagement.ReportService(db, auditMock.Object);

        var filters = new Backend.Models.DTOs.KpiFilterDTO
        {
            DateRangeStart = new DateTime(2026, 10, 1),
            DateRangeEnd = new DateTime(2026, 10, 31)
        };

        var result = await service.GetKpiTrackingAsync(Guid.NewGuid(), Backend.Models.Enums.UserRole.Manager, null, filters);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal(0, result.Data.TotalCompletedTasks);
        Assert.Empty(result.Data.EmployeeKpis);
    }
}
