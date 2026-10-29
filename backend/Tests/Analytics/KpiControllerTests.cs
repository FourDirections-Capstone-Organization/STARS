using System.Security.Claims;
using Backend.Controllers;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using Backend.Modules.RoleBasedAccessControl;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Backend.Data;
using Microsoft.EntityFrameworkCore;
using BackendTask = Backend.Models.Task;
using TaskStatus = Backend.Models.Enums.TaskStatus;

namespace Backend.Tests.Analytics;

public class KpiControllerTests
{
    private static KpiController CreateController(
        Mock<IKpiCalculationEngine> engineMock,
        UserRole callerRole = UserRole.Manager)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new(ClaimTypes.Role, callerRole.ToString())
        };

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        var controller = new KpiController(
            engineMock.Object,
            NullLogger<KpiController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = principal }
            }
        };

        return controller;
    }

    [Fact]
    public void Controller_HasManagerOnlyAuthorizePolicy()
    {
        // Assert that KpiController is decorated with ManagerOnly policy
        var classAuthorizeAttrs = typeof(KpiController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
            .Cast<AuthorizeAttribute>()
            .ToList();

        classAuthorizeAttrs.Should().NotBeEmpty();
        classAuthorizeAttrs.Should().Contain(a => a.Policy == AuthorizationPolicies.ManagerOnly);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_WithValidParameters_Returns200OkWithEvaluation()
    {
        var employeeId = Guid.NewGuid();
        var startDate = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
        var endDate = new DateTime(2026, 10, 29, 0, 0, 0, DateTimeKind.Utc);

        var expectedResult = new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = employeeId,
            EmployeeName = "Jane Doe",
            EmployeeNumber = "EMP-001",
            Role = "Courier",
            PeriodStart = startDate,
            PeriodEnd = endDate,
            TotalAssignedTasks = 10,
            CompletedTasksCount = 8,
            OnTimeTasksCount = 7,
            InFullTasksCount = 8,
            OtifTasksCount = 7,
            AccurateTasksCount = 7,
            OverallScore = 87.5,
            OverallRating = "Green",
            Metrics = new List<KpiMetricValueDTO>
            {
                new() { MetricCode = "OTIF", Name = "On-Time In-Full", ActualValue = 87.5, Unit = "%", TargetValue = 90.0, Weight = 30.0, Rating = "Green" },
                new() { MetricCode = "ACCURACY", Name = "Order Accuracy", ActualValue = 87.5, Unit = "%", TargetValue = 95.0, Weight = 25.0, Rating = "Green" },
                new() { MetricCode = "COMPLETION", Name = "Task Completion Rate", ActualValue = 80.0, Unit = "%", TargetValue = 85.0, Weight = 25.0, Rating = "Amber" },
                new() { MetricCode = "AHT", Name = "Average Handling Time", ActualValue = 3.5, Unit = "hours", TargetValue = 4.0, Weight = 20.0, Rating = "Green", IsLowerBetter = true }
            }
        };

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                employeeId,
                startDate,
                endDate,
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedResult);

        var controller = CreateController(engineMock);

        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = employeeId,
            StartDate = startDate,
            EndDate = endDate
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;

        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.EmployeeId.Should().Be(employeeId);
        response.Data.Metrics.Should().HaveCount(4);
        response.Data.Metrics.Select(m => m.MetricCode).Should().Contain(new[] { "OTIF", "ACCURACY", "COMPLETION", "AHT" });
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_WhenDatesOmitted_DefaultsToLast30Days()
    {
        var employeeId = Guid.NewGuid();
        DateTime capturedStart = DateTime.MinValue;
        DateTime capturedEnd = DateTime.MinValue;

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                employeeId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .Callback<Guid, DateTime, DateTime, Guid?, CancellationToken>((id, start, end, cfg, ct) =>
            {
                capturedStart = start;
                capturedEnd = end;
            })
            .ReturnsAsync(new EmployeeKpiEvaluationResultDTO { EmployeeId = employeeId });

        var controller = CreateController(engineMock);

        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = employeeId
            // StartDate and EndDate omitted
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request);

        actionResult.Should().BeOfType<OkObjectResult>();
        capturedEnd.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
        capturedStart.Should().BeCloseTo(DateTime.UtcNow.AddDays(-30), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_MissingEmployeeId_ReturnsBadRequest()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var controller = CreateController(engineMock);

        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = null
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Employee ID is required");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_EmptyEmployeeGuid_ReturnsBadRequest()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var controller = CreateController(engineMock);

        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = Guid.Empty
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_EmployeeNotFound_ReturnsNotFound()
    {
        var missingEmployeeId = Guid.NewGuid();
        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                missingEmployeeId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException($"Employee with ID '{missingEmployeeId}' was not found."));

        var controller = CreateController(engineMock);

        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = missingEmployeeId
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request);

        var notFoundResult = actionResult.Should().BeOfType<NotFoundObjectResult>().Subject;
        var response = notFoundResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("was not found");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpiByRoute_WithRouteParameter_ReturnsOk()
    {
        var employeeId = Guid.NewGuid();
        var startDate = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
        var endDate = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                employeeId,
                startDate,
                endDate,
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EmployeeKpiEvaluationResultDTO
            {
                EmployeeId = employeeId,
                EmployeeName = "John Route",
                PeriodStart = startDate,
                PeriodEnd = endDate
            });

        var controller = CreateController(engineMock);

        var actionResult = await controller.EvaluateEmployeeKpiByRoute(employeeId, startDate, endDate);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.EmployeeName.Should().Be("John Route");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_WhenEngineThrowsArgumentException_Returns400BadRequest()
    {
        var employeeId = Guid.NewGuid();
        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                employeeId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new ArgumentException("Specified date range is invalid for this employee's employment period."));

        var controller = CreateController(engineMock);
        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = employeeId
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("date range is invalid");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_WhenEngineThrowsUnexpectedException_Returns500InternalServerError()
    {
        var employeeId = Guid.NewGuid();
        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                employeeId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Fatal database timeout while reading audit logs."));

        var controller = CreateController(engineMock);
        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = employeeId
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request);

        var statusResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(500);

        var response = statusResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("unexpected error occurred");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_ForwardsCancellationTokenAndConfigurationId_ToEngine()
    {
        var employeeId = Guid.NewGuid();
        var configId = Guid.NewGuid();
        using var cts = new CancellationTokenSource();
        var token = cts.Token;

        Guid? capturedConfigId = null;
        CancellationToken capturedToken = CancellationToken.None;

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                employeeId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .Callback<Guid, DateTime, DateTime, Guid?, CancellationToken>((id, s, e, cfg, ct) =>
            {
                capturedConfigId = cfg;
                capturedToken = ct;
            })
            .ReturnsAsync(new EmployeeKpiEvaluationResultDTO { EmployeeId = employeeId });

        var controller = CreateController(engineMock);
        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = employeeId,
            ConfigurationId = configId
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request, token);

        actionResult.Should().BeOfType<OkObjectResult>();
        capturedConfigId.Should().Be(configId);
        capturedToken.Should().Be(token);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpiByRoute_WithEmptyGuid_Returns400BadRequest()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var controller = CreateController(engineMock);

        var actionResult = await controller.EvaluateEmployeeKpiByRoute(Guid.Empty);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Employee ID is required");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpiByRoute_ForwardsConfigurationIdAndDates_ToEngine()
    {
        var employeeId = Guid.NewGuid();
        var configId = Guid.NewGuid();
        var start = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc);

        Guid? capturedConfigId = null;
        DateTime capturedStart = DateTime.MinValue;
        DateTime capturedEnd = DateTime.MinValue;

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                employeeId,
                start,
                end,
                configId,
                It.IsAny<CancellationToken>()))
            .Callback<Guid, DateTime, DateTime, Guid?, CancellationToken>((id, s, e, cfg, ct) =>
            {
                capturedStart = s;
                capturedEnd = e;
                capturedConfigId = cfg;
            })
            .ReturnsAsync(new EmployeeKpiEvaluationResultDTO { EmployeeId = employeeId });

        var controller = CreateController(engineMock);

        var actionResult = await controller.EvaluateEmployeeKpiByRoute(employeeId, start, end, configId);

        actionResult.Should().BeOfType<OkObjectResult>();
        capturedStart.Should().Be(start);
        capturedEnd.Should().Be(end);
        capturedConfigId.Should().Be(configId);
    }

    [Fact]
    public async System.Threading.Tasks.Task Integration_ControllerWithRealCalculationEngineAndDatabase_ReturnsFullEvaluation()
    {
        // Arrange - setup in-memory DbContext
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);

        var department = new Department { Id = Guid.NewGuid(), Name = "Express Courier Service" };
        var employee = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EXP-999",
            FirstName = "Roberto",
            LastName = "Gomez",
            Email = "roberto.gomez@speedex.com",
            Role = UserRole.Courier,
            DepartmentId = department.Id,
            Department = department
        };
        db.Departments.Add(department);
        db.Users.Add(employee);

        var now = DateTime.UtcNow;

        // Task 1: On-time with attachment -> OTIF
        var task1 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery package 1",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(4),
            CreatedAt = now.AddHours(-2),
            UpdatedAt = now,
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = now.AddHours(-2) }
            },
            Attachments = new List<TaskAttachment>
            {
                new() { FileName = "signed_receipt.pdf", FilePath = "/receipts/signed_receipt.pdf" }
            }
        };

        // Task 2: InProgress (not completed)
        var task2 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery package 2",
            Status = TaskStatus.InProgress,
            Deadline = now.AddHours(5),
            CreatedAt = now.AddHours(-1),
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = employee.Id, AssignedAt = now.AddHours(-1) }
            }
        };

        db.Tasks.AddRange(task1, task2);
        await db.SaveChangesAsync();

        var realEngine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new(ClaimTypes.Role, UserRole.Manager.ToString())
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        var controller = new KpiController(realEngine, NullLogger<KpiController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = principal }
            }
        };

        // Act
        var actionResult = await controller.EvaluateEmployeeKpi(new KpiEvaluationRequestDTO
        {
            EmployeeId = employee.Id,
            StartDate = now.AddDays(-1),
            EndDate = now.AddDays(1)
        });

        // Assert
        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;

        response.IsSuccess.Should().BeTrue();
        var data = response.Data;
        data.Should().NotBeNull();
        data!.EmployeeName.Should().Be("Roberto Gomez");
        data.DepartmentName.Should().Be("Express Courier Service");
        data.TotalAssignedTasks.Should().Be(2);
        data.CompletedTasksCount.Should().Be(1);
        data.OtifTasksCount.Should().Be(1);
        data.AccurateTasksCount.Should().Be(1);
        data.TotalHandlingHours.Should().Be(2.0);

        data.Metrics.Should().HaveCount(4);
        var otifMetric = data.Metrics.First(m => m.MetricCode == "OTIF");
        otifMetric.ActualValue.Should().Be(100.0);
        otifMetric.Rating.Should().Be("Green");

        var completionMetric = data.Metrics.First(m => m.MetricCode == "COMPLETION_RATE");
        completionMetric.ActualValue.Should().Be(50.0); // 1/2 = 50.0%
        completionMetric.Rating.Should().Be("Red");    // <70% is Red

        data.OverallRating.Should().Be("Red"); // Contains at least one Red metric
   }
}
