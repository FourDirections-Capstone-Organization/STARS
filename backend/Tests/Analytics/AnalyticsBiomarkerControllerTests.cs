using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Backend.Tests.Analytics;

public class AnalyticsBiomarkerControllerTests
{
    private static (AppDbContext Db, BiomarkerScanService ScanService, AnalyticsBiomarkerController Controller) CreateTestContext()
    {
        var services = new ServiceCollection();
        var dbName = Guid.NewGuid().ToString();
        services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(dbName));
        var serviceProvider = services.BuildServiceProvider();
        var scopeFactory = serviceProvider.GetRequiredService<IServiceScopeFactory>();

        var thresholds = Options.Create(new BiomarkerThresholds
        {
            MinOnTimeRate = 0.80,
            MaxLateRatePerEmployee = 0.30,
            MaxOverdueBacklog = 10,
            MaxWorkloadPerEmployee = 10,
            StuckTaskHours = 48
        });

        var scanLogger = NullLogger<BiomarkerScanService>.Instance;
        var scanService = new BiomarkerScanService(scopeFactory, thresholds, scanLogger);

        var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var controllerLogger = NullLogger<AnalyticsBiomarkerController>.Instance;
        var controller = new AnalyticsBiomarkerController(db, scanService, controllerLogger);

        return (db, scanService, controller);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_Pagination_ReturnsCorrectPageAndTotalCount()
    {
        var (db, _, controller) = CreateTestContext();
        var baseTime = DateTime.UtcNow;

        for (int i = 0; i < 15; i++)
        {
            db.BiomarkerAlerts.Add(new BiomarkerAlert
            {
                Id = Guid.NewGuid(),
                ScanDateTime = baseTime.AddMinutes(-i),
                ScanDate = baseTime.Date,
                MetricName = "OnTimeRate",
                CurrentValue = 60.0,
                ThresholdValue = 80.0,
                Severity = "Warning",
                Description = $"Alert {i}"
            });
        }
        await db.SaveChangesAsync();

        var actionResult = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 1, PageSize = 5 });

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value!.GetType().GetProperty("Paged")!.GetValue(okResult.Value) as PaginatedResponseDTO<BiomarkerAlert>;

        paged.Should().NotBeNull();
        paged!.TotalCount.Should().Be(15);
        paged.PageNumber.Should().Be(1);
        paged.PageSize.Should().Be(5);
        paged.Items.Should().HaveCount(5);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_Pagination_ReturnsSecondPageCorrectly()
    {
        var (db, _, controller) = CreateTestContext();
        var baseTime = DateTime.UtcNow;

        for (int i = 0; i < 12; i++)
        {
            db.BiomarkerAlerts.Add(new BiomarkerAlert
            {
                Id = Guid.NewGuid(),
                ScanDateTime = baseTime.AddMinutes(-i),
                ScanDate = baseTime.Date,
                MetricName = "OnTimeRate",
                Description = $"Alert {i}"
            });
        }
        await db.SaveChangesAsync();

        var page1Result = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 1, PageSize = 5 });
        var page2Result = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 2, PageSize = 5 });

        var paged1 = ((OkObjectResult)page1Result).Value!.GetType().GetProperty("Paged")!.GetValue(((OkObjectResult)page1Result).Value) as PaginatedResponseDTO<BiomarkerAlert>;
        var paged2 = ((OkObjectResult)page2Result).Value!.GetType().GetProperty("Paged")!.GetValue(((OkObjectResult)page2Result).Value) as PaginatedResponseDTO<BiomarkerAlert>;

        paged1!.Items.Should().HaveCount(5);
        paged2!.Items.Should().HaveCount(5);
        paged2.TotalCount.Should().Be(12);

        // Ensure page 1 and page 2 items do not overlap
        var page1Ids = paged1.Items.Select(x => x.Id).ToHashSet();
        paged2.Items.Any(x => page1Ids.Contains(x.Id)).Should().BeFalse();
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_OrdersDescendingByScanDateTime()
    {
        var (db, _, controller) = CreateTestContext();
        var baseTime = DateTime.UtcNow;

        db.BiomarkerAlerts.AddRange(
            new BiomarkerAlert { Id = Guid.NewGuid(), ScanDateTime = baseTime.AddHours(-3), Description = "Oldest" },
            new BiomarkerAlert { Id = Guid.NewGuid(), ScanDateTime = baseTime.AddHours(-1), Description = "Newest" },
            new BiomarkerAlert { Id = Guid.NewGuid(), ScanDateTime = baseTime.AddHours(-2), Description = "Middle" }
        );
        await db.SaveChangesAsync();

        var actionResult = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 1, PageSize = 10 });

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value!.GetType().GetProperty("Paged")!.GetValue(okResult.Value) as PaginatedResponseDTO<BiomarkerAlert>;

        paged!.Items.Should().HaveCount(3);
        paged.Items[0].Description.Should().Be("Newest");
        paged.Items[1].Description.Should().Be("Middle");
        paged.Items[2].Description.Should().Be("Oldest");
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_FilterByType_SlaBreach_ReturnsOnlySlaMetrics()
    {
        var (db, _, controller) = CreateTestContext();

        db.BiomarkerAlerts.AddRange(
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "OnTimeRate", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "StuckTasks", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "OverallSlaCompliance", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "HighWorkload", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "InactiveEmployee", ScanDateTime = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();

        var actionResult = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 1, PageSize = 10 }, type: "sla_breach");

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value!.GetType().GetProperty("Paged")!.GetValue(okResult.Value) as PaginatedResponseDTO<BiomarkerAlert>;

        paged!.TotalCount.Should().Be(3);
        paged.Items.Should().HaveCount(3);
        paged.Items.Should().OnlyContain(a => a.MetricName == "OnTimeRate" || a.MetricName == "StuckTasks" || a.MetricName == "OverallSlaCompliance");
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_FilterByType_WorkloadOverload_ReturnsOnlyHighWorkload()
    {
        var (db, _, controller) = CreateTestContext();

        db.BiomarkerAlerts.AddRange(
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "OnTimeRate", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "HighWorkload", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "InactiveEmployee", ScanDateTime = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();

        var actionResult = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 1, PageSize = 10 }, type: "workload_overload");

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value!.GetType().GetProperty("Paged")!.GetValue(okResult.Value) as PaginatedResponseDTO<BiomarkerAlert>;

        paged!.TotalCount.Should().Be(1);
        paged.Items.Single().MetricName.Should().Be("HighWorkload");
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_FilterByType_BiomarkerFlag_ReturnsNonSlaNonWorkloadAlerts()
    {
        var (db, _, controller) = CreateTestContext();

        db.BiomarkerAlerts.AddRange(
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "OnTimeRate", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "HighWorkload", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "InactiveEmployee", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "EmployeeLateRate", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "OverdueBacklog", ScanDateTime = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();

        var actionResult = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 1, PageSize = 10 }, type: "biomarker_flag");

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value!.GetType().GetProperty("Paged")!.GetValue(okResult.Value) as PaginatedResponseDTO<BiomarkerAlert>;

        paged!.TotalCount.Should().Be(3);
        paged.Items.Select(x => x.MetricName).Should().BeEquivalentTo(new[] { "InactiveEmployee", "EmployeeLateRate", "OverdueBacklog" });
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_FilterByEmployeeNumber_ReturnsMatchingAlertsOnly()
    {
        var (db, _, controller) = CreateTestContext();

        db.BiomarkerAlerts.AddRange(
            new BiomarkerAlert { Id = Guid.NewGuid(), EmployeeNumber = "EMP101", MetricName = "HighWorkload", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), EmployeeNumber = "EMP101", MetricName = "EmployeeLateRate", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), EmployeeNumber = "EMP202", MetricName = "HighWorkload", ScanDateTime = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();

        var actionResult = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 1, PageSize = 10 }, employeeNumber: "EMP101");

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value!.GetType().GetProperty("Paged")!.GetValue(okResult.Value) as PaginatedResponseDTO<BiomarkerAlert>;

        paged!.TotalCount.Should().Be(2);
        paged.Items.Should().OnlyContain(x => x.EmployeeNumber == "EMP101");
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_FilterByDepartmentId_ReturnsMatchingAlertsOnly()
    {
        var (db, _, controller) = CreateTestContext();
        var deptA = Guid.NewGuid();
        var deptB = Guid.NewGuid();

        db.BiomarkerAlerts.AddRange(
            new BiomarkerAlert { Id = Guid.NewGuid(), DepartmentId = deptA, MetricName = "OnTimeRate", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), DepartmentId = deptA, MetricName = "OverdueBacklog", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), DepartmentId = deptB, MetricName = "OnTimeRate", ScanDateTime = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();

        var actionResult = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 1, PageSize = 10 }, departmentId: deptA);

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value!.GetType().GetProperty("Paged")!.GetValue(okResult.Value) as PaginatedResponseDTO<BiomarkerAlert>;

        paged!.TotalCount.Should().Be(2);
        paged.Items.Should().OnlyContain(x => x.DepartmentId == deptA);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_FilterByDateRange_ReturnsAlertsWithinRange()
    {
        var (db, _, controller) = CreateTestContext();
        var now = DateTime.UtcNow;

        db.BiomarkerAlerts.AddRange(
            new BiomarkerAlert { Id = Guid.NewGuid(), ScanDateTime = now.AddDays(-10), Description = "Past" },
            new BiomarkerAlert { Id = Guid.NewGuid(), ScanDateTime = now.AddDays(-3), Description = "Target 1" },
            new BiomarkerAlert { Id = Guid.NewGuid(), ScanDateTime = now.AddDays(-2), Description = "Target 2" },
            new BiomarkerAlert { Id = Guid.NewGuid(), ScanDateTime = now, Description = "Present" }
        );
        await db.SaveChangesAsync();

        var actionResult = await controller.GetLatestBiomarkerResults(
            new PaginationQueryDTO { PageNumber = 1, PageSize = 10 },
            dateFrom: now.AddDays(-4),
            dateTo: now.AddDays(-1));

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value!.GetType().GetProperty("Paged")!.GetValue(okResult.Value) as PaginatedResponseDTO<BiomarkerAlert>;

        paged!.TotalCount.Should().Be(2);
        paged.Items.Select(x => x.Description).Should().BeEquivalentTo(new[] { "Target 1", "Target 2" });
    }

    [Fact]
    public async System.Threading.Tasks.Task GetLatestBiomarkerResults_SummaryCounts_ReflectsEntireDatasetRegardlessOfFilters()
    {
        var (db, _, controller) = CreateTestContext();

        db.BiomarkerAlerts.AddRange(
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "OnTimeRate", Severity = "Warning", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "StuckTasks", Severity = "Warning", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "OverallSlaCompliance", Severity = "Critical", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "HighWorkload", Severity = "Warning", ScanDateTime = DateTime.UtcNow },
            new BiomarkerAlert { Id = Guid.NewGuid(), MetricName = "InactiveEmployee", Severity = "Info", ScanDateTime = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();

        // Query with filter type="sla_breach" and PageSize=1
        var actionResult = await controller.GetLatestBiomarkerResults(new PaginationQueryDTO { PageNumber = 1, PageSize = 1 }, type: "sla_breach");

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value!.GetType().GetProperty("Paged")!.GetValue(okResult.Value) as PaginatedResponseDTO<BiomarkerAlert>;
        var summary = okResult.Value!.GetType().GetProperty("Summary")!.GetValue(okResult.Value) as BiomarkerSummaryDTO;

        // Paged reflects the filter
        paged!.TotalCount.Should().Be(3);
        paged.Items.Should().HaveCount(1);

        // Summary reflects the entire unfiltered table
        summary.Should().NotBeNull();
        summary!.TotalViolations.Should().Be(5);
        summary.TotalSlaBreaches.Should().Be(3);
        summary.TotalWorkloadOverloads.Should().Be(1);
        summary.TotalBiomarkerFlags.Should().Be(1); // 5 total - 3 SLA - 1 Workload = 1
        summary.TotalCriticalFlags.Should().Be(1);
        summary.TotalHighMediumFlags.Should().Be(3);
        summary.TotalLowFlags.Should().Be(1);
    }

    [Fact]
    public async System.Threading.Tasks.Task GetBiomarkerHistory_PaginationAndDateFilter_ReturnsCorrectPage()
    {
        var (db, _, controller) = CreateTestContext();
        var baseDate = DateTime.UtcNow;

        for (int i = 0; i < 10; i++)
        {
            db.BiomarkerAlerts.Add(new BiomarkerAlert
            {
                Id = Guid.NewGuid(),
                ScanDateTime = baseDate.AddDays(-i),
                MetricName = "OnTimeRate",
                Description = $"History {i}"
            });
        }
        await db.SaveChangesAsync();

        var actionResult = await controller.GetBiomarkerHistory(
            from: baseDate.AddDays(-6),
            to: baseDate.AddDays(-1),
            pagination: new PaginationQueryDTO { PageNumber = 1, PageSize = 3 });

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var paged = okResult.Value.Should().BeOfType<PaginatedResponseDTO<BiomarkerAlert>>().Subject;

        // Days -1, -2, -3, -4, -5, -6 = 6 matching records
        paged.TotalCount.Should().Be(6);
        paged.PageNumber.Should().Be(1);
        paged.PageSize.Should().Be(3);
        paged.Items.Should().HaveCount(3);
    }

    [Fact]
    public async System.Threading.Tasks.Task TriggerScan_ReturnsOkWithSuccessMessage()
    {
        var (_, _, controller) = CreateTestContext();

        var actionResult = await controller.TriggerScan();

        var okResult = actionResult.Should().BeOfType<OkObjectResult>().Subject;
        var messageProp = okResult.Value!.GetType().GetProperty("message")!.GetValue(okResult.Value) as string;

        messageProp.Should().Be("Biomarker scan triggered successfully");
    }
}
