using System.Security.Claims;
using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using Backend.Modules.RoleBasedAccessControl;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using BackendTask = Backend.Models.Task;
using TaskStatus = Backend.Models.Enums.TaskStatus;

namespace Backend.Tests.Analytics;

public class KpiHierarchicalControllerTests
{
    private static KpiController CreateController(
        Mock<IKpiCalculationEngine>? engineMock = null,
        UserRole callerRole = UserRole.Manager,
        AppDbContext? db = null,
        Guid? currentUserId = null)
    {
        var userId = currentUserId ?? Guid.NewGuid();
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Role, callerRole.ToString())
        };

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var context = db ?? new AppDbContext(options);

        var engine = engineMock?.Object ?? new Mock<IKpiCalculationEngine>().Object;

        var controller = new KpiController(
            engine,
            context,
            NullLogger<KpiController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = principal }
            }
        };

        return controller;
    }

    #region Scope / Hierarchy Endpoint Tests

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_DefaultCompanyScope_Returns200OkWithHierarchyResult()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var expectedResult = new KpiHierarchyScopeResultDTO
        {
            ScopeLevel = "Company",
            ScopeName = "All Departments",
            TotalDepartments = 2,
            TotalTeams = 4,
            TotalEmployees = 10,
            OverallScore = 91.5,
            OverallRating = "Green"
        };

        engineMock
            .Setup(e => e.CalculateHierarchicalScopeAsync(
                null,
                null,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedResult);

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateHierarchicalScope();

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.ScopeLevel.Should().Be("Company");
        response.Data.TotalDepartments.Should().Be(2);
        response.Data.OverallScore.Should().Be(91.5);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WithDepartmentFilter_PassesDepartmentIdToEngine()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var deptId = Guid.NewGuid();
        var expectedResult = new KpiHierarchyScopeResultDTO
        {
            ScopeLevel = "Department",
            ScopeId = deptId,
            ScopeName = "Operations Logistics",
            TotalDepartments = 1,
            TotalTeams = 2,
            TotalEmployees = 5
        };

        engineMock
            .Setup(e => e.CalculateHierarchicalScopeAsync(
                deptId,
                null,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedResult);

        var controller = CreateController(engineMock);

        var filter = new KpiScopeFilterDTO { DepartmentId = deptId };
        var result = await controller.EvaluateHierarchicalScope(filter);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data!.ScopeLevel.Should().Be("Department");
        response.Data.ScopeId.Should().Be(deptId);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WithTeamFilter_PassesTeamIdToEngine()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var teamId = Guid.NewGuid();
        var expectedResult = new KpiHierarchyScopeResultDTO
        {
            ScopeLevel = "Team",
            ScopeId = teamId,
            ScopeName = "Fleet Alpha",
            TotalTeams = 1,
            TotalEmployees = 3
        };

        engineMock
            .Setup(e => e.CalculateHierarchicalScopeAsync(
                null,
                teamId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedResult);

        var controller = CreateController(engineMock);

        var filter = new KpiScopeFilterDTO { TeamId = teamId };
        var result = await controller.EvaluateHierarchicalScope(filter);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data!.ScopeLevel.Should().Be("Team");
        response.Data.ScopeId.Should().Be(teamId);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WithEmployeeFilter_EvaluatesEmployeeAndWrapsInHierarchy()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var employeeId = Guid.NewGuid();
        var deptId = Guid.NewGuid();
        var empResult = new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = employeeId,
            EmployeeName = "Jane Doe",
            EmployeeNumber = "EMP-001",
            DepartmentId = deptId,
            DepartmentName = "Operations",
            Role = "Courier",
            PeriodStart = DateTime.UtcNow.AddDays(-30),
            PeriodEnd = DateTime.UtcNow,
            TotalAssignedTasks = 20,
            CompletedTasksCount = 18,
            OnTimeTasksCount = 17,
            InFullTasksCount = 16,
            OtifTasksCount = 15,
            ReworkTasksCount = 1,
            AccurateTasksCount = 17,
            TotalHandlingHours = 32.5,
            OverallScore = 93.0,
            OverallRating = "Green",
            Metrics = new List<KpiMetricValueDTO>
            {
                new() { MetricCode = "OTIF", ActualValue = 83.33, TargetValue = 95.0, Rating = "Amber" }
            }
        };

        engineMock
            .Setup(e => e.CalculateEmployeeKpiAsync(
                employeeId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(empResult);

        var controller = CreateController(engineMock);

        var filter = new KpiScopeFilterDTO { EmployeeId = employeeId };
        var result = await controller.EvaluateHierarchicalScope(filter);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data!.ScopeLevel.Should().Be("Employee");
        response.Data.ScopeId.Should().Be(employeeId);
        response.Data.ScopeName.Should().Be("Jane Doe");
        response.Data.TotalEmployees.Should().Be(1);
        response.Data.OverallScore.Should().Be(93.0);
        response.Data.Employees.Should().HaveCount(1);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WithRoleFilter_ParsesAndForwardsUserRole()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        UserRole? capturedRole = null;

        engineMock
            .Setup(e => e.CalculateHierarchicalScopeAsync(
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<UserRole?>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .Callback<Guid?, Guid?, DateTime, DateTime, UserRole?, Guid?, CancellationToken>(
                (d, t, start, end, role, c, ct) => capturedRole = role)
            .ReturnsAsync(new KpiHierarchyScopeResultDTO());

        var controller = CreateController(engineMock);

        var filter = new KpiScopeFilterDTO { Role = "courier" };
        var result = await controller.EvaluateHierarchicalScope(filter);

        result.Should().BeOfType<OkObjectResult>();
        capturedRole.Should().Be(UserRole.Courier);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WithInvalidRole_Returns400BadRequest()
    {
        var controller = CreateController();

        var filter = new KpiScopeFilterDTO { Role = "Astronaut" };
        var result = await controller.EvaluateHierarchicalScope(filter);

        var badRequestResult = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Invalid role filter");
        response.Message.Should().Contain("Astronaut");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WithEmptyDepartmentGuid_Returns400BadRequest()
    {
        var controller = CreateController();

        var filter = new KpiScopeFilterDTO { DepartmentId = Guid.Empty };
        var result = await controller.EvaluateHierarchicalScope(filter);

        var badRequestResult = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Department ID cannot be an empty GUID");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WithEmptyTeamGuid_Returns400BadRequest()
    {
        var controller = CreateController();

        var filter = new KpiScopeFilterDTO { TeamId = Guid.Empty };
        var result = await controller.EvaluateHierarchicalScope(filter);

        var badRequestResult = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Team ID cannot be an empty GUID");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WithEmptyEmployeeGuid_Returns400BadRequest()
    {
        var controller = CreateController();

        var filter = new KpiScopeFilterDTO { EmployeeId = Guid.Empty };
        var result = await controller.EvaluateHierarchicalScope(filter);

        var badRequestResult = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Employee ID cannot be an empty GUID");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WhenEngineThrowsKeyNotFound_Returns404NotFound()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var deptId = Guid.NewGuid();

        engineMock
            .Setup(e => e.CalculateHierarchicalScopeAsync(
                deptId,
                null,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException($"Department with ID '{deptId}' was not found."));

        var controller = CreateController(engineMock);

        var filter = new KpiScopeFilterDTO { DepartmentId = deptId };
        var result = await controller.EvaluateHierarchicalScope(filter);

        var notFoundResult = result.Should().BeOfType<NotFoundObjectResult>().Subject;
        var response = notFoundResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("not found");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WhenEngineThrowsArgumentException_Returns400BadRequest()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();

        engineMock
            .Setup(e => e.CalculateHierarchicalScopeAsync(
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<UserRole?>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new ArgumentException("Invalid date range specified."));

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateHierarchicalScope();

        var badRequestResult = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Invalid date range");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WhenEngineThrowsUnexpectedException_Returns500()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();

        engineMock
            .Setup(e => e.CalculateHierarchicalScopeAsync(
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<UserRole?>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Database connection timeout."));

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateHierarchicalScope();

        var errorResult = result.Should().BeOfType<ObjectResult>().Subject;
        errorResult.StatusCode.Should().Be(500);
        var response = errorResult.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("unexpected error");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateHierarchicalScope_WhenDatesInverted_SwapsDatesCleanly()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        DateTime? capturedStart = null;
        DateTime? capturedEnd = null;

        var start = DateTime.UtcNow;
        var end = DateTime.UtcNow.AddDays(-10);

        engineMock
            .Setup(e => e.CalculateHierarchicalScopeAsync(
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<UserRole?>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .Callback<Guid?, Guid?, DateTime, DateTime, UserRole?, Guid?, CancellationToken>(
                (d, t, s, eDate, role, c, ct) =>
                {
                    capturedStart = s;
                    capturedEnd = eDate;
                })
            .ReturnsAsync(new KpiHierarchyScopeResultDTO());

        var controller = CreateController(engineMock);

        var filter = new KpiScopeFilterDTO { StartDate = start, EndDate = end };
        await controller.EvaluateHierarchicalScope(filter);

        capturedStart.Should().BeBefore(capturedEnd!.Value);
    }

    #endregion

    #region Department Evaluation Endpoint Tests

    [Fact]
    public async System.Threading.Tasks.Task EvaluateDepartmentKpi_WithValidId_Returns200OkWithDepartmentResult()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var deptId = Guid.NewGuid();
        var expectedDeptResult = new DepartmentKpiEvaluationResultDTO
        {
            DepartmentId = deptId,
            DepartmentName = "Medical Courier Division",
            TotalEmployees = 4,
            TotalTeams = 2,
            TotalAssignedTasks = 50,
            CompletedTasksCount = 48,
            OverallScore = 94.2,
            OverallRating = "Green"
        };

        engineMock
            .Setup(e => e.CalculateDepartmentKpiAsync(
                deptId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedDeptResult);

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateDepartmentKpi(deptId);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<DepartmentKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data!.DepartmentId.Should().Be(deptId);
        response.Data.TotalEmployees.Should().Be(4);
        response.Data.OverallScore.Should().Be(94.2);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateDepartmentKpi_WithRoleFilter_ParsesAndForwardsRole()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var deptId = Guid.NewGuid();
        UserRole? capturedRole = null;

        engineMock
            .Setup(e => e.CalculateDepartmentKpiAsync(
                deptId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<UserRole?>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .Callback<Guid, DateTime, DateTime, UserRole?, Guid?, CancellationToken>(
                (id, start, end, role, configId, ct) => capturedRole = role)
            .ReturnsAsync(new DepartmentKpiEvaluationResultDTO { DepartmentId = deptId });

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateDepartmentKpi(deptId, role: "Encoder");

        result.Should().BeOfType<OkObjectResult>();
        capturedRole.Should().Be(UserRole.Encoder);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateDepartmentKpi_WithInvalidRole_Returns400BadRequest()
    {
        var controller = CreateController();
        var deptId = Guid.NewGuid();

        var result = await controller.EvaluateDepartmentKpi(deptId, role: "Astronaut");

        var badRequestResult = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.As<ApiResponseDTO<DepartmentKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Invalid role filter");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateDepartmentKpi_WithEmptyGuid_Returns400BadRequest()
    {
        var controller = CreateController();

        var result = await controller.EvaluateDepartmentKpi(Guid.Empty);

        var badRequestResult = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.As<ApiResponseDTO<DepartmentKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Department ID is required");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateDepartmentKpi_WhenDepartmentNotFound_Returns404NotFound()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var deptId = Guid.NewGuid();

        engineMock
            .Setup(e => e.CalculateDepartmentKpiAsync(
                deptId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException($"Department with ID '{deptId}' was not found."));

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateDepartmentKpi(deptId);

        var notFoundResult = result.Should().BeOfType<NotFoundObjectResult>().Subject;
        var response = notFoundResult.Value.As<ApiResponseDTO<DepartmentKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("not found");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateDepartmentKpi_WhenUnexpectedException_Returns500()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var deptId = Guid.NewGuid();

        engineMock
            .Setup(e => e.CalculateDepartmentKpiAsync(
                deptId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("Database connection error"));

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateDepartmentKpi(deptId);

        var errorResult = result.Should().BeOfType<ObjectResult>().Subject;
        errorResult.StatusCode.Should().Be(500);
        var response = errorResult.Value.As<ApiResponseDTO<DepartmentKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeFalse();
    }

    #endregion

    #region Team Evaluation Endpoint Tests

    [Fact]
    public async System.Threading.Tasks.Task EvaluateTeamKpi_WithValidId_Returns200OkWithTeamResult()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var teamId = Guid.NewGuid();
        var expectedTeamResult = new TeamKpiEvaluationResultDTO
        {
            TeamId = teamId,
            TeamName = "North District Couriers",
            TotalMembers = 3,
            TotalAssignedTasks = 30,
            CompletedTasksCount = 28,
            OverallScore = 88.0,
            OverallRating = "Amber"
        };

        engineMock
            .Setup(e => e.CalculateTeamKpiAsync(
                teamId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedTeamResult);

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateTeamKpi(teamId);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<TeamKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data!.TeamId.Should().Be(teamId);
        response.Data.TotalMembers.Should().Be(3);
        response.Data.OverallScore.Should().Be(88.0);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateTeamKpi_WithRoleFilter_ParsesAndForwardsRole()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var teamId = Guid.NewGuid();
        UserRole? capturedRole = null;

        engineMock
            .Setup(e => e.CalculateTeamKpiAsync(
                teamId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<UserRole?>(),
                It.IsAny<Guid?>(),
                It.IsAny<CancellationToken>()))
            .Callback<Guid, DateTime, DateTime, UserRole?, Guid?, CancellationToken>(
                (id, start, end, role, configId, ct) => capturedRole = role)
            .ReturnsAsync(new TeamKpiEvaluationResultDTO { TeamId = teamId });

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateTeamKpi(teamId, role: "Courier");

        result.Should().BeOfType<OkObjectResult>();
        capturedRole.Should().Be(UserRole.Courier);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateTeamKpi_WithInvalidRole_Returns400BadRequest()
    {
        var controller = CreateController();
        var teamId = Guid.NewGuid();

        var result = await controller.EvaluateTeamKpi(teamId, role: "SubmarineCaptain");

        var badRequestResult = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.As<ApiResponseDTO<TeamKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Invalid role filter");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateTeamKpi_WithEmptyGuid_Returns400BadRequest()
    {
        var controller = CreateController();

        var result = await controller.EvaluateTeamKpi(Guid.Empty);

        var badRequestResult = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.As<ApiResponseDTO<TeamKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Team ID is required");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateTeamKpi_WhenTeamNotFound_Returns404NotFound()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var teamId = Guid.NewGuid();

        engineMock
            .Setup(e => e.CalculateTeamKpiAsync(
                teamId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException($"Team with ID '{teamId}' was not found."));

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateTeamKpi(teamId);

        var notFoundResult = result.Should().BeOfType<NotFoundObjectResult>().Subject;
        var response = notFoundResult.Value.As<ApiResponseDTO<TeamKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("not found");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateTeamKpi_WhenUnexpectedException_Returns500()
    {
        var engineMock = new Mock<IKpiCalculationEngine>();
        var teamId = Guid.NewGuid();

        engineMock
            .Setup(e => e.CalculateTeamKpiAsync(
                teamId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("Database connection failure"));

        var controller = CreateController(engineMock);

        var result = await controller.EvaluateTeamKpi(teamId);

        var errorResult = result.Should().BeOfType<ObjectResult>().Subject;
        errorResult.StatusCode.Should().Be(500);
        var response = errorResult.Value.As<ApiResponseDTO<TeamKpiEvaluationResultDTO>>();
        response.IsSuccess.Should().BeFalse();
    }

    #endregion

    #region End-to-End Integration Test

    [Fact]
    public async System.Threading.Tasks.Task HierarchicalScopeEndpoints_EndToEndIntegration_WithRealDatabaseAndEngine()
    {
        // Setup in-memory DbContext
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var dept = new Department
        {
            Id = Guid.NewGuid(),
            Name = "Operations & Logistics",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Departments.Add(dept);

        var courierUser = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Carlos",
            LastName = "Courier",
            EmployeeNumber = "EMP-C1",
            Email = "carlos@example.com",
            DepartmentId = dept.Id,
            Role = UserRole.Courier,
            AvailabilityStatus = AvailabilityStatus.Active,
            CreatedAt = DateTime.UtcNow
        };
        var encoderUser = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Eva",
            LastName = "Encoder",
            EmployeeNumber = "EMP-E1",
            Email = "eva@example.com",
            DepartmentId = dept.Id,
            Role = UserRole.Encoder,
            AvailabilityStatus = AvailabilityStatus.Active,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.AddRange(courierUser, encoderUser);

        var team = new Team
        {
            Id = Guid.NewGuid(),
            Name = "Express Dispatch Team",
            DepartmentId = dept.Id,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Teams.Add(team);

        db.TeamMembers.AddRange(
            new TeamMember { TeamId = team.Id, UserId = courierUser.Id, JoinedAt = DateTime.UtcNow },
            new TeamMember { TeamId = team.Id, UserId = encoderUser.Id, JoinedAt = DateTime.UtcNow }
        );

        // Add completed tasks for Courier
        var now = DateTime.UtcNow;
        var task1 = new BackendTask
        {
            Id = Guid.NewGuid(),
            Title = "Delivery Task 1",
            Status = TaskStatus.Completed,
            Deadline = now.AddHours(2),
            CreatedAt = now.AddHours(-3),
            UpdatedAt = now.AddHours(-1),
            Assignments = new List<TaskAssignment>
            {
                new() { AssignedUserId = courierUser.Id, AssignedAt = now.AddHours(-3) }
            },
            Attachments = new List<TaskAttachment>
            {
                new() { FileName = "pod.pdf", FilePath = "/files/pod.pdf", UploadedById = courierUser.Id }
            }
        };
        db.Tasks.Add(task1);

        // Seed default KPI config
        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);
        await db.SaveChangesAsync();

        var realEngine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);
        var controller = CreateController(engineMock: null, callerRole: UserRole.Manager, db: db);

        var controllerWithRealEngine = new KpiController(
            realEngine,
            db,
            NullLogger<KpiController>.Instance)
        {
            ControllerContext = controller.ControllerContext
        };

        // 1. Evaluate Department via Department endpoint
        var deptAction = await controllerWithRealEngine.EvaluateDepartmentKpi(dept.Id, now.AddDays(-5), now.AddDays(1));
        var deptOk = deptAction.Should().BeOfType<OkObjectResult>().Subject;
        var deptResp = deptOk.Value.As<ApiResponseDTO<DepartmentKpiEvaluationResultDTO>>();
        deptResp.IsSuccess.Should().BeTrue();
        deptResp.Data!.DepartmentId.Should().Be(dept.Id);
        deptResp.Data.TotalEmployees.Should().Be(2);

        // 2. Evaluate Team via Team endpoint
        var teamAction = await controllerWithRealEngine.EvaluateTeamKpi(team.Id, now.AddDays(-5), now.AddDays(1));
        var teamOk = teamAction.Should().BeOfType<OkObjectResult>().Subject;
        var teamResp = teamOk.Value.As<ApiResponseDTO<TeamKpiEvaluationResultDTO>>();
        teamResp.IsSuccess.Should().BeTrue();
        teamResp.Data!.TeamId.Should().Be(team.Id);
        teamResp.Data.TotalMembers.Should().Be(2);

        // 3. Evaluate Hierarchical Scope with Department filter and Courier role
        var scopeFilter = new KpiScopeFilterDTO
        {
            DepartmentId = dept.Id,
            Role = "Courier",
            StartDate = now.AddDays(-5),
            EndDate = now.AddDays(1)
        };
        var scopeAction = await controllerWithRealEngine.EvaluateHierarchicalScope(scopeFilter);
        var scopeOk = scopeAction.Should().BeOfType<OkObjectResult>().Subject;
        var scopeResp = scopeOk.Value.As<ApiResponseDTO<KpiHierarchyScopeResultDTO>>();
        scopeResp.IsSuccess.Should().BeTrue();
        scopeResp.Data!.ScopeLevel.Should().Be("Department");
        scopeResp.Data.RoleFilter.Should().Be("Courier");
        scopeResp.Data.TotalEmployees.Should().Be(1);
        scopeResp.Data.Employees.First().EmployeeId.Should().Be(courierUser.Id);
    }

    #endregion
}
