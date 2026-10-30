using System.Text.Json;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Analytics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Backend.Modules.PerformanceEvaluation;

/// <summary>
/// Server-side single source of truth for evaluation scoring, rating band matching,
/// outlier detection, and frozen historical score bypass.
/// </summary>
public class PerformanceReviewScoringService : IPerformanceReviewScoringService
{
    private readonly AppDbContext _context;
    private readonly IKpiCalculationEngine _kpiEngine;
    private readonly ILogger<PerformanceReviewScoringService> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public PerformanceReviewScoringService(
        AppDbContext context,
        IKpiCalculationEngine kpiEngine,
        ILogger<PerformanceReviewScoringService> logger)
    {
        _context = context;
        _kpiEngine = kpiEngine;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<ReviewResultDTO> CalculateReviewScoreAsync(Guid reviewId, CancellationToken cancellationToken = default)
    {
        var review = await _context.PerformanceReviews
            .Include(r => r.Template)
                .ThenInclude(t => t!.Sections)
                    .ThenInclude(s => s.Criteria)
            .Include(r => r.Template)
                .ThenInclude(t => t!.RatingBands)
            .Include(r => r.Ratings)
                .ThenInclude(rt => rt.Criterion)
            .Include(r => r.Ratings)
                .ThenInclude(rt => rt.Employee)
                    .ThenInclude(e => e!.Department)
            .Include(r => r.Ratings)
                .ThenInclude(rt => rt.Employee)
                    .ThenInclude(e => e!.JobPosition)
            .Include(r => r.Employee)
                .ThenInclude(e => e!.Department)
            .Include(r => r.Employee)
                .ThenInclude(e => e!.JobPosition)
            .Include(r => r.Department)
            .Include(r => r.Team)
            .Include(r => r.Reviewer)
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == reviewId, cancellationToken);

        if (review == null)
        {
            throw new KeyNotFoundException($"Performance review with ID '{reviewId}' was not found.");
        }

        return await CalculateReviewScoreAsync(review, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<ReviewResultDTO> CalculateReviewScoreAsync(PerformanceReview review, CancellationToken cancellationToken = default)
    {
        // Security rule: If finalized and snapshot is present, bypass calculation and return frozen scores
        if (review.Status == ReviewWorkflowStatus.Finalized && !string.IsNullOrWhiteSpace(review.FrozenScoresJson))
        {
            var frozenResult = DeserializeScores(review.FrozenScoresJson);
            if (frozenResult != null)
            {
                _logger.LogInformation("Returning frozen evaluation score snapshot for finalized review {ReviewId}", review.Id);
                return frozenResult;
            }
        }

        // Collect employees to evaluate
        var employees = await ResolveEmployeesForReviewAsync(review, cancellationToken);

        // Fetch KPI evaluations if template contains a KPI section
        var employeeKpis = new Dictionary<Guid, EmployeeKpiEvaluationResultDTO>();
        bool hasKpiSection = review.Template?.Sections?.Any(s => s.IsKpiSection) == true;

        if (hasKpiSection)
        {
            foreach (var employee in employees)
            {
                try
                {
                    var kpiResult = await _kpiEngine.CalculateEmployeeKpiAsync(
                        employee.Id,
                        review.PeriodStart,
                        review.PeriodEnd,
                        cancellationToken: cancellationToken);

                    if (kpiResult != null)
                    {
                        employeeKpis[employee.Id] = kpiResult;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to calculate KPI for employee {EmployeeId} in review {ReviewId}", employee.Id, review.Id);
                }
            }
        }

        return CalculateReviewScoreInternal(review, employees, employeeKpis);
    }

    /// <inheritdoc />
    public ReviewResultDTO CalculateReviewScore(
        PerformanceReview review,
        IReadOnlyDictionary<Guid, EmployeeKpiEvaluationResultDTO>? employeeKpis = null)
    {
        // Security rule: If finalized and snapshot is present, bypass calculation and return frozen scores
        if (review.Status == ReviewWorkflowStatus.Finalized && !string.IsNullOrWhiteSpace(review.FrozenScoresJson))
        {
            var frozenResult = DeserializeScores(review.FrozenScoresJson);
            if (frozenResult != null)
            {
                return frozenResult;
            }
        }

        var employees = ResolveEmployeesFromMemory(review);
        return CalculateReviewScoreInternal(review, employees, employeeKpis ?? new Dictionary<Guid, EmployeeKpiEvaluationResultDTO>());
    }

    /// <inheritdoc />
    public string SerializeScores(ReviewResultDTO result)
    {
        return JsonSerializer.Serialize(result, JsonOptions);
    }

    /// <inheritdoc />
    public ReviewResultDTO? DeserializeScores(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<ReviewResultDTO>(json, JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to deserialize frozen review scores JSON.");
            return null;
        }
    }

    /// <inheritdoc />
    public async Task<string> FreezeReviewScoresAsync(Guid reviewId, CancellationToken cancellationToken = default)
    {
        var review = await _context.PerformanceReviews
            .Include(r => r.Template)
                .ThenInclude(t => t!.Sections)
                    .ThenInclude(s => s.Criteria)
            .Include(r => r.Template)
                .ThenInclude(t => t!.RatingBands)
            .Include(r => r.Ratings)
                .ThenInclude(rt => rt.Criterion)
            .Include(r => r.Ratings)
                .ThenInclude(rt => rt.Employee)
                    .ThenInclude(e => e!.Department)
            .Include(r => r.Ratings)
                .ThenInclude(rt => rt.Employee)
                    .ThenInclude(e => e!.JobPosition)
            .Include(r => r.Employee)
                .ThenInclude(e => e!.Department)
            .Include(r => r.Employee)
                .ThenInclude(e => e!.JobPosition)
            .Include(r => r.Department)
            .Include(r => r.Team)
            .Include(r => r.Reviewer)
            .FirstOrDefaultAsync(r => r.Id == reviewId, cancellationToken);

        if (review == null)
        {
            throw new KeyNotFoundException($"Performance review with ID '{reviewId}' was not found.");
        }

        // Force live calculation to freeze current state
        var employees = await ResolveEmployeesForReviewAsync(review, cancellationToken);
        var employeeKpis = new Dictionary<Guid, EmployeeKpiEvaluationResultDTO>();

        if (review.Template?.Sections?.Any(s => s.IsKpiSection) == true)
        {
            foreach (var employee in employees)
            {
                try
                {
                    var kpiResult = await _kpiEngine.CalculateEmployeeKpiAsync(
                        employee.Id,
                        review.PeriodStart,
                        review.PeriodEnd,
                        cancellationToken: cancellationToken);

                    if (kpiResult != null)
                    {
                        employeeKpis[employee.Id] = kpiResult;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to calculate KPI for employee {EmployeeId} during freeze for review {ReviewId}", employee.Id, review.Id);
                }
            }
        }

        var calculated = CalculateReviewScoreInternal(review, employees, employeeKpis);
        calculated.IsFinalized = true;
        calculated.FinalizedAt = DateTime.UtcNow;

        var json = SerializeScores(calculated);
        review.FrozenScoresJson = json;
        review.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        return json;
    }

    /// <summary>
    /// Core scoring algorithm. Evaluates non-KPI criteria/sections, KPI passthrough,
    /// weighted final scores, outlier detection, and rating band matching.
    /// </summary>
    private ReviewResultDTO CalculateReviewScoreInternal(
        PerformanceReview review,
        IReadOnlyList<User> employees,
        IReadOnlyDictionary<Guid, EmployeeKpiEvaluationResultDTO> employeeKpis)
    {
        var template = review.Template;
        var sections = template?.Sections?.OrderBy(s => s.Order).ToList() ?? new List<EvaluationSection>();
        var ratingBands = template?.RatingBands?.OrderBy(b => b.Order).ToList() ?? new List<RatingBand>();

        var employeeScores = new List<EmployeeReviewScoreDTO>();

        foreach (var employee in employees)
        {
            var employeeRatings = review.Ratings?
                .Where(r => r.EmployeeId == employee.Id)
                .ToDictionary(r => r.CriterionId) ?? new Dictionary<Guid, CriterionRating>();

            employeeKpis.TryGetValue(employee.Id, out var employeeKpi);

            var sectionScoreDTOs = new List<SectionScoreDTO>();
            double totalSectionWeightedScore = 0.0;
            double totalSectionWeight = 0.0;
            int totalOutliers = 0;

            foreach (var section in sections)
            {
                var criteria = section.Criteria?.OrderBy(c => c.Order).ToList() ?? new List<EvaluationCriterion>();
                var criterionScoreDTOs = new List<CriterionScoreDTO>();
                double sectionScore = 0.0;

                if (section.IsKpiSection)
                {
                    // KPI Section Rule:
                    // KPI section = IKpiCalculationEngine.CalculateEmployeeKpiAsync().OverallScore
                    sectionScore = employeeKpi?.OverallScore ?? 0.0;

                    foreach (var criterion in criteria)
                    {
                        double critScore = sectionScore;
                        if (employeeKpi != null && !string.IsNullOrWhiteSpace(criterion.MetricCode))
                        {
                            var matchedMetric = employeeKpi.Metrics.FirstOrDefault(m =>
                                string.Equals(m.MetricCode, criterion.MetricCode, StringComparison.OrdinalIgnoreCase));
                            if (matchedMetric != null)
                            {
                                critScore = matchedMetric.ActualValue;
                            }
                        }

                        criterionScoreDTOs.Add(new CriterionScoreDTO
                        {
                            CriterionId = criterion.Id,
                            CriterionTitle = criterion.Title,
                            CriterionType = criterion.CriterionType,
                            MetricCode = criterion.MetricCode,
                            Weight = criterion.Weight,
                            Order = criterion.Order,
                            Score = Math.Round(critScore, 2),
                            SelfScore = null,
                            ManagerScore = null,
                            Gap = null,
                            IsOutlier = false
                        });
                    }
                }
                else
                {
                    // Non-KPI Section Rule:
                    // non-KPI section score = Σ(managerScore × weight) / Σ(weight) normalized to 0–100
                    double totalCriterionWeight = 0.0;
                    double sumWeightedManagerScore = 0.0;

                    foreach (var criterion in criteria)
                    {
                        employeeRatings.TryGetValue(criterion.Id, out var rating);

                        double? selfScore = rating?.SelfScore;
                        double? managerScore = rating?.ManagerScore;

                        // Outlier rule: outlier flag when |self - manager| >= 2
                        bool isOutlier = selfScore.HasValue && managerScore.HasValue &&
                            Math.Abs(selfScore.Value - managerScore.Value) >= 2.0 - 1e-6;

                        if (isOutlier)
                        {
                            totalOutliers++;
                        }

                        double? gap = (selfScore.HasValue && managerScore.HasValue)
                            ? Math.Round(selfScore.Value - managerScore.Value, 2)
                            : null;

                        // Extensibility: new CriterionType = 1 enum value (Step 1) + 1 scorer case
                        double critNormalizedScore = CalculateCriterionScore(criterion, rating, employeeKpi);

                        if (managerScore.HasValue)
                        {
                            sumWeightedManagerScore += managerScore.Value * criterion.Weight;
                        }
                        totalCriterionWeight += criterion.Weight;

                        criterionScoreDTOs.Add(new CriterionScoreDTO
                        {
                            CriterionId = criterion.Id,
                            CriterionTitle = criterion.Title,
                            CriterionType = criterion.CriterionType,
                            MetricCode = criterion.MetricCode,
                            Weight = criterion.Weight,
                            Order = criterion.Order,
                            SelfScore = selfScore,
                            ManagerScore = managerScore,
                            Gap = gap,
                            IsOutlier = isOutlier,
                            Score = Math.Round(critNormalizedScore, 2),
                            SelfComment = rating?.SelfComment,
                            ManagerComment = rating?.ManagerComment
                        });
                    }

                    if (totalCriterionWeight > 0)
                    {
                        // Raw manager score weighted average on a 0.0 - 5.0 scale
                        double rawWeightedAvg = sumWeightedManagerScore / totalCriterionWeight;
                        // Normalized to 0 - 100
                        sectionScore = (rawWeightedAvg / 5.0) * 100.0;
                    }
                    else
                    {
                        sectionScore = 0.0;
                    }
                }

                sectionScore = Math.Round(sectionScore, 2);
                double sectionWeightedContrib = section.Weight > 0 ? (sectionScore * (section.Weight / 100.0)) : 0.0;

                totalSectionWeightedScore += sectionScore * section.Weight;
                totalSectionWeight += section.Weight;

                sectionScoreDTOs.Add(new SectionScoreDTO
                {
                    SectionId = section.Id,
                    SectionTitle = section.Title,
                    Weight = section.Weight,
                    Order = section.Order,
                    IsKpiSection = section.IsKpiSection,
                    Score = sectionScore,
                    WeightedScore = Math.Round(sectionWeightedContrib, 2),
                    Criteria = criterionScoreDTOs,
                    KpiMetrics = section.IsKpiSection ? employeeKpi?.Metrics : null
                });
            }

            // Weighted final rule: Σ(sectionScore × sectionWeight) / Σ(sectionWeight)
            double finalScore = 0.0;
            if (totalSectionWeight > 0)
            {
                finalScore = Math.Round(totalSectionWeightedScore / totalSectionWeight, 2);
            }

            // Rating label from RatingBand
            var matchedBand = MatchRatingBand(ratingBands, finalScore);

            employeeScores.Add(new EmployeeReviewScoreDTO
            {
                EmployeeId = employee.Id,
                EmployeeName = $"{employee.FirstName} {employee.LastName}".Trim(),
                EmployeeNumber = employee.EmployeeNumber,
                DepartmentId = employee.DepartmentId ?? review.DepartmentId,
                DepartmentName = employee.Department?.Name ?? review.Department?.Name,
                JobPositionTitle = employee.JobPosition?.Name,
                Role = employee.Role.ToString(),
                Sections = sectionScoreDTOs,
                FinalScore = finalScore,
                RatingLabel = matchedBand?.Label ?? (ratingBands.Any() ? ratingBands.First().Label : "Unrated"),
                RatingBandColor = matchedBand?.Color,
                RatingBandDescription = matchedBand?.Description,
                OutlierCount = totalOutliers
            });
        }

        // Summary calculations across evaluated employees
        double overallScore = 0.0;
        string overallRating = "Unrated";
        var distribution = new Dictionary<string, int>();

        if (employeeScores.Count > 0)
        {
            overallScore = Math.Round(employeeScores.Average(e => e.FinalScore), 2);
            var overallBand = MatchRatingBand(ratingBands, overallScore);
            overallRating = overallBand?.Label ?? (ratingBands.Any() ? ratingBands.First().Label : "Unrated");

            distribution = employeeScores
                .GroupBy(e => e.RatingLabel)
                .ToDictionary(g => g.Key, g => g.Count());
        }

        return new ReviewResultDTO
        {
            ReviewId = review.Id,
            TemplateId = review.TemplateId,
            TemplateTitle = review.Template?.Title ?? string.Empty,
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
            ReviewerId = review.ReviewerId,
            ReviewerName = review.Reviewer != null ? $"{review.Reviewer.FirstName} {review.Reviewer.LastName}".Trim() : null,
            IsFinalized = review.Status == ReviewWorkflowStatus.Finalized,
            FinalizedAt = review.FinalizedAt,
            OverallScore = overallScore,
            OverallRating = overallRating,
            RatingDistribution = distribution,
            Employees = employeeScores
        };
    }

    /// <summary>
    /// Scorer case per CriterionType.
    /// Extensibility: Adding a new CriterionType requires 1 enum value in CriterionType.cs and 1 case here.
    /// </summary>
    private static double CalculateCriterionScore(
        EvaluationCriterion criterion,
        CriterionRating? rating,
        EmployeeKpiEvaluationResultDTO? kpiResult)
    {
        switch (criterion.CriterionType)
        {
            case CriterionType.Standard:
                // Standard criterion: manager rating 1.0 - 5.0, normalized to 0 - 100
                return rating?.ManagerScore != null ? (rating.ManagerScore.Value / 5.0) * 100.0 : 0.0;

            case CriterionType.KpiLinked:
                // KPI-linked criterion: matches metric code from KPI result or falls back to overall score
                if (kpiResult != null)
                {
                    if (!string.IsNullOrWhiteSpace(criterion.MetricCode))
                    {
                        var metric = kpiResult.Metrics.FirstOrDefault(m =>
                            string.Equals(m.MetricCode, criterion.MetricCode, StringComparison.OrdinalIgnoreCase));
                        if (metric != null)
                        {
                            return metric.ActualValue;
                        }
                    }
                    return kpiResult.OverallScore;
                }
                return rating?.ManagerScore != null ? (rating.ManagerScore.Value / 5.0) * 100.0 : 0.0;

            default:
                return 0.0;
        }
    }

    /// <summary>
    /// Matches a final score against the template's rating bands.
    /// Safely handles boundary scores (e.g. MinScore <= score <= MaxScore) and edge cases.
    /// </summary>
    private static RatingBand? MatchRatingBand(IReadOnlyList<RatingBand>? bands, double score)
    {
        if (bands == null || bands.Count == 0) return null;

        // 1. Exact boundary match: MinScore <= score <= MaxScore (with floating point tolerance)
        var match = bands
            .OrderBy(b => b.Order)
            .FirstOrDefault(b => score >= (b.MinScore - 1e-6) && score <= (b.MaxScore + 1e-6));

        if (match != null) return match;

        // 2. Score exceeds highest defined max -> match top band
        if (score >= bands.Max(b => b.MaxScore))
        {
            return bands.OrderByDescending(b => b.MaxScore).First();
        }

        // 3. Score falls below lowest defined min -> match bottom band
        if (score <= bands.Min(b => b.MinScore))
        {
            return bands.OrderBy(b => b.MinScore).First();
        }

        return bands.OrderBy(b => b.Order).FirstOrDefault();
    }

    private async Task<IReadOnlyList<User>> ResolveEmployeesForReviewAsync(PerformanceReview review, CancellationToken cancellationToken)
    {
        var employeeDict = new Dictionary<Guid, User>();

        if (review.Employee != null)
        {
            employeeDict[review.Employee.Id] = review.Employee;
        }

        if (review.Ratings != null)
        {
            foreach (var rating in review.Ratings)
            {
                if (rating.Employee != null && !employeeDict.ContainsKey(rating.Employee.Id))
                {
                    employeeDict[rating.Employee.Id] = rating.Employee;
                }
            }
        }

        // Scope resolution for Team or Department
        if (review.Scope == ReviewScope.Team && review.TeamId.HasValue)
        {
            var teamMembers = await _context.TeamMembers
                .Where(tm => tm.TeamId == review.TeamId.Value && tm.User != null && tm.User.IsActive)
                .Include(tm => tm.User!)
                    .ThenInclude(u => u.Department)
                .Include(tm => tm.User!)
                    .ThenInclude(u => u.JobPosition)
                .Select(tm => tm.User!)
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            foreach (var member in teamMembers)
            {
                employeeDict[member.Id] = member;
            }
        }
        else if (review.Scope == ReviewScope.Department && review.DepartmentId.HasValue)
        {
            var deptMembers = await _context.Users
                .Include(u => u.Department)
                .Include(u => u.JobPosition)
                .Where(u => u.DepartmentId == review.DepartmentId && u.IsActive)
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            foreach (var member in deptMembers)
            {
                employeeDict[member.Id] = member;
            }
        }

        // Fallback for single employee if navigation property wasn't loaded
        if (employeeDict.Count == 0 && review.EmployeeId.HasValue)
        {
            var emp = await _context.Users
                .Include(u => u.Department)
                .Include(u => u.JobPosition)
                .FirstOrDefaultAsync(u => u.Id == review.EmployeeId.Value, cancellationToken);

            if (emp != null)
            {
                employeeDict[emp.Id] = emp;
            }
            else
            {
                employeeDict[review.EmployeeId.Value] = new User
                {
                    Id = review.EmployeeId.Value,
                    FirstName = "Employee",
                    LastName = string.Empty
                };
            }
        }

        return employeeDict.Values.ToList();
    }

    private static IReadOnlyList<User> ResolveEmployeesFromMemory(PerformanceReview review)
    {
        var employeeDict = new Dictionary<Guid, User>();

        if (review.Employee != null)
        {
            employeeDict[review.Employee.Id] = review.Employee;
        }
        else if (review.EmployeeId.HasValue)
        {
            employeeDict[review.EmployeeId.Value] = new User
            {
                Id = review.EmployeeId.Value,
                FirstName = "Employee",
                LastName = string.Empty
            };
        }

        if (review.Ratings != null)
        {
            foreach (var rating in review.Ratings)
            {
                if (rating.Employee != null && !employeeDict.ContainsKey(rating.Employee.Id))
                {
                    employeeDict[rating.Employee.Id] = rating.Employee;
                }
                else if (rating.EmployeeId != Guid.Empty && !employeeDict.ContainsKey(rating.EmployeeId))
                {
                    employeeDict[rating.EmployeeId] = new User
                    {
                        Id = rating.EmployeeId,
                        FirstName = "Employee",
                        LastName = string.Empty
                    };
                }
            }
        }

        return employeeDict.Values.ToList();
    }
}
