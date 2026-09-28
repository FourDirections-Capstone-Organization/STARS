using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportController : ControllerBase
{
    private readonly IReportService _reportService;
    private readonly AppDbContext _db;
    private readonly Modules.Analytics.ChartDataService _chartService;

    public ReportController(IReportService reportService, AppDbContext db, Modules.Analytics.ChartDataService chartService)
    {
        _reportService = reportService;
        _db = db;
        _chartService = chartService;
    }

    [HttpGet("kpi")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetKpiTracking(
        [FromQuery] Guid? employeeId = null,
        [FromQuery] DateTime? dateRangeStart = null,
        [FromQuery] DateTime? dateRangeEnd = null)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var filters = new KpiFilterDTO
        {
            EmployeeId = employeeId,
            DateRangeStart = dateRangeStart,
            DateRangeEnd = dateRangeEnd
        };

        var result = await _reportService.GetKpiTrackingAsync(
            requestUserId, requestUserRole, requestUserDepartmentId, filters);

        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpGet("performance")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetPerformanceReport(
        [FromQuery] ReportPeriod period = ReportPeriod.Weekly,
        [FromQuery] DateTime? dateRangeStart = null,
        [FromQuery] DateTime? dateRangeEnd = null,
        [FromQuery] Guid? departmentId = null,
        [FromQuery] Guid? employeeId = null)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var filters = new PerformanceReportFilterDTO
        {
            Period = period,
            DateRangeStart = dateRangeStart,
            DateRangeEnd = dateRangeEnd,
            DepartmentId = departmentId,
            EmployeeId = employeeId
        };

        var result = await _reportService.GeneratePerformanceReportAsync(
            filters, requestUserId, requestUserRole, requestUserDepartmentId);

        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpPost("export")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> ExportReport([FromBody] PerformanceReportFilterDTO filters)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var reportResult = await _reportService.GeneratePerformanceReportAsync(
            filters, requestUserId, requestUserRole, requestUserDepartmentId);

        if (!reportResult.IsSuccess)
            return NotFound(reportResult);

        var exportResult = await _reportService.ExportReportAsync(reportResult.Data!, filters.ExportFormat);

        if (!exportResult.IsSuccess)
            return BadRequest(exportResult);

        var parts = exportResult.Message.Split('|');
        var fileName = parts.Length > 1 ? parts[1] : "report.xlsx";
        var contentType = parts.Length > 2 ? parts[2] : "application/octet-stream";

        return File(exportResult.Data!, contentType, fileName);
    }

    [HttpGet("performance-summary/{employeeId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetEmployeePerformanceSummary(
        Guid employeeId,
        [FromQuery] DateTime? dateRangeStart = null,
        [FromQuery] DateTime? dateRangeEnd = null)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var filters = new EmployeePerformanceFilterDTO
        {
            DateRangeStart = dateRangeStart,
            DateRangeEnd = dateRangeEnd
        };

        var result = await _reportService.GetEmployeePerformanceSummaryAsync(
            employeeId, filters, requestUserId, requestUserRole, requestUserDepartmentId);

        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpGet("kpi/department/{deptId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetDepartmentKpi(Guid deptId, [FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        var result = await _reportService.GetDepartmentKpiAsync(deptId, from, to);
        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpGet("trends/completion-rate")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> GetCompletionRateTrend([FromQuery] int weeks = 4)
    {
        var result = await _chartService.GetCompletionRateTrendAsync(weeks);
        return Ok(result);
    }

    [HttpGet("filter-options")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetFilterOptions()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var result = await _reportService.GetReportFilterOptionsAsync(
            requestUserId, requestUserRole, requestUserDepartmentId);

        return Ok(result);
    }

    [HttpGet("task-completion")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetTaskCompletionReport(
        [FromQuery] DateTime? DateRangeStart = null,
        [FromQuery] DateTime? DateRangeEnd = null,
        [FromQuery] Guid? EmployeeId = null,
        [FromQuery] string? TaskPriorityLevel = null,
        [FromQuery] string? TaskStatus = null,
        [FromQuery] string? TaskCategory = null)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var result = await _reportService.GetTaskCompletionReportAsync(
            DateRangeStart, DateRangeEnd, EmployeeId, TaskPriorityLevel, TaskStatus, TaskCategory,
            requestUserId, requestUserRole, requestUserDepartmentId);

        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpGet("operational-summary")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetOperationalSummary(
        [FromQuery] DateTime? DateRangeStart = null,
        [FromQuery] DateTime? DateRangeEnd = null,
        [FromQuery] Guid? DepartmentId = null,
        [FromQuery] Guid? EmployeeId = null)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var result = await _reportService.GetOperationalSummaryAsync(
            DateRangeStart, DateRangeEnd, DepartmentId, EmployeeId,
            requestUserId, requestUserRole, requestUserDepartmentId);

        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpGet("operational-summary/download")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> DownloadOperationalSummary(
        [FromQuery] DateTime? DateRangeStart = null,
        [FromQuery] DateTime? DateRangeEnd = null,
        [FromQuery] Guid? DepartmentId = null,
        [FromQuery] Guid? EmployeeId = null,
        [FromQuery] string? ReportFormat = "PDF")
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var reportResult = await _reportService.GetOperationalSummaryAsync(
            DateRangeStart, DateRangeEnd, DepartmentId, EmployeeId,
            requestUserId, requestUserRole, requestUserDepartmentId);

        if (!reportResult.IsSuccess)
            return NotFound(reportResult);

        var exportResult = await _reportService.ExportOperationalSummaryAsync(
            reportResult.Data!, ReportFormat ?? "PDF");

        if (!exportResult.IsSuccess)
            return BadRequest(exportResult);

        var parts = exportResult.Message.Split('|');
        var fileName = parts.Length > 1 ? parts[1] : "OperationalSummaryReport.pdf";
        var contentType = parts.Length > 2 ? parts[2] : "application/octet-stream";

        return File(exportResult.Data!, contentType, fileName);
    }

    [HttpPost("task-completion/export")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> ExportTaskCompletionReport([FromBody] TaskCompletionExportRequestDTO filters)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var reportResult = await _reportService.GetTaskCompletionReportAsync(
            filters.DateRangeStart, filters.DateRangeEnd, filters.EmployeeId,
            filters.TaskPriorityLevel, filters.TaskStatus, filters.TaskCategory,
            requestUserId, requestUserRole, requestUserDepartmentId);

        if (!reportResult.IsSuccess)
            return NotFound(reportResult);

        var exportResult = await _reportService.ExportTaskCompletionReportAsync(
            reportResult.Data!, filters.ExportFormat);

        if (!exportResult.IsSuccess)
            return BadRequest(exportResult);

        var parts = exportResult.Message.Split('|');
        var fileName = parts.Length > 1 ? parts[1] : "TaskCompletionReport.xlsx";
        var contentType = parts.Length > 2 ? parts[2] : "application/octet-stream";

        return File(exportResult.Data!, contentType, fileName);
    }

    [HttpGet("financial")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> GetFinancialReport(
        [FromQuery] DateTime? dateRangeStart = null,
        [FromQuery] DateTime? dateRangeEnd = null,
        [FromQuery] Guid? departmentId = null,
        [FromQuery] Guid? employeeId = null,
        [FromQuery] string? fiscalPeriod = null)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var result = await _reportService.GetFinancialReportAsync(
            dateRangeStart, dateRangeEnd, departmentId, employeeId, fiscalPeriod,
            requestUserId, requestUserRole, requestUserDepartmentId);

        if (!result.IsSuccess)
            return NotFound(result);

        return Ok(result);
    }

    [HttpPost("financial/export")]
    [Authorize(Policy = AuthorizationPolicies.CoordinatorAndAbove)]
    public async Task<IActionResult> ExportFinancialReport([FromBody] FinancialReportFilterDTO filters)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userRoleStr = User.FindFirst(ClaimTypes.Role)?.Value;

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var requestUserId))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid user token"));

        if (!Enum.TryParse<UserRole>(userRoleStr, true, out var requestUserRole))
            return Unauthorized(ApiResponseDTO<object>.Failure("Invalid role"));

        Guid? requestUserDepartmentId = null;
        if (requestUserRole == UserRole.Coordinator)
        {
            var user = await _db.Users.FindAsync(requestUserId);
            requestUserDepartmentId = user?.DepartmentId;
        }

        var reportResult = await _reportService.GetFinancialReportAsync(
            filters.DateRangeStart, filters.DateRangeEnd, filters.DepartmentId,
            filters.EmployeeId, filters.FiscalPeriod,
            requestUserId, requestUserRole, requestUserDepartmentId);

        if (!reportResult.IsSuccess)
            return NotFound(reportResult);

        var exportResult = await _reportService.ExportFinancialReportAsync(
            reportResult.Data!, filters.ExportFormat);

        if (!exportResult.IsSuccess)
            return BadRequest(exportResult);

        var parts = exportResult.Message.Split('|');
        var fileName = parts.Length > 1 ? parts[1] : "FinancialReport_FOMS.xlsx";
        var contentType = parts.Length > 2 ? parts[2] : "application/octet-stream";

        return File(exportResult.Data!, contentType, fileName);
    }
}
