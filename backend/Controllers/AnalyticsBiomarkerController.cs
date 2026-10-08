using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Modules.Analytics;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
[Route("api/analytics/biomarker")]
[Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
public class AnalyticsBiomarkerController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly BiomarkerScanService _scanService;
    private readonly ILogger<AnalyticsBiomarkerController> _logger;

    public AnalyticsBiomarkerController(AppDbContext db, BiomarkerScanService scanService, ILogger<AnalyticsBiomarkerController> logger)
    {
        _db = db;
        _scanService = scanService;
        _logger = logger;
    }

    [HttpGet("latest")]
    public async Task<IActionResult> GetLatestBiomarkerResults(
        [FromQuery] PaginationQueryDTO pagination,
        [FromQuery] string? type = null,
        [FromQuery] string? employeeNumber = null,
        [FromQuery] Guid? departmentId = null,
        [FromQuery] string? team = null,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        [FromQuery] string? search = null)
    {
        try
        {
            // Build filter query
            var filteredQuery = _db.BiomarkerAlerts.AsQueryable();

            if (!string.IsNullOrEmpty(type))
            {
                filteredQuery = type switch
                {
                    "sla_breach" => filteredQuery.Where(a =>
                        a.MetricName == "OnTimeRate" ||
                        a.MetricName == "StuckTasks" ||
                        a.MetricName == "OverallSlaCompliance"),
                    "workload_overload" => filteredQuery.Where(a => a.MetricName == "HighWorkload"),
                    "biomarker_flag" => filteredQuery.Where(a =>
                        a.MetricName != "OnTimeRate" &&
                        a.MetricName != "StuckTasks" &&
                        a.MetricName != "OverallSlaCompliance" &&
                        a.MetricName != "HighWorkload"),
                    _ => filteredQuery
                };
            }

            if (!string.IsNullOrEmpty(employeeNumber))
                filteredQuery = filteredQuery.Where(a => a.EmployeeNumber == employeeNumber);

            if (departmentId.HasValue)
                filteredQuery = filteredQuery.Where(a => a.DepartmentId == departmentId.Value);

            if (!string.IsNullOrEmpty(team))
                filteredQuery = filteredQuery.Where(a =>
                    EF.Functions.ILike(a.DepartmentName, $"%{team}%") ||
                    EF.Functions.ILike(a.Description, $"%{team}%"));

            if (dateFrom.HasValue)
                filteredQuery = filteredQuery.Where(a => a.ScanDateTime >= dateFrom.Value);

            if (dateTo.HasValue)
                filteredQuery = filteredQuery.Where(a => a.ScanDateTime <= dateTo.Value);

            if (!string.IsNullOrEmpty(search))
                filteredQuery = filteredQuery.Where(a =>
                    EF.Functions.ILike(a.Description, $"%{search}%") ||
                    EF.Functions.ILike(a.EmployeeName ?? "", $"%{search}%") ||
                    EF.Functions.ILike(a.EmployeeNumber ?? "", $"%{search}%") ||
                    EF.Functions.ILike(a.DepartmentName, $"%{search}%") ||
                    EF.Functions.ILike(a.MetricName, $"%{search}%"));

            // Total count for the filtered query (for pagination)
            var filteredCount = await filteredQuery.CountAsync();

            // Fetch the page
            var paged = await filteredQuery
                .OrderByDescending(a => a.ScanDateTime)
                .Skip((pagination.PageNumber - 1) * pagination.PageSize)
                .Take(pagination.PageSize)
                .ToListAsync();

            // Compute summary counts from the UNFILTERED dataset (always overall totals)
            var unfilteredQuery = _db.BiomarkerAlerts.AsQueryable();
            var totalAll = await unfilteredQuery.CountAsync();
            var totalSlaBreaches = await unfilteredQuery
                .CountAsync(a => a.MetricName == "OnTimeRate" || a.MetricName == "StuckTasks" || a.MetricName == "OverallSlaCompliance");
            var totalWorkloadOverloads = await unfilteredQuery
                .CountAsync(a => a.MetricName == "HighWorkload");
            var totalBiomarkerFlags = totalAll - totalSlaBreaches - totalWorkloadOverloads;
            var totalCritical = await unfilteredQuery.CountAsync(a => a.Severity == "Critical");
            var totalWarning = await unfilteredQuery.CountAsync(a => a.Severity == "Warning");
            var totalInfo = await unfilteredQuery.CountAsync(a => a.Severity == "Info");

            return Ok(new
            {
                Paged = new PaginatedResponseDTO<BiomarkerAlert>
                {
                    Items = paged,
                    TotalCount = filteredCount,
                    PageNumber = pagination.PageNumber,
                    PageSize = pagination.PageSize
                },
                Summary = new BiomarkerSummaryDTO
                {
                    TotalViolations = totalAll,
                    TotalSlaBreaches = totalSlaBreaches,
                    TotalWorkloadOverloads = totalWorkloadOverloads,
                    TotalBiomarkerFlags = totalBiomarkerFlags,
                    TotalCriticalFlags = totalCritical,
                    TotalHighMediumFlags = totalWarning,
                    TotalLowFlags = totalInfo
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch latest biomarker alerts");
            return StatusCode(500, new { error = ex.Message, innerError = ex.InnerException?.Message, stackTrace = ex.StackTrace });
        }
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetBiomarkerHistory([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] PaginationQueryDTO pagination)
    {
        try
        {
            var query = _db.BiomarkerAlerts.AsQueryable();

            if (from.HasValue)
                query = query.Where(a => a.ScanDateTime >= from.Value);
            if (to.HasValue)
                query = query.Where(a => a.ScanDateTime <= to.Value);

            var totalCount = await query.CountAsync();

            var alerts = await query
                .OrderByDescending(a => a.ScanDateTime)
                .Skip((pagination.PageNumber - 1) * pagination.PageSize)
                .Take(pagination.PageSize)
                .ToListAsync();

            return Ok(new PaginatedResponseDTO<BiomarkerAlert>
            {
                Items = alerts,
                TotalCount = totalCount,
                PageNumber = pagination.PageNumber,
                PageSize = pagination.PageSize
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch biomarker alert history");
            return StatusCode(500, new { error = ex.Message, innerError = ex.InnerException?.Message });
        }
    }

    [HttpPost("trigger-scan")]
    public async Task<IActionResult> TriggerScan()
    {
        try
        {
            await _scanService.RunBiomarkerScanAsync(DateTime.UtcNow.Date);
            return Ok(new { message = "Biomarker scan triggered successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to trigger biomarker scan");
            return StatusCode(500, new { error = ex.Message, innerError = ex.InnerException?.Message });
        }
    }
}
