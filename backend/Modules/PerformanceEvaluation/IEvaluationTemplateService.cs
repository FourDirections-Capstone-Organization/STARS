using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.PerformanceEvaluation;

/// <summary>
/// Service for managing evaluation templates, sections, criteria, and rating bands.
/// Enforces weight sum constraints (100±0.5%), at most one KPI section, non-overlapping rating bands,
/// and guards against mutations when templates are actively in use by non-Draft reviews.
/// </summary>
public interface IEvaluationTemplateService
{
    /// <summary>
    /// Validates an evaluation template configuration against STARS domain rules:
    /// - Section weights sum to 100±0.5%
    /// - Criterion weights within each section sum to 100±0.5%
    /// - At most one KPI section per template
    /// - Non-overlapping rating band score intervals
    /// </summary>
    TemplateValidationResult ValidateTemplate(EvaluationTemplate template);

    /// <summary>
    /// Creates and persists a new evaluation template after domain validation.
    /// </summary>
    Task<TemplateServiceResult<EvaluationTemplate>> CreateTemplateAsync(
        EvaluationTemplate template,
        Guid userId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Retrieves an evaluation template by ID including sections, criteria, and rating bands.
    /// </summary>
    Task<EvaluationTemplate?> GetTemplateByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Lists evaluation templates with optional filtering by active status, department, and target role.
    /// </summary>
    Task<IReadOnlyList<EvaluationTemplate>> GetAllTemplatesAsync(
        bool? activeOnly = null,
        Guid? departmentId = null,
        string? targetRole = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates an existing template. Blocked if the template is in use by any non-Draft performance review.
    /// </summary>
    Task<TemplateServiceResult<EvaluationTemplate>> UpdateTemplateAsync(
        Guid id,
        EvaluationTemplate updatedTemplate,
        Guid userId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes or deactivates a template. Blocked if the template is in use by any non-Draft performance review.
    /// </summary>
    Task<TemplateServiceResult<bool>> DeleteTemplateAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns true if the template is associated with any review that is NOT in Draft status
    /// (e.g. SelfAssessment, ManagerReview, HrReview, Acknowledgment, Finalized).
    /// </summary>
    Task<bool> IsTemplateInUseByNonDraftReviewsAsync(
        Guid templateId,
        CancellationToken cancellationToken = default);
}

