using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Modules.Analytics;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

[ApiController]
[Route("api/kpi")]
[Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
public class KpiController : ControllerBase
{
    private readonly IKpiCalculationEngine _kpiCalculationEngine;
    private readonly ILogger<KpiController> _logger;

    public KpiController(
        IKpiCalculationEngine kpiCalculationEngine,
        ILogger<KpiController> logger)
    {
        _kpiCalculationEngine = kpiCalculationEngine;
        _logger = logger;
    }

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
}
