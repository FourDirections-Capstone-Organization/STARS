using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using BackendTask = Backend.Models.Task;
using TaskStatus = Backend.Models.Enums.TaskStatus;

namespace Backend.Tests.Analytics;

public class KpiHierarchicalScopeEngineTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static (Department Dept, Team TeamA, Team TeamB, User Courier1, User Courier2, User Encoder1) CreateSampleOrganization(AppDbContext db)
    {
        var dept = new Department
        {
            Id = Guid.NewGuid(),
            Name = "Operations & Logistics",
            IsActive = true
        };

        var teamLeader = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "LEAD-001",
            FirstName = "Maria",
            LastName = "Santos",
            Email = "maria.santos@speedex.com",
            Role = UserRole.Coordinator,
            DepartmentId = dept.Id,
            AvailabilityStatus = AvailabilityStatus.Active
        };

        var teamA = new Team
        {
            Id = Guid.NewGuid(),
            Name = "North Delivery Team",
            DepartmentId = dept.Id,
            TeamLeaderId = teamLeader.Id,
            TeamLeader = teamLeader,
            IsActive = true
        };

        var teamB = new Team
        {
            Id = Guid.NewGuid(),
            Name = "Data Entry Team",
            DepartmentId = dept.Id,
            IsActive = true
        };

        var courier1 = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "CR-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Email = "juan.delacruz@speedex.com",
            Role = UserRole.Courier,
            DepartmentId = dept.Id,
            AvailabilityStatus = AvailabilityStatus.Active
        };

        var courier2 = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "CR-002",
            FirstName = "Pedro",
            LastName = "Penduko",
            Email = "pedro.penduko@speedex.com",
            Role = UserRole.Courier,
            DepartmentId = dept.Id,
            AvailabilityStatus = AvailabilityStatus.Active
        };

        var encoder1 = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "ENC-001",
            FirstName = "Ana",
            LastName = "Reyes",
            Email = "ana.reyes@speedex.com",
            Role = UserRole.Encoder,
            DepartmentId = dept.Id,
            AvailabilityStatus = AvailabilityStatus.Active
        };

        teamA.Members.Add(new TeamMember { TeamId = teamA.Id, UserId = courier1.Id, User = courier1 });
        teamA.Members.Add(new TeamMember { TeamId = teamA.Id, UserId = courier2.Id, User = courier2 });
        teamB.Members.Add(new TeamMember { TeamId = teamB.Id, UserId = encoder1.Id, User = encoder1 });

        dept.Users.Add(courier1);
        dept.Users.Add(courier2);
        dept.Users.Add(encoder1);
        dept.Users.Add(teamLeader);

        db.Departments.Add(dept);
        db.Users.AddRange(courier1, courier2, encoder1, teamLeader);
        db.Teams.AddRange(teamA, teamB);
        db.SaveChanges();

        return (dept, teamA, teamB, courier1, courier2, encoder1);
    }

    [Fact]
    public void AggregateDepartmentEvaluation_CalculatesCorrectTotalsAndMetrics()
    {
        // Arrange
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);
        var dept = new Department { Id = Guid.NewGuid(), Name = "Logistics" };
        var team = new Team { Id = Guid.NewGuid(), Name = "Alpha Team", DepartmentId = dept.Id };

        var emp1Eval = new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = Guid.NewGuid(),
            EmployeeName = "Juan Dela Cruz",
            TotalAssignedTasks = 10,
            CompletedTasksCount = 10,
            OnTimeTasksCount = 10,
            InFullTasksCount = 10,
            OtifTasksCount = 10,
            ReworkTasksCount = 0,
            AccurateTasksCount = 10,
            TotalHandlingHours = 20.0,
            OverallScore = 100.0,
            OverallRating = "Green"
        };

        var emp2Eval = new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = Guid.NewGuid(),
            EmployeeName = "Pedro Penduko",
            TotalAssignedTasks = 10,
            CompletedTasksCount = 10,
            OnTimeTasksCount = 8,
            InFullTasksCount = 8,
            OtifTasksCount = 8,
            ReworkTasksCount = 2,
            AccurateTasksCount = 8,
            TotalHandlingHours = 30.0,
            OverallScore = 80.0,
            OverallRating = "Amber"
        };

        team.Members.Add(new TeamMember { TeamId = team.Id, UserId = emp1Eval.EmployeeId });
        team.Members.Add(new TeamMember { TeamId = team.Id, UserId = emp2Eval.EmployeeId });

        var start = DateTime.UtcNow.AddDays(-30);
        var end = DateTime.UtcNow;

        // Act
        var result = engine.AggregateDepartmentEvaluation(
            dept,
            new List<Team> { team },
            new List<EmployeeKpiEvaluationResultDTO> { emp1Eval, emp2Eval },
            start,
            end);

        // Assert
        Assert.Equal(dept.Id, result.DepartmentId);
        Assert.Equal("Logistics", result.DepartmentName);
        Assert.Equal(2, result.TotalEmployees);
        Assert.Equal(1, result.TotalTeams);
        Assert.Equal(20, result.TotalAssignedTasks);
        Assert.Equal(20, result.CompletedTasksCount);
        Assert.Equal(18, result.OnTimeTasksCount);
        Assert.Equal(18, result.InFullTasksCount);
        Assert.Equal(18, result.OtifTasksCount);
        Assert.Equal(2, result.ReworkTasksCount);
        Assert.Equal(18, result.AccurateTasksCount);
        Assert.Equal(50.0, result.TotalHandlingHours);
        Assert.Equal(90.0, result.AverageEmployeeScore); // (100 + 80) / 2 = 90
        Assert.Single(result.Teams);
        Assert.Equal("Alpha Team", result.Teams[0].TeamName);
        Assert.Equal(2, result.Employees.Count);
    }

    [Fact]
    public void AggregateTeamEvaluation_CalculatesCorrectTotalsAndMetrics()
    {
        // Arrange
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);
        var dept = new Department { Id = Guid.NewGuid(), Name = "Logistics" };
        var team = new Team
        {
            Id = Guid.NewGuid(),
            Name = "Bravo Team",
            DepartmentId = dept.Id,
            Department = dept
        };

        var emp1Eval = new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = Guid.NewGuid(),
            EmployeeName = "Ana Reyes",
            TotalAssignedTasks = 5,
            CompletedTasksCount = 5,
            OnTimeTasksCount = 5,
            InFullTasksCount = 5,
            OtifTasksCount = 5,
            ReworkTasksCount = 0,
            AccurateTasksCount = 5,
            TotalHandlingHours = 10.0,
            OverallScore = 100.0,
            OverallRating = "Green"
        };

        var start = DateTime.UtcNow.AddDays(-7);
        var end = DateTime.UtcNow;

        // Act
        var result = engine.AggregateTeamEvaluation(
            team,
            new List<EmployeeKpiEvaluationResultDTO> { emp1Eval },
            start,
            end);

        // Assert
        Assert.Equal(team.Id, result.TeamId);
        Assert.Equal("Bravo Team", result.TeamName);
        Assert.Equal(dept.Id, result.DepartmentId);
        Assert.Equal("Logistics", result.DepartmentName);
        Assert.Equal(1, result.TotalMembers);
        Assert.Equal(5, result.TotalAssignedTasks);
        Assert.Equal(5, result.CompletedTasksCount);
        Assert.Equal(5, result.OtifTasksCount);
        Assert.Equal(10.0, result.TotalHandlingHours);
        Assert.Equal(100.0, result.AverageEmployeeScore);
        Assert.Equal("Green", result.OverallRating);
        Assert.Single(result.Employees);
    }

    [Fact]
    public void AggregateDepartmentEvaluation_WithZeroTasks_ReturnsZeroRatesAndAmberRating()
    {
        // Arrange
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance);
        var dept = new Department { Id = Guid.NewGuid(), Name = "Operations" };

        var start = DateTime.UtcNow.AddDays(-30);
        var end = DateTime.UtcNow;

        // Act
        var result = engine.AggregateDepartmentEvaluation(
            dept,
            new List<Team>(),
            new List<EmployeeKpiEvaluationResultDTO>(),
            start,
            end);

        // Assert
        Assert.Equal(0, result.TotalEmployees);
        Assert.Equal(0, result.TotalAssignedTasks);
        Assert.Equal(0, result.CompletedTasksCount);
        Assert.Equal(25.0, result.OverallScore); // AHT (lower is better, actual = 0) gets 25.0 weight
        Assert.Equal("Amber", result.OverallRating);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateDepartmentKpiAsync_AggregatesAllDepartmentEmployeesAndTeams()
    {
        // Arrange
        var db = CreateInMemoryDbContext();
        var (dept, teamA, teamB, courier1, courier2, encoder1) = CreateSampleOrganization(db);

        var now = DateTime.UtcNow;
        var start = now.AddDays(-10);
        var end = now.AddDays(1);

        // Add completed task for courier1 (On-time, with attachment -> OTIF)
        var t1 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery Task 1",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now.AddHours(-3),
            UpdatedAt = now.AddHours(-1),
            Attachments = new List<TaskAttachment> { new() { FileName = "p1.jpg", FilePath = "/p1.jpg" } },
            Assignments = new List<TaskAssignment> { new() { AssignedUserId = courier1.Id, AssignedAt = now.AddHours(-3) } }
        };

        // Add completed task for courier2 (On-time, with attachment -> OTIF)
        var t2 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery Task 2",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now.AddHours(-4),
            UpdatedAt = now.AddHours(-2),
            Attachments = new List<TaskAttachment> { new() { FileName = "p2.jpg", FilePath = "/p2.jpg" } },
            Assignments = new List<TaskAssignment> { new() { AssignedUserId = courier2.Id, AssignedAt = now.AddHours(-4) } }
        };

        // Add completed task for encoder1 (Late, no attachment)
        var t3 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Encoding Task 3",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(-3),
            CreatedAt = now.AddHours(-5),
            UpdatedAt = now.AddHours(-1),
            Attachments = new List<TaskAttachment>(),
            Assignments = new List<TaskAssignment> { new() { AssignedUserId = encoder1.Id, AssignedAt = now.AddHours(-5) } }
        };

        db.Tasks.AddRange(t1, t2, t3);
        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act
        var result = await engine.CalculateDepartmentKpiAsync(dept.Id, start, end);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(dept.Id, result.DepartmentId);
        Assert.Equal("Operations & Logistics", result.DepartmentName);
        Assert.Equal(4, result.TotalEmployees); // courier1, courier2, encoder1, teamLeader
        Assert.Equal(2, result.TotalTeams);
        Assert.Equal(3, result.TotalAssignedTasks);
        Assert.Equal(3, result.CompletedTasksCount);
        Assert.Equal(2, result.OnTimeTasksCount);
        Assert.Equal(2, result.OtifTasksCount);
        Assert.Equal(2, result.Teams.Count);

        // Team A has courier1 and courier2 (2 completed, 2 OTIF)
        var teamASummary = result.Teams.FirstOrDefault(t => t.TeamId == teamA.Id);
        Assert.NotNull(teamASummary);
        Assert.Equal(2, teamASummary.TotalAssignedTasks);
        Assert.Equal(2, teamASummary.CompletedTasksCount);
        Assert.Equal(100.0, teamASummary.OverallScore);

        // Team B has encoder1 (1 completed, 0 OTIF, late)
        var teamBSummary = result.Teams.FirstOrDefault(t => t.TeamId == teamB.Id);
        Assert.NotNull(teamBSummary);
        Assert.Equal(1, teamBSummary.TotalAssignedTasks);
        Assert.Equal(1, teamBSummary.CompletedTasksCount);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateDepartmentKpiAsync_WithRoleFilter_FiltersEmployeesToSpecifiedRole()
    {
        // Arrange
        var db = CreateInMemoryDbContext();
        var (dept, _, _, courier1, courier2, encoder1) = CreateSampleOrganization(db);

        var now = DateTime.UtcNow;
        var start = now.AddDays(-10);
        var end = now.AddDays(1);

        var t1 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery Task 1",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now.AddHours(-3),
            UpdatedAt = now.AddHours(-1),
            Attachments = new List<TaskAttachment> { new() { FileName = "p1.jpg", FilePath = "/p1.jpg" } },
            Assignments = new List<TaskAssignment> { new() { AssignedUserId = courier1.Id, AssignedAt = now.AddHours(-3) } }
        };

        var t2 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Encoding Task 2",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now.AddHours(-3),
            UpdatedAt = now.AddHours(-1),
            Assignments = new List<TaskAssignment> { new() { AssignedUserId = encoder1.Id, AssignedAt = now.AddHours(-3) } }
        };

        db.Tasks.AddRange(t1, t2);
        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act: Filter by Courier only
        var courierResult = await engine.CalculateDepartmentKpiAsync(dept.Id, start, end, roleFilter: UserRole.Courier);

        // Assert
        Assert.Equal("Courier", courierResult.RoleFilter);
        Assert.Equal(2, courierResult.TotalEmployees); // courier1, courier2
        Assert.All(courierResult.Employees, e => Assert.Equal("Courier", e.Role));
        Assert.Equal(1, courierResult.CompletedTasksCount); // Only t1

        // Act: Filter by Encoder only
        var encoderResult = await engine.CalculateDepartmentKpiAsync(dept.Id, start, end, roleFilter: UserRole.Encoder);

        // Assert
        Assert.Equal("Encoder", encoderResult.RoleFilter);
        Assert.Equal(1, encoderResult.TotalEmployees); // encoder1
        Assert.Single(encoderResult.Employees);
        Assert.Equal("Encoder", encoderResult.Employees[0].Role);
        Assert.Equal(1, encoderResult.CompletedTasksCount); // Only t2
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateTeamKpiAsync_AggregatesTeamMembersCorrectly()
    {
        // Arrange
        var db = CreateInMemoryDbContext();
        var (_, teamA, _, courier1, courier2, _) = CreateSampleOrganization(db);

        var now = DateTime.UtcNow;
        var start = now.AddDays(-5);
        var end = now.AddDays(1);

        var t1 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Task Courier 1",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now.AddHours(-2),
            UpdatedAt = now.AddHours(-1),
            Attachments = new List<TaskAttachment> { new() { FileName = "p1.jpg", FilePath = "/p1.jpg" } },
            Assignments = new List<TaskAssignment> { new() { AssignedUserId = courier1.Id, AssignedAt = now.AddHours(-2) } }
        };

        var t2 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Task Courier 2",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now.AddHours(-3),
            UpdatedAt = now.AddHours(-1),
            Attachments = new List<TaskAttachment> { new() { FileName = "p2.jpg", FilePath = "/p2.jpg" } },
            Assignments = new List<TaskAssignment> { new() { AssignedUserId = courier2.Id, AssignedAt = now.AddHours(-3) } }
        };

        db.Tasks.AddRange(t1, t2);
        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act
        var result = await engine.CalculateTeamKpiAsync(teamA.Id, start, end);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(teamA.Id, result.TeamId);
        Assert.Equal("North Delivery Team", result.TeamName);
        Assert.Equal(2, result.TotalMembers);
        Assert.Equal(2, result.TotalAssignedTasks);
        Assert.Equal(2, result.CompletedTasksCount);
        Assert.Equal(2, result.OtifTasksCount);
        Assert.Equal(100.0, result.OverallScore);
        Assert.Equal("Green", result.OverallRating);
        Assert.Equal(2, result.Employees.Count);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateTeamKpiAsync_WithRoleFilter_FiltersMembersByRole()
    {
        // Arrange
        var db = CreateInMemoryDbContext();
        var (dept, teamA, _, courier1, _, encoder1) = CreateSampleOrganization(db);

        // Add encoder1 to teamA as well
        db.Set<TeamMember>().Add(new TeamMember { TeamId = teamA.Id, UserId = encoder1.Id });
        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);
        var start = DateTime.UtcNow.AddDays(-5);
        var end = DateTime.UtcNow.AddDays(1);

        // Act: Filter by Courier
        var result = await engine.CalculateTeamKpiAsync(teamA.Id, start, end, roleFilter: UserRole.Courier);

        // Assert
        Assert.Equal(2, result.TotalMembers); // courier1, courier2
        Assert.All(result.Employees, e => Assert.Equal("Courier", e.Role));
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateHierarchicalScopeAsync_AtTeamLevel_ReturnsTeamScopeResult()
    {
        // Arrange
        var db = CreateInMemoryDbContext();
        var (dept, teamA, _, _, _, _) = CreateSampleOrganization(db);
        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        var start = DateTime.UtcNow.AddDays(-5);
        var end = DateTime.UtcNow.AddDays(1);

        // Act
        var result = await engine.CalculateHierarchicalScopeAsync(
            departmentId: dept.Id,
            teamId: teamA.Id,
            startDate: start,
            endDate: end);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Team", result.ScopeLevel);
        Assert.Equal(teamA.Id, result.ScopeId);
        Assert.Equal("North Delivery Team", result.ScopeName);
        Assert.Equal(dept.Id, result.ParentScopeId);
        Assert.Equal(dept.Name, result.ParentScopeName);
        Assert.Equal(2, result.TotalEmployees);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateHierarchicalScopeAsync_AtDepartmentLevel_ReturnsDepartmentScopeResult()
    {
        // Arrange
        var db = CreateInMemoryDbContext();
        var (dept, _, _, _, _, _) = CreateSampleOrganization(db);
        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        var start = DateTime.UtcNow.AddDays(-5);
        var end = DateTime.UtcNow.AddDays(1);

        // Act
        var result = await engine.CalculateHierarchicalScopeAsync(
            departmentId: dept.Id,
            teamId: null,
            startDate: start,
            endDate: end);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Department", result.ScopeLevel);
        Assert.Equal(dept.Id, result.ScopeId);
        Assert.Equal("Operations & Logistics", result.ScopeName);
        Assert.Equal(1, result.TotalDepartments);
        Assert.Equal(2, result.TotalTeams);
        Assert.Equal(4, result.TotalEmployees);
        Assert.Equal(2, result.Teams.Count);
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateHierarchicalScopeAsync_AtCompanyLevel_AggregatesAllActiveDepartments()
    {
        // Arrange
        var db = CreateInMemoryDbContext();
        var (dept1, _, _, _, _, _) = CreateSampleOrganization(db);

        // Create second department
        var dept2 = new Department
        {
            Id = Guid.NewGuid(),
            Name = "Customer Support",
            IsActive = true
        };
        db.Departments.Add(dept2);
        await db.SaveChangesAsync();

        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        var start = DateTime.UtcNow.AddDays(-5);
        var end = DateTime.UtcNow.AddDays(1);

        // Act
        var result = await engine.CalculateHierarchicalScopeAsync(
            departmentId: null,
            teamId: null,
            startDate: start,
            endDate: end);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Company", result.ScopeLevel);
        Assert.Null(result.ScopeId);
        Assert.Equal("All Departments", result.ScopeName);
        Assert.Equal(2, result.TotalDepartments);
        Assert.Equal(2, result.Departments.Count);
        Assert.Contains(result.Departments, d => d.DepartmentName == "Operations & Logistics");
        Assert.Contains(result.Departments, d => d.DepartmentName == "Customer Support");
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateDepartmentKpiAsync_NonExistentDepartment_ThrowsKeyNotFoundException()
    {
        // Arrange
        var db = CreateInMemoryDbContext();
        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act & Assert
        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            engine.CalculateDepartmentKpiAsync(Guid.NewGuid(), DateTime.UtcNow.AddDays(-1), DateTime.UtcNow));
    }

    [Fact]
    public async System.Threading.Tasks.Task CalculateTeamKpiAsync_NonExistentTeam_ThrowsKeyNotFoundException()
    {
        // Arrange
        var db = CreateInMemoryDbContext();
        var engine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        // Act & Assert
        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            engine.CalculateTeamKpiAsync(Guid.NewGuid(), DateTime.UtcNow.AddDays(-1), DateTime.UtcNow));
    }

    [Fact]
    public void AggregateDepartmentEvaluation_WithCustomFormula_EvaluatesAcrossAggregateVariables()
    {
        // Arrange
        var parser = new SafeFormulaParser();
        var registry = new KpiVariableRegistry();
        var engine = new KpiCalculationEngine(CreateInMemoryDbContext(), NullLogger<KpiCalculationEngine>.Instance, parser, registry);

        var dept = new Department { Id = Guid.NewGuid(), Name = "Custom Logistics" };
        var customConfig = new KpiConfiguration
        {
            Id = Guid.NewGuid(),
            Title = "Custom Formula Config",
            IsActive = true,
            EffectiveStartDate = DateTime.UtcNow.AddDays(-30),
            OverallGreenThreshold = 80.0,
            OverallAmberThreshold = 60.0,
            Items = new List<KpiItem>
            {
                new()
                {
                    MetricCode = "AGGREGATE_ACCURACY",
                    Name = "Aggregate Accuracy Formula",
                    IsCustomFormula = true,
                    CustomFormula = "(accurate_tasks / completed_tasks) * 100",
                    Weight = 100.0,
                    TargetValue = 100.0,
                    GreenThreshold = 70.0,
                    AmberThreshold = 50.0,
                    RedThreshold = 30.0
                }
            }
        };

        var emp1 = new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = Guid.NewGuid(),
            TotalAssignedTasks = 5,
            CompletedTasksCount = 5,
            AccurateTasksCount = 4, // 1 rework
            ReworkTasksCount = 1
        };

        var emp2 = new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = Guid.NewGuid(),
            TotalAssignedTasks = 5,
            CompletedTasksCount = 5,
            AccurateTasksCount = 4, // 1 rework
            ReworkTasksCount = 1
        };

        // Total completed: 10, accurate: 8 -> (8 / 10) * 100 = 80%
        var result = engine.AggregateDepartmentEvaluation(
            dept,
            new List<Team>(),
            new List<EmployeeKpiEvaluationResultDTO> { emp1, emp2 },
            DateTime.UtcNow.AddDays(-10),
            DateTime.UtcNow,
            configuration: customConfig);

        Assert.Single(result.Metrics);
        var metric = result.Metrics[0];
        Assert.Equal("AGGREGATE_ACCURACY", metric.MetricCode);
        Assert.Equal(80.0, metric.ActualValue);
        Assert.Equal("Green", metric.Rating);
        Assert.Equal(80.0, result.OverallScore);
    }
}
