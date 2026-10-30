using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Modules.Analytics;
using Backend.Models.Enums;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
[Route("api/kpi")]
[Authorize]
public class KpiController : ControllerBase
{
    private readonly IKpiCalculationEngine _kpiCalculationEngine;
    private readonly AppDbContext _db;
    private readonly ILogger<KpiController> _logger;
    private readonly ISafeFormulaParser _safeFormulaParser;
    private readonly IKpiVariableRegistry _variableRegistry;
    private readonly IKpiExportService _kpiExportService;

    public KpiController(
        IKpiCalculationEngine kpiCalculationEngine,
        AppDbContext db,
        ILogger<KpiController> logger,
        ISafeFormulaParser? safeFormulaParser = null,
        IKpiVariableRegistry? variableRegistry = null,
        IKpiExportService? kpiExportService = null)
    {
        _kpiCalculationEngine = kpiCalculationEngine;
        _db = db;
        _logger = logger;
        _safeFormulaParser = safeFormulaParser ?? new SafeFormulaParser();
        _variableRegistry = variableRegistry ?? new KpiVariableRegistry();
        _kpiExportService = kpiExportService ?? new KpiExportService();
    }

    #region Evaluation Endpoints

    /// <summary>
    /// Evaluates KPI metrics for a specified employee over a timeframe using query parameters.
    /// </summary>
    [HttpGet("evaluate")]
    public async Task<IActionResult> EvaluateEmployeeKpi(
        [FromQuery] KpiEvaluationRequestDTO request,
        CancellationToken cancellationToken = default)
    {
        if (request == null || !request.EmployeeId.HasValue || request.EmployeeId.Value == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure("Employee ID is required."));
        }

        if (!CanAccessEmployeeData(request.EmployeeId.Value))
        {
            return StatusCode(StatusCodes.Status403Forbidden, ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure(
                "Forbidden: You do not have permission to view another employee's KPI evaluation."));
        }

        var endDate = request.EndDate ?? DateTime.UtcNow;
        var startDate = request.StartDate ?? endDate.AddDays(-30);

        try
        {
            var result = await _kpiCalculationEngine.CalculateEmployeeKpiAsync(
                request.EmployeeId.Value,
                startDate,
                endDate,
                request.ConfigurationId,
                cancellationToken);

            return Ok(ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Success(
                result,
                "Employee KPI evaluation calculated successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Employee not found for KPI evaluation: {EmployeeId}", request.EmployeeId);
            return NotFound(ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure(ex.Message));
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid argument for KPI evaluation: {Message}", ex.Message);
            return BadRequest(ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error evaluating KPI for employee {EmployeeId}", request.EmployeeId);
            return StatusCode(500, ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure(
                "An unexpected error occurred while calculating KPI evaluation."));
        }
    }

    /// <summary>
    /// Evaluates KPI metrics for a specified employee over a timeframe using route parameter.
    /// </summary>
    [HttpGet("evaluate/{employeeId:guid}")]
    [HttpGet("employee/{employeeId:guid}")]
    public async Task<IActionResult> EvaluateEmployeeKpiByRoute(
        [FromRoute] Guid employeeId,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        var request = new KpiEvaluationRequestDTO
        {
            EmployeeId = employeeId,
            StartDate = startDate,
            EndDate = endDate,
            ConfigurationId = configurationId
        };

        return await EvaluateEmployeeKpi(request, cancellationToken);
    }

    /// <summary>
    /// Retrieves the KPI scorecard for the authenticated employee over a timeframe.
    /// </summary>
    [HttpGet("my-scorecard")]
    [HttpGet("scorecard")]
    public async Task<IActionResult> GetMyScorecard(
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        var currentUserId = GetCurrentUserId();
        if (!currentUserId.HasValue)
        {
            return Unauthorized(ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure("User is not authenticated."));
        }

        var endDateResolved = endDate ?? DateTime.UtcNow;
        var startDateResolved = startDate ?? endDateResolved.AddDays(-30);
        if (startDateResolved > endDateResolved)
        {
            (startDateResolved, endDateResolved) = (endDateResolved, startDateResolved);
        }

        try
        {
            var result = await _kpiCalculationEngine.CalculateEmployeeKpiAsync(
                currentUserId.Value,
                startDateResolved,
                endDateResolved,
                configurationId,
                cancellationToken);

            return Ok(ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Success(
                result,
                "Employee scorecard retrieved successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Employee not found for scorecard: {EmployeeId}", currentUserId);
            return NotFound(ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error retrieving scorecard for employee {EmployeeId}", currentUserId);
            return StatusCode(500, ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure(
                "An unexpected error occurred while retrieving employee scorecard."));
        }
    }

    /// <summary>
    /// Retrieves the KPI scorecard for a specific employee (requires Manager role or self-access).
    /// </summary>
    [HttpGet("scorecard/{employeeId:guid}")]
    public async Task<IActionResult> GetEmployeeScorecard(
        [FromRoute] Guid employeeId,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        if (employeeId == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure("Employee ID is required."));
        }

        if (!CanAccessEmployeeData(employeeId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, ApiResponseDTO<EmployeeKpiEvaluationResultDTO>.Failure(
                "Forbidden: You do not have permission to view another employee's KPI scorecard."));
        }

        return await EvaluateEmployeeKpiByRoute(employeeId, startDate, endDate, configurationId, cancellationToken);
    }

    /// <summary>
    /// Exports an employee's scorecard to PDF or Excel.
    /// Non-managers may only export their own scorecard.
    /// </summary>
    [HttpGet("export/scorecard")]
    [HttpGet("scorecard/export")]
    public async Task<IActionResult> ExportEmployeeScorecard(
        [FromQuery] Guid? employeeId = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Guid? configurationId = null,
        [FromQuery] string? format = "pdf",
        CancellationToken cancellationToken = default)
    {
        var targetEmployeeId = employeeId ?? GetCurrentUserId();
        if (!targetEmployeeId.HasValue || targetEmployeeId.Value == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<object>.Failure("Employee ID is required or user must be authenticated."));
        }

        if (!CanAccessEmployeeData(targetEmployeeId.Value))
        {
            return StatusCode(StatusCodes.Status403Forbidden, ApiResponseDTO<object>.Failure(
                "Forbidden: You do not have permission to export another employee's KPI scorecard."));
        }

        var endDateResolved = endDate ?? DateTime.UtcNow;
        var startDateResolved = startDate ?? endDateResolved.AddDays(-30);
        if (startDateResolved > endDateResolved)
        {
            (startDateResolved, endDateResolved) = (endDateResolved, startDateResolved);
        }

        try
        {
            var scorecard = await _kpiCalculationEngine.CalculateEmployeeKpiAsync(
                targetEmployeeId.Value,
                startDateResolved,
                endDateResolved,
                configurationId,
                cancellationToken);

            var exportFormat = (format ?? "pdf").Trim().ToLowerInvariant();
            var sanitizedName = SanitizeFileName(scorecard.EmployeeName);
            var dateSuffix = DateTime.UtcNow.ToString("yyyyMMdd");

            if (exportFormat == "pdf")
            {
                var pdfBytes = _kpiExportService.ExportEmployeeScorecardPdf(scorecard);
                return File(pdfBytes, "application/pdf", $"Scorecard_{sanitizedName}_{dateSuffix}.pdf");
            }
            else if (exportFormat is "excel" or "xlsx")
            {
                var excelBytes = _kpiExportService.ExportEmployeeScorecardExcel(scorecard);
                return File(excelBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"Scorecard_{sanitizedName}_{dateSuffix}.xlsx");
            }
            else
            {
                return BadRequest(ApiResponseDTO<object>.Failure("Invalid export format. Supported formats are 'pdf' and 'excel'."));
            }
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Employee not found for scorecard export: {EmployeeId}", targetEmployeeId);
            return NotFound(ApiResponseDTO<object>.Failure(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error exporting scorecard for employee {EmployeeId}", targetEmployeeId);
            return StatusCode(500, ApiResponseDTO<object>.Failure(
                "An unexpected error occurred while generating scorecard export."));
        }
    }

    /// <summary>
    /// Exports hierarchical scope KPI results to PDF or Excel (Manager only).
    /// </summary>
    [HttpGet("export/scope")]
    [HttpGet("scope/export")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> ExportHierarchyScope(
        [FromQuery] KpiScopeFilterDTO? filter = null,
        [FromQuery] string? format = "pdf",
        CancellationToken cancellationToken = default)
    {
        filter ??= new KpiScopeFilterDTO();

        var (roleValid, parsedRole, roleError) = TryParseRole(filter.Role);
        if (!roleValid)
        {
            return BadRequest(ApiResponseDTO<object>.Failure(roleError!));
        }

        var endDate = filter.EndDate ?? DateTime.UtcNow;
        var startDate = filter.StartDate ?? endDate.AddDays(-30);
        if (startDate > endDate)
        {
            (startDate, endDate) = (endDate, startDate);
        }

        try
        {
            KpiHierarchyScopeResultDTO scopeResult;

            if (filter.EmployeeId.HasValue)
            {
                var empResult = await _kpiCalculationEngine.CalculateEmployeeKpiAsync(
                    filter.EmployeeId.Value,
                    startDate,
                    endDate,
                    filter.ConfigurationId,
                    cancellationToken);

                scopeResult = new KpiHierarchyScopeResultDTO
                {
                    ScopeLevel = "Employee",
                    ScopeId = empResult.EmployeeId,
                    ScopeName = empResult.EmployeeName,
                    ParentScopeId = empResult.DepartmentId,
                    ParentScopeName = empResult.DepartmentName,
                    PeriodStart = empResult.PeriodStart,
                    PeriodEnd = empResult.PeriodEnd,
                    RoleFilter = parsedRole?.ToString() ?? empResult.Role,
                    ConfigurationId = empResult.ConfigurationId,
                    ConfigurationTitle = empResult.ConfigurationTitle,
                    TotalDepartments = empResult.DepartmentId.HasValue ? 1 : 0,
                    TotalTeams = 0,
                    TotalEmployees = 1,
                    TotalAssignedTasks = empResult.TotalAssignedTasks,
                    CompletedTasksCount = empResult.CompletedTasksCount,
                    OnTimeTasksCount = empResult.OnTimeTasksCount,
                    InFullTasksCount = empResult.InFullTasksCount,
                    OtifTasksCount = empResult.OtifTasksCount,
                    ReworkTasksCount = empResult.ReworkTasksCount,
                    AccurateTasksCount = empResult.AccurateTasksCount,
                    TotalHandlingHours = empResult.TotalHandlingHours,
                    OverallScore = empResult.OverallScore,
                    AverageEmployeeScore = empResult.OverallScore,
                    OverallRating = empResult.OverallRating,
                    Metrics = empResult.Metrics,
                    Employees = new List<EmployeeKpiEvaluationResultDTO> { empResult }
                };
            }
            else
            {
                scopeResult = await _kpiCalculationEngine.CalculateHierarchicalScopeAsync(
                    filter.DepartmentId,
                    filter.TeamId,
                    startDate,
                    endDate,
                    parsedRole,
                    filter.ConfigurationId,
                    cancellationToken);
            }

            var exportFormat = (format ?? "pdf").Trim().ToLowerInvariant();
            var dateSuffix = DateTime.UtcNow.ToString("yyyyMMdd");
            var safeScope = SanitizeFileName($"{scopeResult.ScopeLevel}_{scopeResult.ScopeName}");

            if (exportFormat == "pdf")
            {
                var pdfBytes = _kpiExportService.ExportHierarchyScopePdf(scopeResult);
                return File(pdfBytes, "application/pdf", $"KpiScope_{safeScope}_{dateSuffix}.pdf");
            }
            else if (exportFormat is "excel" or "xlsx")
            {
                var excelBytes = _kpiExportService.ExportHierarchyScopeExcel(scopeResult);
                return File(excelBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"KpiScope_{safeScope}_{dateSuffix}.xlsx");
            }
            else
            {
                return BadRequest(ApiResponseDTO<object>.Failure("Invalid export format. Supported formats are 'pdf' and 'excel'."));
            }
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Entity not found for scope export.");
            return NotFound(ApiResponseDTO<object>.Failure(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error generating scope export.");
            return StatusCode(500, ApiResponseDTO<object>.Failure(
                "An unexpected error occurred while generating scope export."));
        }
    }

    /// <summary>
    /// Evaluates KPI metrics hierarchically across Company, Department, Team, or Employee scope with optional role and timeframe filters.
    /// </summary>
    [HttpGet("scope")]
    [HttpGet("hierarchy")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> EvaluateHierarchicalScope(
        [FromQuery] KpiScopeFilterDTO? filter = null,
        CancellationToken cancellationToken = default)
    {
        filter ??= new KpiScopeFilterDTO();

        if (filter.DepartmentId.HasValue && filter.DepartmentId.Value == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<KpiHierarchyScopeResultDTO>.Failure("Department ID cannot be an empty GUID."));
        }

        if (filter.TeamId.HasValue && filter.TeamId.Value == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<KpiHierarchyScopeResultDTO>.Failure("Team ID cannot be an empty GUID."));
        }

        if (filter.EmployeeId.HasValue && filter.EmployeeId.Value == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<KpiHierarchyScopeResultDTO>.Failure("Employee ID cannot be an empty GUID."));
        }

        var (roleValid, parsedRole, roleError) = TryParseRole(filter.Role);
        if (!roleValid)
        {
            return BadRequest(ApiResponseDTO<KpiHierarchyScopeResultDTO>.Failure(roleError!));
        }

        var endDate = filter.EndDate ?? DateTime.UtcNow;
        var startDate = filter.StartDate ?? endDate.AddDays(-30);
        if (startDate > endDate)
        {
            (startDate, endDate) = (endDate, startDate);
        }

        try
        {
            if (filter.EmployeeId.HasValue)
            {
                var empResult = await _kpiCalculationEngine.CalculateEmployeeKpiAsync(
                    filter.EmployeeId.Value,
                    startDate,
                    endDate,
                    filter.ConfigurationId,
                    cancellationToken);

                var scopeResult = new KpiHierarchyScopeResultDTO
                {
                    ScopeLevel = "Employee",
                    ScopeId = empResult.EmployeeId,
                    ScopeName = empResult.EmployeeName,
                    ParentScopeId = empResult.DepartmentId,
                    ParentScopeName = empResult.DepartmentName,
                    PeriodStart = empResult.PeriodStart,
                    PeriodEnd = empResult.PeriodEnd,
                    RoleFilter = parsedRole?.ToString() ?? empResult.Role,
                    ConfigurationId = empResult.ConfigurationId,
                    ConfigurationTitle = empResult.ConfigurationTitle,
                    TotalDepartments = empResult.DepartmentId.HasValue ? 1 : 0,
                    TotalTeams = 0,
                    TotalEmployees = 1,
                    TotalAssignedTasks = empResult.TotalAssignedTasks,
                    CompletedTasksCount = empResult.CompletedTasksCount,
                    OnTimeTasksCount = empResult.OnTimeTasksCount,
                    InFullTasksCount = empResult.InFullTasksCount,
                    OtifTasksCount = empResult.OtifTasksCount,
                    ReworkTasksCount = empResult.ReworkTasksCount,
                    AccurateTasksCount = empResult.AccurateTasksCount,
                    TotalHandlingHours = empResult.TotalHandlingHours,
                    OverallScore = empResult.OverallScore,
                    AverageEmployeeScore = empResult.OverallScore,
                    OverallRating = empResult.OverallRating,
                    Metrics = empResult.Metrics,
                    Employees = new List<EmployeeKpiEvaluationResultDTO> { empResult }
                };

                return Ok(ApiResponseDTO<KpiHierarchyScopeResultDTO>.Success(
                    scopeResult,
                    "Hierarchical KPI evaluation calculated successfully."));
            }

            var result = await _kpiCalculationEngine.CalculateHierarchicalScopeAsync(
                filter.DepartmentId,
                filter.TeamId,
                startDate,
                endDate,
                parsedRole,
                filter.ConfigurationId,
                cancellationToken);

            return Ok(ApiResponseDTO<KpiHierarchyScopeResultDTO>.Success(
                result,
                "Hierarchical KPI evaluation calculated successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Scope target not found for KPI evaluation: {Message}", ex.Message);
            return NotFound(ApiResponseDTO<KpiHierarchyScopeResultDTO>.Failure(ex.Message));
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid argument for KPI scope evaluation: {Message}", ex.Message);
            return BadRequest(ApiResponseDTO<KpiHierarchyScopeResultDTO>.Failure(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error evaluating KPI scope hierarchy.");
            return StatusCode(500, ApiResponseDTO<KpiHierarchyScopeResultDTO>.Failure(
                "An unexpected error occurred while calculating hierarchical KPI evaluation."));
        }
    }

    /// <summary>
    /// Evaluates KPI metrics aggregated for a specific department with optional role, timeframe, and configuration filters.
    /// </summary>
    [HttpGet("department/{departmentId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> EvaluateDepartmentKpi(
        [FromRoute] Guid departmentId,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] string? role = null,
        [FromQuery] Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        if (departmentId == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<DepartmentKpiEvaluationResultDTO>.Failure("Department ID is required."));
        }

        var (roleValid, parsedRole, roleError) = TryParseRole(role);
        if (!roleValid)
        {
            return BadRequest(ApiResponseDTO<DepartmentKpiEvaluationResultDTO>.Failure(roleError!));
        }

        var normalizedEnd = endDate ?? DateTime.UtcNow;
        var normalizedStart = startDate ?? normalizedEnd.AddDays(-30);
        if (normalizedStart > normalizedEnd)
        {
            (normalizedStart, normalizedEnd) = (normalizedEnd, normalizedStart);
        }

        try
        {
            var result = await _kpiCalculationEngine.CalculateDepartmentKpiAsync(
                departmentId,
                normalizedStart,
                normalizedEnd,
                parsedRole,
                configurationId,
                cancellationToken);

            return Ok(ApiResponseDTO<DepartmentKpiEvaluationResultDTO>.Success(
                result,
                "Department KPI evaluation calculated successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Department not found for KPI evaluation: {DepartmentId}", departmentId);
            return NotFound(ApiResponseDTO<DepartmentKpiEvaluationResultDTO>.Failure(ex.Message));
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid argument for department KPI evaluation: {Message}", ex.Message);
            return BadRequest(ApiResponseDTO<DepartmentKpiEvaluationResultDTO>.Failure(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error evaluating KPI for department {DepartmentId}", departmentId);
            return StatusCode(500, ApiResponseDTO<DepartmentKpiEvaluationResultDTO>.Failure(
                "An unexpected error occurred while calculating department KPI evaluation."));
        }
    }

    /// <summary>
    /// Evaluates KPI metrics aggregated for a specific team with optional role, timeframe, and configuration filters.
    /// </summary>
    [HttpGet("team/{teamId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> EvaluateTeamKpi(
        [FromRoute] Guid teamId,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] string? role = null,
        [FromQuery] Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        if (teamId == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<TeamKpiEvaluationResultDTO>.Failure("Team ID is required."));
        }

        var (roleValid, parsedRole, roleError) = TryParseRole(role);
        if (!roleValid)
        {
            return BadRequest(ApiResponseDTO<TeamKpiEvaluationResultDTO>.Failure(roleError!));
        }

        var normalizedEnd = endDate ?? DateTime.UtcNow;
        var normalizedStart = startDate ?? normalizedEnd.AddDays(-30);
        if (normalizedStart > normalizedEnd)
        {
            (normalizedStart, normalizedEnd) = (normalizedEnd, normalizedStart);
        }

        try
        {
            var result = await _kpiCalculationEngine.CalculateTeamKpiAsync(
                teamId,
                normalizedStart,
                normalizedEnd,
                parsedRole,
                configurationId,
                cancellationToken);

            return Ok(ApiResponseDTO<TeamKpiEvaluationResultDTO>.Success(
                result,
                "Team KPI evaluation calculated successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Team not found for KPI evaluation: {TeamId}", teamId);
            return NotFound(ApiResponseDTO<TeamKpiEvaluationResultDTO>.Failure(ex.Message));
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid argument for team KPI evaluation: {Message}", ex.Message);
            return BadRequest(ApiResponseDTO<TeamKpiEvaluationResultDTO>.Failure(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error evaluating KPI for team {TeamId}", teamId);
            return StatusCode(500, ApiResponseDTO<TeamKpiEvaluationResultDTO>.Failure(
                "An unexpected error occurred while calculating team KPI evaluation."));
        }
    }

    #endregion

    #region Manager Configuration CRUD Endpoints

    /// <summary>
    /// Retrieves all KPI configurations with optional filtering by department, target role, or active status.
    /// </summary>
    [HttpGet("configurations")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> GetAllConfigurations(
        [FromQuery] Guid? departmentId = null,
        [FromQuery] string? targetRole = null,
        [FromQuery] bool? isActive = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var query = _db.KpiConfigurations
                .Include(c => c.Department)
                .Include(c => c.CreatedBy)
                .Include(c => c.Items)
                .AsNoTracking();

            if (departmentId.HasValue)
            {
                query = query.Where(c => c.DepartmentId == departmentId.Value);
            }

            if (!string.IsNullOrWhiteSpace(targetRole))
            {
                var roleTrim = targetRole.Trim();
                query = query.Where(c => c.TargetRole != null && c.TargetRole.ToLower() == roleTrim.ToLower());
            }

            if (isActive.HasValue)
            {
                query = query.Where(c => c.IsActive == isActive.Value);
            }

            var configs = await query
                .OrderByDescending(c => c.EffectiveStartDate)
                .ThenBy(c => c.Title)
                .ToListAsync(cancellationToken);

            var result = configs.Select(MapToResponseDTO).ToList();

            return Ok(ApiResponseDTO<List<KpiConfigurationResponseDTO>>.Success(
                result,
                "KPI configurations retrieved successfully."));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error retrieving KPI configurations.");
            return StatusCode(500, ApiResponseDTO<List<KpiConfigurationResponseDTO>>.Failure(
                "An unexpected error occurred while retrieving KPI configurations."));
        }
    }

    /// <summary>
    /// Retrieves a specific KPI configuration by its unique identifier.
    /// </summary>
    [HttpGet("configurations/{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> GetConfigurationById(
        [FromRoute] Guid id,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var config = await _db.KpiConfigurations
                .Include(c => c.Department)
                .Include(c => c.CreatedBy)
                .Include(c => c.Items)
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (config == null)
            {
                return NotFound(ApiResponseDTO<KpiConfigurationResponseDTO>.Failure(
                    $"KPI configuration with ID '{id}' was not found."));
            }

            return Ok(ApiResponseDTO<KpiConfigurationResponseDTO>.Success(
                MapToResponseDTO(config),
                "KPI configuration retrieved successfully."));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error retrieving KPI configuration {ConfigurationId}.", id);
            return StatusCode(500, ApiResponseDTO<KpiConfigurationResponseDTO>.Failure(
                "An unexpected error occurred while retrieving the KPI configuration."));
        }
    }

    /// <summary>
    /// Creates a new prospective KPI configuration with weighted items and thresholds.
    /// </summary>
    [HttpPost("configurations")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> CreateConfiguration(
        [FromBody] KpiConfigurationRequestDTO request,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            return BadRequest(ApiResponseDTO<KpiConfigurationResponseDTO>.Failure("Configuration request body is required."));
        }

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);
        if (!isValid)
        {
            return BadRequest(ApiResponseDTO<KpiConfigurationResponseDTO>.Failure(
                "Validation failed: " + string.Join("; ", errors)));
        }

        try
        {
            if (request.DepartmentId.HasValue)
            {
                var departmentExists = await _db.Departments
                    .AnyAsync(d => d.Id == request.DepartmentId.Value, cancellationToken);

                if (!departmentExists)
                {
                    return BadRequest(ApiResponseDTO<KpiConfigurationResponseDTO>.Failure(
                        $"Department with ID '{request.DepartmentId.Value}' does not exist."));
                }
            }

            var creatorId = GetCurrentUserId();
            var now = DateTime.UtcNow;

            var configId = Guid.NewGuid();
            var newConfig = new KpiConfiguration
            {
                Id = configId,
                Title = request.Title.Trim(),
                Description = request.Description?.Trim(),
                TargetRole = request.TargetRole?.Trim(),
                DepartmentId = request.DepartmentId,
                EffectiveStartDate = DateTime.SpecifyKind(request.EffectiveStartDate, DateTimeKind.Utc),
                EffectiveEndDate = request.EffectiveEndDate.HasValue
                    ? DateTime.SpecifyKind(request.EffectiveEndDate.Value, DateTimeKind.Utc)
                    : null,
                IsActive = request.IsActive,
                OverallGreenThreshold = request.OverallGreenThreshold,
                OverallAmberThreshold = request.OverallAmberThreshold,
                OverallRedThreshold = request.OverallRedThreshold,
                CreatedById = creatorId,
                CreatedAt = now,
                UpdatedAt = now,
                Items = request.Items.Select((item, idx) => new KpiItem
                {
                    Id = (item.Id.HasValue && item.Id.Value != Guid.Empty) ? item.Id.Value : Guid.NewGuid(),
                    KpiConfigurationId = configId,
                    Name = item.Name.Trim(),
                    MetricCode = item.MetricCode.Trim().ToUpperInvariant(),
                    Description = item.Description?.Trim(),
                    Weight = item.Weight,
                    Unit = string.IsNullOrWhiteSpace(item.Unit) ? "%" : item.Unit.Trim(),
                    TargetValue = item.TargetValue,
                    GreenThreshold = item.GreenThreshold,
                    AmberThreshold = item.AmberThreshold,
                    RedThreshold = item.RedThreshold,
                    IsLowerBetter = item.IsLowerBetter,
                    IsCustomFormula = item.IsCustomFormula,
                    CustomFormula = item.CustomFormula,
                    Order = item.Order > 0 ? item.Order : idx + 1,
                    CreatedAt = now,
                    UpdatedAt = now
                }).ToList()
            };

            _db.KpiConfigurations.Add(newConfig);
            var entries = string.Join("; ", _db.ChangeTracker.Entries().Select(e => $"{e.Entity.GetType().Name}[{e.Property("Id").CurrentValue}]={e.State}"));
            _logger.LogWarning("TRACKED ENTRIES: {Entries}", entries);
            try {
                await _db.SaveChangesAsync(cancellationToken);
            } catch (Exception ex) {
                throw new Exception($"TRACKED: {entries} | EX: {ex.Message}");
            }

            // Reload entity with navigation properties for response
            var createdConfig = await _db.KpiConfigurations
                .Include(c => c.Department)
                .Include(c => c.CreatedBy)
                .Include(c => c.Items)
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == newConfig.Id, cancellationToken);

            var responseDto = MapToResponseDTO(createdConfig ?? newConfig);

            return CreatedAtAction(
                nameof(GetConfigurationById),
                new { id = newConfig.Id },
                ApiResponseDTO<KpiConfigurationResponseDTO>.Success(
                    responseDto,
                    "KPI configuration created successfully."));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error creating KPI configuration.");
            return StatusCode(500, ApiResponseDTO<KpiConfigurationResponseDTO>.Failure(
                "An unexpected error occurred while creating the KPI configuration."));
        }
    }

    /// <summary>
    /// Updates an existing KPI configuration and its items.
    /// </summary>
    [HttpPut("configurations/{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> UpdateConfiguration(
        [FromRoute] Guid id,
        [FromBody] KpiConfigurationRequestDTO request,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            return BadRequest(ApiResponseDTO<KpiConfigurationResponseDTO>.Failure("Configuration request body is required."));
        }

        var (isValid, errors) = KpiConfigurationValidator.ValidateConfiguration(request);
        if (!isValid)
        {
            return BadRequest(ApiResponseDTO<KpiConfigurationResponseDTO>.Failure(
                "Validation failed: " + string.Join("; ", errors)));
        }

        try
        {
            var existingConfig = await _db.KpiConfigurations
                .Include(c => c.Items)
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (existingConfig == null)
            {
                return NotFound(ApiResponseDTO<KpiConfigurationResponseDTO>.Failure(
                    $"KPI configuration with ID '{id}' was not found."));
            }

            if (request.DepartmentId.HasValue)
            {
                var departmentExists = await _db.Departments
                    .AnyAsync(d => d.Id == request.DepartmentId.Value, cancellationToken);

                if (!departmentExists)
                {
                    return BadRequest(ApiResponseDTO<KpiConfigurationResponseDTO>.Failure(
                        $"Department with ID '{request.DepartmentId.Value}' does not exist."));
                }
            }

            var now = DateTime.UtcNow;

            existingConfig.Title = request.Title.Trim();
            existingConfig.Description = request.Description?.Trim();
            existingConfig.TargetRole = request.TargetRole?.Trim();
            existingConfig.DepartmentId = request.DepartmentId;
            existingConfig.EffectiveStartDate = DateTime.SpecifyKind(request.EffectiveStartDate, DateTimeKind.Utc);
            existingConfig.EffectiveEndDate = request.EffectiveEndDate.HasValue
                ? DateTime.SpecifyKind(request.EffectiveEndDate.Value, DateTimeKind.Utc)
                : null;
            existingConfig.IsActive = request.IsActive;
            existingConfig.OverallGreenThreshold = request.OverallGreenThreshold;
            existingConfig.OverallAmberThreshold = request.OverallAmberThreshold;
            existingConfig.OverallRedThreshold = request.OverallRedThreshold;
            existingConfig.UpdatedAt = now;

            // Replace items in database following TaskService pattern
            _db.KpiItems.RemoveRange(existingConfig.Items);

            foreach (var (item, idx) in request.Items.Select((it, i) => (it, i)))
            {
                _db.KpiItems.Add(new KpiItem
                {
                    Id = Guid.NewGuid(),
                    KpiConfigurationId = existingConfig.Id,
                    Name = item.Name.Trim(),
                    MetricCode = item.MetricCode.Trim().ToUpperInvariant(),
                    Description = item.Description?.Trim(),
                    Weight = item.Weight,
                    Unit = string.IsNullOrWhiteSpace(item.Unit) ? "%" : item.Unit.Trim(),
                    TargetValue = item.TargetValue,
                    GreenThreshold = item.GreenThreshold,
                    AmberThreshold = item.AmberThreshold,
                    RedThreshold = item.RedThreshold,
                    IsLowerBetter = item.IsLowerBetter,
                    IsCustomFormula = item.IsCustomFormula,
                    CustomFormula = item.CustomFormula,
                    Order = item.Order > 0 ? item.Order : idx + 1,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }

            await _db.SaveChangesAsync(cancellationToken);

            // Reload for navigation properties
            var updatedConfig = await _db.KpiConfigurations
                .Include(c => c.Department)
                .Include(c => c.CreatedBy)
                .Include(c => c.Items)
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            var responseDto = MapToResponseDTO(updatedConfig ?? existingConfig);

            return Ok(ApiResponseDTO<KpiConfigurationResponseDTO>.Success(
                responseDto,
                "KPI configuration updated successfully."));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error updating KPI configuration {ConfigurationId}.", id);
            return StatusCode(500, ApiResponseDTO<KpiConfigurationResponseDTO>.Failure(
                "An unexpected error occurred while updating the KPI configuration."));
        }
    }

    /// <summary>
    /// Deletes a KPI configuration by its unique identifier.
    /// The default system configuration cannot be deleted.
    /// </summary>
    [HttpDelete("configurations/{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> DeleteConfiguration(
        [FromRoute] Guid id,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (id == KpiDefaultSeeder.DefaultConfigurationId)
            {
                return BadRequest(ApiResponseDTO<object>.Failure(
                    "Cannot delete the default system KPI configuration."));
            }

            var config = await _db.KpiConfigurations
                .Include(c => c.Items)
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (config == null)
            {
                return NotFound(ApiResponseDTO<object>.Failure(
                    $"KPI configuration with ID '{id}' was not found."));
            }

            _db.KpiConfigurations.Remove(config);
            await _db.SaveChangesAsync(cancellationToken);

            return Ok(ApiResponseDTO<object>.Success(
                null,
                "KPI configuration deleted successfully."));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error deleting KPI configuration {ConfigurationId}.", id);
            return StatusCode(500, ApiResponseDTO<object>.Failure(
                "An unexpected error occurred while deleting the KPI configuration."));
        }
    }

    #endregion

    #region Custom Formula Endpoints

    /// <summary>
    /// Retrieves all whitelisted KPI variables available for custom arithmetic formulas.
    /// </summary>
    [HttpGet("variables")]
    [HttpGet("formula/variables")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public IActionResult GetFormulaVariables()
    {
        try
        {
            var variables = _variableRegistry.GetAllVariables();
            return Ok(ApiResponseDTO<IReadOnlyList<KpiVariableDefinition>>.Success(
                variables,
                "Formula variables retrieved successfully."));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error retrieving formula variables.");
            return StatusCode(500, ApiResponseDTO<IReadOnlyList<KpiVariableDefinition>>.Failure(
                "An unexpected error occurred while retrieving formula variables."));
        }
    }

    /// <summary>
    /// Dry-runs and validates a custom arithmetic formula using whitelisted variables and mock values.
    /// </summary>
    [HttpPost("formula/test")]
    [HttpPost("test-formula")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public IActionResult TestFormula([FromBody] FormulaTestRequestDTO request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Formula))
        {
            return BadRequest(ApiResponseDTO<FormulaTestResponseDTO>.Failure("Formula is required."));
        }

        try
        {
            var allowedVariables = _variableRegistry.GetAllowedVariableNames();
            var validationResult = _safeFormulaParser.Validate(request.Formula, allowedVariables);

            if (!validationResult.IsValid)
            {
                var invalidResult = new FormulaTestResponseDTO
                {
                    IsValid = false,
                    ErrorMessage = validationResult.ErrorMessage,
                    VariablesUsed = validationResult.Variables ?? Array.Empty<string>()
                };

                return Ok(ApiResponseDTO<FormulaTestResponseDTO>.Success(
                    invalidResult,
                    "Formula validation failed."));
            }

            // Build dictionary of variables for calculation using default sample values merged with provided sample values
            var defaultSamples = _variableRegistry.GetDefaultSampleValues();
            var resolvedVariables = new Dictionary<string, double>(defaultSamples, StringComparer.OrdinalIgnoreCase);

            if (request.SampleValues != null)
            {
                foreach (var (key, val) in request.SampleValues)
                {
                    resolvedVariables[key] = val;
                }
            }

            var usedVariables = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            foreach (var v in validationResult.Variables)
            {
                usedVariables[v] = resolvedVariables.TryGetValue(v, out var val) ? val : 0.0;
            }

            double calculatedValue = _safeFormulaParser.Evaluate(
                request.Formula,
                resolvedVariables,
                divisionByZeroDefault: 0.0);

            var responseDto = new FormulaTestResponseDTO
            {
                IsValid = true,
                Result = Math.Round(calculatedValue, 4),
                VariablesUsed = validationResult.Variables,
                ResolvedVariables = usedVariables
            };

            return Ok(ApiResponseDTO<FormulaTestResponseDTO>.Success(
                responseDto,
                "Formula evaluated successfully."));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error testing custom formula: {Formula}", request.Formula);
            var errorResponse = new FormulaTestResponseDTO
            {
                IsValid = false,
                ErrorMessage = ex.Message
            };

            return Ok(ApiResponseDTO<FormulaTestResponseDTO>.Success(
                errorResponse,
                "Formula evaluation error."));
        }
    }

    #endregion

    #region Helper Methods

    private static (bool IsValid, UserRole? Role, string? ErrorMessage) TryParseRole(string? roleString)
    {
        if (string.IsNullOrWhiteSpace(roleString))
        {
            return (true, null, null);
        }

        if (Enum.TryParse<UserRole>(roleString.Trim(), ignoreCase: true, out var roleVal))
        {
            return (true, roleVal, null);
        }

        return (false, null, $"Invalid role filter '{roleString}'. Valid roles: {string.Join(", ", Enum.GetNames<UserRole>())}");
    }

    private Guid? GetCurrentUserId()
    {
        if (ControllerContext?.HttpContext == null)
            return null;

        var idStr = User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(idStr, out var id) ? id : null;
    }

    private bool IsManagerOrAdmin()
    {
        if (ControllerContext?.HttpContext == null)
            return true;

        return User?.IsInRole(UserRole.Manager.ToString()) == true ||
               User?.IsInRole("Admin") == true ||
               User?.IsInRole("SystemAdmin") == true;
    }

    private bool CanAccessEmployeeData(Guid employeeId)
    {
        if (ControllerContext?.HttpContext == null)
            return true;

        if (IsManagerOrAdmin())
            return true;

        var currentUserId = GetCurrentUserId();
        return currentUserId.HasValue && currentUserId.Value == employeeId;
    }

    private static string SanitizeFileName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "Employee";

        var invalidChars = Path.GetInvalidFileNameChars();
        var clean = new string(name.Select(ch => invalidChars.Contains(ch) ? '_' : ch).ToArray());
        return clean.Replace(' ', '_');
    }

    private static KpiConfigurationResponseDTO MapToResponseDTO(KpiConfiguration config)
    {
        return new KpiConfigurationResponseDTO
        {
            Id = config.Id,
            Title = config.Title,
            Description = config.Description,
            TargetRole = config.TargetRole,
            DepartmentId = config.DepartmentId,
            DepartmentName = config.Department?.Name,
            EffectiveStartDate = config.EffectiveStartDate,
            EffectiveEndDate = config.EffectiveEndDate,
            IsActive = config.IsActive,
            OverallGreenThreshold = config.OverallGreenThreshold,
            OverallAmberThreshold = config.OverallAmberThreshold,
            OverallRedThreshold = config.OverallRedThreshold,
            CreatedById = config.CreatedById,
            CreatedByName = config.CreatedBy != null
                ? $"{config.CreatedBy.FirstName} {config.CreatedBy.LastName}".Trim()
                : null,
            CreatedAt = config.CreatedAt,
            UpdatedAt = config.UpdatedAt,
            Items = (config.Items ?? new List<KpiItem>())
                .OrderBy(i => i.Order)
                .Select(i => new KpiItemResponseDTO
                {
                    Id = i.Id,
                    KpiConfigurationId = i.KpiConfigurationId,
                    Name = i.Name,
                    MetricCode = i.MetricCode,
                    Description = i.Description,
                    Weight = i.Weight,
                    Unit = i.Unit,
                    TargetValue = i.TargetValue,
                    GreenThreshold = i.GreenThreshold,
                    AmberThreshold = i.AmberThreshold,
                    RedThreshold = i.RedThreshold,
                    IsLowerBetter = i.IsLowerBetter,
                    IsCustomFormula = i.IsCustomFormula,
                    CustomFormula = i.CustomFormula,
                    Order = i.Order,
                    CreatedAt = i.CreatedAt,
                    UpdatedAt = i.UpdatedAt
                })
                .ToList()
        };
    }

    #endregion
}
