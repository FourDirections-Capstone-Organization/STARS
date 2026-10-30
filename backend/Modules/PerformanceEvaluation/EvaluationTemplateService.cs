using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.PerformanceEvaluation;

/// <summary>
/// Service implementing CRUD and domain rule validations for evaluation templates.
/// Validates section and criterion weight sums, single KPI section constraint,
/// non-overlapping rating bands, and prevents mutations on templates with active reviews.
/// </summary>
public class EvaluationTemplateService : IEvaluationTemplateService
{
    private readonly AppDbContext _context;
    private readonly ILogger<EvaluationTemplateService> _logger;

    public EvaluationTemplateService(
        AppDbContext context,
        ILogger<EvaluationTemplateService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <inheritdoc />
    public TemplateValidationResult ValidateTemplate(EvaluationTemplate template)
    {
        var errors = new List<string>();

        if (template == null)
        {
            return TemplateValidationResult.Fail("Template cannot be null.");
        }

        if (string.IsNullOrWhiteSpace(template.Title))
        {
            errors.Add("Template title is required.");
        }

        // Section validations
        var sections = template.Sections?.ToList() ?? new List<EvaluationSection>();
        if (sections.Count == 0)
        {
            errors.Add("Template must contain at least one evaluation section.");
        }
        else
        {
            // Validate section weights sum to 100% ± 0.5%
            var totalSectionWeight = sections.Sum(s => s.Weight);
            if (Math.Abs(totalSectionWeight - 100.0) > 0.5)
            {
                errors.Add($"Total section weight must sum to 100% (±0.5%). Current sum: {Math.Round(totalSectionWeight, 2)}%.");
            }

            // At most one KPI section per template
            var kpiSectionCount = sections.Count(s => s.IsKpiSection);
            if (kpiSectionCount > 1)
            {
                errors.Add($"At most one KPI section is permitted per evaluation template. Found {kpiSectionCount} KPI sections.");
            }

            // Validate individual sections & criterion weights
            foreach (var section in sections)
            {
                if (section.Weight < 0)
                {
                    errors.Add($"Section '{section.Title}' has invalid negative weight: {section.Weight}%.");
                }

                var criteria = section.Criteria?.ToList() ?? new List<EvaluationCriterion>();
                if (!section.IsKpiSection)
                {
                    if (criteria.Count == 0)
                    {
                        errors.Add($"Standard section '{section.Title}' must contain at least one evaluation criterion.");
                    }
                    else
                    {
                        var critSum = criteria.Sum(c => c.Weight);
                        if (Math.Abs(critSum - 100.0) > 0.5)
                        {
                            errors.Add($"Criterion weights in section '{section.Title}' must sum to 100% (±0.5%). Current sum: {Math.Round(critSum, 2)}%.");
                        }

                        foreach (var crit in criteria)
                        {
                            if (crit.Weight < 0)
                            {
                                errors.Add($"Criterion '{crit.Title}' in section '{section.Title}' has invalid negative weight: {crit.Weight}%.");
                            }
                        }
                    }
                }
                else
                {
                    // KPI section criteria (if specified, must sum to 100±0.5%)
                    if (criteria.Count > 0)
                    {
                        var critSum = criteria.Sum(c => c.Weight);
                        if (Math.Abs(critSum - 100.0) > 0.5)
                        {
                            errors.Add($"Criterion weights in KPI section '{section.Title}' must sum to 100% (±0.5%). Current sum: {Math.Round(critSum, 2)}%.");
                        }

                        foreach (var crit in criteria)
                        {
                            if (crit.Weight < 0)
                            {
                                errors.Add($"Criterion '{crit.Title}' in KPI section '{section.Title}' has invalid negative weight: {crit.Weight}%.");
                            }
                        }
                    }
                }
            }
        }

        // Rating bands validations
        var bands = template.RatingBands?.ToList() ?? new List<RatingBand>();
        if (bands.Count > 0)
        {
            // Range check per band
            foreach (var band in bands)
            {
                if (band.MinScore > band.MaxScore)
                {
                    errors.Add($"Rating band '{band.Label}' has invalid range: MinScore ({band.MinScore}) cannot be greater than MaxScore ({band.MaxScore}).");
                }
            }

            // Non-overlapping check across all pairs
            for (int i = 0; i < bands.Count; i++)
            {
                for (int j = i + 1; j < bands.Count; j++)
                {
                    var a = bands[i];
                    var b = bands[j];

                    if (a.MinScore <= a.MaxScore && b.MinScore <= b.MaxScore)
                    {
                        // Two intervals [MinA, MaxA] and [MinB, MaxB] overlap on more than a single boundary point
                        // if max(MinA, MinB) < min(MaxA, MaxB)
                        if (Math.Max(a.MinScore, b.MinScore) < Math.Min(a.MaxScore, b.MaxScore) - 1e-4)
                        {
                            errors.Add($"Rating bands overlap: '{a.Label}' ({a.MinScore}-{a.MaxScore}) and '{b.Label}' ({b.MinScore}-{b.MaxScore}).");
                        }
                    }
                }
            }
        }

        return errors.Count > 0
            ? TemplateValidationResult.Fail(errors)
            : TemplateValidationResult.Success();
    }

    /// <inheritdoc />
    public async Task<TemplateServiceResult<EvaluationTemplate>> CreateTemplateAsync(
        EvaluationTemplate template,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var validation = ValidateTemplate(template);
        if (!validation.IsValid)
        {
            _logger.LogWarning("Template creation failed validation with {Count} errors", validation.Errors.Count);
            return TemplateServiceResult<EvaluationTemplate>.Failure(
                422,
                "Template validation failed: " + string.Join("; ", validation.Errors),
                validation.Errors);
        }

        template.CreatedById = userId;
        template.CreatedAt = DateTime.UtcNow;
        template.UpdatedAt = DateTime.UtcNow;

        if (template.Id == Guid.Empty)
        {
            template.Id = Guid.NewGuid();
        }

        // Ensure child relationships are properly wired
        foreach (var section in template.Sections)
        {
            section.TemplateId = template.Id;
            if (section.Id == Guid.Empty) section.Id = Guid.NewGuid();

            foreach (var crit in section.Criteria)
            {
                crit.SectionId = section.Id;
                if (crit.Id == Guid.Empty) crit.Id = Guid.NewGuid();
            }
        }

        foreach (var band in template.RatingBands)
        {
            band.TemplateId = template.Id;
            if (band.Id == Guid.Empty) band.Id = Guid.NewGuid();
        }

        await _context.EvaluationTemplates.AddAsync(template, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Evaluation template '{Title}' ({TemplateId}) created successfully", template.Title, template.Id);
        return TemplateServiceResult<EvaluationTemplate>.Success(template, "Template created successfully.");
    }

    /// <inheritdoc />
    public async Task<EvaluationTemplate?> GetTemplateByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        return await _context.EvaluationTemplates
            .Include(t => t.Department)
            .Include(t => t.CreatedBy)
            .Include(t => t.Sections.OrderBy(s => s.Order))
                .ThenInclude(s => s.Criteria.OrderBy(c => c.Order))
            .Include(t => t.RatingBands.OrderBy(b => b.Order))
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<EvaluationTemplate>> GetAllTemplatesAsync(
        bool? activeOnly = null,
        Guid? departmentId = null,
        string? targetRole = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.EvaluationTemplates
            .Include(t => t.Department)
            .Include(t => t.Sections.OrderBy(s => s.Order))
                .ThenInclude(s => s.Criteria.OrderBy(c => c.Order))
            .Include(t => t.RatingBands.OrderBy(b => b.Order))
            .AsQueryable();

        if (activeOnly.HasValue)
        {
            query = query.Where(t => t.IsActive == activeOnly.Value);
        }

        if (departmentId.HasValue)
        {
            query = query.Where(t => t.DepartmentId == departmentId.Value || t.DepartmentId == null);
        }

        if (!string.IsNullOrWhiteSpace(targetRole))
        {
            query = query.Where(t => t.TargetRole == targetRole || t.TargetRole == null);
        }

        return await query.OrderBy(t => t.Title).ToListAsync(cancellationToken);
    }

    /// <inheritdoc />
    public async Task<bool> IsTemplateInUseByNonDraftReviewsAsync(
        Guid templateId,
        CancellationToken cancellationToken = default)
    {
        return await _context.PerformanceReviews
            .AnyAsync(r => r.TemplateId == templateId && r.Status != ReviewWorkflowStatus.Draft, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<TemplateServiceResult<EvaluationTemplate>> UpdateTemplateAsync(
        Guid id,
        EvaluationTemplate updatedTemplate,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var existing = await _context.EvaluationTemplates
            .Include(t => t.Sections)
                .ThenInclude(s => s.Criteria)
            .Include(t => t.RatingBands)
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);

        if (existing == null)
        {
            return TemplateServiceResult<EvaluationTemplate>.Failure(404, $"Evaluation template with ID '{id}' was not found.");
        }

        // Block update if template in use by non-Draft review
        if (await IsTemplateInUseByNonDraftReviewsAsync(id, cancellationToken))
        {
            _logger.LogWarning("Template update blocked: Template {TemplateId} is currently in use by active/finalized reviews", id);
            return TemplateServiceResult<EvaluationTemplate>.Failure(
                422,
                "Template cannot be updated because it is currently in use by active or finalized performance reviews.");
        }

        // Domain validation
        var validation = ValidateTemplate(updatedTemplate);
        if (!validation.IsValid)
        {
            return TemplateServiceResult<EvaluationTemplate>.Failure(
                422,
                "Template validation failed: " + string.Join("; ", validation.Errors),
                validation.Errors);
        }

        // Update scalar fields
        existing.Title = updatedTemplate.Title;
        existing.Description = updatedTemplate.Description;
        existing.TargetRole = updatedTemplate.TargetRole;
        existing.DepartmentId = updatedTemplate.DepartmentId;
        existing.IsActive = updatedTemplate.IsActive;
        existing.IsAiEnabled = updatedTemplate.IsAiEnabled;
        existing.UpdatedAt = DateTime.UtcNow;

        // Cleanly replace rating bands
        if (existing.RatingBands.Any())
        {
            _context.RatingBands.RemoveRange(existing.RatingBands);
        }

        // Cleanly replace sections (cascade delete removes existing criteria)
        if (existing.Sections.Any())
        {
            _context.EvaluationSections.RemoveRange(existing.Sections);
        }

        await _context.SaveChangesAsync(cancellationToken);

        // Add new rating bands
        if (updatedTemplate.RatingBands != null && updatedTemplate.RatingBands.Any())
        {
            foreach (var band in updatedTemplate.RatingBands)
            {
                band.Id = Guid.NewGuid();
                band.TemplateId = existing.Id;
                await _context.RatingBands.AddAsync(band, cancellationToken);
            }
        }

        // Add new sections and criteria
        if (updatedTemplate.Sections != null && updatedTemplate.Sections.Any())
        {
            foreach (var section in updatedTemplate.Sections)
            {
                section.Id = Guid.NewGuid();
                section.TemplateId = existing.Id;

                if (section.Criteria != null)
                {
                    foreach (var crit in section.Criteria)
                    {
                        crit.Id = Guid.NewGuid();
                        crit.SectionId = section.Id;
                    }
                }
                await _context.EvaluationSections.AddAsync(section, cancellationToken);
            }
        }

        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Evaluation template '{Title}' ({TemplateId}) updated successfully", existing.Title, existing.Id);
        return TemplateServiceResult<EvaluationTemplate>.Success(existing, "Template updated successfully.");
    }

    /// <inheritdoc />
    public async Task<TemplateServiceResult<bool>> DeleteTemplateAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var existing = await _context.EvaluationTemplates.FindAsync(new object[] { id }, cancellationToken);
        if (existing == null)
        {
            return TemplateServiceResult<bool>.Failure(404, $"Evaluation template with ID '{id}' was not found.");
        }

        if (await IsTemplateInUseByNonDraftReviewsAsync(id, cancellationToken))
        {
            _logger.LogWarning("Template deletion blocked: Template {TemplateId} is in use by non-Draft reviews", id);
            return TemplateServiceResult<bool>.Failure(
                422,
                "Template cannot be deleted because it is currently in use by active or finalized performance reviews.");
        }

        var inUseByDraft = await _context.PerformanceReviews.AnyAsync(r => r.TemplateId == id, cancellationToken);
        if (inUseByDraft)
        {
            // Soft delete if linked to Draft reviews to preserve draft integrity
            existing.IsActive = false;
            existing.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Evaluation template {TemplateId} deactivated (soft-deleted)", id);
            return TemplateServiceResult<bool>.Success(true, "Template has associated draft reviews and was deactivated.");
        }

        _context.EvaluationTemplates.Remove(existing);
        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Evaluation template {TemplateId} permanently deleted", id);
        return TemplateServiceResult<bool>.Success(true, "Template deleted successfully.");
    }
}

