using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Moq;
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

public class TaskPrioritySyncTests
{
    private AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private TaskService CreateTaskService(AppDbContext db, Mock<IAuditLogService>? auditLogMock = null)
    {
        var notificationServiceMock = new Mock<INotificationService>();
        var dashboardServiceMock = new Mock<IDashboardService>();
        dashboardServiceMock
            .Setup(d => d.ValidateAssigneeAvailabilityAsync(It.IsAny<Guid>()))
            .ReturnsAsync(ApiResponseDTO<bool>.Success(true));

        var auditLog = auditLogMock ?? new Mock<IAuditLogService>();
        var slaRiskServiceMock = new Mock<ISlaRiskPredictionService>();

        return new TaskService(
            db,
            notificationServiceMock.Object,
            dashboardServiceMock.Object,
            auditLog.Object,
            slaRiskServiceMock.Object);
    }

    private User CreateTestUser(AppDbContext db, string empNo, UserRole role)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = empNo,
            Email = $"{empNo.ToLower()}@speedex.com",
            PasswordHash = "hash",
            FirstName = "Test",
            LastName = empNo,
            Role = role,
            IsActive = true,
            AvailabilityStatus = AvailabilityStatus.Active
        };
        db.Users.Add(user);
        db.SaveChanges();
        return user;
    }

    [Theory]
    [InlineData(PriorityLevel.Low)]
    [InlineData(PriorityLevel.Medium)]
    [InlineData(PriorityLevel.High)]
    [InlineData(PriorityLevel.Urgent)]
    public async Task CreateAsync_ExplicitPriority_PersistsExactPriority(PriorityLevel priority)
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);
        var coordinator = CreateTestUser(db, "COORD-001", UserRole.Coordinator);
        var employee = CreateTestUser(db, "EMP-001", UserRole.Courier);

        var dto = new CreateTaskDTO
        {
            Title = $"Task Priority {priority}",
            Description = "Testing priority persistence",
            PriorityLevel = priority,
            Classification = TaskClassification.RoutineDailyTask,
            AssignmentScope = AssignmentScope.SingleEmployee,
            Deadline = DateTime.UtcNow.AddDays(3),
            AssignedUserIds = new List<Guid> { employee.Id }
        };

        var result = await service.CreateAsync(dto, coordinator.Id, "127.0.0.1");

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal(priority, result.Data.PriorityLevel);

        var saved = await db.Tasks.FirstOrDefaultAsync(t => t.Id == result.Data.Id);
        Assert.NotNull(saved);
        Assert.Equal(priority, saved.PriorityLevel);
    }

    [Fact]
    public async Task AssignTask_ReassignTask_PreservesExistingPriority()
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);
        var coordinator = CreateTestUser(db, "COORD-002", UserRole.Coordinator);
        var employee1 = CreateTestUser(db, "EMP-002A", UserRole.Courier);
        var employee2 = CreateTestUser(db, "EMP-002B", UserRole.Courier);

        // 1. Create task with Low priority assigned to employee1
        var createDto = new CreateTaskDTO
        {
            Title = "Low Priority Assignment Test",
            Description = "Ensuring reassigning does not change priority",
            PriorityLevel = PriorityLevel.Low,
            Classification = TaskClassification.RoutineDailyTask,
            AssignmentScope = AssignmentScope.SingleEmployee,
            Deadline = DateTime.UtcNow.AddDays(5),
            AssignedUserIds = new List<Guid> { employee1.Id }
        };

        var createResult = await service.CreateAsync(createDto, coordinator.Id, "127.0.0.1");
        Assert.True(createResult.IsSuccess);
        var taskId = createResult.Data!.Id;

        // Verify initially saved as Low
        var taskInDb = await db.Tasks.Include(t => t.Assignments).FirstOrDefaultAsync(t => t.Id == taskId);
        Assert.NotNull(taskInDb);
        Assert.Equal(PriorityLevel.Low, taskInDb.PriorityLevel);
        Assert.Single(taskInDb.Assignments);
        Assert.Equal(employee1.Id, taskInDb.Assignments.First().AssignedUserId);

        // 2. Reassign to employee2 WITHOUT specifying priority (simulating assignment-only update)
        var updateDto = new UpdateTaskDTO
        {
            AssignedUserIds = new List<Guid> { employee2.Id }
            // PriorityLevel is left null
        };

        var updateResult = await service.UpdateAsync(taskId, updateDto, coordinator.Id, "127.0.0.1");
        Assert.True(updateResult.IsSuccess);

        // Verify task priority remains Low
        var reassignedTask = await db.Tasks.Include(t => t.Assignments).FirstOrDefaultAsync(t => t.Id == taskId);
        Assert.NotNull(reassignedTask);
        Assert.Equal(PriorityLevel.Low, reassignedTask.PriorityLevel);
        Assert.Single(reassignedTask.Assignments);
        Assert.Equal(employee2.Id, reassignedTask.Assignments.First().AssignedUserId);
    }

    [Fact]
    public async Task UpdateAsync_ExplicitPriorityChange_UpdatesPriorityAndLogsAudit()
    {
        using var db = CreateDbContext();
        var auditMock = new Mock<IAuditLogService>();
        var service = CreateTaskService(db, auditMock);
        var coordinator = CreateTestUser(db, "COORD-003", UserRole.Coordinator);
        var employee = CreateTestUser(db, "EMP-003", UserRole.Courier);

        var createDto = new CreateTaskDTO
        {
            Title = "Priority Change Test",
            Description = "Testing priority change audit log",
            PriorityLevel = PriorityLevel.Low,
            Classification = TaskClassification.RoutineDailyTask,
            AssignmentScope = AssignmentScope.SingleEmployee,
            Deadline = DateTime.UtcNow.AddDays(5),
            AssignedUserIds = new List<Guid> { employee.Id }
        };

        var createRes = await service.CreateAsync(createDto, coordinator.Id, "127.0.0.1");
        var taskId = createRes.Data!.Id;

        // Update priority from Low to High
        var updateDto = new UpdateTaskDTO
        {
            PriorityLevel = PriorityLevel.High
        };

        var updateRes = await service.UpdateAsync(taskId, updateDto, coordinator.Id, "127.0.0.1");
        Assert.True(updateRes.IsSuccess);

        var updatedTask = await db.Tasks.FindAsync(taskId);
        Assert.NotNull(updatedTask);
        Assert.Equal(PriorityLevel.High, updatedTask.PriorityLevel);

        // Verify audit log captured the old value "Low" and new value "High"
        auditMock.Verify(a => a.LogAsync(
            coordinator.Id,
            AuditActionType.Update,
            "Task",
            taskId,
            "127.0.0.1",
            It.Is<string>(d => d.Contains("priority")),
            "TaskManagement",
            It.Is<string>(oldVal => oldVal.Contains("\"Priority\":\"Low\"")),
            It.Is<string>(newVal => newVal.Contains("\"Priority\":\"High\""))),
            Times.Once);
    }

    [Fact]
    public void JsonSerialization_ConvertsPriorityLevelToStringEnum()
    {
        var options = new JsonSerializerOptions();
        options.Converters.Add(new JsonStringEnumConverter());

        var dto = new TaskResponseDTO
        {
            Id = Guid.NewGuid(),
            Title = "Json Test",
            PriorityLevel = PriorityLevel.Low
        };

        var json = JsonSerializer.Serialize(dto, options);

        // Must serialize as string "Low", not integer 0
        Assert.Contains("\"priorityLevel\":\"Low\"", json, StringComparison.OrdinalIgnoreCase);

        // Deserializing back should yield PriorityLevel.Low
        var deserialized = JsonSerializer.Deserialize<TaskResponseDTO>(json, options);
        Assert.NotNull(deserialized);
        Assert.Equal(PriorityLevel.Low, deserialized.PriorityLevel);
        Assert.Equal("Low", deserialized.Priority);
    }

    [Fact]
    public async Task CreateAsync_OmittedPriority_DefaultsToMedium()
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);
        var coordinator = CreateTestUser(db, "COORD-004", UserRole.Coordinator);
        var employee = CreateTestUser(db, "EMP-004", UserRole.Courier);

        var dto = new CreateTaskDTO
        {
            Title = "Default Priority Test",
            Description = "Priority omitted, should default to Medium",
            // PriorityLevel and Priority are null
            Classification = TaskClassification.RoutineDailyTask,
            AssignmentScope = AssignmentScope.SingleEmployee,
            Deadline = DateTime.UtcNow.AddDays(3),
            AssignedUserIds = new List<Guid> { employee.Id }
        };

        var result = await service.CreateAsync(dto, coordinator.Id, "127.0.0.1");

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal(PriorityLevel.Medium, result.Data.PriorityLevel);
        Assert.Equal("Medium", result.Data.Priority);

        var saved = await db.Tasks.FirstOrDefaultAsync(t => t.Id == result.Data.Id);
        Assert.NotNull(saved);
        Assert.Equal(PriorityLevel.Medium, saved.PriorityLevel);
    }

    [Fact]
    public async Task CreateAsync_PriorityAlias_SetsSpecifiedPriority()
    {
        using var db = CreateDbContext();
        var service = CreateTaskService(db);
        var coordinator = CreateTestUser(db, "COORD-005", UserRole.Coordinator);
        var employee = CreateTestUser(db, "EMP-005", UserRole.Courier);

        var dto = new CreateTaskDTO
        {
            Title = "Priority Alias Test",
            Description = "Using Priority alias instead of PriorityLevel",
            Priority = PriorityLevel.Low,
            Classification = TaskClassification.RoutineDailyTask,
            AssignmentScope = AssignmentScope.SingleEmployee,
            Deadline = DateTime.UtcNow.AddDays(3),
            AssignedUserIds = new List<Guid> { employee.Id }
        };

        var result = await service.CreateAsync(dto, coordinator.Id, "127.0.0.1");

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal(PriorityLevel.Low, result.Data.PriorityLevel);
        Assert.Equal("Low", result.Data.Priority);
    }
}
