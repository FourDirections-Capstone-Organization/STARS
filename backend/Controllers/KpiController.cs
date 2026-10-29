using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Backend.Data;
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
    private readonly AppDbContext _db;
    private readonly ILogger<KpiController> _logger;

    public KpiController(
        IKpiCalculationEngine kpiCalculationEngine,
        AppDbContext db,
        ILogger<KpiController> logger)
    {
        _kpiCalculationEngine = kpiCalculationEngine;
        _db = db;
        _logger = logger;
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

    #endregion

    #region Manager Configuration CRUD Endpoints

    /// <summary>
    /// Retrieves all KPI configurations with optional filtering by department, target role, or active status.
    /// </summary>
    [HttpGet("configurations")]
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

    #region Helper Methods

    private Guid? GetCurrentUserId()
    {
        var idStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(idStr, out var id) ? id : null;
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
