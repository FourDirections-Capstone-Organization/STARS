using System.Security.Claims;
using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;
using Backend.Modules.TaskManagement.Groq;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Task = System.Threading.Tasks.Task;

namespace Backend.Tests.AIExpertSystemTests;

public class SuitabilityControllerIntegrationTests
{
    private static AppDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static SuitabilityController CreateController(
        ISuitabilityService suitabilityService,
        UserRole callerRole = UserRole.Coordinator,
        Guid? departmentId = null,
        Guid? userId = null)
    {
        var userGuid = userId ?? Guid.NewGuid();
        var deptGuid = departmentId ?? Guid.NewGuid();

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userGuid.ToString()),
            new(ClaimTypes.Role, callerRole.ToString()),
            new("DepartmentId", deptGuid.ToString())
        };

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        return new SuitabilityController(suitabilityService)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = principal }
            }
        };
    }

    private static IExpertSystemConfigStore CreateConfigStore()
    {
        var mock = new Mock<IExpertSystemConfigStore>();
        mock.Setup(s => s.GetConfig()).Returns(new ExpertSystemConfig
        {
            WorkloadWeight = 0.35,
            ExperienceWeight = 0.25,
            RecScoreWeight = 0.40,
            MaxWorkload = 10,
            MaxXP = 20
        });
        return mock.Object;
    }

    private static (Department Dept, User Alice, User Bob, Models.Task Task) SeedBasicTestData(AppDbContext db)
    {
        var dept = new Department
        {
            Id = Guid.NewGuid(),
            Name = "Operations"
        };
        db.Departments.Add(dept);

        var alice = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            FirstName = "Alice",
            LastName = "Rivera",
            Email = "alice@example.com",
            PasswordHash = "hash",
            Role = UserRole.Encoder,
            DepartmentId = dept.Id,
            AvailabilityStatus = AvailabilityStatus.Active,
            IsActive = true
        };

        var bob = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            FirstName = "Bob",
            LastName = "Santos",
            Email = "bob@example.com",
            PasswordHash = "hash",
            Role = UserRole.Dispatcher,
            DepartmentId = dept.Id,
            AvailabilityStatus = AvailabilityStatus.Active,
            IsActive = true
        };

        db.Users.AddRange(alice, bob);

        // Seed Alice workload: 1 active task (NotStarted), 3 completed routine tasks, 2 completed special tasks
        var activeTask1 = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Active Task 1",
            Description = "Active 1",
            Status = Models.Enums.TaskStatus.NotStarted,
            Classification = TaskClassification.RoutineDailyTask,
            Deadline = DateTime.UtcNow.AddDays(1)
        };
        db.Tasks.Add(activeTask1);
        db.TaskAssignments.Add(new TaskAssignment { TaskId = activeTask1.Id, AssignedUserId = alice.Id });

        for (int i = 0; i < 3; i++)
        {
            var routineDone = new Models.Task
            {
                Id = Guid.NewGuid(),
                Title = $"Routine Done {i}",
                Description = "Done",
                Status = Models.Enums.TaskStatus.Completed,
                Classification = TaskClassification.RoutineDailyTask,
                Deadline = DateTime.UtcNow.AddDays(-1)
            };
            db.Tasks.Add(routineDone);
            db.TaskAssignments.Add(new TaskAssignment { TaskId = routineDone.Id, AssignedUserId = alice.Id });
        }

        for (int i = 0; i < 2; i++)
        {
            var specialDone = new Models.Task
            {
                Id = Guid.NewGuid(),
                Title = $"Special Done {i}",
                Description = "Done",
                Status = Models.Enums.TaskStatus.Completed,
                Classification = TaskClassification.SpecialTask,
                Deadline = DateTime.UtcNow.AddDays(-1)
            };
            db.Tasks.Add(specialDone);
            db.TaskAssignments.Add(new TaskAssignment { TaskId = specialDone.Id, AssignedUserId = alice.Id });
        }

        // Seed Alice recommendations: 1 Timeliness, 1 WorkQuality (total 2)
        db.Recommendations.Add(new Recommendation
        {
            TaskId = activeTask1.Id,
            AssigneeId = alice.Id,
            CoordinatorId = Guid.NewGuid(),
            Category = RecommendationCategory.Timeliness,
            Notes = "Prompt delivery"
        });
        db.Recommendations.Add(new Recommendation
        {
            TaskId = activeTask1.Id,
            AssigneeId = alice.Id,
            CoordinatorId = Guid.NewGuid(),
            Category = RecommendationCategory.WorkQuality,
            Notes = "Excellent accuracy"
        });

        // Seed Bob workload: 3 active tasks, 1 completed routine task
        for (int i = 0; i < 3; i++)
        {
            var bobActive = new Models.Task
            {
                Id = Guid.NewGuid(),
                Title = $"Bob Active {i}",
                Description = "Active",
                Status = Models.Enums.TaskStatus.InProgress,
                Classification = TaskClassification.RoutineDailyTask,
                Deadline = DateTime.UtcNow.AddDays(2)
            };
            db.Tasks.Add(bobActive);
            db.TaskAssignments.Add(new TaskAssignment { TaskId = bobActive.Id, AssignedUserId = bob.Id });
        }

        var bobRoutineDone = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Bob Routine Done",
            Description = "Done",
            Status = Models.Enums.TaskStatus.Completed,
            Classification = TaskClassification.RoutineDailyTask,
            Deadline = DateTime.UtcNow.AddDays(-2)
        };
        db.Tasks.Add(bobRoutineDone);
        db.TaskAssignments.Add(new TaskAssignment { TaskId = bobRoutineDone.Id, AssignedUserId = bob.Id });

        // Seed Bob recommendations: 1 Communication (total 1)
        db.Recommendations.Add(new Recommendation
        {
            TaskId = bobRoutineDone.Id,
            AssigneeId = bob.Id,
            CoordinatorId = Guid.NewGuid(),
            Category = RecommendationCategory.Communication,
            Notes = "Clear communicator"
        });

        // Seed the target task for evaluation
        var targetTask = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Urgent Package Processing",
            Description = "Process and verify dispatch parcel.",
            Status = Models.Enums.TaskStatus.NotStarted,
            Classification = TaskClassification.RoutineDailyTask,
            PriorityLevel = PriorityLevel.High,
            AssignedDepartmentId = dept.Id,
            Deadline = DateTime.UtcNow.AddDays(1)
        };
        db.Tasks.Add(targetTask);

        db.SaveChanges();
        return (dept, alice, bob, targetTask);
    }

    [Fact]
    public async Task GetSuitableEmployees_ReturnsRankedCandidates_FromPostgreSqlMetrics_WithGroqEvaluation()
    {
        using var db = CreateInMemoryDb();
        var (dept, alice, bob, task) = SeedBasicTestData(db);

        var mockGroq = new Mock<IGroqSuitabilityService>();
        mockGroq.Setup(g => g.IsConfigured).Returns(true);

        List<GroqCandidateMetrics>? capturedCandidates = null;
        mockGroq.Setup(g => g.EvaluateSuitabilityAsync(
                It.IsAny<GroqTaskContext>(),
                It.IsAny<List<GroqCandidateMetrics>>(),
                It.IsAny<CancellationToken>()))
            .Callback<GroqTaskContext, List<GroqCandidateMetrics>, CancellationToken>((_, c, _) => capturedCandidates = c)
            .ReturnsAsync((GroqTaskContext t, List<GroqCandidateMetrics> c, CancellationToken _) => new GroqSuitabilityResult
            {
                FromCache = false,
                Recommendations = new List<GroqCandidateRecommendation>
                {
                    new()
                    {
                        EmployeeId = alice.Id,
                        Rank = 1,
                        Score = 0.94,
                        Rationale = "Light workload (1 active task) and consistent routine task experience."
                    },
                    new()
                    {
                        EmployeeId = bob.Id,
                        Rank = 2,
                        Score = 0.68,
                        Rationale = "Moderate workload (3 active tasks) with fewer completed routine tasks."
                    }
                }
            });

        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Coordinator, dept.Id);

        var actionResult = await controller.GetSuitableEmployees(task.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Subject;
        apiResponse.IsSuccess.Should().BeTrue();
        apiResponse.Data.Should().NotBeNull();
        apiResponse.Data!.TotalCount.Should().Be(2);

        var items = apiResponse.Data.Items;
        items.Should().HaveCount(2);

        // First candidate: Alice
        items[0].EmployeeId.Should().Be(alice.Id);
        items[0].FullName.Should().Be("Alice Rivera");
        items[0].Role.Should().Be(UserRole.Encoder.ToString());
        items[0].Workload.Should().Be(1);
        items[0].SuitabilityScore.Should().Be(0.94);
        items[0].Rank.Should().Be(1);
        items[0].Rationale.Should().Contain("Light workload");

        // Second candidate: Bob
        items[1].EmployeeId.Should().Be(bob.Id);
        items[1].FullName.Should().Be("Bob Santos");
        items[1].Role.Should().Be(UserRole.Dispatcher.ToString());
        items[1].Workload.Should().Be(3);
        items[1].SuitabilityScore.Should().Be(0.68);
        items[1].Rank.Should().Be(2);
        items[1].Rationale.Should().Contain("Moderate workload");

        // Verify captured candidate metrics from PostgreSQL query
        capturedCandidates.Should().NotBeNull();
        var aliceMetrics = capturedCandidates!.First(c => c.EmployeeId == alice.Id);
        aliceMetrics.Workload.Should().Be(1);
        aliceMetrics.RoutineExperience.Should().Be(3);
        aliceMetrics.SpecialExperience.Should().Be(2);
        aliceMetrics.TimelinessRating.Should().Be(2.50);
        aliceMetrics.WorkQualityRating.Should().Be(2.50);
        aliceMetrics.CommunicationRating.Should().Be(0.00);

        var bobMetrics = capturedCandidates.First(c => c.EmployeeId == bob.Id);
        bobMetrics.Workload.Should().Be(3);
        bobMetrics.RoutineExperience.Should().Be(1);
        bobMetrics.SpecialExperience.Should().Be(0);
        bobMetrics.CommunicationRating.Should().Be(5.00);
    }

    [Fact]
    public async Task GetSuitableEmployees_WhenGroqFailsOrNotConfigured_FallsBackToPostgreSqlHeuristic()
    {
        using var db = CreateInMemoryDb();
        var (dept, alice, bob, task) = SeedBasicTestData(db);

        var mockGroq = new Mock<IGroqSuitabilityService>();
        mockGroq.Setup(g => g.IsConfigured).Returns(false);

        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Coordinator, dept.Id);

        var actionResult = await controller.GetSuitableEmployees(task.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Subject;
        apiResponse.IsSuccess.Should().BeTrue();
        apiResponse.Data!.Items.Should().HaveCount(2);

        // Fallback provides heuristic score grounded in verified PostgreSQL metrics
        var firstItem = apiResponse.Data.Items[0];
        firstItem.SuitabilityScore.Should().BeGreaterThan(0.0);
        firstItem.Workload.Should().Be(1); // Alice has lower workload (1 vs 3) and higher experience
        firstItem.FullName.Should().Be("Alice Rivera");
        firstItem.Rank.Should().Be(1);
    }

    [Fact]
    public async Task GetSuitableEmployees_TaskNotFound_ReturnsBadRequest()
    {
        using var db = CreateInMemoryDb();
        var mockGroq = new Mock<IGroqSuitabilityService>();
        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Coordinator);

        var actionResult = await controller.GetSuitableEmployees(Guid.NewGuid());

        var badResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badResult.Value.Should().BeOfType<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Be("Task not found");
    }

    [Fact]
    public async Task GetSuitableEmployees_TaskHasNoAssignedDepartment_ReturnsBadRequest()
    {
        using var db = CreateInMemoryDb();
        var taskWithoutDept = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Task with no department",
            Description = "Unassigned",
            AssignedDepartmentId = null
        };
        db.Tasks.Add(taskWithoutDept);
        db.SaveChanges();

        var mockGroq = new Mock<IGroqSuitabilityService>();
        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Coordinator);

        var actionResult = await controller.GetSuitableEmployees(taskWithoutDept.Id);

        var badResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badResult.Value.Should().BeOfType<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Be("Task has no assigned department");
    }

    [Fact]
    public async Task GetSuitableEmployees_UnauthorizedRole_ReturnsBadRequest()
    {
        using var db = CreateInMemoryDb();
        var (dept, _, _, task) = SeedBasicTestData(db);

        var mockGroq = new Mock<IGroqSuitabilityService>();
        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Courier, dept.Id); // Courier is not authorized

        var actionResult = await controller.GetSuitableEmployees(task.Id);

        var badResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badResult.Value.Should().BeOfType<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Be("Not authorized to view suitability");
    }

    [Fact]
    public async Task GetSuitabilityExplanation_ReturnsDetailedBreakdown_AndAiRationale()
    {
        using var db = CreateInMemoryDb();
        var (dept, alice, _, task) = SeedBasicTestData(db);

        var mockGroq = new Mock<IGroqSuitabilityService>();
        mockGroq.Setup(g => g.IsConfigured).Returns(true);
        mockGroq.Setup(g => g.EvaluateSuitabilityAsync(
                It.IsAny<GroqTaskContext>(),
                It.IsAny<List<GroqCandidateMetrics>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GroqSuitabilityResult
            {
                FromCache = false,
                Recommendations = new List<GroqCandidateRecommendation>
                {
                    new()
                    {
                        EmployeeId = alice.Id,
                        Rank = 1,
                        Score = 0.95,
                        Rationale = "Optimal match based on low workload and high routine experience."
                    }
                }
            });

        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Coordinator, dept.Id);

        var actionResult = await controller.GetSuitabilityExplanation(task.Id, alice.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<List<SuitabilityExplanationDTO>>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().HaveCount(1);

        var explanation = response.Data![0];
        explanation.EmployeeId.Should().Be(alice.Id);
        explanation.FullName.Should().Be("Alice Rivera");
        explanation.FinalScore.Should().Be(0.95);
        explanation.WorkloadFactor.Should().BeGreaterThan(0.0);
        explanation.ExperienceFactor.Should().BeGreaterThan(0.0);
        explanation.RecScore.Should().BeGreaterThan(0.0);
        explanation.Explanation.Should().Contain("Alice Rivera");
        explanation.Explanation.Should().Contain("workload factor");
        explanation.Explanation.Should().Contain("Optimal match based on low workload");
    }

    [Fact]
    public async Task GetSuitabilityExplanation_EmployeeNotFound_ReturnsBadRequest()
    {
        using var db = CreateInMemoryDb();
        var (dept, _, _, task) = SeedBasicTestData(db);

        var mockGroq = new Mock<IGroqSuitabilityService>();
        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Coordinator, dept.Id);

        var actionResult = await controller.GetSuitabilityExplanation(task.Id, Guid.NewGuid());

        var badResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badResult.Value.Should().BeOfType<ApiResponseDTO<List<SuitabilityExplanationDTO>>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Be("Employee not found or not eligible for this task");
    }

    [Fact]
    public async Task GetSuitabilityPreview_ReturnsCandidates_FromPostgreSqlMetrics()
    {
        using var db = CreateInMemoryDb();
        var (dept, alice, bob, _) = SeedBasicTestData(db);

        var mockGroq = new Mock<IGroqSuitabilityService>();
        mockGroq.Setup(g => g.IsConfigured).Returns(true);
        mockGroq.Setup(g => g.EvaluateSuitabilityAsync(
                It.IsAny<GroqTaskContext>(),
                It.IsAny<List<GroqCandidateMetrics>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GroqSuitabilityResult
            {
                FromCache = false,
                Recommendations = new List<GroqCandidateRecommendation>
                {
                    new() { EmployeeId = alice.Id, Rank = 1, Score = 0.91, Rationale = "Preview rank 1" },
                    new() { EmployeeId = bob.Id, Rank = 2, Score = 0.70, Rationale = "Preview rank 2" }
                }
            });

        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Manager, dept.Id);

        var actionResult = await controller.GetSuitabilityPreview(dept.Id, classification: 0);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.Items.Should().HaveCount(2);
        response.Data.Items[0].EmployeeId.Should().Be(alice.Id);
    }

    [Fact]
    public async Task GetSuitabilityPreview_CompanyWide_WhenDepartmentIdNull_ReturnsCandidatesAcrossMultipleDepartmentsWithUniqueSequentialRanks()
    {
        using var db = CreateInMemoryDb();
        var dept1 = new Department { Id = Guid.NewGuid(), Name = "Operations" };
        var dept2 = new Department { Id = Guid.NewGuid(), Name = "Logistics" };
        db.Departments.AddRange(dept1, dept2);

        var alice = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            FirstName = "Alice",
            LastName = "Smith",
            DepartmentId = dept1.Id,
            Role = UserRole.Courier,
            AvailabilityStatus = AvailabilityStatus.Active,
            IsActive = true
        };
        var bob = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            FirstName = "Bob",
            LastName = "Jones",
            DepartmentId = dept2.Id,
            Role = UserRole.Courier,
            AvailabilityStatus = AvailabilityStatus.Active,
            IsActive = true
        };
        var charlie = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-003",
            FirstName = "Charlie",
            LastName = "Brown",
            DepartmentId = dept2.Id,
            Role = UserRole.Dispatcher,
            AvailabilityStatus = AvailabilityStatus.Active,
            IsActive = true
        };
        db.Users.AddRange(alice, bob, charlie);
        await db.SaveChangesAsync();

        var mockGroq = new Mock<IGroqSuitabilityService>();
        mockGroq.Setup(g => g.IsConfigured).Returns(false); // test heuristic fallback with multi-department ranking

        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Manager, dept1.Id);

        var actionResult = await controller.GetSuitabilityPreview(departmentId: null, classification: 0, pageSize: 10);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.Items.Should().HaveCount(3);

        // Verify strictly sequential ranks: 1, 2, 3 with no duplicates and single #1
        var ranks = response.Data.Items.Select(i => i.Rank).ToList();
        ranks.Should().Equal(new List<int?> { 1, 2, 3 });
        response.Data.Items.Count(i => i.Rank == 1).Should().Be(1);

        // Verify candidates come from both departments
        var candidateIds = response.Data.Items.Select(i => i.EmployeeId).ToHashSet();
        candidateIds.Should().Contain(alice.Id);
        candidateIds.Should().Contain(bob.Id);
        candidateIds.Should().Contain(charlie.Id);
    }

    [Fact]
    public async Task GetSuitabilityPreview_CompanyWide_WhenDepartmentIdEmptyGuid_ReturnsCandidatesAcrossMultipleDepartments()
    {
        using var db = CreateInMemoryDb();
        var dept1 = new Department { Id = Guid.NewGuid(), Name = "Operations" };
        var dept2 = new Department { Id = Guid.NewGuid(), Name = "Logistics" };
        db.Departments.AddRange(dept1, dept2);

        var alice = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            FirstName = "Alice",
            LastName = "Smith",
            DepartmentId = dept1.Id,
            Role = UserRole.Courier,
            AvailabilityStatus = AvailabilityStatus.Active,
            IsActive = true
        };
        var bob = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            FirstName = "Bob",
            LastName = "Jones",
            DepartmentId = dept2.Id,
            Role = UserRole.Courier,
            AvailabilityStatus = AvailabilityStatus.Active,
            IsActive = true
        };
        db.Users.AddRange(alice, bob);
        await db.SaveChangesAsync();

        var mockGroq = new Mock<IGroqSuitabilityService>();
        mockGroq.Setup(g => g.IsConfigured).Returns(false);

        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Manager, dept1.Id);

        var actionResult = await controller.GetSuitabilityPreview(departmentId: Guid.Empty, classification: 0, pageSize: 10);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.Items.Should().HaveCount(2);
        response.Data.Items.Select(i => i.Rank).Should().Equal(new List<int?> { 1, 2 });
    }

    [Fact]
    public async Task GetSuitableEmployees_Pagination_HandlesPageSizeAndPageNumber()
    {
        using var db = CreateInMemoryDb();
        var dept = new Department { Id = Guid.NewGuid(), Name = "Logistics" };
        db.Departments.Add(dept);

        for (int i = 1; i <= 6; i++)
        {
            db.Users.Add(new User
            {
                Id = Guid.NewGuid(),
                EmployeeNumber = $"EMP-00{i}",
                FirstName = $"User{i}",
                LastName = "Test",
                Email = $"user{i}@example.com",
                PasswordHash = "hash",
                Role = UserRole.Encoder,
                DepartmentId = dept.Id,
                AvailabilityStatus = AvailabilityStatus.Active,
                IsActive = true
            });
        }

        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Pagination Test Task",
            Description = "Testing paged suitability",
            AssignedDepartmentId = dept.Id,
            Classification = TaskClassification.RoutineDailyTask
        };
        db.Tasks.Add(task);
        db.SaveChanges();

        var mockGroq = new Mock<IGroqSuitabilityService>();
        mockGroq.Setup(g => g.IsConfigured).Returns(false); // test heuristic fallback pagination

        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Coordinator, dept.Id);

        // Page 1 with pageSize 2
        var resultPage1 = await controller.GetSuitableEmployees(task.Id, pageNumber: 1, pageSize: 2);
        var okPage1 = resultPage1.Should().BeOfType<OkObjectResult>().Subject;
        var pagedData1 = okPage1.Value.As<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Data;

        pagedData1!.TotalCount.Should().Be(6);
        pagedData1.Items.Should().HaveCount(2);
        pagedData1.PageNumber.Should().Be(1);

        // Page 2 with pageSize 2
        var resultPage2 = await controller.GetSuitableEmployees(task.Id, pageNumber: 2, pageSize: 2);
        var okPage2 = resultPage2.Should().BeOfType<OkObjectResult>().Subject;
        var pagedData2 = okPage2.Value.As<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>().Data;

        pagedData2!.TotalCount.Should().Be(6);
        pagedData2.Items.Should().HaveCount(2);
        pagedData2.PageNumber.Should().Be(2);

        // Page 1 and Page 2 items should not overlap
        var page1Ids = pagedData1.Items.Select(x => x.EmployeeId);
        var page2Ids = pagedData2.Items.Select(x => x.EmployeeId);
        page1Ids.Intersect(page2Ids).Should().BeEmpty();
    }

    [Fact]
    public async Task GetSuitableEmployees_Fallback_AssignsStrictlySequentialRanksAndDescriptiveRationales()
    {
        using var db = CreateInMemoryDb();
        var dept = new Department { Id = Guid.NewGuid(), Name = "Operations" };
        db.Departments.Add(dept);

        var users = new List<User>();
        for (int i = 1; i <= 4; i++)
        {
            var user = new User
            {
                Id = Guid.NewGuid(),
                EmployeeNumber = $"EMP-10{i}",
                FirstName = $"Candidate",
                LastName = $"Number{i}",
                Email = $"cand{i}@example.com",
                PasswordHash = "hash",
                Role = UserRole.Encoder,
                DepartmentId = dept.Id,
                AvailabilityStatus = AvailabilityStatus.Active,
                IsActive = true
            };
            db.Users.Add(user);
            users.Add(user);
        }

        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Batch Data Processing",
            Description = "Process monthly incoming records",
            AssignedDepartmentId = dept.Id,
            Classification = TaskClassification.RoutineDailyTask,
            PriorityLevel = PriorityLevel.Medium
        };
        db.Tasks.Add(task);

        // Assign varying active workloads:
        // user[0]: 0 active tasks, 5 routine completions
        // user[1]: 1 active task, 3 routine completions
        // user[2]: 2 active tasks, 1 routine completion
        // user[3]: 4 active tasks, 0 routine completions
        for (int i = 0; i < 5; i++)
        {
            var compTask = new Models.Task
            {
                Id = Guid.NewGuid(),
                Title = $"Completed Routine {i}",
                Status = Models.Enums.TaskStatus.Completed,
                Classification = TaskClassification.RoutineDailyTask
            };
            db.Tasks.Add(compTask);
            db.TaskAssignments.Add(new TaskAssignment
            {
                Id = Guid.NewGuid(),
                TaskId = compTask.Id,
                Task = compTask,
                AssignedUserId = users[0].Id,
                AssignedUser = users[0]
            });
        }

        // Active task for user 1
        var act1 = new Models.Task { Id = Guid.NewGuid(), Title = "Active 1", Status = Models.Enums.TaskStatus.InProgress };
        db.Tasks.Add(act1);
        db.TaskAssignments.Add(new TaskAssignment { Id = Guid.NewGuid(), TaskId = act1.Id, Task = act1, AssignedUserId = users[1].Id, AssignedUser = users[1] });

        // Active tasks for user 2
        for (int i = 0; i < 2; i++)
        {
            var act = new Models.Task { Id = Guid.NewGuid(), Title = $"Active 2-{i}", Status = Models.Enums.TaskStatus.InProgress };
            db.Tasks.Add(act);
            db.TaskAssignments.Add(new TaskAssignment { Id = Guid.NewGuid(), TaskId = act.Id, Task = act, AssignedUserId = users[2].Id, AssignedUser = users[2] });
        }

        // Active tasks for user 3
        for (int i = 0; i < 4; i++)
        {
            var act = new Models.Task { Id = Guid.NewGuid(), Title = $"Active 3-{i}", Status = Models.Enums.TaskStatus.NotStarted };
            db.Tasks.Add(act);
            db.TaskAssignments.Add(new TaskAssignment { Id = Guid.NewGuid(), TaskId = act.Id, Task = act, AssignedUserId = users[3].Id, AssignedUser = users[3] });
        }

        db.SaveChanges();

        var mockGroq = new Mock<IGroqSuitabilityService>();
        mockGroq.Setup(g => g.IsConfigured).Returns(false); // Fallback mode

        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Coordinator, dept.Id);

        var actionResult = await controller.GetSuitableEmployees(task.Id, pageNumber: 1, pageSize: 10);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.As<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>();
        apiResponse.Data.Should().NotBeNull();
        var items = apiResponse.Data!.Items;

        items.Should().HaveCount(4);

        // Verify strictly sequential ranks 1, 2, 3, 4 without duplicates
        var ranks = items.Select(x => x.Rank).ToList();
        ranks.Should().Equal(1, 2, 3, 4);

        // Check each candidate's fallback rationale & factors
        foreach (var item in items)
        {
            item.Rationale.Should().NotBeNullOrWhiteSpace();
            item.Rationale.Should().NotContain("Heuristic evaluation based on");
            item.Rationale.Should().NotMatchRegex(@"\b0\.\d{2,}\b", "rationale text should omit raw decimal scores");

            item.Factors.Should().NotBeNull();
            item.Factors!.Workload.Should().NotBeNullOrWhiteSpace();
            item.Factors.Experience.Should().NotBeNullOrWhiteSpace();
            item.Factors.Ratings.Should().NotBeNullOrWhiteSpace();
        }

        // Top candidate is user[0] with 0 workload and 5 completed tasks
        items[0].EmployeeId.Should().Be(users[0].Id);
        items[0].Rank.Should().Be(1);
        items[0].Workload.Should().Be(0);
        items[0].Rationale.Should().Contain("Has full capacity with no active tasks");
        items[0].Rationale.Should().Contain("extensive experience across 5 completed routine tasks");

        // Last candidate is user[3] with 4 active tasks
        items[3].EmployeeId.Should().Be(users[3].Id);
        items[3].Rank.Should().Be(4);
        items[3].Workload.Should().Be(4);
        items[3].Rationale.Should().Contain("Currently managing 4 active tasks");
    }

    [Fact]
    public async Task GetSuitableEmployees_GroqReturnsDuplicateRanks_NormalizesToStrictlySequentialRanks()
    {
        using var db = CreateInMemoryDb();
        var (dept, alice, bob, task) = SeedBasicTestData(db);

        var mockGroq = new Mock<IGroqSuitabilityService>();
        mockGroq.Setup(g => g.IsConfigured).Returns(true);
        // Groq erroneously returns both candidates with rank 1
        mockGroq.Setup(g => g.EvaluateSuitabilityAsync(
                It.IsAny<GroqTaskContext>(),
                It.IsAny<List<GroqCandidateMetrics>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GroqSuitabilityResult
            {
                FromCache = false,
                Recommendations = new List<GroqCandidateRecommendation>
                {
                    new() { EmployeeId = alice.Id, Rank = 1, Score = 0.90, Rationale = "Alice fit" },
                    new() { EmployeeId = bob.Id, Rank = 1, Score = 0.85, Rationale = "Bob fit" }
                }
            });

        var configStore = CreateConfigStore();
        var service = new SuitabilityService(db, mockGroq.Object, configStore, NullLogger<SuitabilityService>.Instance);
        var controller = CreateController(service, UserRole.Coordinator, dept.Id);

        var actionResult = await controller.GetSuitableEmployees(task.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>>();
        var items = response.Data!.Items;

        items.Should().HaveCount(2);
        // Sequential 1..N normalization ensures exactly one rank 1 and one rank 2
        items[0].Rank.Should().Be(1);
        items[0].EmployeeId.Should().Be(alice.Id);

        items[1].Rank.Should().Be(2);
        items[1].EmployeeId.Should().Be(bob.Id);

        items.Select(x => x.Rank).Distinct().Should().HaveCount(2);
    }
}

