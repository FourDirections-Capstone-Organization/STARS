using System.Security.Claims;
using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using Backend.Modules.RoleBasedAccessControl;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using BackendTask = Backend.Models.Task;
using TaskStatus = Backend.Models.Enums.TaskStatus;

namespace Backend.Tests.Analytics;

public class KpiControllerTests
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

    private static KpiConfigurationRequestDTO CreateValidConfigurationRequest(Guid? departmentId = null)
    {
        return new KpiConfigurationRequestDTO
        {
            Title = "2026 Q4 Operations KPI Configuration",
            Description = "Standard weighted evaluation for courier operations",
            TargetRole = "Courier",
            DepartmentId = departmentId,
            EffectiveStartDate = DateTime.UtcNow.AddDays(1),
            EffectiveEndDate = DateTime.UtcNow.AddMonths(3),
            IsActive = true,
            OverallGreenThreshold = 90.0,
            OverallAmberThreshold = 75.0,
            OverallRedThreshold = 60.0,
            Items = new List<KpiItemRequestDTO>
            {
                new()
                {
                    Name = "On-Time In-Full (OTIF)",
                    MetricCode = "OTIF",
                    Weight = 30.0,
                    TargetValue = 95.0,
                    GreenThreshold = 95.0,
                    AmberThreshold = 85.0,
                    RedThreshold = 75.0,
                    IsLowerBetter = false,
                    Order = 1
                },
                new()
                {
                    Name = "Order Accuracy",
                    MetricCode = "ORDER_ACCURACY",
                    Weight = 25.0,
                    TargetValue = 98.0,
                    GreenThreshold = 98.0,
                    AmberThreshold = 90.0,
                    RedThreshold = 80.0,
                    IsLowerBetter = false,
                    Order = 2
                },
                new()
                {
                    Name = "Task Completion Rate",
                    MetricCode = "COMPLETION_RATE",
                    Weight = 25.0,
                    TargetValue = 90.0,
                    GreenThreshold = 90.0,
                    AmberThreshold = 80.0,
                    RedThreshold = 70.0,
                    IsLowerBetter = false,
                    Order = 3
                },
                new()
                {
                    Name = "Average Handling Time",
                    MetricCode = "AHT",
                    Unit = "hours",
                    Weight = 20.0,
                    TargetValue = 4.0,
                    GreenThreshold = 4.0,
                    AmberThreshold = 8.0,
                    RedThreshold = 12.0,
                    IsLowerBetter = true,
                    Order = 4
                }
            }
        };
    }

    [Fact]
    public void Controller_HasAuthorizeAttribute()
    {
        // Assert that KpiController is decorated with Authorize attribute
        var classAuthorizeAttrs = typeof(KpiController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
            .Cast<AuthorizeAttribute>()
            .ToList();

        classAuthorizeAttrs.Should().NotBeEmpty();
    }

    [Theory]
    [InlineData("EvaluateHierarchicalScope")]
    [InlineData("GetAllConfigurations")]
    [InlineData("CreateConfiguration")]
    [InlineData("UpdateConfiguration")]
    [InlineData("DeleteConfiguration")]
    [InlineData("GetFormulaVariables")]
    [InlineData("TestFormula")]
    [InlineData("ExportHierarchyScope")]
    public void ManagerEndpoints_HaveManagerOnlyAuthorizePolicy(string methodName)
    {
        var method = typeof(KpiController).GetMethod(methodName);
        method.Should().NotBeNull();
        var authorizeAttrs = method!.GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
            .Cast<AuthorizeAttribute>()
            .ToList();
        authorizeAttrs.Should().NotBeEmpty();
        authorizeAttrs.Should().Contain(a => a.Policy == AuthorizationPolicies.ManagerOnly);
    }

    #region Evaluation Endpoint Tests

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

        if (actionResult is ObjectResult obj && actionResult is not OkObjectResult) { var fail = obj.Value as ApiResponseDTO<KpiConfigurationResponseDTO>; Assert.Fail($"Status: {obj.StatusCode}, Error: {fail?.Message}"); }
        var okResult = actionResult.Should().BeOfType<OkObjectResult>(((actionResult as ObjectResult)?.Value as ApiResponseDTO<KpiConfigurationResponseDTO>)?.Message ?? "Not Ok").Subject;
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

        var okResult = actionResult.Should().BeOfType<OkObjectResult>(((actionResult as ObjectResult)?.Value as ApiResponseDTO<KpiConfigurationResponseDTO>)?.Message).Subject;
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

    #endregion

    #region Manager Configuration CRUD Tests

    [Fact]
    public async System.Threading.Tasks.Task GetAllConfigurations_ReturnsListIncludingDefaultSeededConfiguration()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);
        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);

        var controller = CreateController(db: db);

        var actionResult = await controller.GetAllConfigurations();

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<List<KpiConfigurationResponseDTO>>>().Subject;

        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeEmpty();
        var defaultConfig = response.Data!.FirstOrDefault(c => c.Id == KpiDefaultSeeder.DefaultConfigurationId);
        defaultConfig.Should().NotBeNull();
        defaultConfig!.Title.Should().Be("Default Logistics Operations KPI");
        defaultConfig.OverallGreenThreshold.Should().Be(85.0);
        defaultConfig.OverallAmberThreshold.Should().Be(70.0);
        defaultConfig.OverallRedThreshold.Should().Be(60.0);
        defaultConfig.Items.Should().HaveCount(4);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetAllConfigurations_FiltersByDepartment_AndTargetRole()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var dept1 = new Department { Id = Guid.NewGuid(), Name = "Dispatch Dept" };
        var dept2 = new Department { Id = Guid.NewGuid(), Name = "Sorting Dept" };
        db.Departments.AddRange(dept1, dept2);

        var config1 = new KpiConfiguration
        {
            Id = Guid.NewGuid(),
            Title = "Dispatch Courier Config",
            DepartmentId = dept1.Id,
            TargetRole = "Courier",
            IsActive = true
        };
        var config2 = new KpiConfiguration
        {
            Id = Guid.NewGuid(),
            Title = "Sorting Encoder Config",
            DepartmentId = dept2.Id,
            TargetRole = "Encoder",
            IsActive = false
        };
        db.KpiConfigurations.AddRange(config1, config2);
        await db.SaveChangesAsync();

        var controller = CreateController(db: db);

        // Filter by Department 1
        var deptResult = await controller.GetAllConfigurations(departmentId: dept1.Id);
        var deptOk = deptResult.Should().BeOfType<OkObjectResult>().Subject;
        var deptData = deptOk.Value.As<ApiResponseDTO<List<KpiConfigurationResponseDTO>>>().Data;
        deptData.Should().HaveCount(1);
        deptData![0].Id.Should().Be(config1.Id);

        // Filter by TargetRole
        var roleResult = await controller.GetAllConfigurations(targetRole: "Encoder");
        var roleOk = roleResult.Should().BeOfType<OkObjectResult>().Subject;
        var roleData = roleOk.Value.As<ApiResponseDTO<List<KpiConfigurationResponseDTO>>>().Data;
        roleData.Should().HaveCount(1);
        roleData![0].Id.Should().Be(config2.Id);

        // Filter by IsActive
        var activeResult = await controller.GetAllConfigurations(isActive: false);
        var activeOk = activeResult.Should().BeOfType<OkObjectResult>().Subject;
        var activeData = activeOk.Value.As<ApiResponseDTO<List<KpiConfigurationResponseDTO>>>().Data;
        activeData.Should().HaveCount(1);
        activeData![0].Id.Should().Be(config2.Id);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetConfigurationById_WhenExists_Returns200OkWithItems()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);
        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);

        var controller = CreateController(db: db);

        var actionResult = await controller.GetConfigurationById(KpiDefaultSeeder.DefaultConfigurationId);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<KpiConfigurationResponseDTO>>().Subject;

        response.IsSuccess.Should().BeTrue();
        response.Data!.Id.Should().Be(KpiDefaultSeeder.DefaultConfigurationId);
        response.Data.Items.Should().HaveCount(4);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetConfigurationById_WhenNotFound_Returns404NotFound()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var controller = CreateController(db: db);
        var missingId = Guid.NewGuid();

        var actionResult = await controller.GetConfigurationById(missingId);

        var notFoundResult = actionResult.Should().BeOfType<NotFoundObjectResult>().Subject;
        var response = notFoundResult.Value.Should().BeOfType<ApiResponseDTO<KpiConfigurationResponseDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain(missingId.ToString());
    }

    [Fact]
    public async System.Threading.Tasks.Task CreateConfiguration_WithValidRequest_PersistsAndReturns201Created()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var managerId = Guid.NewGuid();
        var department = new Department { Id = Guid.NewGuid(), Name = "Fleet Operations" };
        db.Departments.Add(department);
        await db.SaveChangesAsync();

        var controller = CreateController(db: db, currentUserId: managerId);
        var request = CreateValidConfigurationRequest(department.Id);

        var actionResult = await controller.CreateConfiguration(request);

        var createdResult = actionResult.Should().BeOfType<CreatedAtActionResult>().Subject;
        createdResult.StatusCode.Should().Be(201);
        var response = createdResult.Value.Should().BeOfType<ApiResponseDTO<KpiConfigurationResponseDTO>>().Subject;

        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.Title.Should().Be(request.Title);
        response.Data.DepartmentName.Should().Be("Fleet Operations");
        response.Data.OverallGreenThreshold.Should().Be(90.0);
        response.Data.OverallAmberThreshold.Should().Be(75.0);
        response.Data.OverallRedThreshold.Should().Be(60.0);
        response.Data.Items.Should().HaveCount(4);

        // Verify entity persisted in database
        var persisted = await db.KpiConfigurations.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == response.Data.Id);
        persisted.Should().NotBeNull();
        persisted!.Items.Should().HaveCount(4);
        persisted.Items.Sum(i => i.Weight).Should().Be(100.0);
    }

    [Fact]
    public async System.Threading.Tasks.Task CreateConfiguration_WhenWeightsDoNotSumTo100_Returns400BadRequest()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var controller = CreateController(db: db);
        var request = CreateValidConfigurationRequest();
        request.Items[0].Weight = 10.0; // Total becomes 80%, not 100%

        var actionResult = await controller.CreateConfiguration(request);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.Should().BeOfType<ApiResponseDTO<KpiConfigurationResponseDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Total item weights must sum to exactly 100%");
    }

    [Fact]
    public async System.Threading.Tasks.Task CreateConfiguration_WhenDepartmentDoesNotExist_Returns400BadRequest()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var controller = CreateController(db: db);
        var nonExistentDeptId = Guid.NewGuid();
        var request = CreateValidConfigurationRequest(nonExistentDeptId);

        var actionResult = await controller.CreateConfiguration(request);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.Should().BeOfType<ApiResponseDTO<KpiConfigurationResponseDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("does not exist");
    }

    [Fact]
    public async System.Threading.Tasks.Task UpdateConfiguration_WhenValid_UpdatesFieldsAndItems()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var configId = Guid.NewGuid();
        var existingConfig = new KpiConfiguration
        {
            Id = configId,
            Title = "Old 2025 Config",
            Description = "Old description",
            IsActive = true,
            OverallGreenThreshold = 85.0,
            OverallAmberThreshold = 70.0,
            OverallRedThreshold = 60.0,
            Items = new List<KpiItem>
            {
                new() { Id = Guid.NewGuid(), KpiConfigurationId = configId, Name = "Old Item", MetricCode = "OTIF", Weight = 100.0, GreenThreshold = 90, AmberThreshold = 80, RedThreshold = 70 }
            }
        };
        db.KpiConfigurations.Add(existingConfig);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var controller = CreateController(db: db);
        var updateRequest = CreateValidConfigurationRequest();
        updateRequest.Title = "Updated 2026 Q4 Operations Config";
        updateRequest.OverallGreenThreshold = 92.0;

        var actionResult = await controller.UpdateConfiguration(configId, updateRequest);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<KpiConfigurationResponseDTO>>().Subject;

        response.IsSuccess.Should().BeTrue();
        response.Data!.Title.Should().Be("Updated 2026 Q4 Operations Config");
        response.Data.OverallGreenThreshold.Should().Be(92.0);
        response.Data.Items.Should().HaveCount(4);

        // Verify in DB
        var updatedInDb = await db.KpiConfigurations.Include(c => c.Items).FirstAsync(c => c.Id == existingConfig.Id);
        updatedInDb.Title.Should().Be("Updated 2026 Q4 Operations Config");
        updatedInDb.OverallGreenThreshold.Should().Be(92.0);
        updatedInDb.Items.Should().HaveCount(4);
    }

    [Fact]
    public async System.Threading.Tasks.Task UpdateConfiguration_WhenNotFound_Returns404NotFound()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var controller = CreateController(db: db);
        var missingId = Guid.NewGuid();
        var updateRequest = CreateValidConfigurationRequest();

        var actionResult = await controller.UpdateConfiguration(missingId, updateRequest);

        var notFoundResult = actionResult.Should().BeOfType<NotFoundObjectResult>().Subject;
        var response = notFoundResult.Value.Should().BeOfType<ApiResponseDTO<KpiConfigurationResponseDTO>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain(missingId.ToString());
    }

    [Fact]
    public async System.Threading.Tasks.Task DeleteConfiguration_WhenCustomConfig_DeletesSuccessfully()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var customConfig = new KpiConfiguration
        {
            Id = Guid.NewGuid(),
            Title = "Temporary Pilot Config",
            Items = new List<KpiItem>
            {
                new() { Id = Guid.NewGuid(), Name = "Metric", MetricCode = "OTIF", Weight = 100.0 }
            }
        };
        db.KpiConfigurations.Add(customConfig);
        await db.SaveChangesAsync();

        var controller = CreateController(db: db);

        var actionResult = await controller.DeleteConfiguration(customConfig.Id);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<object>>().Subject;
        response.IsSuccess.Should().BeTrue();

        var existsInDb = await db.KpiConfigurations.AnyAsync(c => c.Id == customConfig.Id);
        existsInDb.Should().BeFalse();
    }

    [Fact]
    public async System.Threading.Tasks.Task DeleteConfiguration_WhenDefaultConfig_Returns400BadRequest()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);
        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);

        var controller = CreateController(db: db);

        var actionResult = await controller.DeleteConfiguration(KpiDefaultSeeder.DefaultConfigurationId);

        var badRequestResult = actionResult.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequestResult.Value.Should().BeOfType<ApiResponseDTO<object>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Cannot delete the default system KPI configuration");
    }

    [Fact]
    public async System.Threading.Tasks.Task DeleteConfiguration_WhenNotFound_Returns404NotFound()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var controller = CreateController(db: db);
        var missingId = Guid.NewGuid();

        var actionResult = await controller.DeleteConfiguration(missingId);

        var notFoundResult = actionResult.Should().BeOfType<NotFoundObjectResult>().Subject;
        var response = notFoundResult.Value.Should().BeOfType<ApiResponseDTO<object>>().Subject;
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain(missingId.ToString());
    }

    #endregion

    #region Custom Overall Thresholds Engine Integration Tests

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
        var controller = new KpiController(realEngine, db, NullLogger<KpiController>.Instance)
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

    [Fact]
    public async System.Threading.Tasks.Task Engine_WithCustomOverallThresholds_AppliesCustomThresholdsToOverallRating()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var db = new AppDbContext(options);

        var employee = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EXP-888",
            FirstName = "Carlos",
            LastName = "Vargas",
            Role = UserRole.Courier
        };
        db.Users.Add(employee);

        var now = DateTime.UtcNow;

        // Create 10 completed tasks: all on-time, with attachments, no rework, 2 hours handling time
        // All metrics will be 100% (Green)
        for (int i = 0; i < 10; i++)
        {
            db.Tasks.Add(new BackendTask
            {
                Id = Guid.NewGuid(),
                Title = $"Task {i}",
                Status = TaskStatus.Completed,
                Deadline = now.AddHours(4),
                CreatedAt = now.AddHours(-2),
                UpdatedAt = now,
                Assignments = new List<TaskAssignment> { new() { AssignedUserId = employee.Id, AssignedAt = now.AddHours(-2) } },
                Attachments = new List<TaskAttachment> { new() { FileName = "proof.pdf", FilePath = "/proof.pdf" } }
            });
        }

        // Custom config 1: Strict thresholds (Green: 92, Amber: 80, Red: 65) with weights yielding score of 88.0
        // Items: 88% achievable
        var customStrictConfigId = Guid.NewGuid();
        var customStrictConfig = new KpiConfiguration
        {
            Id = customStrictConfigId,
            Title = "Strict 92% Green Target Config",
            IsActive = true,
            EffectiveStartDate = now.AddDays(-30),
            OverallGreenThreshold = 92.0, // Overall score needs 92.0 to be Green
            OverallAmberThreshold = 80.0,
            OverallRedThreshold = 65.0,
            Items = new List<KpiItem>
            {
                // Item with Target 100, actual 100 -> score 88.0
                new() { Id = Guid.NewGuid(), MetricCode = "OTIF", Name = "OTIF", Weight = 88.0, TargetValue = 100.0, GreenThreshold = 90.0, AmberThreshold = 75.0, RedThreshold = 60.0 },
                new() { Id = Guid.NewGuid(), MetricCode = "ORDER_ACCURACY", Name = "Accuracy", Weight = 12.0, TargetValue = 100.0, GreenThreshold = 90.0, AmberThreshold = 75.0, RedThreshold = 60.0 }
            }
        };

        // Custom config 2: Standard thresholds (Green: 85, Amber: 70, Red: 60)
        var customStandardConfigId = Guid.NewGuid();
        var customStandardConfig = new KpiConfiguration
        {
            Id = customStandardConfigId,
            Title = "Standard 85% Green Target Config",
            IsActive = true,
            EffectiveStartDate = now.AddDays(-30),
            OverallGreenThreshold = 85.0, // Overall score 88.0 will be Green here
            OverallAmberThreshold = 70.0,
            OverallRedThreshold = 60.0,
            Items = new List<KpiItem>
            {
                new() { Id = Guid.NewGuid(), MetricCode = "OTIF", Name = "OTIF", Weight = 88.0, TargetValue = 100.0, GreenThreshold = 90.0, AmberThreshold = 75.0, RedThreshold = 60.0 },
                new() { Id = Guid.NewGuid(), MetricCode = "ORDER_ACCURACY", Name = "Accuracy", Weight = 12.0, TargetValue = 100.0, GreenThreshold = 90.0, AmberThreshold = 75.0, RedThreshold = 60.0 }
            }
        };

        db.KpiConfigurations.AddRange(customStrictConfig, customStandardConfig);
        await db.SaveChangesAsync();

        var realEngine = new KpiCalculationEngine(db, NullLogger<KpiCalculationEngine>.Instance);
        var controller = new KpiController(realEngine, db, NullLogger<KpiController>.Instance);

        // Evaluation 1: Evaluate with Strict Config (Green threshold = 92.0). Score = 100.0 (all 100).
        // Let's test with a task setup where actual score is 88.0:
        // OTIF = 100% (weight 88 -> 88.0 score), Accuracy has 0% actual -> score 0 (weight 12). Overall score = 88.0.
        // Let's create an employee with rework on some tasks to test custom cutoffs:
        var reworkEmployee = new User { Id = Guid.NewGuid(), EmployeeNumber = "EXP-777", FirstName = "Elena", LastName = "Reyes", Role = UserRole.Courier };
        db.Users.Add(reworkEmployee);

        // 10 tasks, 10 completed, 10 on-time with attachment (OTIF 100%), but 2 tasks have pushback comments (Accuracy 80%)
        for (int i = 0; i < 10; i++)
        {
            db.Tasks.Add(new BackendTask
            {
                Id = Guid.NewGuid(),
                Title = $"Elena Task {i}",
                Status = TaskStatus.Completed,
                Deadline = now.AddHours(4),
                CreatedAt = now.AddHours(-2),
                UpdatedAt = now,
                PushBackComment = i < 2 ? "Correction requested" : null,
                Assignments = new List<TaskAssignment> { new() { AssignedUserId = reworkEmployee.Id, AssignedAt = now.AddHours(-2) } },
                Attachments = new List<TaskAttachment> { new() { FileName = "p.png", FilePath = "/p.png" } }
            });
        }
        await db.SaveChangesAsync();

        // Under Standard Config (OverallGreenThreshold = 85.0):
        // OTIF: 100% * 88 = 88.0 (Rating: Green)
        // Accuracy: 80% / 100 * 12 = 9.6 (Rating: Amber, because 80% is Amber)
        // With Amber metric, overall rating becomes Amber under Standard Config.
        // Now test pure score cutoffs without metric degradation:
        // Config where GreenThreshold for Accuracy is 75 (so 80% is Green!):
        customStandardConfig.Items.First(i => i.MetricCode == "ORDER_ACCURACY").GreenThreshold = 75.0;
        customStrictConfig.Items.First(i => i.MetricCode == "ORDER_ACCURACY").GreenThreshold = 75.0;
        await db.SaveChangesAsync();

        // Now both metrics are Green!
        // Total score = 88.0 + (80/100 * 12) = 88.0 + 9.6 = 97.6.
        // Let's set weights: Item 1 weight = 88.0, Item 2 weight = 12.0, Item 2 target = 100.
        // If Item 2 actual is 0 (all tasks have rework):
        // Score = 88.0.
        // Now let's test evaluation under customStrictConfig (OverallGreen = 92.0):
        // Score 97.6 >= 92.0 -> Green.
        // If we set OverallGreenThreshold = 99.0 on strict config:
        customStrictConfig.OverallGreenThreshold = 99.0;
        customStrictConfig.OverallAmberThreshold = 90.0;
        customStrictConfig.OverallRedThreshold = 70.0;
        await db.SaveChangesAsync();

        var evalStrict = await controller.EvaluateEmployeeKpi(new KpiEvaluationRequestDTO
        {
            EmployeeId = reworkEmployee.Id,
            ConfigurationId = customStrictConfigId,
            StartDate = now.AddDays(-1),
            EndDate = now.AddDays(1)
        });

        var strictOk = evalStrict.Should().BeOfType<OkObjectResult>().Subject;
        var strictData = strictOk.Value.As<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Data;
        strictData.Should().NotBeNull();
        strictData!.OverallScore.Should().Be(97.6);
        // Under strict config with OverallGreen = 99.0, score 97.6 is < 99.0, so overall rating is "Amber"!
        strictData.OverallRating.Should().Be("Amber");

        // Now evaluate SAME employee with customStandardConfig (OverallGreen = 85.0):
        var evalStandard = await controller.EvaluateEmployeeKpi(new KpiEvaluationRequestDTO
        {
            EmployeeId = reworkEmployee.Id,
            ConfigurationId = customStandardConfigId,
            StartDate = now.AddDays(-1),
            EndDate = now.AddDays(1)
        });

        var standardOk = evalStandard.Should().BeOfType<OkObjectResult>().Subject;
        var standardData = standardOk.Value.As<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Data;
        standardData.Should().NotBeNull();
        standardData!.OverallScore.Should().Be(97.6);
        // Under standard config with OverallGreen = 85.0, score 97.6 is >= 85.0, so overall rating is "Green"!
        standardData.OverallRating.Should().Be("Green");
    }

    #endregion

    #region Formula Testing & Variable Catalog Tests

    [Fact]
    public void GetFormulaVariables_ReturnsOkWithCatalogOfVariables()
    {
        var controller = CreateController();

        var result = controller.GetFormulaVariables();

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<IReadOnlyList<KpiVariableDefinition>>>();
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data.Should().HaveCountGreaterThanOrEqualTo(10);
        response.Data.Should().Contain(v => v.Name == "completed_tasks");
        response.Data.Should().Contain(v => v.Name == "total_assigned_tasks");
    }

    [Fact]
    public void TestFormula_WithNullOrEmptyFormula_ReturnsBadRequest()
    {
        var controller = CreateController();

        var result = controller.TestFormula(new FormulaTestRequestDTO { Formula = "  " });

        var badRequest = result.Should().BeOfType<BadRequestObjectResult>().Subject;
        var response = badRequest.Value.As<ApiResponseDTO<FormulaTestResponseDTO>>();
        response.IsSuccess.Should().BeFalse();
        response.Message.Should().Contain("Formula is required");
    }

    [Fact]
    public void TestFormula_WithValidFormulaAndDefaultSamples_CalculatesSuccessfully()
    {
        var controller = CreateController();

        // (completed_tasks / total_assigned_tasks) * 100
        // default samples: completed_tasks = 45, total_assigned_tasks = 50 -> (45/50)*100 = 90.0
        var result = controller.TestFormula(new FormulaTestRequestDTO
        {
            Formula = "(completed_tasks / total_assigned_tasks) * 100"
        });

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<FormulaTestResponseDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.IsValid.Should().BeTrue();
        response.Data.Result.Should().Be(90.0);
        response.Data.VariablesUsed.Should().Contain("completed_tasks");
        response.Data.VariablesUsed.Should().Contain("total_assigned_tasks");
        response.Data.ResolvedVariables["completed_tasks"].Should().Be(45.0);
        response.Data.ResolvedVariables["total_assigned_tasks"].Should().Be(50.0);
    }

    [Fact]
    public void TestFormula_WithSampleValueOverrides_UsesProvidedSampleValues()
    {
        var controller = CreateController();

        var result = controller.TestFormula(new FormulaTestRequestDTO
        {
            Formula = "completed_tasks * 2 + on_time_tasks",
            SampleValues = new Dictionary<string, double>
            {
                { "completed_tasks", 10.0 },
                { "on_time_tasks", 5.0 }
            }
        });

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<FormulaTestResponseDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.IsValid.Should().BeTrue();
        // 10 * 2 + 5 = 25.0
        response.Data.Result.Should().Be(25.0);
        response.Data.ResolvedVariables["completed_tasks"].Should().Be(10.0);
        response.Data.ResolvedVariables["on_time_tasks"].Should().Be(5.0);
    }

    [Fact]
    public void TestFormula_WithDivisionByZero_ReturnsSafeDefaultZeroWithoutCrashing()
    {
        var controller = CreateController();

        var result = controller.TestFormula(new FormulaTestRequestDTO
        {
            Formula = "completed_tasks / 0",
            SampleValues = new Dictionary<string, double>
            {
                { "completed_tasks", 100.0 }
            }
        });

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<FormulaTestResponseDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.IsValid.Should().BeTrue();
        response.Data.Result.Should().Be(0.0);
    }

    [Fact]
    public void TestFormula_WithInvalidSyntax_ReturnsValidationFailureMessage()
    {
        var controller = CreateController();

        var result = controller.TestFormula(new FormulaTestRequestDTO
        {
            Formula = "completed_tasks + * 10"
        });

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<FormulaTestResponseDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.IsValid.Should().BeFalse();
        response.Data.ErrorMessage.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void TestFormula_WithUnapprovedVariable_ReturnsNotPermittedErrorMessage()
    {
        var controller = CreateController();

        var result = controller.TestFormula(new FormulaTestRequestDTO
        {
            Formula = "completed_tasks + hacker_variable"
        });

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.As<ApiResponseDTO<FormulaTestResponseDTO>>();
        response.IsSuccess.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.IsValid.Should().BeFalse();
        response.Data.ErrorMessage.Should().Contain("hacker_variable");
        response.Data.ErrorMessage.Should().Contain("not permitted");
    }

    #endregion
}
