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
using Backend.Modules.Notifications;
using Backend.Modules.TaskManagement;
using Xunit;
using Task = System.Threading.Tasks.Task;
using BackendTask = Backend.Models.Task;

namespace Backend.Tests.TaskManagement;

public class TaskServiceCreatedByFilterTests
{
    private AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private TaskService CreateTaskService(AppDbContext db)
    {
        var notificationServiceMock = new Mock<INotificationService>();
        var dashboardServiceMock = new Mock<IDashboardService>();
        var auditLogServiceMock = new Mock<IAuditLogService>();
        var slaRiskServiceMock = new Mock<ISlaRiskPredictionService>();

        return new TaskService(
            db,
            notificationServiceMock.Object,
            dashboardServiceMock.Object,
            auditLogServiceMock.Object,
            slaRiskServiceMock.Object);
    }

    [Fact]
    public async Task GetAllAsync_WithCreatedByUserId_FiltersOnlyTasksCreatedByThatUser()
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);

        var creatorA = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "creatorA@speedex.com",
            PasswordHash = "hash",
            FirstName = "Alice",
            LastName = "Coordinator",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        var creatorB = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            Email = "creatorB@speedex.com",
            PasswordHash = "hash",
            FirstName = "Bob",
            LastName = "Coordinator",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-000",
            Email = "manager@speedex.com",
            PasswordHash = "hash",
            FirstName = "System",
            LastName = "Manager",
            Role = UserRole.Manager,
            IsActive = true
        };

        db.Users.AddRange(creatorA, creatorB, manager);

        // 3 tasks created by creatorA
        for (int i = 1; i <= 3; i++)
        {
            db.Tasks.Add(new BackendTask
            {
                Id = Guid.NewGuid(),
                TaskNumber = $"TASK-A-{i}",
                Title = $"Alice Task {i}",
                Description = $"Description for task {i}",
                CreatedById = creatorA.Id,
                CreatedBy = creatorA,
                Deadline = DateTime.UtcNow.AddDays(7),
                Status = Backend.Models.Enums.TaskStatus.InProgress,
                CreatedAt = DateTime.UtcNow.AddHours(-i)
            });
        }

        // 2 tasks created by creatorB
        for (int i = 1; i <= 2; i++)
        {
            db.Tasks.Add(new BackendTask
            {
                Id = Guid.NewGuid(),
                TaskNumber = $"TASK-B-{i}",
                Title = $"Bob Task {i}",
                Description = $"Description for task {i}",
                CreatedById = creatorB.Id,
                CreatedBy = creatorB,
                Deadline = DateTime.UtcNow.AddDays(7),
                Status = Backend.Models.Enums.TaskStatus.NotStarted,
                CreatedAt = DateTime.UtcNow.AddHours(-i - 5)
            });
        }

        await db.SaveChangesAsync();

        // Act - Manager queries tasks created by creatorA
        var resultA = await service.GetAllAsync(
            requestUserId: manager.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            createdByUserId: creatorA.Id);

        // Assert
        Assert.True(resultA.IsSuccess);
        Assert.Equal(3, resultA.Data!.TotalCount);
        Assert.Equal(3, resultA.Data.Items.Count);
        Assert.All(resultA.Data.Items, item => Assert.Equal(creatorA.Id, item.CreatedById));

        // Act - Manager queries tasks created by creatorB
        var resultB = await service.GetAllAsync(
            requestUserId: manager.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            createdByUserId: creatorB.Id);

        // Assert
        Assert.True(resultB.IsSuccess);
        Assert.Equal(2, resultB.Data!.TotalCount);
        Assert.Equal(2, resultB.Data.Items.Count);
        Assert.All(resultB.Data.Items, item => Assert.Equal(creatorB.Id, item.CreatedById));
    }

    [Fact]
    public async Task GetAllAsync_WithCreatedByUserId_RespectsServerPagination()
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);

        var creator = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "creator@speedex.com",
            PasswordHash = "hash",
            FirstName = "Charlie",
            LastName = "Coordinator",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        db.Users.Add(creator);

        // Create 5 tasks created by creator
        for (int i = 1; i <= 5; i++)
        {
            db.Tasks.Add(new BackendTask
            {
                Id = Guid.NewGuid(),
                TaskNumber = $"PAGED-{i}",
                Title = $"Paged Task {i}",
                Description = $"Description {i}",
                CreatedById = creator.Id,
                CreatedBy = creator,
                Deadline = DateTime.UtcNow.AddDays(7),
                CreatedAt = DateTime.UtcNow.AddMinutes(-i)
            });
        }

        await db.SaveChangesAsync();

        // Page 1, size 2
        var page1 = await service.GetAllAsync(
            requestUserId: creator.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            pageNumber: 1,
            pageSize: 2,
            createdByUserId: creator.Id);

        Assert.True(page1.IsSuccess);
        Assert.Equal(5, page1.Data!.TotalCount);
        Assert.Equal(2, page1.Data.Items.Count);
        Assert.Equal(1, page1.Data.PageNumber);
        Assert.Equal(2, page1.Data.PageSize);

        // Page 3, size 2 (should have last 1 item)
        var page3 = await service.GetAllAsync(
            requestUserId: creator.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            pageNumber: 3,
            pageSize: 2,
            createdByUserId: creator.Id);

        Assert.True(page3.IsSuccess);
        Assert.Equal(5, page3.Data!.TotalCount);
        Assert.Single(page3.Data.Items);
        Assert.Equal(3, page3.Data.PageNumber);
    }

    [Fact]
    public async Task GetAllAsync_WithCreatedByUserId_NoTasksMatch_ReturnsEmpty()
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);

        var creatorWithNoTasks = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-999",
            Email = "notasks@speedex.com",
            PasswordHash = "hash",
            FirstName = "No",
            LastName = "Tasks",
            Role = UserRole.Encoder,
            IsActive = true
        };
        db.Users.Add(creatorWithNoTasks);
        await db.SaveChangesAsync();

        var result = await service.GetAllAsync(
            requestUserId: creatorWithNoTasks.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            createdByUserId: creatorWithNoTasks.Id);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Data!.TotalCount);
        Assert.Empty(result.Data.Items);
    }

    [Fact]
    public async Task GetAllAsync_WithoutCreatedByUserId_ReturnsAllAccessibleTasks()
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);

        var creatorA = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "creatorA@speedex.com",
            PasswordHash = "hash",
            FirstName = "Alice",
            LastName = "Coordinator",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        var creatorB = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            Email = "creatorB@speedex.com",
            PasswordHash = "hash",
            FirstName = "Bob",
            LastName = "Coordinator",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        db.Users.AddRange(creatorA, creatorB);

        db.Tasks.Add(new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Task A",
            Description = "Desc A",
            CreatedById = creatorA.Id,
            CreatedBy = creatorA,
            Deadline = DateTime.UtcNow.AddDays(7)
        });
        db.Tasks.Add(new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Task B",
            Description = "Desc B",
            CreatedById = creatorB.Id,
            CreatedBy = creatorB,
            Deadline = DateTime.UtcNow.AddDays(7)
        });

        await db.SaveChangesAsync();

        // Act - Manager with no createdByUserId filter
        var result = await service.GetAllAsync(
            requestUserId: Guid.NewGuid(),
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            createdByUserId: null);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Data!.TotalCount);
        Assert.Equal(2, result.Data.Items.Count);
    }

    [Theory]
    [InlineData(UserRole.Dispatcher)]
    [InlineData(UserRole.Encoder)]
    [InlineData(UserRole.Courier)]
    [InlineData(UserRole.Accountant)]
    public async Task GetAllAsync_WithCreatedByUserId_NonCreatorOperationalRoles_ReturnsEmptyEvenIfTasksExist(UserRole operationalRole)
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);

        var operationalUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-OPERATIONAL-01",
            Email = "operational@speedex.com",
            PasswordHash = "hash",
            FirstName = "Op",
            LastName = "Worker",
            Role = operationalRole,
            IsActive = true
        };
        db.Users.Add(operationalUser);

        // Even if bad/legacy data has tasks created by this user:
        db.Tasks.Add(new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Task with operational creator",
            Description = "Should not be returned under Created Tasks",
            CreatedById = operationalUser.Id,
            CreatedBy = operationalUser,
            Deadline = DateTime.UtcNow.AddDays(7),
            Status = Backend.Models.Enums.TaskStatus.InProgress,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var result = await service.GetAllAsync(
            requestUserId: operationalUser.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            createdByUserId: operationalUser.Id);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Data!.TotalCount);
        Assert.Empty(result.Data.Items);
    }

    [Fact]
    public async Task GetAllAsync_WithCreatedByUserId_NonExistentCreator_ReturnsEmpty()
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);

        var nonExistentUserId = Guid.NewGuid();

        var result = await service.GetAllAsync(
            requestUserId: Guid.NewGuid(),
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            createdByUserId: nonExistentUserId);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Data!.TotalCount);
        Assert.Empty(result.Data.Items);
    }

    [Fact]
    public async Task GetAllAsync_StatusFilterVariations_ReturnsExpectedFilteredTasks()
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);

        var coordinator = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-COORD-01",
            Email = "coord@speedex.com",
            PasswordHash = "hash",
            FirstName = "Chloe",
            LastName = "Coord",
            Role = UserRole.Coordinator,
            IsActive = true
        };
        db.Users.Add(coordinator);

        var taskCancelled = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TASK-CANCELLED",
            Title = "Cancelled Task",
            Description = "Desc Cancelled",
            CreatedById = coordinator.Id,
            CreatedBy = coordinator,
            Status = Backend.Models.Enums.TaskStatus.Cancelled,
            Deadline = DateTime.UtcNow.AddDays(3)
        };
        var taskInProgress = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TASK-INPROGRESS",
            Title = "In Progress Task",
            Description = "Desc InProgress",
            CreatedById = coordinator.Id,
            CreatedBy = coordinator,
            Status = Backend.Models.Enums.TaskStatus.InProgress,
            Deadline = DateTime.UtcNow.AddDays(3)
        };
        var taskOnHold = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TASK-ONHOLD",
            Title = "On Hold Task",
            Description = "Desc OnHold",
            CreatedById = coordinator.Id,
            CreatedBy = coordinator,
            Status = Backend.Models.Enums.TaskStatus.OnHold,
            Deadline = DateTime.UtcNow.AddDays(3)
        };
        var taskNotStarted = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TASK-NOTSTARTED",
            Title = "Not Started Task",
            Description = "Desc NotStarted",
            CreatedById = coordinator.Id,
            CreatedBy = coordinator,
            Status = Backend.Models.Enums.TaskStatus.NotStarted,
            Deadline = DateTime.UtcNow.AddDays(3)
        };
        var taskCompleted = new BackendTask
        {
            Id = Guid.NewGuid(),
            TaskNumber = "TASK-COMPLETED",
            Title = "Completed Task",
            Description = "Desc Completed",
            CreatedById = coordinator.Id,
            CreatedBy = coordinator,
            Status = Backend.Models.Enums.TaskStatus.Completed,
            Deadline = DateTime.UtcNow.AddDays(3)
        };

        db.Tasks.AddRange(taskCancelled, taskInProgress, taskOnHold, taskNotStarted, taskCompleted);
        await db.SaveChangesAsync();

        // 1. Status = Cancelled
        var cancelledRes = await service.GetAllAsync(
            requestUserId: coordinator.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            status: Backend.Models.Enums.TaskStatus.Cancelled);
        Assert.True(cancelledRes.IsSuccess);
        Assert.Equal(1, cancelledRes.Data!.TotalCount);
        Assert.Equal("TASK-CANCELLED", cancelledRes.Data.Items[0].TaskNumber);

        // 2. Status = InProgress
        var inProgRes = await service.GetAllAsync(
            requestUserId: coordinator.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            status: Backend.Models.Enums.TaskStatus.InProgress);
        Assert.True(inProgRes.IsSuccess);
        Assert.Equal(1, inProgRes.Data!.TotalCount);
        Assert.Equal("TASK-INPROGRESS", inProgRes.Data.Items[0].TaskNumber);

        // 3. Status = OnHold
        var onHoldRes = await service.GetAllAsync(
            requestUserId: coordinator.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            status: Backend.Models.Enums.TaskStatus.OnHold);
        Assert.True(onHoldRes.IsSuccess);
        Assert.Equal(1, onHoldRes.Data!.TotalCount);
        Assert.Equal("TASK-ONHOLD", onHoldRes.Data.Items[0].TaskNumber);

        // 4. Status = null ("All") - preserves all 5 tasks including Cancelled
        var allRes = await service.GetAllAsync(
            requestUserId: coordinator.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            status: null);
        Assert.True(allRes.IsSuccess);
        Assert.Equal(5, allRes.Data!.TotalCount);

        // 5. Combine createdByUserId and Status = Cancelled
        var creatorCancelledRes = await service.GetAllAsync(
            requestUserId: coordinator.Id,
            requestUserRole: UserRole.Manager,
            requestUserDepartmentId: null,
            status: Backend.Models.Enums.TaskStatus.Cancelled,
            createdByUserId: coordinator.Id);
        Assert.True(creatorCancelledRes.IsSuccess);
        Assert.Equal(1, creatorCancelledRes.Data!.TotalCount);
        Assert.Equal("TASK-CANCELLED", creatorCancelledRes.Data.Items[0].TaskNumber);
    }

    [Theory]
    [InlineData("Cancelled", Backend.Models.Enums.TaskStatus.Cancelled)]
    [InlineData("cancelled", Backend.Models.Enums.TaskStatus.Cancelled)]
    [InlineData("Canceled", Backend.Models.Enums.TaskStatus.Cancelled)]
    [InlineData("In Progress", Backend.Models.Enums.TaskStatus.InProgress)]
    [InlineData("InProgress", Backend.Models.Enums.TaskStatus.InProgress)]
    [InlineData("in progress", Backend.Models.Enums.TaskStatus.InProgress)]
    [InlineData("On Hold", Backend.Models.Enums.TaskStatus.OnHold)]
    [InlineData("OnHold", Backend.Models.Enums.TaskStatus.OnHold)]
    [InlineData("Pending", Backend.Models.Enums.TaskStatus.NotStarted)]
    [InlineData("NotStarted", Backend.Models.Enums.TaskStatus.NotStarted)]
    [InlineData("Done", Backend.Models.Enums.TaskStatus.Completed)]
    [InlineData("Completed", Backend.Models.Enums.TaskStatus.Completed)]
    [InlineData("5", Backend.Models.Enums.TaskStatus.Cancelled)]
    public async Task TaskController_GetAll_StatusNormalization_ResolvesExpectedEnum(string inputStatus, Backend.Models.Enums.TaskStatus expectedEnum)
    {
        using var db = CreateDbContext();
        var taskServiceMock = new Mock<ITaskService>();
        var workflowServiceMock = new Mock<ITaskWorkflowService>();

        Backend.Models.Enums.TaskStatus? capturedStatus = null;
        taskServiceMock
            .Setup(s => s.GetAllAsync(
                It.IsAny<Guid>(),
                It.IsAny<UserRole>(),
                It.IsAny<Guid?>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<Backend.Models.Enums.TaskStatus?>(),
                It.IsAny<PriorityLevel?>(),
                It.IsAny<TaskClassification?>(),
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<string?>(),
                It.IsAny<Backend.Models.Enums.TaskStatus?>(),
                It.IsAny<List<Backend.Models.Enums.TaskStatus>?>(),
                It.IsAny<bool?>(),
                It.IsAny<Guid?>()))
            .Callback<Guid, UserRole, Guid?, int, int, Backend.Models.Enums.TaskStatus?, PriorityLevel?, TaskClassification?, Guid?, Guid?, string?, Backend.Models.Enums.TaskStatus?, List<Backend.Models.Enums.TaskStatus>?, bool?, Guid?>(
                (uId, role, dept, page, size, stat, pri, cls, assigned, dId, search, excl, exclList, overdue, creator) =>
                {
                    capturedStatus = stat;
                })
            .ReturnsAsync(ApiResponseDTO<TaskListResponseDTO>.Success(new TaskListResponseDTO()));

        var controller = new TaskController(taskServiceMock.Object, workflowServiceMock.Object, db);
        var managerId = Guid.NewGuid();
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, managerId.ToString()),
                    new Claim(ClaimTypes.Role, "Manager")
                }, "TestAuth"))
            }
        };

        var actionResult = await controller.GetAll(status: inputStatus);

        Assert.IsType<OkObjectResult>(actionResult);
        Assert.Equal(expectedEnum, capturedStatus);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("All")]
    public async Task TaskController_GetAll_AllOrEmptyStatus_PassesNullStatusToService(string? inputStatus)
    {
        using var db = CreateDbContext();
        var taskServiceMock = new Mock<ITaskService>();
        var workflowServiceMock = new Mock<ITaskWorkflowService>();

        Backend.Models.Enums.TaskStatus? capturedStatus = null;
        taskServiceMock
            .Setup(s => s.GetAllAsync(
                It.IsAny<Guid>(),
                It.IsAny<UserRole>(),
                It.IsAny<Guid?>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<Backend.Models.Enums.TaskStatus?>(),
                It.IsAny<PriorityLevel?>(),
                It.IsAny<TaskClassification?>(),
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<string?>(),
                It.IsAny<Backend.Models.Enums.TaskStatus?>(),
                It.IsAny<List<Backend.Models.Enums.TaskStatus>?>(),
                It.IsAny<bool?>(),
                It.IsAny<Guid?>()))
            .Callback<Guid, UserRole, Guid?, int, int, Backend.Models.Enums.TaskStatus?, PriorityLevel?, TaskClassification?, Guid?, Guid?, string?, Backend.Models.Enums.TaskStatus?, List<Backend.Models.Enums.TaskStatus>?, bool?, Guid?>(
                (uId, role, dept, page, size, stat, pri, cls, assigned, dId, search, excl, exclList, overdue, creator) =>
                {
                    capturedStatus = stat;
                })
            .ReturnsAsync(ApiResponseDTO<TaskListResponseDTO>.Success(new TaskListResponseDTO()));

        var controller = new TaskController(taskServiceMock.Object, workflowServiceMock.Object, db);
        var managerId = Guid.NewGuid();
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, managerId.ToString()),
                    new Claim(ClaimTypes.Role, "Manager")
                }, "TestAuth"))
            }
        };

        var actionResult = await controller.GetAll(status: inputStatus);

        Assert.IsType<OkObjectResult>(actionResult);
        Assert.Null(capturedStatus);
    }

    [Fact]
    public async Task TaskController_GetAll_OverdueStatus_SetsIsOverdueFlag()
    {
        using var db = CreateDbContext();
        var taskServiceMock = new Mock<ITaskService>();
        var workflowServiceMock = new Mock<ITaskWorkflowService>();

        bool? capturedOverdue = null;
        taskServiceMock
            .Setup(s => s.GetAllAsync(
                It.IsAny<Guid>(),
                It.IsAny<UserRole>(),
                It.IsAny<Guid?>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<Backend.Models.Enums.TaskStatus?>(),
                It.IsAny<PriorityLevel?>(),
                It.IsAny<TaskClassification?>(),
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<string?>(),
                It.IsAny<Backend.Models.Enums.TaskStatus?>(),
                It.IsAny<List<Backend.Models.Enums.TaskStatus>?>(),
                It.IsAny<bool?>(),
                It.IsAny<Guid?>()))
            .Callback<Guid, UserRole, Guid?, int, int, Backend.Models.Enums.TaskStatus?, PriorityLevel?, TaskClassification?, Guid?, Guid?, string?, Backend.Models.Enums.TaskStatus?, List<Backend.Models.Enums.TaskStatus>?, bool?, Guid?>(
                (uId, role, dept, page, size, stat, pri, cls, assigned, dId, search, excl, exclList, overdue, creator) =>
                {
                    capturedOverdue = overdue;
                })
            .ReturnsAsync(ApiResponseDTO<TaskListResponseDTO>.Success(new TaskListResponseDTO()));

        var controller = new TaskController(taskServiceMock.Object, workflowServiceMock.Object, db);
        var managerId = Guid.NewGuid();
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, managerId.ToString()),
                    new Claim(ClaimTypes.Role, "Manager")
                }, "TestAuth"))
            }
        };

        var actionResult = await controller.GetAll(status: "Overdue");

        Assert.IsType<OkObjectResult>(actionResult);
        Assert.True(capturedOverdue);
    }
}
