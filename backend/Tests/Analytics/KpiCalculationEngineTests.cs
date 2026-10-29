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

    [Fact]
    public async System.Threading.Tasks.Task CalculateEmployeeKpiAsync_WhenDatesAreInverted_NormalizesDatesCorrectly()
    {
        // Arrange
        using var db = CreateInMemoryDbContext();
        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);

        var employee = CreateSampleEmployee();
        db.Users.Add(employee);

        var now = DateTime.UtcNow;
        var task = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Task between dates",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now.AddHours(-1),
            UpdatedAt = now,
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = now.AddHours(-1) }
            },
            Attachments = new List<TaskAttachment>
            {
                new() { FileName = "attachment.pdf", FilePath = "/files/attachment.pdf" }
            }
        };
        db.Tasks.Add(task);
        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act - provide startDate that is AFTER endDate
        var result = await engine.CalculateEmployeeKpiAsync(
            employee.Id,
            now.AddDays(7),  // startDate > endDate
            now.AddDays(-7)); // endDate < startDate

        // Assert - dates should be normalized so startDate <= endDate
        Assert.NotNull(result);
        Assert.True(result.PeriodStart <= result.PeriodEnd);
        Assert.Equal(1, result.TotalAssignedTasks);
        Assert.Equal(1, result.CompletedTasksCount);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateEmployeeKpiAsync_WhenEmployeeNotFound_ThrowsKeyNotFoundException()
    {
        // Arrange
        using var db = CreateInMemoryDbContext();
        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);
        var nonExistentId = Guid.NewGuid();

        // Act & Assert
        var ex = await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            engine.CalculateEmployeeKpiAsync(nonExistentId, DateTime.UtcNow.AddDays(-7), DateTime.UtcNow));

        Assert.Contains(nonExistentId.ToString(), ex.Message);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateEmployeeKpiAsync_WithExplicitConfigurationId_UsesSpecifiedConfiguration()
    {
        // Arrange
        using var db = CreateInMemoryDbContext();
        var employee = CreateSampleEmployee();
        db.Users.Add(employee);

        var customConfigId = Guid.NewGuid();
        var customConfig = new KpiConfiguration
        {
            Id = customConfigId,
            Title = "Custom Expedited Courier Config",
            IsActive = true,
            EffectiveStartDate = DateTime.UtcNow.AddDays(-30),
            Items = new List<KpiItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    MetricCode = "OTIF",
                    Name = "Expedited OTIF",
                    Weight = 100.0,
                    Unit = "%",
                    TargetValue = 99.0,
                    GreenThreshold = 95.0,
                    AmberThreshold = 85.0,
                    RedThreshold = 70.0,
                    IsLowerBetter = false,
                    Order = 1
                }
            }
        };
        db.KpiConfigurations.Add(customConfig);
        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act
        var result = await engine.CalculateEmployeeKpiAsync(
            employee.Id,
            DateTime.UtcNow.AddDays(-7),
            DateTime.UtcNow,
            configurationId: customConfigId);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(customConfigId, result.ConfigurationId);
        Assert.Equal("Custom Expedited Courier Config", result.ConfigurationTitle);
        Assert.Single(result.Metrics);
        Assert.Equal("OTIF", result.Metrics[0].MetricCode);
        Assert.Equal(100.0, result.Metrics[0].Weight);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateEmployeeKpiAsync_ResolvesConfiguration_MatchingDepartmentAndRole()
    {
        // Arrange
        using var db = CreateInMemoryDbContext();
        var department = new Department { Id = Guid.NewGuid(), Name = "Sorting Hub" };
        var employee = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "SORT-01",
            FirstName = "Alex",
            LastName = "Tan",
            Email = "alex.tan@speedex.com",
            Role = UserRole.Encoder,
            DepartmentId = department.Id,
            Department = department
        };
        db.Departments.Add(department);
        db.Users.Add(employee);

        var deptRoleConfig = new KpiConfiguration
        {
            Id = Guid.NewGuid(),
            Title = "Sorting Hub Encoder Config",
            DepartmentId = department.Id,
            TargetRole = "Encoder",
            IsActive = true,
            EffectiveStartDate = DateTime.UtcNow.AddDays(-60),
            Items = new List<KpiItem>
            {
                new() { Id = Guid.NewGuid(), MetricCode = "COMPLETION_RATE", Name = "Encoder Speed", Weight = 100.0, TargetValue = 98.0, GreenThreshold = 95.0, AmberThreshold = 80.0, RedThreshold = 60.0 }
            }
        };
        db.KpiConfigurations.Add(deptRoleConfig);
        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act
        var result = await engine.CalculateEmployeeKpiAsync(
            employee.Id,
            DateTime.UtcNow.AddDays(-10),
            DateTime.UtcNow);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(deptRoleConfig.Id, result.ConfigurationId);
        Assert.Equal("Sorting Hub Encoder Config", result.ConfigurationTitle);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateEmployeeKpiAsync_ResolvesConfiguration_MatchingRoleOnlyWhenNoDepartmentMatch()
    {
        // Arrange
        using var db = CreateInMemoryDbContext();
        var department = new Department { Id = Guid.NewGuid(), Name = "Regional Hub" };
        var employee = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "REG-01",
            FirstName = "Sam",
            LastName = "Lee",
            Email = "sam.lee@speedex.com",
            Role = UserRole.Courier,
            DepartmentId = department.Id,
            Department = department
        };
        db.Departments.Add(department);
        db.Users.Add(employee);

        var roleOnlyConfig = new KpiConfiguration
        {
            Id = Guid.NewGuid(),
            Title = "Global Courier Config",
            DepartmentId = null,
            TargetRole = "Courier",
            IsActive = true,
            EffectiveStartDate = DateTime.UtcNow.AddDays(-60),
            Items = new List<KpiItem>
            {
                new() { Id = Guid.NewGuid(), MetricCode = "OTIF", Name = "Global Courier OTIF", Weight = 100.0, TargetValue = 95.0, GreenThreshold = 90.0, AmberThreshold = 75.0, RedThreshold = 60.0 }
            }
        };
        db.KpiConfigurations.Add(roleOnlyConfig);
        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act
        var result = await engine.CalculateEmployeeKpiAsync(
            employee.Id,
            DateTime.UtcNow.AddDays(-10),
            DateTime.UtcNow);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(roleOnlyConfig.Id, result.ConfigurationId);
        Assert.Equal("Global Courier Config", result.ConfigurationTitle);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateEmployeeKpiAsync_ReworkDetectedViaAuditLogDescription()
    {
        // Arrange
        using var db = CreateInMemoryDbContext();
        var employee = CreateSampleEmployee();
        db.Users.Add(employee);

        var now = DateTime.UtcNow;
        var task = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Task with rework description",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now.AddHours(-3),
            UpdatedAt = now.AddHours(-1),
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = now.AddHours(-3) }
            }
        };
        db.Tasks.Add(task);

        // Audit log with description containing 'rework'
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
            ActionType = AuditActionType.StatusChange,
            TargetEntity = "Task",
            TargetEntityId = task.Id,
            OldValue = "UnderReview",
            NewValue = "PendingCorrections",
            Description = "Supervisor returned task: rework necessary for incomplete manifest",
            Module = "TaskManagement",
            Timestamp = now.AddHours(-2)
        });

        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act
        var result = await engine.CalculateEmployeeKpiAsync(
            employee.Id,
            now.AddDays(-1),
            now.AddDays(1));

        // Assert
        Assert.Equal(1, result.CompletedTasksCount);
        Assert.Equal(1, result.ReworkTasksCount);
        Assert.Equal(0, result.AccurateTasksCount);

        var accuracy = result.Metrics.First(m => m.MetricCode == "ORDER_ACCURACY");
        Assert.Equal(0.0, accuracy.ActualValue);
    }

    [Fact]
    public void CalculateFromTasks_WhenAllTasksPendingOrInProgress_ReturnsZeroCompletedWithoutDivisionError()
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);
        var now = DateTime.UtcNow;

        var tasks = new List<BackendTask>
        {
            new() { Id = Guid.NewGuid(), Status = TaskStatus.InProgress, Deadline = now.AddHours(2), CreatedAt = now },
            new() { Id = Guid.NewGuid(), Status = TaskStatus.NotStarted, Deadline = now.AddHours(4), CreatedAt = now },
            new() { Id = Guid.NewGuid(), Status = TaskStatus.DonePendingReview, Deadline = now.AddHours(1), CreatedAt = now }
        };

        // Act
        var result = engine.CalculateFromTasks(employee, tasks, new HashSet<Guid>(), now.AddDays(-1), now.AddDays(1));

        // Assert
        Assert.Equal(3, result.TotalAssignedTasks);
        Assert.Equal(0, result.CompletedTasksCount);
        Assert.Equal(0, result.OnTimeTasksCount);
        Assert.Equal(0, result.InFullTasksCount);
        Assert.Equal(0, result.OtifTasksCount);
        Assert.Equal(0, result.AccurateTasksCount);
        Assert.Equal(0.0, result.TotalHandlingHours);

        var completion = result.Metrics.First(m => m.MetricCode == "COMPLETION_RATE");
        Assert.Equal(0.0, completion.ActualValue);

        var otif = result.Metrics.First(m => m.MetricCode == "OTIF");
        Assert.Equal(0.0, otif.ActualValue);

        var accuracy = result.Metrics.First(m => m.MetricCode == "ORDER_ACCURACY");
        Assert.Equal(0.0, accuracy.ActualValue);

        var aht = result.Metrics.First(m => m.MetricCode == "AHT");
        Assert.Equal(0.0, aht.ActualValue);
    }

    [Fact]
    public void CalculateFromTasks_ClampsNegativeHandlingDuration_WhenEndTimeBeforeStartTime()
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);
        var baseTime = DateTime.UtcNow;

        var task = new BackendTask
        {
            Id = Guid.NewGuid(),
            Status = TaskStatus.Completed,
            CreatedAt = baseTime,
            UpdatedAt = baseTime.AddHours(-1), // UpdatedAt before CreatedAt (clock skew)
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = baseTime }
            }
        };

        // Act
        var result = engine.CalculateFromTasks(employee, new List<BackendTask> { task }, new HashSet<Guid>(), baseTime.AddDays(-1), baseTime.AddDays(1));

        // Assert
        Assert.Equal(1, result.CompletedTasksCount);
        Assert.Equal(0.0, result.TotalHandlingHours); // Clamped, not negative
        var aht = result.Metrics.First(m => m.MetricCode == "AHT");
        Assert.Equal(0.0, aht.ActualValue);
    }

    [Fact]
    public void CalculateFromTasks_UsesRevisedDeadlineOverOriginalDeadline()
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);
        var now = DateTime.UtcNow;

        // Task A: Original deadline expired, but RevisedDeadline is extended -> on-time!
        var taskA = new BackendTask
        {
            Id = Guid.NewGuid(),
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(-2),
            RevisedDeadline = now.AddHours(2),
            CreatedAt = now.AddHours(-4),
            UpdatedAt = now,
            Attachments = new List<TaskAttachment> { new() { FileName = "a.jpg", FilePath = "/a.jpg" } }
        };

        // Task B: Original deadline was future, but RevisedDeadline was shortened and expired -> late!
        var taskB = new BackendTask
        {
            Id = Guid.NewGuid(),
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(5),
            RevisedDeadline = now.AddHours(-1),
            CreatedAt = now.AddHours(-4),
            UpdatedAt = now,
            Attachments = new List<TaskAttachment> { new() { FileName = "b.jpg", FilePath = "/b.jpg" } }
        };

        // Act
        var result = engine.CalculateFromTasks(employee, new List<BackendTask> { taskA, taskB }, new HashSet<Guid>(), now.AddDays(-1), now.AddDays(1));

        // Assert
        Assert.Equal(2, result.CompletedTasksCount);
        Assert.Equal(1, result.OnTimeTasksCount); // Only taskA
        Assert.Equal(1, result.OtifTasksCount);   // Only taskA
    }

    [Theory]
    [InlineData(100.0, 100.0, 100.0, 2.0, "Green")]  // All Green
    [InlineData(78.0, 95.0, 95.0, 3.0, "Amber")]    // OTIF is Amber (75-90)
    [InlineData(50.0, 95.0, 95.0, 3.0, "Red")]      // OTIF is Red (<60)
    [InlineData(95.0, 98.0, 95.0, 15.0, "Red")]     // AHT is Red (>12)
    [InlineData(95.0, 98.0, 50.0, 3.0, "Red")]      // Completion rate is Red (<70)
    public void DetermineOverallRating_EvaluatesAcrossTrafficLightThresholds(
        double otifActual,
        double accuracyActual,
        double completionActual,
        double ahtActual,
        string expectedOverallRating)
    {
        // Arrange
        var employee = CreateSampleEmployee();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);

        var config = KpiCalculationEngine.CreateDefaultFallbackConfiguration();
        var now = DateTime.UtcNow;

        var tasks = new List<BackendTask>();
        // Add 100 completed tasks to approximate the percentages
        int completedCount = 100;
        int onTimeCount = (int)otifActual;
        int accurateCount = (int)accuracyActual;
        int reworkCount = completedCount - accurateCount;

        for (int i = 0; i < completedCount; i++)
        {
            bool isOnTimeAndInFull = i < onTimeCount;
            var t = new BackendTask
            {
                Id = Guid.NewGuid(),
                Status = TaskStatus.Completed,
                Deadline = isOnTimeAndInFull ? now.AddHours(5) : now.AddHours(-1),
                CreatedAt = now.AddHours(-ahtActual),
                UpdatedAt = now,
                Attachments = isOnTimeAndInFull ? new List<TaskAttachment> { new() { FileName = "p.png", FilePath = "/p.png" } } : new List<TaskAttachment>()
            };
            tasks.Add(t);
        }

        // Add pending tasks to reflect completionActual percentage
        int pendingCount = completionActual < 100.0 ? (int)Math.Round(completedCount * (100.0 - completionActual) / completionActual) : 0;
        for (int i = 0; i < pendingCount; i++)
        {
            tasks.Add(new BackendTask { Id = Guid.NewGuid(), Status = TaskStatus.InProgress, CreatedAt = now });
        }

        var reworkIds = new HashSet<Guid>();
        for (int i = 0; i < reworkCount; i++)
        {
            reworkIds.Add(tasks[i].Id);
        }

        // Act
        var result = engine.CalculateFromTasks(employee, tasks, reworkIds, now.AddDays(-1), now.AddDays(1), config);

        // Assert
        Assert.Equal(expectedOverallRating, result.OverallRating);
    }
}
