using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Backend.Data;
using Backend.Models;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;
using Task = System.Threading.Tasks.Task;

namespace Backend.Tests.TaskManagement;

public class RoundRobinAssignmentTests
{
    private AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    [Fact]
    public async Task PickAssignee_SkipsOfflineAndOnLeaveEmployees()
    {
        using var db = CreateDbContext();
        var deptId = Guid.NewGuid();

        // Active employee
        var activeUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "emp1@example.com",
            DepartmentId = deptId,
            AvailabilityStatus = AvailabilityStatus.Active,
            Role = UserRole.Encoder,
            IsActive = true
        };

        // Offline employee
        var offlineUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            Email = "emp2@example.com",
            DepartmentId = deptId,
            AvailabilityStatus = AvailabilityStatus.Offline,
            Role = UserRole.Encoder,
            IsActive = true
        };

        // On leave employee
        var onLeaveUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-003",
            Email = "emp3@example.com",
            DepartmentId = deptId,
            AvailabilityStatus = AvailabilityStatus.OnLeave,
            Role = UserRole.Encoder,
            IsActive = true
        };

        db.Users.AddRange(activeUser, offlineUser, onLeaveUser);
        await db.SaveChangesAsync();

        var service = new RoundRobinAssignmentService(db, NullLogger<RoundRobinAssignmentService>.Instance);
        var winner = await service.PickAssigneeAsync(deptId);

        Assert.NotNull(winner);
        Assert.Equal(activeUser.Id, winner.Value);
    }

    [Fact]
    public async Task PickAssignee_PicksEmployeeWithLeastActiveTasks()
    {
        using var db = CreateDbContext();
        var deptId = Guid.NewGuid();

        var userWithTwoTasks = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "emp1@example.com",
            DepartmentId = deptId,
            AvailabilityStatus = AvailabilityStatus.Active,
            Role = UserRole.Encoder,
            IsActive = true
        };

        var userWithNoTasks = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            Email = "emp2@example.com",
            DepartmentId = deptId,
            AvailabilityStatus = AvailabilityStatus.Active,
            Role = UserRole.Encoder,
            IsActive = true
        };

        db.Users.AddRange(userWithTwoTasks, userWithNoTasks);

        var task1 = new Backend.Models.Task { Id = Guid.NewGuid(), Title = "Task 1", Status = Backend.Models.Enums.TaskStatus.InProgress };
        var task2 = new Backend.Models.Task { Id = Guid.NewGuid(), Title = "Task 2", Status = Backend.Models.Enums.TaskStatus.NotStarted };
        db.Tasks.AddRange(task1, task2);

        db.TaskAssignments.AddRange(
            new TaskAssignment { TaskId = task1.Id, AssignedUserId = userWithTwoTasks.Id },
            new TaskAssignment { TaskId = task2.Id, AssignedUserId = userWithTwoTasks.Id }
        );

        await db.SaveChangesAsync();

        var service = new RoundRobinAssignmentService(db, NullLogger<RoundRobinAssignmentService>.Instance);
        var winner = await service.PickAssigneeAsync(deptId);

        Assert.NotNull(winner);
        Assert.Equal(userWithNoTasks.Id, winner.Value);
    }

    [Fact]
    public async Task PickAssignee_TieBreaksByOldestLastAssignment()
    {
        using var db = CreateDbContext();
        var deptId = Guid.NewGuid();

        var userAssignedYesterday = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "emp1@example.com",
            DepartmentId = deptId,
            AvailabilityStatus = AvailabilityStatus.Active,
            Role = UserRole.Encoder,
            IsActive = true
        };

        var userAssignedLastWeek = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            Email = "emp2@example.com",
            DepartmentId = deptId,
            AvailabilityStatus = AvailabilityStatus.Active,
            Role = UserRole.Encoder,
            IsActive = true
        };

        db.Users.AddRange(userAssignedYesterday, userAssignedLastWeek);

        var task1 = new Backend.Models.Task { Id = Guid.NewGuid(), Title = "Task 1", Status = Backend.Models.Enums.TaskStatus.InProgress };
        var task2 = new Backend.Models.Task { Id = Guid.NewGuid(), Title = "Task 2", Status = Backend.Models.Enums.TaskStatus.InProgress };
        db.Tasks.AddRange(task1, task2);

        db.TaskAssignments.AddRange(
            new TaskAssignment { TaskId = task1.Id, AssignedUserId = userAssignedYesterday.Id, AssignedAt = DateTime.UtcNow.AddDays(-1) },
            new TaskAssignment { TaskId = task2.Id, AssignedUserId = userAssignedLastWeek.Id, AssignedAt = DateTime.UtcNow.AddDays(-7) }
        );

        await db.SaveChangesAsync();

        var service = new RoundRobinAssignmentService(db, NullLogger<RoundRobinAssignmentService>.Instance);
        var winner = await service.PickAssigneeAsync(deptId);

        Assert.NotNull(winner);
        // userAssignedLastWeek hasn't been assigned anything in the longest time
        Assert.Equal(userAssignedLastWeek.Id, winner.Value);
    }

    [Fact]
    public async Task PickAssignee_ReturnsNullIfNoEligibleEmployees()
    {
        using var db = CreateDbContext();
        var deptId = Guid.NewGuid();

        var offlineUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "emp1@example.com",
            DepartmentId = deptId,
            AvailabilityStatus = AvailabilityStatus.Offline,
            Role = UserRole.Encoder,
            IsActive = true
        };

        db.Users.Add(offlineUser);
        await db.SaveChangesAsync();

        var service = new RoundRobinAssignmentService(db, NullLogger<RoundRobinAssignmentService>.Instance);
        var winner = await service.PickAssigneeAsync(deptId);

        Assert.Null(winner);
    }
}
