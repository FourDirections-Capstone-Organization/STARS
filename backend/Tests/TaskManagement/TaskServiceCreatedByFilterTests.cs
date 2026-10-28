using Microsoft.EntityFrameworkCore;
using Moq;
using Backend.Data;
using Backend.Models;
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
}
