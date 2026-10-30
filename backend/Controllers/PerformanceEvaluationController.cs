using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.PerformanceEvaluation;
using Backend.Modules.RoleBasedAccessControl;

namespace Backend.Controllers;

/// <summary>
/// Controller for managing performance evaluation templates, reviews, scoring, and workflow transitions.
/// Enforces ManagerOnly policy on administrative actions and CanAccessEmployeeData guards on employee records.
/// </summary>
[ApiController]
[Route("api/performance")]
[Authorize]
public class PerformanceEvaluationController : ControllerBase
{
    private readonly IEvaluationTemplateService _templateService;
    private readonly IReviewWorkflowService _workflowService;
    private readonly IPerformanceReviewScoringService _scoringService;
    private readonly AppDbContext _context;
    private readonly ILogger<PerformanceEvaluationController> _logger;

    public PerformanceEvaluationController(
        IEvaluationTemplateService templateService,
        IReviewWorkflowService workflowService,
        IPerformanceReviewScoringService scoringService,
        AppDbContext context,
        ILogger<PerformanceEvaluationController> logger)
    {
        _templateService = templateService;
        _workflowService = workflowService;
        _scoringService = scoringService;
        _context = context;
        _logger = logger;
    }

    #region Evaluation Template Endpoints

    /// <summary>
    /// Lists all evaluation templates with optional filtering by active status, department, and target role.
    /// Restricted to Managers and Administrators.
    /// </summary>
    [HttpGet("templates")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> GetAllTemplates(
        [FromQuery] bool? activeOnly,
        [FromQuery] Guid? departmentId,
        [FromQuery] string? targetRole,
        CancellationToken cancellationToken = default)
    {
        var templates = await _templateService.GetAllTemplatesAsync(
            activeOnly, departmentId, targetRole, cancellationToken);

        return Ok(ApiResponseDTO<IReadOnlyList<EvaluationTemplate>>.Success(templates));
    }

    /// <summary>
    /// Retrieves a specific evaluation template by ID.
    /// Restricted to Managers and Administrators.
    /// </summary>
    [HttpGet("templates/{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> GetTemplateById(Guid id, CancellationToken cancellationToken = default)
    {
        var template = await _templateService.GetTemplateByIdAsync(id, cancellationToken);
        if (template == null)
        {
            return NotFound(ApiResponseDTO<EvaluationTemplate>.Failure(
                $"Evaluation template with ID '{id}' was not found."));
        }

        return Ok(ApiResponseDTO<EvaluationTemplate>.Success(template));
    }

    /// <summary>
    /// Creates and persists a new evaluation template after domain validation.
    /// Restricted to Managers and Administrators.
    /// </summary>
    [HttpPost("templates")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> CreateTemplate(
        [FromBody] EvaluationTemplate template,
        CancellationToken cancellationToken = default)
    {
        if (template == null)
        {
            return BadRequest(ApiResponseDTO<EvaluationTemplate>.Failure("Template configuration is required."));
        }

        var userId = GetCurrentUserId() ?? Guid.Empty;
        var result = await _templateService.CreateTemplateAsync(template, userId, cancellationToken);

        if (!result.IsSuccess)
        {
            var message = !string.IsNullOrWhiteSpace(result.Message)
                ? result.Message
                : string.Join("; ", result.Errors);

            return StatusCode(result.StatusCode, ApiResponseDTO<EvaluationTemplate>.Failure(message));
        }

        return CreatedAtAction(
            nameof(GetTemplateById),
            new { id = result.Data!.Id },
            ApiResponseDTO<EvaluationTemplate>.Success(result.Data, "Evaluation template created successfully."));
    }

    /// <summary>
    /// Updates an existing evaluation template. Blocked if the template is in use by non-Draft reviews.
    /// Restricted to Managers and Administrators.
    /// </summary>
    [HttpPut("templates/{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> UpdateTemplate(
        Guid id,
        [FromBody] EvaluationTemplate template,
        CancellationToken cancellationToken = default)
    {
        if (template == null)
        {
            return BadRequest(ApiResponseDTO<EvaluationTemplate>.Failure("Updated template configuration is required."));
        }

        var userId = GetCurrentUserId() ?? Guid.Empty;
        var result = await _templateService.UpdateTemplateAsync(id, template, userId, cancellationToken);

        if (!result.IsSuccess)
        {
            var message = !string.IsNullOrWhiteSpace(result.Message)
                ? result.Message
                : string.Join("; ", result.Errors);

            return StatusCode(result.StatusCode, ApiResponseDTO<EvaluationTemplate>.Failure(message));
        }

        return Ok(ApiResponseDTO<EvaluationTemplate>.Success(result.Data, "Evaluation template updated successfully."));
    }

    /// <summary>
    /// Deletes or deactivates an evaluation template. Blocked if the template is in use by non-Draft reviews.
    /// Restricted to Managers and Administrators.
    /// </summary>
    [HttpDelete("templates/{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> DeleteTemplate(Guid id, CancellationToken cancellationToken = default)
    {
        var result = await _templateService.DeleteTemplateAsync(id, cancellationToken);

        if (!result.IsSuccess)
        {
            var message = !string.IsNullOrWhiteSpace(result.Message)
                ? result.Message
                : string.Join("; ", result.Errors);

            return StatusCode(result.StatusCode, ApiResponseDTO<bool>.Failure(message));
        }

        return Ok(ApiResponseDTO<bool>.Success(true, "Evaluation template deleted successfully."));
    }

    #endregion

    #region Performance Review Endpoints

    /// <summary>
    /// Creates a new performance review in Draft status.
    /// Restricted to Managers and Administrators.
    /// </summary>
    [HttpPost("reviews")]
    [Authorize(Policy = AuthorizationPolicies.ManagerOnly)]
    public async Task<IActionResult> CreateReview(
        [FromBody] CreatePerformanceReviewDTO request,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            return BadRequest(ApiResponseDTO<PerformanceReviewSummaryDTO>.Failure("Review creation payload is required."));
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(ApiResponseDTO<PerformanceReviewSummaryDTO>.Failure("Review title is required."));
        }

        if (request.TemplateId == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<PerformanceReviewSummaryDTO>.Failure("Template ID is required."));
        }

        var template = await _templateService.GetTemplateByIdAsync(request.TemplateId, cancellationToken);
        if (template == null)
        {
            return BadRequest(ApiResponseDTO<PerformanceReviewSummaryDTO>.Failure(
                $"Evaluation template with ID '{request.TemplateId}' was not found."));
        }

        if (request.PeriodEnd < request.PeriodStart)
        {
            return BadRequest(ApiResponseDTO<PerformanceReviewSummaryDTO>.Failure(
                "Period end date cannot be earlier than period start date."));
        }

        if (request.Scope == ReviewScope.Individual && (!request.EmployeeId.HasValue || request.EmployeeId.Value == Guid.Empty))
        {
            return BadRequest(ApiResponseDTO<PerformanceReviewSummaryDTO>.Failure(
                "Employee ID is required for Individual scope reviews."));
        }

        if (request.Scope == ReviewScope.Department && (!request.DepartmentId.HasValue || request.DepartmentId.Value == Guid.Empty))
        {
            return BadRequest(ApiResponseDTO<PerformanceReviewSummaryDTO>.Failure(
                "Department ID is required for Department scope reviews."));
        }

        if (request.Scope == ReviewScope.Team && (!request.TeamId.HasValue || request.TeamId.Value == Guid.Empty))
        {
            return BadRequest(ApiResponseDTO<PerformanceReviewSummaryDTO>.Failure(
                "Team ID is required for Team scope reviews."));
        }

        var currentUserId = GetCurrentUserId();

        var review = new PerformanceReview
        {
            Id = Guid.NewGuid(),
            TemplateId = request.TemplateId,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            Scope = request.Scope,
            Status = ReviewWorkflowStatus.Draft,
            PeriodStart = request.PeriodStart,
            PeriodEnd = request.PeriodEnd,
            DepartmentId = request.DepartmentId,
            TeamId = request.TeamId,
            EmployeeId = request.EmployeeId,
            ReviewerId = request.ReviewerId ?? currentUserId,
            CreatedById = currentUserId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.PerformanceReviews.Add(review);
        await _context.SaveChangesAsync(cancellationToken);

        var summary = MapToSummaryDTO(review, template.Title);

        return CreatedAtAction(
            nameof(GetReviewById),
            new { id = review.Id },
            ApiResponseDTO<PerformanceReviewSummaryDTO>.Success(summary, "Performance review created successfully."));
    }

    /// <summary>
    /// Lists performance reviews matching status, scope, date, department, team, and employee filters.
    /// Non-managers are strictly restricted to reviews where they are evaluated.
    /// </summary>
    [HttpGet("reviews")]
    public async Task<IActionResult> GetReviews(
        [FromQuery] PerformanceReviewFilterDTO filter,
        CancellationToken cancellationToken = default)
    {
        filter ??= new PerformanceReviewFilterDTO();

        if (filter.EmployeeId.HasValue && !CanAccessEmployeeData(filter.EmployeeId.Value))
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                ApiResponseDTO<List<PerformanceReviewSummaryDTO>>.Failure(
                    "Forbidden: You do not have permission to view another employee's performance reviews."));
        }

        var query = _context.PerformanceReviews
            .AsNoTracking()
            .Include(r => r.Template)
            .Include(r => r.Department)
            .Include(r => r.Team)
            .Include(r => r.Employee)
            .Include(r => r.Reviewer)
            .Include(r => r.Ratings)
            .AsQueryable();

        if (!IsManagerOrAdmin())
        {
            var currentUserId = GetCurrentUserId();
            if (!currentUserId.HasValue)
            {
                return Unauthorized(ApiResponseDTO<List<PerformanceReviewSummaryDTO>>.Failure(
                    "User is not authenticated."));
            }

            query = query.Where(r =>
                r.EmployeeId == currentUserId.Value ||
                r.Ratings.Any(rt => rt.EmployeeId == currentUserId.Value));
        }

        if (filter.Status.HasValue)
        {
            query = query.Where(r => r.Status == filter.Status.Value);
        }

        if (filter.Scope.HasValue)
        {
            query = query.Where(r => r.Scope == filter.Scope.Value);
        }

        if (filter.StartDate.HasValue)
        {
            query = query.Where(r => r.PeriodEnd >= filter.StartDate.Value);
        }

        if (filter.EndDate.HasValue)
        {
            query = query.Where(r => r.PeriodStart <= filter.EndDate.Value);
        }

        if (filter.DepartmentId.HasValue)
        {
            query = query.Where(r => r.DepartmentId == filter.DepartmentId.Value);
        }

        if (filter.TeamId.HasValue)
        {
            query = query.Where(r => r.TeamId == filter.TeamId.Value);
        }

        if (filter.EmployeeId.HasValue)
        {
            query = query.Where(r => r.EmployeeId == filter.EmployeeId.Value);
        }

        var reviews = await query
            .OrderByDescending(r => r.PeriodEnd)
            .ThenByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        var summaries = reviews.Select(r => MapToSummaryDTO(r, r.Template?.Title ?? string.Empty)).ToList();

        return Ok(ApiResponseDTO<List<PerformanceReviewSummaryDTO>>.Success(summaries));
    }

    /// <summary>
    /// Retrieves full evaluation results for a review, including section and criterion scores.
    /// Non-managers can only access their own evaluations and peer scores are redacted.
    /// </summary>
    [HttpGet("reviews/{id:guid}")]
    public async Task<IActionResult> GetReviewById(Guid id, CancellationToken cancellationToken = default)
    {
        var review = await _context.PerformanceReviews
            .AsNoTracking()
            .Include(r => r.Ratings)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

        if (review == null)
        {
            return NotFound(ApiResponseDTO<ReviewResultDTO>.Failure(
                $"Performance review with ID '{id}' was not found."));
        }

        if (!IsManagerOrAdmin())
        {
            var currentUserId = GetCurrentUserId();
            if (!currentUserId.HasValue)
            {
                return Unauthorized(ApiResponseDTO<ReviewResultDTO>.Failure("User is not authenticated."));
            }

            if (review.Scope == ReviewScope.Individual)
            {
                if (review.EmployeeId != currentUserId.Value)
                {
                    return StatusCode(
                        StatusCodes.Status403Forbidden,
                        ApiResponseDTO<ReviewResultDTO>.Failure(
                            "Forbidden: You do not have permission to view another employee's performance review."));
                }
            }
            else
            {
                var isIncluded = review.Ratings.Any(rt => rt.EmployeeId == currentUserId.Value) ||
                                 review.EmployeeId == currentUserId.Value;

                if (!isIncluded)
                {
                    return StatusCode(
                        StatusCodes.Status403Forbidden,
                        ApiResponseDTO<ReviewResultDTO>.Failure(
                            "Forbidden: You do not have permission to view this performance review."));
                }
            }
        }

        var result = await _scoringService.CalculateReviewScoreAsync(id, cancellationToken);

        if (!IsManagerOrAdmin())
        {
            var currentUserId = GetCurrentUserId();
            result.Employees = result.Employees
                .Where(e => e.EmployeeId == currentUserId!.Value)
                .ToList();

            if (result.Employees.Count == 0)
            {
                return StatusCode(
                    StatusCodes.Status403Forbidden,
                    ApiResponseDTO<ReviewResultDTO>.Failure(
                        "Forbidden: You do not have permission to view this performance review."));
            }
        }

        return Ok(ApiResponseDTO<ReviewResultDTO>.Success(result));
    }

    /// <summary>
    /// Retrieves calculated score data for a review.
    /// If employeeId is specified or caller is a non-manager, returns EmployeeReviewScoreDTO;
    /// otherwise returns the overall ReviewResultDTO.
    /// </summary>
    [HttpGet("reviews/{id:guid}/score")]
    public async Task<IActionResult> GetReviewScore(
        Guid id,
        [FromQuery] Guid? employeeId,
        CancellationToken cancellationToken = default)
    {
        var review = await _context.PerformanceReviews
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

        if (review == null)
        {
            return NotFound(ApiResponseDTO<object>.Failure(
                $"Performance review with ID '{id}' was not found."));
        }

        if (employeeId.HasValue)
        {
            if (!CanAccessEmployeeData(employeeId.Value))
            {
                return StatusCode(
                    StatusCodes.Status403Forbidden,
                    ApiResponseDTO<object>.Failure(
                        "Forbidden: You do not have permission to view another employee's performance score."));
            }
        }
        else if (!IsManagerOrAdmin())
        {
            var currentUserId = GetCurrentUserId();
            if (!currentUserId.HasValue)
            {
                return Unauthorized(ApiResponseDTO<object>.Failure("User is not authenticated."));
            }
            employeeId = currentUserId;
        }

        var result = await _scoringService.CalculateReviewScoreAsync(id, cancellationToken);

        if (employeeId.HasValue)
        {
            var empScore = result.Employees.FirstOrDefault(e => e.EmployeeId == employeeId.Value);
            if (empScore == null)
            {
                return NotFound(ApiResponseDTO<EmployeeReviewScoreDTO>.Failure(
                    $"Employee '{employeeId.Value}' was not found in performance review '{id}'."));
            }

            return Ok(ApiResponseDTO<EmployeeReviewScoreDTO>.Success(empScore));
        }

        return Ok(ApiResponseDTO<ReviewResultDTO>.Success(result));
    }

    /// <summary>
    /// Submits or updates ratings for criteria in a review.
    /// Enforces SelfAssessment stage for self-scores and ManagerReview stage for manager-scores.
    /// Blocked when review is in Draft or Finalized status.
    /// </summary>
    [HttpPut("reviews/{id:guid}/ratings")]
    public async Task<IActionResult> UpdateRatings(
        Guid id,
        [FromBody] SubmitReviewRatingsDTO request,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            return BadRequest(ApiResponseDTO<object>.Failure("Rating submission payload is required."));
        }

        var review = await _context.PerformanceReviews
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

        if (review == null)
        {
            return NotFound(ApiResponseDTO<object>.Failure(
                $"Performance review with ID '{id}' was not found."));
        }

        if (review.Status == ReviewWorkflowStatus.Finalized)
        {
            return StatusCode(
                StatusCodes.Status422UnprocessableEntity,
                ApiResponseDTO<object>.Failure("Cannot modify ratings for a finalized performance review."));
        }

        if (review.Status == ReviewWorkflowStatus.Draft)
        {
            return StatusCode(
                StatusCodes.Status422UnprocessableEntity,
                ApiResponseDTO<object>.Failure(
                    "Ratings cannot be submitted while the review is in Draft status. Transition to SelfAssessment or ManagerReview first."));
        }

        if (review.Status != ReviewWorkflowStatus.SelfAssessment && review.Status != ReviewWorkflowStatus.ManagerReview)
        {
            return StatusCode(
                StatusCodes.Status422UnprocessableEntity,
                ApiResponseDTO<object>.Failure(
                    $"Ratings cannot be submitted while review is in '{review.Status}' stage. Ratings are only editable in SelfAssessment or ManagerReview."));
        }

        var targetEmployeeId = request.EmployeeId ?? review.EmployeeId;
        if (!targetEmployeeId.HasValue || targetEmployeeId.Value == Guid.Empty)
        {
            return BadRequest(ApiResponseDTO<object>.Failure("Employee ID is required for ratings submission."));
        }

        // Access and stage role enforcement
        if (review.Status == ReviewWorkflowStatus.SelfAssessment)
        {
            if (!CanAccessEmployeeData(targetEmployeeId.Value))
            {
                return StatusCode(
                    StatusCodes.Status403Forbidden,
                    ApiResponseDTO<object>.Failure(
                        "Forbidden: You do not have permission to submit self-assessment ratings for another employee."));
            }

            if (!IsManagerOrAdmin())
            {
                var normalizedCheck = request.GetNormalizedRatings();
                if (normalizedCheck.Any(r => r.ManagerScore.HasValue || !string.IsNullOrEmpty(r.ManagerComment)))
                {
                    return BadRequest(ApiResponseDTO<object>.Failure(
                        "Employees cannot submit manager scores or comments during self-assessment."));
                }
            }
        }
        else if (review.Status == ReviewWorkflowStatus.ManagerReview)
        {
            if (!IsManagerOrAdmin())
            {
                return StatusCode(
                    StatusCodes.Status403Forbidden,
                    ApiResponseDTO<object>.Failure(
                        "Forbidden: Only managers can submit ratings during the ManagerReview stage."));
            }
        }

        var normalizedRatings = request.GetNormalizedRatings();
        if (normalizedRatings.Count == 0)
        {
            return BadRequest(ApiResponseDTO<object>.Failure("At least one criterion rating must be provided."));
        }

        // Validate score boundaries (1.0 to 5.0 scale)
        foreach (var item in normalizedRatings)
        {
            if (item.SelfScore.HasValue && (item.SelfScore.Value < 1.0 || item.SelfScore.Value > 5.0))
            {
                return BadRequest(ApiResponseDTO<object>.Failure(
                    $"Self-score {item.SelfScore.Value} is out of bounds. Ratings must be between 1.0 and 5.0."));
            }

            if (item.ManagerScore.HasValue && (item.ManagerScore.Value < 1.0 || item.ManagerScore.Value > 5.0))
            {
                return BadRequest(ApiResponseDTO<object>.Failure(
                    $"Manager-score {item.ManagerScore.Value} is out of bounds. Ratings must be between 1.0 and 5.0."));
            }
        }

        // Upsert ratings
        foreach (var item in normalizedRatings)
        {
            var existing = await _context.CriterionRatings
                .FirstOrDefaultAsync(
                    r => r.ReviewId == id &&
                         r.EmployeeId == targetEmployeeId.Value &&
                         r.CriterionId == item.CriterionId,
                    cancellationToken);

            if (existing == null)
            {
                existing = new CriterionRating
                {
                    Id = Guid.NewGuid(),
                    ReviewId = id,
                    EmployeeId = targetEmployeeId.Value,
                    CriterionId = item.CriterionId,
                    CreatedAt = DateTime.UtcNow
                };
                _context.CriterionRatings.Add(existing);
            }

            if (review.Status == ReviewWorkflowStatus.SelfAssessment)
            {
                if (item.SelfScore.HasValue) existing.SelfScore = item.SelfScore.Value;
                if (item.SelfComment != null) existing.SelfComment = item.SelfComment;
            }
            else if (review.Status == ReviewWorkflowStatus.ManagerReview)
            {
                if (item.ManagerScore.HasValue) existing.ManagerScore = item.ManagerScore.Value;
                if (item.ManagerComment != null) existing.ManagerComment = item.ManagerComment;
            }

            existing.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync(cancellationToken);

        return Ok(ApiResponseDTO<object>.Success(null, "Ratings saved successfully."));
    }

    /// <summary>
    /// Transitions a performance review to a target workflow status.
    /// Non-managers can only submit their own self-assessment (SelfAssessment -> ManagerReview)
    /// or acknowledge their review (Acknowledgment -> Finalized).
    /// </summary>
    [HttpPost("reviews/{id:guid}/transition")]
    public async Task<IActionResult> TransitionReviewStatus(
        Guid id,
        [FromBody] ReviewStatusTransitionDTO request,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            return BadRequest(ApiResponseDTO<WorkflowTransitionResult>.Failure("Transition request payload is required."));
        }

        var review = await _context.PerformanceReviews
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

        if (review == null)
        {
            return NotFound(ApiResponseDTO<WorkflowTransitionResult>.Failure(
                $"Performance review with ID '{id}' was not found."));
        }

        if (!IsManagerOrAdmin())
        {
            if (review.EmployeeId.HasValue && !CanAccessEmployeeData(review.EmployeeId.Value))
            {
                return StatusCode(
                    StatusCodes.Status403Forbidden,
                    ApiResponseDTO<WorkflowTransitionResult>.Failure(
                        "Forbidden: You do not have permission to transition another employee's performance review."));
            }

            // Non-managers may only submit self-assessment or acknowledge review
            var isPermittedNonManagerTransition =
                (review.Status == ReviewWorkflowStatus.SelfAssessment && request.TargetStatus == ReviewWorkflowStatus.ManagerReview) ||
                (review.Status == ReviewWorkflowStatus.Acknowledgment && request.TargetStatus == ReviewWorkflowStatus.Finalized);

            if (!isPermittedNonManagerTransition)
            {
                return StatusCode(
                    StatusCodes.Status403Forbidden,
                    ApiResponseDTO<WorkflowTransitionResult>.Failure(
                        "Forbidden: Only managers can perform this workflow transition."));
            }
        }

        var currentUserId = GetCurrentUserId() ?? Guid.Empty;
        var result = await _workflowService.TransitionStatusAsync(
            id, request.TargetStatus, currentUserId, cancellationToken);

        if (!result.IsSuccess)
        {
            return StatusCode(
                result.StatusCode,
                ApiResponseDTO<WorkflowTransitionResult>.Failure(
                    result.ErrorMessage ?? "Review workflow transition failed."));
        }

        return Ok(ApiResponseDTO<WorkflowTransitionResult>.Success(
            result, $"Review transitioned to '{result.NewStatus}' successfully."));
    }

    #endregion

    #region Helper Methods

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

    private static PerformanceReviewSummaryDTO MapToSummaryDTO(PerformanceReview review, string templateTitle)
    {
        return new PerformanceReviewSummaryDTO
        {
            Id = review.Id,
            TemplateId = review.TemplateId,
            TemplateTitle = templateTitle,
            Title = review.Title,
            Description = review.Description,
            Scope = review.Scope,
            Status = review.Status,
            PeriodStart = review.PeriodStart,
            PeriodEnd = review.PeriodEnd,
            DepartmentId = review.DepartmentId,
            DepartmentName = review.Department?.Name,
            TeamId = review.TeamId,
            TeamName = review.Team?.Name,
            EmployeeId = review.EmployeeId,
            EmployeeName = review.Employee != null
                ? $"{review.Employee.FirstName} {review.Employee.LastName}".Trim()
                : null,
            ReviewerId = review.ReviewerId,
            ReviewerName = review.Reviewer != null
                ? $"{review.Reviewer.FirstName} {review.Reviewer.LastName}".Trim()
                : null,
            IsFinalized = review.Status == ReviewWorkflowStatus.Finalized,
            FinalizedAt = review.FinalizedAt,
            CreatedAt = review.CreatedAt,
            UpdatedAt = review.UpdatedAt
        };
    }

    #endregion
}
