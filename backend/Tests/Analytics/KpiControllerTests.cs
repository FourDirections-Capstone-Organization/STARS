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
}
