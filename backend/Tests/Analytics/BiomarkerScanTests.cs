using Xunit;
using Backend.Data;
using Backend.Models;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Backend.Tests.Analytics;

public class BiomarkerScanTests
{
    private static (BiomarkerScanService Service, IServiceScopeFactory ScopeFactory) CreateScanService(BiomarkerThresholds? customThresholds = null)
    {
        var services = new ServiceCollection();
        var dbName = Guid.NewGuid().ToString();
        services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(dbName));
        var serviceProvider = services.BuildServiceProvider();
        var scopeFactory = serviceProvider.GetRequiredService<IServiceScopeFactory>();

        var thresholds = Options.Create(customThresholds ?? new BiomarkerThresholds
        {
            MinOnTimeRate = 0.80,
            MaxLateRatePerEmployee = 0.30,
            MaxOverdueBacklog = 10,
            MaxWorkloadPerEmployee = 10,
            StuckTaskHours = 48
        });

        var logger = NullLogger<BiomarkerScanService>.Instance;
        var service = new BiomarkerScanService(scopeFactory, thresholds, logger);

        return (service, scopeFactory);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Static SLA Calculation Unit Tests
    // ──────────────────────────────────────────────────────────────────────────

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
            UpdatedAt = new DateTime(2026, 7, 22, 10, 0, 0, DateTimeKind.Utc)
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

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Department-Level Metrics & Threshold Triggers
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_DepartmentOnTimeRate_BelowThreshold_GeneratesWarningAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MinOnTimeRate = 0.80 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Dispatch", IsActive = true });

            // 1 on-time, 1 late completed in last 24h -> 50% on-time rate (< 80% threshold)
            db.Tasks.AddRange(
                new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = "Task OnTime",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.Completed,
                    CreatedAt = now.AddHours(-10),
                    UpdatedAt = now.AddHours(-2),
                    Deadline = now.AddHours(2)
                },
                new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = "Task Late",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.Completed,
                    CreatedAt = now.AddHours(-10),
                    UpdatedAt = now.AddHours(-1),
                    Deadline = now.AddHours(-3)
                }
            );
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "OnTimeRate" && a.DepartmentId == deptId);

            alert.Should().NotBeNull();
            alert!.Severity.Should().Be("Warning");
            alert.CurrentValue.Should().Be(50.0);
            alert.ThresholdValue.Should().Be(80.0);
            alert.DepartmentName.Should().Be("Dispatch");
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_DepartmentOnTimeRate_AboveThreshold_GeneratesNoOnTimeAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MinOnTimeRate = 0.80 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Dispatch", IsActive = true });

            // 2 on-time out of 2 = 100% on-time rate (>= 80% threshold)
            db.Tasks.AddRange(
                new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = "Task 1",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.Completed,
                    CreatedAt = now.AddHours(-10),
                    UpdatedAt = now.AddHours(-5),
                    Deadline = now.AddHours(2)
                },
                new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = "Task 2",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.Completed,
                    CreatedAt = now.AddHours(-10),
                    UpdatedAt = now.AddHours(-3),
                    Deadline = now.AddHours(2)
                }
            );
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "OnTimeRate" && a.DepartmentId == deptId);
            alert.Should().BeNull();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_DepartmentOverdueBacklog_Moderate_TriggersWarningSeverity()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxOverdueBacklog = 5 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Logistics", IsActive = true });

            // 7 overdue tasks (> 5 and <= 2 * 5 = 10) -> Warning
            for (int i = 0; i < 7; i++)
            {
                db.Tasks.Add(new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = $"Overdue {i}",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.NotStarted,
                    Deadline = now.AddDays(-2),
                    CreatedAt = now.AddDays(-5)
                });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "OverdueBacklog" && a.DepartmentId == deptId);

            alert.Should().NotBeNull();
            alert!.Severity.Should().Be("Warning");
            alert.CurrentValue.Should().Be(7);
            alert.ThresholdValue.Should().Be(5);
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_DepartmentOverdueBacklog_Severe_TriggersCriticalSeverity()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxOverdueBacklog = 5 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Logistics", IsActive = true });

            // 12 overdue tasks (> 2 * 5 = 10) -> Critical
            for (int i = 0; i < 12; i++)
            {
                db.Tasks.Add(new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = $"Overdue {i}",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.InProgress,
                    Deadline = now.AddDays(-2),
                    CreatedAt = now.AddDays(-5)
                });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "OverdueBacklog" && a.DepartmentId == deptId);

            alert.Should().NotBeNull();
            alert!.Severity.Should().Be("Critical");
            alert.CurrentValue.Should().Be(12);
            alert.ThresholdValue.Should().Be(5);
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_OverdueBacklog_ExcludesCompletedAndCancelledTasks()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxOverdueBacklog = 2 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Warehouse", IsActive = true });

            // 3 tasks past deadline, but completed or cancelled -> should NOT count as overdue
            db.Tasks.AddRange(
                new Backend.Models.Task { Id = Guid.NewGuid(), Title = "Done", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.Completed, Deadline = now.AddDays(-2) },
                new Backend.Models.Task { Id = Guid.NewGuid(), Title = "Cancelled", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.Cancelled, Deadline = now.AddDays(-2) },
                new Backend.Models.Task { Id = Guid.NewGuid(), Title = "Active Overdue", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.NotStarted, Deadline = now.AddDays(-2) }
            );
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            // Only 1 overdue task, which is <= 2 -> no alert
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "OverdueBacklog" && a.DepartmentId == deptId);
            alert.Should().BeNull();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_OverdueBacklog_RespectsRevisedDeadlineInFuture()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxOverdueBacklog = 1 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Warehouse", IsActive = true });

            // Original deadline in the past, but revised deadline is tomorrow -> not overdue
            db.Tasks.AddRange(
                new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = "Extended Task",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.InProgress,
                    Deadline = now.AddDays(-2),
                    RevisedDeadline = now.AddDays(1)
                },
                new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = "Extended Task 2",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.InProgress,
                    Deadline = now.AddDays(-3),
                    RevisedDeadline = now.AddDays(2)
                }
            );
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "OverdueBacklog" && a.DepartmentId == deptId);
            alert.Should().BeNull();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_StuckTasks_InProgressOverStuckHours_GeneratesWarningAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { StuckTaskHours = 48 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Operations", IsActive = true });

            // Stuck task: InProgress for 50 hours
            db.Tasks.Add(new Backend.Models.Task
            {
                Id = Guid.NewGuid(),
                Title = "Stuck Task",
                AssignedDepartmentId = deptId,
                Status = Backend.Models.Enums.TaskStatus.InProgress,
                CreatedAt = now.AddHours(-60),
                UpdatedAt = now.AddHours(-50),
                Deadline = now.AddDays(1)
            });
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "StuckTasks" && a.DepartmentId == deptId);

            alert.Should().NotBeNull();
            alert!.Severity.Should().Be("Warning");
            alert.CurrentValue.Should().Be(1);
            alert.ThresholdValue.Should().Be(0);
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_StuckTasks_NotStartedOrRecent_GeneratesNoAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { StuckTaskHours = 48 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Operations", IsActive = true });

            // Task 1: Pending for 60 hours (not InProgress)
            // Task 2: InProgress for only 10 hours (< 48h)
            db.Tasks.AddRange(
                new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = "Pending Task",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.NotStarted,
                    CreatedAt = now.AddHours(-60),
                    UpdatedAt = now.AddHours(-55),
                    Deadline = now.AddDays(1)
                },
                new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = "Recent Task",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.InProgress,
                    CreatedAt = now.AddHours(-15),
                    UpdatedAt = now.AddHours(-10),
                    Deadline = now.AddDays(1)
                }
            );
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "StuckTasks" && a.DepartmentId == deptId);
            alert.Should().BeNull();
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Employee-Level Metrics & Threshold Triggers
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_InactiveEmployee_AssignmentsWithZeroCompletedIn7Days_GeneratesInfoAlert()
    {
        var (scanService, scopeFactory) = CreateScanService();
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();
        var empId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var dept = new Department { Id = deptId, Name = "Field Ops", IsActive = true };
            var emp = new User
            {
                Id = empId,
                FirstName = "Bob",
                LastName = "Jones",
                Email = "bob@example.com",
                EmployeeNumber = "EMP301",
                DepartmentId = deptId,
                Role = UserRole.Courier,
                IsActive = true
            };
            var task = new Backend.Models.Task
            {
                Id = Guid.NewGuid(),
                Title = "Old Task",
                AssignedDepartmentId = deptId,
                Status = Backend.Models.Enums.TaskStatus.InProgress,
                CreatedAt = now.AddDays(-10)
            };

            db.Departments.Add(dept);
            db.Users.Add(emp);
            db.Tasks.Add(task);
            db.TaskAssignments.Add(new TaskAssignment { TaskId = task.Id, AssignedUserId = empId });
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "InactiveEmployee" && a.EmployeeNumber == "EMP301");

            alert.Should().NotBeNull();
            alert!.Severity.Should().Be("Info");
            alert.CurrentValue.Should().Be(0);
            alert.ThresholdValue.Should().Be(1);
            alert.EmployeeName.Should().Be("Bob Jones");
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_ActiveEmployee_WithCompletedTasksIn7Days_GeneratesNoInactiveAlert()
    {
        var (scanService, scopeFactory) = CreateScanService();
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();
        var empId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var dept = new Department { Id = deptId, Name = "Field Ops", IsActive = true };
            var emp = new User
            {
                Id = empId,
                FirstName = "Bob",
                LastName = "Jones",
                Email = "bob@example.com",
                EmployeeNumber = "EMP301",
                DepartmentId = deptId,
                Role = UserRole.Courier,
                IsActive = true
            };
            var task = new Backend.Models.Task
            {
                Id = Guid.NewGuid(),
                Title = "Recent Completed",
                AssignedDepartmentId = deptId,
                Status = Backend.Models.Enums.TaskStatus.Completed,
                CreatedAt = now.AddDays(-3),
                UpdatedAt = now.AddDays(-1),
                Deadline = now.AddDays(1)
            };

            db.Departments.Add(dept);
            db.Users.Add(emp);
            db.Tasks.Add(task);
            db.TaskAssignments.Add(new TaskAssignment { TaskId = task.Id, AssignedUserId = empId });
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "InactiveEmployee" && a.EmployeeNumber == "EMP301");
            alert.Should().BeNull();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_EmployeeWithNoAssignments_GeneratesNoInactiveAlert()
    {
        var (scanService, scopeFactory) = CreateScanService();
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Field Ops", IsActive = true });
            db.Users.Add(new User
            {
                Id = Guid.NewGuid(),
                FirstName = "Unassigned",
                LastName = "Employee",
                Email = "unassigned@example.com",
                EmployeeNumber = "EMP999",
                DepartmentId = deptId,
                Role = UserRole.Courier,
                IsActive = true
            });
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "InactiveEmployee" && a.EmployeeNumber == "EMP999");
            alert.Should().BeNull();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_EmployeeLateRate_OverThreshold_GeneratesWarningAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxLateRatePerEmployee = 0.30 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();
        var empId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Logistics", IsActive = true });
            db.Users.Add(new User
            {
                Id = empId,
                FirstName = "Charlie",
                LastName = "Brown",
                Email = "charlie@example.com",
                EmployeeNumber = "EMP401",
                DepartmentId = deptId,
                Role = UserRole.Courier,
                IsActive = true
            });

            // 4 completed tasks: 1 on-time, 3 late = 75% late rate (> 30% threshold)
            for (int i = 0; i < 4; i++)
            {
                var isLate = i > 0;
                var task = new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = $"Task {i}",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.Completed,
                    CreatedAt = now.AddDays(-10),
                    UpdatedAt = isLate ? now.AddDays(-1) : now.AddDays(-5),
                    Deadline = now.AddDays(-3)
                };
                db.Tasks.Add(task);
                db.TaskAssignments.Add(new TaskAssignment { TaskId = task.Id, AssignedUserId = empId });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "EmployeeLateRate" && a.EmployeeNumber == "EMP401");

            alert.Should().NotBeNull();
            alert!.Severity.Should().Be("Warning");
            alert.CurrentValue.Should().Be(75.0);
            alert.ThresholdValue.Should().Be(30.0);
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_EmployeeLateRate_UnderThreeCompletedTasks_GeneratesNoAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxLateRatePerEmployee = 0.30 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();
        var empId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Logistics", IsActive = true });
            db.Users.Add(new User
            {
                Id = empId,
                FirstName = "Dave",
                LastName = "Miller",
                Email = "dave@example.com",
                EmployeeNumber = "EMP402",
                DepartmentId = deptId,
                Role = UserRole.Courier,
                IsActive = true
            });

            // Only 2 completed tasks (both late) -> totalCompleted < 3, so rule suppresses alert
            for (int i = 0; i < 2; i++)
            {
                var task = new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = $"Task {i}",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.Completed,
                    CreatedAt = now.AddDays(-10),
                    UpdatedAt = now.AddDays(-1),
                    Deadline = now.AddDays(-3)
                };
                db.Tasks.Add(task);
                db.TaskAssignments.Add(new TaskAssignment { TaskId = task.Id, AssignedUserId = empId });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "EmployeeLateRate" && a.EmployeeNumber == "EMP402");
            alert.Should().BeNull();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_HighWorkload_OverMaxWorkload_GeneratesWarningAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxWorkloadPerEmployee = 5 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();
        var empId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Operations", IsActive = true });
            db.Users.Add(new User
            {
                Id = empId,
                FirstName = "Eve",
                LastName = "Polastri",
                Email = "eve@example.com",
                EmployeeNumber = "EMP501",
                DepartmentId = deptId,
                Role = UserRole.Courier,
                IsActive = true
            });

            // 7 active tasks (> 5 threshold)
            for (int i = 0; i < 7; i++)
            {
                var task = new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = $"Active Task {i}",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.InProgress,
                    CreatedAt = now.AddDays(-1)
                };
                db.Tasks.Add(task);
                db.TaskAssignments.Add(new TaskAssignment { TaskId = task.Id, AssignedUserId = empId });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "HighWorkload" && a.EmployeeNumber == "EMP501");

            alert.Should().NotBeNull();
            alert!.Severity.Should().Be("Warning");
            alert.CurrentValue.Should().Be(7);
            alert.ThresholdValue.Should().Be(5);
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_HighWorkload_ExcludesCompletedAndCancelledTasks()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxWorkloadPerEmployee = 3 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();
        var empId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Operations", IsActive = true });
            db.Users.Add(new User
            {
                Id = empId,
                FirstName = "Eve",
                LastName = "Polastri",
                Email = "eve@example.com",
                EmployeeNumber = "EMP502",
                DepartmentId = deptId,
                Role = UserRole.Courier,
                IsActive = true
            });

            // 2 active tasks, 3 completed, 1 cancelled -> active assignments = 2 (<= 3 threshold)
            var tasks = new List<Backend.Models.Task>
            {
                new() { Id = Guid.NewGuid(), Title = "Active 1", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.InProgress },
                new() { Id = Guid.NewGuid(), Title = "Active 2", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.NotStarted },
                new() { Id = Guid.NewGuid(), Title = "Done 1", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.Completed },
                new() { Id = Guid.NewGuid(), Title = "Done 2", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.Completed },
                new() { Id = Guid.NewGuid(), Title = "Done 3", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.Completed },
                new() { Id = Guid.NewGuid(), Title = "Cancelled 1", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.Cancelled }
            };

            foreach (var t in tasks)
            {
                db.Tasks.Add(t);
                db.TaskAssignments.Add(new TaskAssignment { TaskId = t.Id, AssignedUserId = empId });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "HighWorkload" && a.EmployeeNumber == "EMP502");
            alert.Should().BeNull();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_ManagersAndCoordinators_AreExcludedFromEmployeeMetrics()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxWorkloadPerEmployee = 1 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Management", IsActive = true });

            var mgr = new User
            {
                Id = Guid.NewGuid(),
                FirstName = "Boss",
                LastName = "Man",
                Email = "boss@example.com",
                EmployeeNumber = "MGR001",
                DepartmentId = deptId,
                Role = UserRole.Manager,
                IsActive = true
            };
            var coord = new User
            {
                Id = Guid.NewGuid(),
                FirstName = "Coord",
                LastName = "Inator",
                Email = "coord@example.com",
                EmployeeNumber = "CRD001",
                DepartmentId = deptId,
                Role = UserRole.Coordinator,
                IsActive = true
            };
            db.Users.AddRange(mgr, coord);

            // Assign 10 active tasks to both manager and coordinator
            for (int i = 0; i < 10; i++)
            {
                var taskM = new Backend.Models.Task { Id = Guid.NewGuid(), Title = $"M Task {i}", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.InProgress };
                var taskC = new Backend.Models.Task { Id = Guid.NewGuid(), Title = $"C Task {i}", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.InProgress };
                db.Tasks.AddRange(taskM, taskC);
                db.TaskAssignments.Add(new TaskAssignment { TaskId = taskM.Id, AssignedUserId = mgr.Id });
                db.TaskAssignments.Add(new TaskAssignment { TaskId = taskC.Id, AssignedUserId = coord.Id });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var mgrAlerts = await db.BiomarkerAlerts.Where(a => a.EmployeeNumber == "MGR001" || a.EmployeeNumber == "CRD001").ToListAsync();
            mgrAlerts.Should().BeEmpty();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_InactiveOrDeactivatedUsers_AreExcludedFromEmployeeMetrics()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MaxWorkloadPerEmployee = 1 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Operations", IsActive = true });

            var inactiveUser = new User
            {
                Id = Guid.NewGuid(),
                FirstName = "Inactive",
                LastName = "User",
                Email = "inactive@example.com",
                EmployeeNumber = "INACT01",
                DepartmentId = deptId,
                Role = UserRole.Courier,
                IsActive = false
            };
            var deactivatedUser = new User
            {
                Id = Guid.NewGuid(),
                FirstName = "Deactivated",
                LastName = "User",
                Email = "deact@example.com",
                EmployeeNumber = "DEACT01",
                DepartmentId = deptId,
                Role = UserRole.Courier,
                IsActive = true,
                IsDeactivated = true
            };
            db.Users.AddRange(inactiveUser, deactivatedUser);

            for (int i = 0; i < 5; i++)
            {
                var task1 = new Backend.Models.Task { Id = Guid.NewGuid(), Title = $"T1 {i}", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.InProgress };
                var task2 = new Backend.Models.Task { Id = Guid.NewGuid(), Title = $"T2 {i}", AssignedDepartmentId = deptId, Status = Backend.Models.Enums.TaskStatus.InProgress };
                db.Tasks.AddRange(task1, task2);
                db.TaskAssignments.Add(new TaskAssignment { TaskId = task1.Id, AssignedUserId = inactiveUser.Id });
                db.TaskAssignments.Add(new TaskAssignment { TaskId = task2.Id, AssignedUserId = deactivatedUser.Id });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var excludedAlerts = await db.BiomarkerAlerts.Where(a => a.EmployeeNumber == "INACT01" || a.EmployeeNumber == "DEACT01").ToListAsync();
            excludedAlerts.Should().BeEmpty();
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. System-Level Overall SLA Compliance & Severity Rules
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_OverallSlaCompliance_Below50Percent_GeneratesCriticalAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MinOnTimeRate = 0.80 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Express", IsActive = true });

            // 1 on-time and 3 late -> 25% overall SLA compliance (< 50% -> Critical)
            for (int i = 0; i < 4; i++)
            {
                var isLate = i > 0;
                db.Tasks.Add(new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = $"Task {i}",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.Completed,
                    CreatedAt = now.AddDays(-10),
                    UpdatedAt = isLate ? now.AddDays(-1) : now.AddDays(-5),
                    Deadline = now.AddDays(-3)
                });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "OverallSlaCompliance");

            alert.Should().NotBeNull();
            alert!.Severity.Should().Be("Critical");
            alert.CurrentValue.Should().Be(25.0);
            alert.ThresholdValue.Should().Be(80.0);
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_OverallSlaCompliance_Between50AndThreshold_GeneratesWarningAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MinOnTimeRate = 0.80 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Express", IsActive = true });

            // 3 on-time and 2 late -> 60% overall SLA compliance (>= 50% and < 80% -> Warning)
            for (int i = 0; i < 5; i++)
            {
                var isLate = i >= 3;
                db.Tasks.Add(new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = $"Task {i}",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.Completed,
                    CreatedAt = now.AddDays(-10),
                    UpdatedAt = isLate ? now.AddDays(-1) : now.AddDays(-5),
                    Deadline = now.AddDays(-3)
                });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "OverallSlaCompliance");

            alert.Should().NotBeNull();
            alert!.Severity.Should().Be("Warning");
            alert.CurrentValue.Should().Be(60.0);
            alert.ThresholdValue.Should().Be(80.0);
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_OverallSlaCompliance_AboveThreshold_GeneratesNoAlert()
    {
        var (scanService, scopeFactory) = CreateScanService(new BiomarkerThresholds { MinOnTimeRate = 0.80 });
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Express", IsActive = true });

            // 9 on-time and 1 late -> 90% overall SLA compliance (>= 80% -> No alert)
            for (int i = 0; i < 10; i++)
            {
                var isLate = i == 9;
                db.Tasks.Add(new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = $"Task {i}",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.Completed,
                    CreatedAt = now.AddDays(-10),
                    UpdatedAt = isLate ? now.AddDays(-1) : now.AddDays(-5),
                    Deadline = now.AddDays(-3)
                });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alert = await db.BiomarkerAlerts.FirstOrDefaultAsync(a => a.MetricName == "OverallSlaCompliance");
            alert.Should().BeNull();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_InactiveDepartment_IsSkipped()
    {
        var (scanService, scopeFactory) = CreateScanService();
        var now = DateTime.UtcNow;
        var deptId = Guid.NewGuid();

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Departments.Add(new Department { Id = deptId, Name = "Closed Dept", IsActive = false });

            // Overdue tasks for inactive department
            for (int i = 0; i < 20; i++)
            {
                db.Tasks.Add(new Backend.Models.Task
                {
                    Id = Guid.NewGuid(),
                    Title = $"Task {i}",
                    AssignedDepartmentId = deptId,
                    Status = Backend.Models.Enums.TaskStatus.NotStarted,
                    Deadline = now.AddDays(-5)
                });
            }
            await db.SaveChangesAsync();
        }

        await scanService.RunBiomarkerScanAsync(now.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alerts = await db.BiomarkerAlerts.Where(a => a.DepartmentId == deptId).ToListAsync();
            alerts.Should().BeEmpty();
        }
    }

    [Fact]
    public async System.Threading.Tasks.Task RunBiomarkerScanAsync_EmptyDatabase_ExecutesCleanlyWithoutAlerts()
    {
        var (scanService, scopeFactory) = CreateScanService();

        await scanService.RunBiomarkerScanAsync(DateTime.UtcNow.Date);

        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var alerts = await db.BiomarkerAlerts.ToListAsync();
            alerts.Should().BeEmpty();
        }
    }
}
