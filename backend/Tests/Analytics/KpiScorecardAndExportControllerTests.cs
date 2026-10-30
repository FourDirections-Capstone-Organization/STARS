using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Backend.Tests.Analytics;

public class KpiScorecardAndExportControllerTests
{
    private static KpiController CreateController(
        Mock<IKpiCalculationEngine>? engineMock = null,
        Mock<IKpiExportService>? exportServiceMock = null,
        UserRole callerRole = UserRole.Courier,
        Guid? currentUserId = null,
        bool isAuthenticated = true)
    {
        var claims = new List<Claim>();
        if (isAuthenticated)
        {
            var userId = currentUserId ?? Guid.NewGuid();
            claims.Add(new Claim(ClaimTypes.NameIdentifier, userId.ToString()));
            claims.Add(new Claim(ClaimTypes.Role, callerRole.ToString()));
        }

        var identity = isAuthenticated
            ? new ClaimsIdentity(claims, "TestAuth")
            : new ClaimsIdentity();
        var principal = new ClaimsPrincipal(identity);

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var context = new AppDbContext(options);

        var engine = engineMock?.Object ?? new Mock<IKpiCalculationEngine>().Object;
        var export = exportServiceMock?.Object ?? new Mock<IKpiExportService>().Object;

        var controller = new KpiController(
            engine,
            context,
            NullLogger<KpiController>.Instance,
            kpiExportService: export)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = principal }
            }
        };

        return controller;
    }

    private static EmployeeKpiEvaluationResultDTO CreateSampleScorecard(Guid employeeId, string name = "Jane Courier")
    {
        return new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = employeeId,
            EmployeeName = name,
            EmployeeNumber = "EMP-999",
            OverallScore = 92.5,
            OverallRating = "Green",
            TotalAssignedTasks = 20,
            CompletedTasksCount = 19,
            PeriodStart = DateTime.UtcNow.AddDays(-30),
            PeriodEnd = DateTime.UtcNow
        };
    }

    [Fact]
    public async System.Threading.Tasks.Task GetMyScorecard_AuthenticatedEmployee_Returns200WithScorecard()
    {
        var myUserId = Guid.NewGuid();
        var sampleScorecard = CreateSampleScorecard(myUserId);

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                myUserId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(sampleScorecard);

        var controller = CreateController(engineMock, callerRole: UserRole.Courier, currentUserId: myUserId);

        var actionResult = await controller.GetMyScorecard();

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.EmployeeId.Should().Be(myUserId);
        response.Data.EmployeeName.Should().Be("Jane Courier");
    }

    [Fact]
    public async System.Threading.Tasks.Task GetMyScorecard_Unauthenticated_Returns401Unauthorized()
    {
        var controller = CreateController(isAuthenticated: false);

        var actionResult = await controller.GetMyScorecard();

        actionResult.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async System.Threading.Tasks.Task GetEmployeeScorecard_SelfAccess_Returns200WithScorecard()
    {
        var myUserId = Guid.NewGuid();
        var sampleScorecard = CreateSampleScorecard(myUserId);

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                myUserId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(sampleScorecard);

        var controller = CreateController(engineMock, callerRole: UserRole.Courier, currentUserId: myUserId);

        var actionResult = await controller.GetEmployeeScorecard(myUserId);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.EmployeeId.Should().Be(myUserId);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetEmployeeScorecard_OtherEmployeeNonManager_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();

        var controller = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId);

        var actionResult = await controller.GetEmployeeScorecard(otherUserId);

        var statusResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetEmployeeScorecard_ManagerAccessAny_Returns200WithScorecard()
    {
        var managerId = Guid.NewGuid();
        var employeeId = Guid.NewGuid();
        var sampleScorecard = CreateSampleScorecard(employeeId);

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                employeeId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(sampleScorecard);

        var controller = CreateController(engineMock, callerRole: UserRole.Manager, currentUserId: managerId);

        var actionResult = await controller.GetEmployeeScorecard(employeeId);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.EmployeeId.Should().Be(employeeId);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetEmployeeScorecard_EmptyGuid_Returns400BadRequest()
    {
        var controller = CreateController(callerRole: UserRole.Manager);

        var actionResult = await controller.GetEmployeeScorecard(Guid.Empty);

        actionResult.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async System.Threading.Tasks.Task ExportEmployeeScorecard_PdfFormat_ReturnsFileResultWithPdfContentType()
    {
        var myUserId = Guid.NewGuid();
        var sampleScorecard = CreateSampleScorecard(myUserId, "Jane Courier");
        var fakePdfBytes = System.Text.Encoding.ASCII.GetBytes("%PDF-1.4 test scorecard content");

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                myUserId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(sampleScorecard);

        var exportMock = new Mock<IKpiExportService>();
        exportMock.Setup(x => x.ExportEmployeeScorecardPdf(sampleScorecard))
            .Returns(fakePdfBytes);

        var controller = CreateController(engineMock, exportMock, callerRole: UserRole.Courier, currentUserId: myUserId);

        var actionResult = await controller.ExportEmployeeScorecard(format: "pdf");

        var fileResult = actionResult.Should().BeOfType<FileContentResult>().Subject;
        fileResult.ContentType.Should().Be("application/pdf");
        fileResult.FileDownloadName.Should().StartWith("Scorecard_Jane_Courier_");
        fileResult.FileDownloadName.Should().EndWith(".pdf");
        fileResult.FileContents.Should().BeEquivalentTo(fakePdfBytes);
    }

    [Fact]
    public async System.Threading.Tasks.Task ExportEmployeeScorecard_ExcelFormat_ReturnsFileResultWithExcelContentType()
    {
        var myUserId = Guid.NewGuid();
        var sampleScorecard = CreateSampleScorecard(myUserId, "Jane Courier");
        var fakeExcelBytes = new byte[] { 0x50, 0x4B, 0x03, 0x04, 0x00 };

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                myUserId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(sampleScorecard);

        var exportMock = new Mock<IKpiExportService>();
        exportMock.Setup(x => x.ExportEmployeeScorecardExcel(sampleScorecard))
            .Returns(fakeExcelBytes);

        var controller = CreateController(engineMock, exportMock, callerRole: UserRole.Courier, currentUserId: myUserId);

        var actionResult = await controller.ExportEmployeeScorecard(format: "excel");

        var fileResult = actionResult.Should().BeOfType<FileContentResult>().Subject;
        fileResult.ContentType.Should().Be("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        fileResult.FileDownloadName.Should().StartWith("Scorecard_Jane_Courier_");
        fileResult.FileDownloadName.Should().EndWith(".xlsx");
        fileResult.FileContents.Should().BeEquivalentTo(fakeExcelBytes);
    }

    [Fact]
    public async System.Threading.Tasks.Task ExportEmployeeScorecard_OtherEmployeeNonManager_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();

        var controller = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId);

        var actionResult = await controller.ExportEmployeeScorecard(employeeId: otherUserId, format: "pdf");

        var statusResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async System.Threading.Tasks.Task ExportEmployeeScorecard_InvalidFormat_Returns400BadRequest()
    {
        var myUserId = Guid.NewGuid();
        var sampleScorecard = CreateSampleScorecard(myUserId);

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                myUserId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(sampleScorecard);

        var controller = CreateController(engineMock, callerRole: UserRole.Courier, currentUserId: myUserId);

        var actionResult = await controller.ExportEmployeeScorecard(format: "invalid_format");

        actionResult.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async System.Threading.Tasks.Task ExportHierarchyScope_PdfFormat_ReturnsFileResultWithPdf()
    {
        var fakePdfBytes = System.Text.Encoding.ASCII.GetBytes("%PDF-1.4 scope report");
        var scopeResult = new KpiHierarchyScopeResultDTO
        {
            ScopeLevel = "Department",
            ScopeName = "Operations",
            PeriodStart = DateTime.UtcNow.AddDays(-30),
            PeriodEnd = DateTime.UtcNow
        };

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateHierarchicalScopeAsync(
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<UserRole?>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(scopeResult);

        var exportMock = new Mock<IKpiExportService>();
        exportMock.Setup(x => x.ExportHierarchyScopePdf(scopeResult))
            .Returns(fakePdfBytes);

        var controller = CreateController(engineMock, exportMock, callerRole: UserRole.Manager);

        var actionResult = await controller.ExportHierarchyScope(format: "pdf");

        var fileResult = actionResult.Should().BeOfType<FileContentResult>().Subject;
        fileResult.ContentType.Should().Be("application/pdf");
        fileResult.FileDownloadName.Should().StartWith("KpiScope_Department_Operations_");
        fileResult.FileDownloadName.Should().EndWith(".pdf");
    }

    [Fact]
    public async System.Threading.Tasks.Task ExportHierarchyScope_ExcelFormat_ReturnsFileResultWithExcel()
    {
        var fakeExcelBytes = new byte[] { 0x50, 0x4B, 0x03, 0x04 };
        var scopeResult = new KpiHierarchyScopeResultDTO
        {
            ScopeLevel = "Department",
            ScopeName = "Operations",
            PeriodStart = DateTime.UtcNow.AddDays(-30),
            PeriodEnd = DateTime.UtcNow
        };

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateHierarchicalScopeAsync(
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                It.IsAny<UserRole?>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(scopeResult);

        var exportMock = new Mock<IKpiExportService>();
        exportMock.Setup(x => x.ExportHierarchyScopeExcel(scopeResult))
            .Returns(fakeExcelBytes);

        var controller = CreateController(engineMock, exportMock, callerRole: UserRole.Manager);

        var actionResult = await controller.ExportHierarchyScope(format: "excel");

        var fileResult = actionResult.Should().BeOfType<FileContentResult>().Subject;
        fileResult.ContentType.Should().Be("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        fileResult.FileDownloadName.Should().StartWith("KpiScope_Department_Operations_");
        fileResult.FileDownloadName.Should().EndWith(".xlsx");
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_OtherEmployeeNonManager_Returns403Forbidden()
    {
        var myUserId = Guid.NewGuid();
        var targetEmployeeId = Guid.NewGuid();

        var controller = CreateController(callerRole: UserRole.Courier, currentUserId: myUserId);

        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = targetEmployeeId
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request);

        var statusResult = actionResult.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async System.Threading.Tasks.Task EvaluateEmployeeKpi_SelfAccess_Returns200Ok()
    {
        var myUserId = Guid.NewGuid();
        var sampleScorecard = CreateSampleScorecard(myUserId);

        var engineMock = new Mock<IKpiCalculationEngine>();
        engineMock.Setup(e => e.CalculateEmployeeKpiAsync(
                myUserId,
                It.IsAny<DateTime>(),
                It.IsAny<DateTime>(),
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(sampleScorecard);

        var controller = CreateController(engineMock, callerRole: UserRole.Courier, currentUserId: myUserId);

        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = myUserId
        };

        var actionResult = await controller.EvaluateEmployeeKpi(request);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponseDTO<EmployeeKpiEvaluationResultDTO>>().Subject;
        response.IsSuccess.Should().BeTrue();
        response.Data!.EmployeeId.Should().Be(myUserId);
    }
}
