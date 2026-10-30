using System;
using System.Collections.Generic;
using System.IO;
using Backend.Models.DTOs;
using Backend.Modules.Analytics;
using FluentAssertions;
using Xunit;

namespace Backend.Tests.Analytics;

public class KpiExportServiceTests
{
    private readonly KpiExportService _exportService = new();

    private static EmployeeKpiEvaluationResultDTO CreateSampleScorecard()
    {
        return new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = Guid.NewGuid(),
            EmployeeName = "Jane Courier",
            EmployeeNumber = "EMP-00123",
            DepartmentId = Guid.NewGuid(),
            DepartmentName = "Operations",
            JobPositionTitle = "Lead Courier",
            Role = "Courier",
            PeriodStart = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
            PeriodEnd = new DateTime(2026, 10, 30, 0, 0, 0, DateTimeKind.Utc),
            ConfigurationId = Guid.NewGuid(),
            ConfigurationTitle = "2026 Q4 Courier Performance Configuration",
            TotalAssignedTasks = 40,
            CompletedTasksCount = 38,
            OnTimeTasksCount = 36,
            InFullTasksCount = 37,
            OtifTasksCount = 35,
            ReworkTasksCount = 1,
            AccurateTasksCount = 37,
            TotalHandlingHours = 76.5,
            OverallScore = 91.2,
            OverallRating = "Green",
            Metrics = new List<KpiMetricValueDTO>
            {
                new()
                {
                    MetricCode = "OTIF",
                    Name = "On-Time In-Full",
                    ActualValue = 92.1,
                    TargetValue = 95.0,
                    Unit = "%",
                    Weight = 30.0,
                    GreenThreshold = 95.0,
                    AmberThreshold = 85.0,
                    RedThreshold = 75.0,
                    Rating = "Amber",
                    WeightedScore = 27.63
                },
                new()
                {
                    MetricCode = "ACCURACY",
                    Name = "Order Accuracy",
                    ActualValue = 97.4,
                    TargetValue = 95.0,
                    Unit = "%",
                    Weight = 25.0,
                    GreenThreshold = 95.0,
                    AmberThreshold = 85.0,
                    RedThreshold = 75.0,
                    Rating = "Green",
                    WeightedScore = 24.35
                },
                new()
                {
                    MetricCode = "COMPLETION",
                    Name = "Task Completion Rate",
                    ActualValue = 95.0,
                    TargetValue = 90.0,
                    Unit = "%",
                    Weight = 25.0,
                    GreenThreshold = 90.0,
                    AmberThreshold = 80.0,
                    RedThreshold = 70.0,
                    Rating = "Green",
                    WeightedScore = 23.75
                },
                new()
                {
                    MetricCode = "AHT",
                    Name = "Average Handling Time",
                    ActualValue = 2.01,
                    TargetValue = 2.5,
                    Unit = "hrs",
                    Weight = 20.0,
                    GreenThreshold = 2.5,
                    AmberThreshold = 3.5,
                    RedThreshold = 4.5,
                    IsLowerBetter = true,
                    Rating = "Green",
                    WeightedScore = 20.0
                }
            }
        };
    }

    private static KpiHierarchyScopeResultDTO CreateSampleScopeResult()
    {
        var sampleScorecard = CreateSampleScorecard();
        return new KpiHierarchyScopeResultDTO
        {
            ScopeLevel = "Department",
            ScopeId = sampleScorecard.DepartmentId,
            ScopeName = "Operations Department",
            PeriodStart = sampleScorecard.PeriodStart,
            PeriodEnd = sampleScorecard.PeriodEnd,
            RoleFilter = "Courier",
            ConfigurationId = sampleScorecard.ConfigurationId,
            ConfigurationTitle = sampleScorecard.ConfigurationTitle,
            TotalDepartments = 1,
            TotalTeams = 2,
            TotalEmployees = 1,
            TotalAssignedTasks = 40,
            CompletedTasksCount = 38,
            OnTimeTasksCount = 36,
            InFullTasksCount = 37,
            OtifTasksCount = 35,
            ReworkTasksCount = 1,
            AccurateTasksCount = 37,
            TotalHandlingHours = 76.5,
            OverallScore = 91.2,
            AverageEmployeeScore = 91.2,
            OverallRating = "Green",
            Employees = new List<EmployeeKpiEvaluationResultDTO> { sampleScorecard }
        };
    }

    [Fact]
    public void ExportEmployeeScorecardPdf_WithValidScorecard_ReturnsValidPdfBytes()
    {
        var scorecard = CreateSampleScorecard();

        var pdfBytes = _exportService.ExportEmployeeScorecardPdf(scorecard);

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);

        // PDF magic header: %PDF-
        var header = System.Text.Encoding.ASCII.GetString(pdfBytes, 0, 5);
        header.Should().Be("%PDF-");
    }

    [Fact]
    public void ExportEmployeeScorecardExcel_WithValidScorecard_ReturnsValidExcelBytes()
    {
        var scorecard = CreateSampleScorecard();

        var excelBytes = _exportService.ExportEmployeeScorecardExcel(scorecard);

        excelBytes.Should().NotBeNull();
        excelBytes.Length.Should().BeGreaterThan(500);

        // ZIP/OpenXML magic header: PK\x03\x04
        excelBytes[0].Should().Be(0x50); // 'P'
        excelBytes[1].Should().Be(0x4B); // 'K'
        excelBytes[2].Should().Be(0x03);
        excelBytes[3].Should().Be(0x04);
    }

    [Fact]
    public void ExportHierarchyScopePdf_WithValidScopeResult_ReturnsValidPdfBytes()
    {
        var scopeResult = CreateSampleScopeResult();

        var pdfBytes = _exportService.ExportHierarchyScopePdf(scopeResult);

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);

        var header = System.Text.Encoding.ASCII.GetString(pdfBytes, 0, 5);
        header.Should().Be("%PDF-");
    }

    [Fact]
    public void ExportHierarchyScopeExcel_WithValidScopeResult_ReturnsValidExcelBytes()
    {
        var scopeResult = CreateSampleScopeResult();

        var excelBytes = _exportService.ExportHierarchyScopeExcel(scopeResult);

        excelBytes.Should().NotBeNull();
        excelBytes.Length.Should().BeGreaterThan(500);

        excelBytes[0].Should().Be(0x50); // 'P'
        excelBytes[1].Should().Be(0x4B); // 'K'
    }

    [Fact]
    public void ExportEmployeeScorecardPdf_WithNullScorecard_ThrowsArgumentNullException()
    {
        var act = () => _exportService.ExportEmployeeScorecardPdf(null!);
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void ExportEmployeeScorecardExcel_WithNullScorecard_ThrowsArgumentNullException()
    {
        var act = () => _exportService.ExportEmployeeScorecardExcel(null!);
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void ExportHierarchyScopePdf_WithNullScopeResult_ThrowsArgumentNullException()
    {
        var act = () => _exportService.ExportHierarchyScopePdf(null!);
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void ExportHierarchyScopeExcel_WithNullScopeResult_ThrowsArgumentNullException()
    {
        var act = () => _exportService.ExportHierarchyScopeExcel(null!);
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void ExportEmployeeScorecardPdf_WithEmptyMetrics_RendersSuccessfully()
    {
        var scorecard = CreateSampleScorecard();
        scorecard.Metrics.Clear();

        var pdfBytes = _exportService.ExportEmployeeScorecardPdf(scorecard);

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);
    }

    [Fact]
    public void ExportHierarchyScopePdf_WithEmptyEmployees_RendersSuccessfully()
    {
        var scopeResult = CreateSampleScopeResult();
        scopeResult.Employees.Clear();

        var pdfBytes = _exportService.ExportHierarchyScopePdf(scopeResult);

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);
    }
}
