using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.OrganizationalStructure;
using Backend.Modules.TaskManagement;
using Xunit;
using Task = System.Threading.Tasks.Task;
using BackendTask = Backend.Models.Task;

namespace Backend.Tests.OrganizationalStructure;

public class HierarchyDashboardTests
{
    private AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private HierarchyService CreateHierarchyService(AppDbContext db)
    {
        var auditLogServiceMock = new Mock<IAuditLogService>();
        return new HierarchyService(db, auditLogServiceMock.Object);
    }

    private ControllerContext CreateControllerContext(Guid userId, string role)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Role, role)
        };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        return new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal }
        };
    }

    [Fact]
    public async Task GetEmployeeDashboard_Level1_Manager_ReturnsExecutiveSupervisorAndPopulatedHeader()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);

        var dept = new Department { Id = Guid.NewGuid(), Name = "Executive Department", IsActive = true };
        var pos = new JobPosition { Id = Guid.NewGuid(), Name = "General Manager", DepartmentId = dept.Id, IsActive = true };
        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-MGR-001",
            Email = "manager@speedex.com",
            PasswordHash = "hash",
            FirstName = "Eleanor",
            LastName = "Vance",
            Role = UserRole.Manager,
            DepartmentId = dept.Id,
            Department = dept,
            JobPositionId = pos.Id,
            JobPosition = pos,
            AvailabilityStatus = AvailabilityStatus.Active,
            LastActivityAt = DateTime.UtcNow.AddMinutes(-5),
            IsActive = true
        };

        db.Departments.Add(dept);
        db.JobPositions.Add(pos);
        db.Users.Add(manager);
        await db.SaveChangesAsync();

        var result = await service.GetEmployeeDashboardAsync(manager.Id, manager.Id, UserRole.Manager);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal(manager.Id, result.Data.EmployeeId);
        Assert.Equal("EMP-MGR-001", result.Data.EmployeeNumber);
        Assert.Equal("Eleanor Vance", result.Data.FullName);
        Assert.Equal("manager@speedex.com", result.Data.Email);
        Assert.Equal("Manager", result.Data.Role);
        Assert.Equal("Executive Department", result.Data.DepartmentName);
        Assert.Equal("General Manager", result.Data.JobPositionName);
        Assert.Equal("Active", result.Data.AvailabilityStatus);
        Assert.Equal("Online", result.Data.PresenceStatus);

        // Supervisor: Top-level manager reports to Executive Board
        Assert.NotNull(result.Data.ReportsTo);
        Assert.Null(result.Data.ReportsTo.SupervisorId);
        Assert.Equal("Executive Board", result.Data.ReportsTo.SupervisorName);
        Assert.Equal("Executive Board", result.Data.ReportsTo.ReportingRelation);
        Assert.Equal("Executive Board", result.Data.SupervisorName);
        Assert.Equal("Executive Board", result.Data.ReportingRelation);
    }

    [Fact]
    public async Task GetEmployeeDashboard_Level2_Coordinator_ReportsToManager()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-MGR-001",
            Email = "manager@speedex.com",
            PasswordHash = "hash",
            FirstName = "Alice",
            LastName = "Boss",
            Role = UserRole.Manager,
            IsActive = true
        };
        var coordinator = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-COORD-001",
            Email = "coordinator@speedex.com",
            PasswordHash = "hash",
            FirstName = "Carlos",
            LastName = "Mendez",
            Role = UserRole.Coordinator,
            IsActive = true
        };

        db.Users.AddRange(manager, coordinator);
        await db.SaveChangesAsync();

        var result = await service.GetEmployeeDashboardAsync(coordinator.Id, manager.Id, UserRole.Manager);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal("Coordinator", result.Data.Role);
        Assert.NotNull(result.Data.ReportsTo);
        Assert.Equal(manager.Id, result.Data.ReportsTo.SupervisorId);
        Assert.Equal("Alice Boss", result.Data.ReportsTo.SupervisorName);
        Assert.Equal("Manager", result.Data.ReportsTo.ReportingRelation);
        Assert.Equal("EMP-MGR-001", result.Data.ReportsTo.SupervisorEmployeeNumber);
    }

    [Fact]
    public async Task GetEmployeeDashboard_Level3_StaffWithTeam_ReportsToTeamLeader()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-MGR-001",
            Email = "manager@speedex.com",
            PasswordHash = "hash",
            FirstName = "Alice",
            LastName = "Boss",
            Role = UserRole.Manager,
            IsActive = true
        };
        var teamLeader = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-LEAD-001",
            Email = "leader@speedex.com",
            PasswordHash = "hash",
            FirstName = "Liam",
            LastName = "Torres",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        var staff = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-STAFF-001",
            Email = "courier@speedex.com",
            PasswordHash = "hash",
            FirstName = "Sam",
            LastName = "Reyes",
            Role = UserRole.Courier,
            IsActive = true
        };

        var team = new Team
        {
            Id = Guid.NewGuid(),
            Name = "Express Dispatch Team",
            TeamLeaderId = teamLeader.Id,
            CreatedById = manager.Id,
            IsActive = true
        };

        var teamMember = new TeamMember
        {
            Id = Guid.NewGuid(),
            TeamId = team.Id,
            UserId = staff.Id
        };

        db.Users.AddRange(manager, teamLeader, staff);
        db.Teams.Add(team);
        db.TeamMembers.Add(teamMember);
        await db.SaveChangesAsync();

        var result = await service.GetEmployeeDashboardAsync(staff.Id, manager.Id, UserRole.Manager);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.NotNull(result.Data.ReportsTo);
        Assert.Equal(teamLeader.Id, result.Data.ReportsTo.SupervisorId);
        Assert.Equal("Liam Torres", result.Data.ReportsTo.SupervisorName);
        Assert.Equal("Team Leader", result.Data.ReportsTo.ReportingRelation);
        Assert.Equal("EMP-LEAD-001", result.Data.ReportsTo.SupervisorEmployeeNumber);
    }

    [Fact]
    public async Task GetEmployeeDashboard_Level3_StaffWithoutTeam_ReportsToDepartmentCoordinator()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);

        var dept = new Department { Id = Guid.NewGuid(), Name = "Logistics", IsActive = true };
        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-MGR-001",
            Email = "manager@speedex.com",
            PasswordHash = "hash",
            FirstName = "Alice",
            LastName = "Boss",
            Role = UserRole.Manager,
            IsActive = true
        };
        var deptCoordinator = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-COORD-002",
            Email = "logistics.coord@speedex.com",
            PasswordHash = "hash",
            FirstName = "Diana",
            LastName = "Prince",
            Role = UserRole.Coordinator,
            DepartmentId = dept.Id,
            IsActive = true
        };
        var staff = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-STAFF-002",
            Email = "encoder@speedex.com",
            PasswordHash = "hash",
            FirstName = "Barry",
            LastName = "Allen",
            Role = UserRole.Encoder,
            DepartmentId = dept.Id,
            IsActive = true
        };

        db.Departments.Add(dept);
        db.Users.AddRange(manager, deptCoordinator, staff);
        await db.SaveChangesAsync();

        var result = await service.GetEmployeeDashboardAsync(staff.Id, manager.Id, UserRole.Manager);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.NotNull(result.Data.ReportsTo);
        Assert.Equal(deptCoordinator.Id, result.Data.ReportsTo.SupervisorId);
        Assert.Equal("Diana Prince", result.Data.ReportsTo.SupervisorName);
        Assert.Equal("Department Coordinator", result.Data.ReportsTo.ReportingRelation);
    }

    [Fact]
    public async Task GetEmployeeDashboard_Level3_StaffWithoutTeamOrCoordinator_ReportsToManager()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-MGR-001",
            Email = "manager@speedex.com",
            PasswordHash = "hash",
            FirstName = "Alice",
            LastName = "Boss",
            Role = UserRole.Manager,
            IsActive = true
        };
        var staff = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-STAFF-003",
            Email = "dispatcher@speedex.com",
            PasswordHash = "hash",
            FirstName = "Victor",
            LastName = "Stone",
            Role = UserRole.Dispatcher,
            DepartmentId = null,
            IsActive = true
        };

        db.Users.AddRange(manager, staff);
        await db.SaveChangesAsync();

        var result = await service.GetEmployeeDashboardAsync(staff.Id, manager.Id, UserRole.Manager);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.NotNull(result.Data.ReportsTo);
        Assert.Equal(manager.Id, result.Data.ReportsTo.SupervisorId);
        Assert.Equal("Alice Boss", result.Data.ReportsTo.SupervisorName);
        Assert.Equal("Manager", result.Data.ReportsTo.ReportingRelation);
    }

    [Fact]
    public async Task GetEmployeeDashboard_ZeroTasks_ReturnsOkWithZeroCountsAndEmptyTrendLists()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);

        var staff = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-ZERO-001",
            Email = "zero@speedex.com",
            PasswordHash = "hash",
            FirstName = "Zero",
            LastName = "Tasker",
            Role = UserRole.Encoder,
            IsActive = true
        };

        db.Users.Add(staff);
        await db.SaveChangesAsync();

        var result = await service.GetEmployeeDashboardAsync(staff.Id, staff.Id, UserRole.Manager);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal(0, result.Data.TotalAssignedTasks);
        Assert.Equal(0, result.Data.TotalCreatedTasks);
        Assert.Equal(0, result.Data.CompletedCount);
        Assert.Equal(0, result.Data.InProgressCount);
        Assert.Equal(0, result.Data.PendingCount);
        Assert.Equal(0, result.Data.OverdueCount);

        // Empty breakdown and trend lists
        Assert.NotNull(result.Data.StatusBreakdown);
        Assert.Empty(result.Data.StatusBreakdown);

        Assert.NotNull(result.Data.PriorityDistribution);
        Assert.Empty(result.Data.PriorityDistribution);

        Assert.NotNull(result.Data.CompletionTrend);
        Assert.Empty(result.Data.CompletionTrend);
    }

    [Fact]
    public async Task GetEmployeeDashboard_NonExistentEmployee_ReturnsNotFoundFailure()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);

        var nonExistentId = Guid.NewGuid();
        var result = await service.GetEmployeeDashboardAsync(nonExistentId, Guid.NewGuid(), UserRole.Manager);

        Assert.False(result.IsSuccess);
        Assert.Equal("Employee not found", result.Message);
    }

    [Fact]
    public async Task GetEmployeeDashboard_TaskAggregations_CalculatesAccurateKpisAndBreakdowns()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);

        var employee = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-METRICS-001",
            Email = "metrics@speedex.com",
            PasswordHash = "hash",
            FirstName = "Rachel",
            LastName = "Green",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        db.Users.Add(employee);

        var creator = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-MGR-002",
            Email = "manager2@speedex.com",
            PasswordHash = "hash",
            FirstName = "Monica",
            LastName = "Geller",
            Role = UserRole.Manager,
            IsActive = true
        };
        db.Users.Add(creator);

        var now = DateTime.UtcNow;

        // 1. Completed Task (completed in September 2026)
        var taskCompleted = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TSK-001",
            Title = "Completed Task",
            Description = "Completed Desc",
            Status = Backend.Models.Enums.TaskStatus.Completed,
            PriorityLevel = PriorityLevel.High,
            Deadline = now.AddDays(-10),
            CreatedAt = new DateTime(2026, 9, 5, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 9, 15, 0, 0, 0, DateTimeKind.Utc),
            CreatedById = creator.Id
        };
        taskCompleted.Assignments.Add(new TaskAssignment { TaskId = taskCompleted.Id, AssignedUserId = employee.Id });

        // 2. In Progress Task (Future deadline)
        var taskInProgress = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TSK-002",
            Title = "In Progress Task",
            Description = "InProgress Desc",
            Status = Backend.Models.Enums.TaskStatus.InProgress,
            PriorityLevel = PriorityLevel.Urgent,
            Deadline = now.AddDays(5),
            CreatedAt = now.AddDays(-1),
            CreatedById = creator.Id
        };
        taskInProgress.Assignments.Add(new TaskAssignment { TaskId = taskInProgress.Id, AssignedUserId = employee.Id });

        // 3. Overdue Task (Past deadline, NotStarted)
        var taskOverdue = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TSK-003",
            Title = "Overdue NotStarted Task",
            Description = "Overdue Desc",
            Status = Backend.Models.Enums.TaskStatus.NotStarted,
            PriorityLevel = PriorityLevel.Medium,
            Deadline = now.AddDays(-3),
            CreatedAt = now.AddDays(-5),
            CreatedById = creator.Id
        };
        taskOverdue.Assignments.Add(new TaskAssignment { TaskId = taskOverdue.Id, AssignedUserId = employee.Id });

        // 4. Pending Task (Future deadline, NotStarted)
        var taskPending = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TSK-004",
            Title = "Pending Task",
            Description = "Pending Desc",
            Status = Backend.Models.Enums.TaskStatus.NotStarted,
            PriorityLevel = PriorityLevel.Low,
            Deadline = now.AddDays(7),
            CreatedAt = now.AddHours(-2),
            CreatedById = creator.Id
        };
        taskPending.Assignments.Add(new TaskAssignment { TaskId = taskPending.Id, AssignedUserId = employee.Id });

        // 5. Task CREATED by employee (not assigned to them)
        var taskCreatedOnly = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TSK-005",
            Title = "Created by employee",
            Description = "Created Desc",
            Status = Backend.Models.Enums.TaskStatus.InProgress,
            PriorityLevel = PriorityLevel.Medium,
            Deadline = now.AddDays(3),
            CreatedAt = now.AddHours(-1),
            CreatedById = employee.Id
        };

        db.Tasks.AddRange(taskCompleted, taskInProgress, taskOverdue, taskPending, taskCreatedOnly);
        await db.SaveChangesAsync();

        var result = await service.GetEmployeeDashboardAsync(employee.Id, creator.Id, UserRole.Manager);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);

        // KPI Counts
        Assert.Equal(4, result.Data.TotalAssignedTasks);
        Assert.Equal(1, result.Data.TotalCreatedTasks);
        Assert.Equal(1, result.Data.CompletedCount);
        Assert.Equal(1, result.Data.InProgressCount);
        Assert.Equal(2, result.Data.PendingCount); // taskOverdue (NotStarted) + taskPending (NotStarted)
        Assert.Equal(1, result.Data.OverdueCount); // taskOverdue

        // Priority Distribution
        Assert.Equal(4, result.Data.PriorityDistribution.Count);
        Assert.Equal(1, result.Data.PriorityDistribution.First(p => p.Priority == "Urgent").Count);
        Assert.Equal(1, result.Data.PriorityDistribution.First(p => p.Priority == "High").Count);
        Assert.Equal(1, result.Data.PriorityDistribution.First(p => p.Priority == "Medium").Count);
        Assert.Equal(1, result.Data.PriorityDistribution.First(p => p.Priority == "Low").Count);

        // Status Breakdown
        Assert.Contains(result.Data.StatusBreakdown, s => s.Status == "Completed" && s.Count == 1 && s.Percentage == 25.0);
        Assert.Contains(result.Data.StatusBreakdown, s => s.Status == "In Progress" && s.Count == 1 && s.Percentage == 25.0);
        Assert.Contains(result.Data.StatusBreakdown, s => s.Status == "Pending" && s.Count == 1 && s.Percentage == 25.0);
        Assert.Contains(result.Data.StatusBreakdown, s => s.Status == "Overdue" && s.Count == 1 && s.Percentage == 25.0);

        // Completion Trend
        Assert.Single(result.Data.CompletionTrend);
        Assert.Equal("Sep 2026", result.Data.CompletionTrend[0].Period);
        Assert.Equal(1, result.Data.CompletionTrend[0].CompletedCount);
    }

    [Fact]
    public async Task HierarchyController_GetEmployeeDashboard_NonExistentEmployee_ReturnsNotFound()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);
        var controller = new HierarchyController(service);

        var managerId = Guid.NewGuid();
        controller.ControllerContext = CreateControllerContext(managerId, "Manager");

        var nonExistentId = Guid.NewGuid();
        var response = await controller.GetEmployeeDashboard(nonExistentId);

        var notFoundResult = Assert.IsType<NotFoundObjectResult>(response);
        var apiResponse = Assert.IsAssignableFrom<ApiResponseDTO<EmployeeDashboardDTO>>(notFoundResult.Value);
        Assert.False(apiResponse.IsSuccess);
        Assert.Equal("Employee not found", apiResponse.Message);
    }

    [Fact]
    public async Task HierarchyController_GetEmployeeDashboard_ValidEmployee_ReturnsOk()
    {
        using var db = CreateDbContext();
        var service = CreateHierarchyService(db);
        var controller = new HierarchyController(service);

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-MGR-009",
            Email = "manager9@speedex.com",
            PasswordHash = "hash",
            FirstName = "Bruce",
            LastName = "Wayne",
            Role = UserRole.Manager,
            IsActive = true
        };
        var staff = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-STAFF-009",
            Email = "staff9@speedex.com",
            PasswordHash = "hash",
            FirstName = "Dick",
            LastName = "Grayson",
            Role = UserRole.Courier,
            IsActive = true
        };

        db.Users.AddRange(manager, staff);
        await db.SaveChangesAsync();

        controller.ControllerContext = CreateControllerContext(manager.Id, "Manager");

        var response = await controller.GetEmployeeDashboard(staff.Id);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsAssignableFrom<ApiResponseDTO<EmployeeDashboardDTO>>(okResult.Value);
        Assert.True(apiResponse.IsSuccess);
        Assert.NotNull(apiResponse.Data);
        Assert.Equal(staff.Id, apiResponse.Data.EmployeeId);
        Assert.Equal("Dick Grayson", apiResponse.Data.FullName);
    }
}
