using Xunit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Backend.Data;
using Backend.Models;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using BackendTask = Backend.Models.Task;
using TaskStatus = Backend.Models.Enums.TaskStatus;

namespace Backend.Tests.Analytics;

public class KpiCalculationEngineTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static User CreateSampleEmployee(Guid? id = null)
    {
        return new User
        {
            Id = id ?? Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Email = "juan.delacruz@speedex.com",
            Role = UserRole.Courier,
            Department = new Department { Name = "Logistics Operations" }
        };
    }

    [Fact]
    public void Otif_CalculatesCorrectly_BasedOnDeadlinesAndAttachments()
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);

        var now = DateTime.UtcNow;

        // Task 1: On-time with attachment -> OTIF
        var t1 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery 1",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now,
            UpdatedAt = now.AddHours(1),
            Attachments = new List<TaskAttachment>
            {
                new() { FileName = "pod1.jpg", FilePath = "/uploads/pod1.jpg" }
            },
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = now }
            }
        };

        // Task 2: On-time but missing attachment -> Not In-Full -> NOT OTIF
        var t2 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery 2",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now,
            UpdatedAt = now.AddHours(1),
            Attachments = new List<TaskAttachment>(),
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = now }
            }
        };

        // Task 3: Late despite having attachment -> NOT OTIF
        var t3 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery 3",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(1),
            CreatedAt = now,
            UpdatedAt = now.AddHours(3),
            Attachments = new List<TaskAttachment>
            {
                new() { FileName = "pod3.jpg", FilePath = "/uploads/pod3.jpg" }
            },
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = now }
            }
        };

        // Task 4: On-time via RevisedDeadline with attachment -> OTIF
        var t4 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery 4",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(1),
            RevisedDeadline = now.AddHours(4),
            CreatedAt = now,
            UpdatedAt = now.AddHours(3),
            Attachments = new List<TaskAttachment>
            {
                new() { FileName = "pod4.jpg", FilePath = "/uploads/pod4.jpg" }
            },
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = now }
            }
        };

        var tasks = new List<BackendTask> { t1, t2, t3, t4 };
        var reworkIds = new HashSet<Guid>();

        // Act
        var result = engine.CalculateFromTasks(employee, tasks, reworkIds, now.AddDays(-1), now.AddDays(1));

        // Assert
        Assert.Equal(4, result.CompletedTasksCount);
        Assert.Equal(3, result.OnTimeTasksCount); // t1, t2, t4
        Assert.Equal(3, result.InFullTasksCount); // t1, t3, t4
        Assert.Equal(2, result.OtifTasksCount);   // t1, t4

        var otifMetric = result.Metrics.FirstOrDefault(m => m.MetricCode == "OTIF");
        Assert.NotNull(otifMetric);
        Assert.Equal(50.0, otifMetric.ActualValue); // 2/4 = 50.0%
    }

    [Fact]
    public void OrderAccuracy_CalculatesCorrectly_WhenReworkPresent()
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);

        var now = DateTime.UtcNow;

        var t1 = new BackendTask { Id = Guid.NewGuid(), Status = TaskStatus.Completed, Deadline = now.AddHours(2), CreatedAt = now, UpdatedAt = now.AddHours(1) };
        var t2 = new BackendTask { Id = Guid.NewGuid(), Status = TaskStatus.Completed, Deadline = now.AddHours(2), CreatedAt = now, UpdatedAt = now.AddHours(1) };
        var t3 = new BackendTask { Id = Guid.NewGuid(), Status = TaskStatus.Completed, Deadline = now.AddHours(2), CreatedAt = now, UpdatedAt = now.AddHours(1) };
        var t4 = new BackendTask { Id = Guid.NewGuid(), Status = TaskStatus.Completed, Deadline = now.AddHours(2), CreatedAt = now, UpdatedAt = now.AddHours(1) };

        var tasks = new List<BackendTask> { t1, t2, t3, t4 };
        // t1 has rework in audit logs, t2 has non-empty pushback comment
        var reworkIds = new HashSet<Guid> { t1.Id };
        t2.PushBackComment = "Address incorrect, please verify with sender";

        // Act
        var result = engine.CalculateFromTasks(employee, tasks, reworkIds, now.AddDays(-1), now.AddDays(1));

        // Assert
        Assert.Equal(4, result.CompletedTasksCount);
        Assert.Equal(2, result.ReworkTasksCount);
        Assert.Equal(2, result.AccurateTasksCount);

        var accuracyMetric = result.Metrics.FirstOrDefault(m => m.MetricCode == "ORDER_ACCURACY");
        Assert.NotNull(accuracyMetric);
        Assert.Equal(50.0, accuracyMetric.ActualValue); // 2/4 = 50.0%
    }

    [Fact]
    public void TaskCompletionRate_CalculatesCorrectly_WithPendingTasks()
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);

        var now = DateTime.UtcNow;

        var tasks = new List<BackendTask>
        {
            new() { Id = Guid.NewGuid(), Status = TaskStatus.Completed, Deadline = now.AddHours(1), CreatedAt = now, UpdatedAt = now.AddHours(1) },
            new() { Id = Guid.NewGuid(), Status = TaskStatus.Completed, Deadline = now.AddHours(1), CreatedAt = now, UpdatedAt = now.AddHours(1) },
            new() { Id = Guid.NewGuid(), Status = TaskStatus.Completed, Deadline = now.AddHours(1), CreatedAt = now, UpdatedAt = now.AddHours(1) },
            new() { Id = Guid.NewGuid(), Status = TaskStatus.InProgress, Deadline = now.AddHours(1), CreatedAt = now },
            new() { Id = Guid.NewGuid(), Status = TaskStatus.NotStarted, Deadline = now.AddHours(1), CreatedAt = now }
        };

        // Act
        var result = engine.CalculateFromTasks(employee, tasks, new HashSet<Guid>(), now.AddDays(-1), now.AddDays(1));

        // Assert
        Assert.Equal(5, result.TotalAssignedTasks);
        Assert.Equal(3, result.CompletedTasksCount);

        var completionMetric = result.Metrics.FirstOrDefault(m => m.MetricCode == "COMPLETION_RATE");
        Assert.NotNull(completionMetric);
        Assert.Equal(60.0, completionMetric.ActualValue); // 3/5 = 60.0%
    }

    [Fact]
    public void AverageHandlingTime_CalculatesCorrectly_InHours()
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);

        var baseTime = new DateTime(2026, 10, 1, 8, 0, 0, DateTimeKind.Utc);

        var t1 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Status = TaskStatus.Completed,
            CreatedAt = baseTime,
            UpdatedAt = baseTime.AddHours(2), // 2 hours
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = baseTime }
            }
        };

        var t2 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Status = TaskStatus.Completed,
            CreatedAt = baseTime,
            UpdatedAt = baseTime.AddHours(5), // assigned 1 hour later, handled in 4 hours
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = baseTime.AddHours(1) }
            }
        };

        var tasks = new List<BackendTask> { t1, t2 };

        // Act
        var result = engine.CalculateFromTasks(employee, tasks, new HashSet<Guid>(), baseTime.AddDays(-1), baseTime.AddDays(2));

        // Assert
        Assert.Equal(2, result.CompletedTasksCount);
        Assert.Equal(6.0, result.TotalHandlingHours); // 2 + 4 = 6.0 hours

        var ahtMetric = result.Metrics.FirstOrDefault(m => m.MetricCode == "AHT");
        Assert.NotNull(ahtMetric);
        Assert.Equal(3.0, ahtMetric.ActualValue); // 6 / 2 = 3.0 hours
        Assert.Equal("Green", ahtMetric.Rating);  // Target is 4.0, Green is <= 4.0
    }

    [Fact]
    public void ZeroTasks_ReturnsZeroRates_WithoutDivideByZero()
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);

        var now = DateTime.UtcNow;

        // Act
        var result = engine.CalculateFromTasks(employee, new List<BackendTask>(), new HashSet<Guid>(), now.AddDays(-7), now);

        // Assert
        Assert.Equal(0, result.TotalAssignedTasks);
        Assert.Equal(0, result.CompletedTasksCount);
        Assert.Equal(0.0, result.TotalHandlingHours);

        foreach (var metric in result.Metrics)
        {
            Assert.Equal(0.0, metric.ActualValue);
            Assert.False(double.IsNaN(metric.ActualValue));
            Assert.False(double.IsInfinity(metric.ActualValue));
        }
    }

    [Fact]
    public void LowerIsBetter_ThresholdLogic_EvaluatesAhtCorrectly()
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);

        var config = KpiCalculationEngine.CreateDefaultFallbackConfiguration();
        var ahtItem = config.Items.First(i => i.MetricCode == "AHT");
        // Target = 4.0, Green = 4.0, Amber = 8.0, Red = 12.0

        var baseTime = DateTime.UtcNow;

        // 1. Excellent AHT (2 hours -> Green)
        var fastTask = new BackendTask
        {
            Id = Guid.NewGuid(),
            Status = TaskStatus.Completed,
            CreatedAt = baseTime,
            UpdatedAt = baseTime.AddHours(2)
        };
        var res1 = engine.CalculateFromTasks(employee, new List<BackendTask> { fastTask }, new HashSet<Guid>(), baseTime.AddDays(-1), baseTime.AddDays(1), config);
        Assert.Equal("Green", res1.Metrics.First(m => m.MetricCode == "AHT").Rating);

        // 2. Acceptable AHT (6 hours -> Amber)
        var moderateTask = new BackendTask
        {
            Id = Guid.NewGuid(),
            Status = TaskStatus.Completed,
            CreatedAt = baseTime,
            UpdatedAt = baseTime.AddHours(6)
        };
        var res2 = engine.CalculateFromTasks(employee, new List<BackendTask> { moderateTask }, new HashSet<Guid>(), baseTime.AddDays(-1), baseTime.AddDays(1), config);
        Assert.Equal("Amber", res2.Metrics.First(m => m.MetricCode == "AHT").Rating);

        // 3. Degraded AHT (14 hours -> Red)
        var slowTask = new BackendTask
        {
            Id = Guid.NewGuid(),
            Status = TaskStatus.Completed,
            CreatedAt = baseTime,
            UpdatedAt = baseTime.AddHours(14)
        };
        var res3 = engine.CalculateFromTasks(employee, new List<BackendTask> { slowTask }, new HashSet<Guid>(), baseTime.AddDays(-1), baseTime.AddDays(1), config);
        Assert.Equal("Red", res3.Metrics.First(m => m.MetricCode == "AHT").Rating);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateEmployeeKpiAsync_WithDatabaseIntegration_ReturnsExpectedEvaluation()
    {
        // Arrange
        using var db = CreateInMemoryDbContext();
        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);

        var employeeId = Guid.NewGuid();
        var department = new Department { Id = Guid.NewGuid(), Name = "Express Logistics" };
        var employee = new User
        {
            Id = employeeId,
            EmployeeNumber = "EXP-101",
            FirstName = "Maria",
            LastName = "Santos",
            Email = "maria.santos@speedex.com",
            Role = UserRole.Courier,
            DepartmentId = department.Id,
            Department = department
        };
        db.Departments.Add(department);
        db.Users.Add(employee);

        var now = DateTime.UtcNow;

        // Add 2 tasks:
        // Task 1: Completed on-time with attachment, no rework
        var task1 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Parcel Dispatch 1",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(5),
            CreatedAt = now.AddHours(-3),
            UpdatedAt = now.AddHours(-1),
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employeeId, AssignedAt = now.AddHours(-3) }
            },
            Attachments = new List<TaskAttachment>
            {
                new() { FileName = "signature.png", FilePath = "/files/sig.png" }
            }
        };

        // Task 2: Completed, had rework transition recorded in AuditLog
        var task2 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Parcel Dispatch 2",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(5),
            CreatedAt = now.AddHours(-4),
            UpdatedAt = now.AddHours(-1),
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employeeId, AssignedAt = now.AddHours(-4) }
            },
            Attachments = new List<TaskAttachment>
            {
                new() { FileName = "proof.png", FilePath = "/files/proof.png" }
            }
        };

        db.Tasks.AddRange(task1, task2);

        // AuditLog for task2 rework
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
            ActionType = AuditActionType.StatusChange,
            TargetEntity = "Task",
            TargetEntityId = task2.Id,
            OldValue = "DonePendingReview",
            NewValue = "InProgress",
            Description = "Task status changed from DonePendingReview to InProgress (returned for rework)",
            Module = "TaskManagement",
            Timestamp = now.AddHours(-2)
        });

        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act
        var result = await engine.CalculateEmployeeKpiAsync(
            employeeId,
            now.AddDays(-1),
            now.AddDays(1));

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Maria Santos", result.EmployeeName);
        Assert.Equal("Express Logistics", result.DepartmentName);
        Assert.Equal(2, result.TotalAssignedTasks);
        Assert.Equal(2, result.CompletedTasksCount);
        Assert.Equal(2, result.OtifTasksCount); // Both on-time and with attachments
        Assert.Equal(1, result.ReworkTasksCount); // task2 had rework
        Assert.Equal(1, result.AccurateTasksCount); // task1 only

        var otif = result.Metrics.First(m => m.MetricCode == "OTIF");
        Assert.Equal(100.0, otif.ActualValue);

        var accuracy = result.Metrics.First(m => m.MetricCode == "ORDER_ACCURACY");
        Assert.Equal(50.0, accuracy.ActualValue);

        var completion = result.Metrics.First(m => m.MetricCode == "COMPLETION_RATE");
        Assert.Equal(100.0, completion.ActualValue);

        var aht = result.Metrics.First(m => m.MetricCode == "AHT");
        Assert.Equal(2.5, aht.ActualValue); // Task 1 = 2h, Task 2 = 3h, Avg = 2.5h
    }
}
