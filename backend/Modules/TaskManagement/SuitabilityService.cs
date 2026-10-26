using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement.Groq;
using Microsoft.EntityFrameworkCore;
using Task = System.Threading.Tasks.Task;

namespace Backend.Modules.TaskManagement;

public class SuitabilityService : ISuitabilityService
{
    private readonly AppDbContext _db;
    private readonly IGroqSuitabilityService _groqService;
    private readonly IExpertSystemConfigStore _configStore;
    private readonly ILogger<SuitabilityService> _logger;

    public SuitabilityService(
        AppDbContext db,
        IGroqSuitabilityService groqService,
        IExpertSystemConfigStore configStore,
        ILogger<SuitabilityService> logger)
    {
        _db = db;
        _groqService = groqService;
        _configStore = configStore;
        _logger = logger;
    }

    private static UserRole[] GetEligibleRoles(UserRole callerRole) => callerRole switch
    {
        UserRole.Manager => new[] { UserRole.Dispatcher, UserRole.Encoder, UserRole.Courier },
        UserRole.Coordinator => new[] { UserRole.Dispatcher, UserRole.Encoder, UserRole.Courier },
        _ => Array.Empty<UserRole>()
    };

    private sealed class CandidateEvaluationItem
    {
        public GroqCandidateMetrics Metrics { get; set; } = new();
        public double WorkloadFactor { get; set; }
        public double ExperienceFactor { get; set; }
        public double RecScore { get; set; }
        public double HeuristicScore { get; set; }
    }

    private async Task<List<CandidateEvaluationItem>> QueryCandidateMetricsAsync(
        Guid departmentId,
        UserRole[] eligibleRoles,
        TaskClassification classification,
        Guid? specificEmployeeId = null,
        CancellationToken cancellationToken = default)
    {
        var usersQuery = _db.Users.AsNoTracking()
            .Where(u => u.DepartmentId == departmentId
                     && u.AvailabilityStatus == AvailabilityStatus.Active
                     && u.IsActive
                     && eligibleRoles.Contains(u.Role));

        if (specificEmployeeId.HasValue)
        {
            usersQuery = usersQuery.Where(u => u.Id == specificEmployeeId.Value);
        }

        var users = await usersQuery.ToListAsync(cancellationToken);
        if (users.Count == 0)
        {
            return new List<CandidateEvaluationItem>();
        }

        var candidateIds = users.Select(u => u.Id).ToList();

        // 1. Workload: Active assigned tasks (not Completed, not Cancelled)
        var activeWorkloads = await _db.TaskAssignments.AsNoTracking()
            .Where(a => candidateIds.Contains(a.AssignedUserId)
                     && a.Task != null
                     && a.Task.Status != Models.Enums.TaskStatus.Completed
                     && a.Task.Status != Models.Enums.TaskStatus.Cancelled)
            .GroupBy(a => a.AssignedUserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.UserId, g => g.Count, cancellationToken);

        // 2. Routine XP: Completed tasks where Classification == RoutineDailyTask
        var completedRoutineCounts = await _db.TaskAssignments.AsNoTracking()
            .Where(a => candidateIds.Contains(a.AssignedUserId)
                     && a.Task != null
                     && a.Task.Status == Models.Enums.TaskStatus.Completed
                     && a.Task.Classification == TaskClassification.RoutineDailyTask)
            .GroupBy(a => a.AssignedUserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.UserId, g => g.Count, cancellationToken);

        // 3. Special XP: Completed tasks where Classification == SpecialTask
        var completedSpecialCounts = await _db.TaskAssignments.AsNoTracking()
            .Where(a => candidateIds.Contains(a.AssignedUserId)
                     && a.Task != null
                     && a.Task.Status == Models.Enums.TaskStatus.Completed
                     && a.Task.Classification == TaskClassification.SpecialTask)
            .GroupBy(a => a.AssignedUserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.UserId, g => g.Count, cancellationToken);

        // 4. Recommendations: Group by Assignee and Category
        var recGroupCounts = await _db.Recommendations.AsNoTracking()
            .Where(r => candidateIds.Contains(r.AssigneeId))
            .GroupBy(r => new { r.AssigneeId, r.Category })
            .Select(g => new { g.Key.AssigneeId, g.Key.Category, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var cfg = _configStore.GetConfig();
        var maxWorkload = cfg.MaxWorkload > 0 ? cfg.MaxWorkload : 10;
        var maxXP = cfg.MaxXP > 0 ? cfg.MaxXP : 20;

        var items = new List<CandidateEvaluationItem>(users.Count);
        foreach (var u in users)
        {
            var userRecs = recGroupCounts.Where(r => r.AssigneeId == u.Id).ToList();
            var totalRecs = userRecs.Sum(r => r.Count);
            var timelinessCount = userRecs.FirstOrDefault(r => r.Category == RecommendationCategory.Timeliness)?.Count ?? 0;
            var qualityCount = userRecs.FirstOrDefault(r => r.Category == RecommendationCategory.WorkQuality)?.Count ?? 0;
            var commCount = userRecs.FirstOrDefault(r => r.Category == RecommendationCategory.Communication)?.Count ?? 0;

            var timelinessRating = totalRecs > 0 ? ((double)timelinessCount / totalRecs) * 5.0 : 0.0;
            var workQualityRating = totalRecs > 0 ? ((double)qualityCount / totalRecs) * 5.0 : 0.0;
            var communicationRating = totalRecs > 0 ? ((double)commCount / totalRecs) * 5.0 : 0.0;
            var recScore = totalRecs > 0 ? (double)(timelinessCount + qualityCount + commCount) / (3.0 * totalRecs) : 0.0;

            var workload = activeWorkloads.GetValueOrDefault(u.Id, 0);
            var routineExp = completedRoutineCounts.GetValueOrDefault(u.Id, 0);
            var specialExp = completedSpecialCounts.GetValueOrDefault(u.Id, 0);

            var workloadFactor = Math.Max(0.0, 1.0 - (workload * 1.0 / maxWorkload));
            var expTasks = classification == TaskClassification.RoutineDailyTask ? routineExp : specialExp;
            var experienceFactor = Math.Min(1.0, expTasks * 1.0 / maxXP);

            var heuristicScore = Math.Round(
                cfg.WorkloadWeight * workloadFactor +
                cfg.ExperienceWeight * experienceFactor +
                cfg.RecScoreWeight * recScore,
                4);

            items.Add(new CandidateEvaluationItem
            {
                Metrics = new GroqCandidateMetrics
                {
                    EmployeeId = u.Id,
                    EmployeeNumber = u.EmployeeNumber,
                    FullName = $"{u.FirstName} {u.LastName}".Trim(),
                    Role = u.Role.ToString(),
                    Workload = workload,
                    RoutineExperience = routineExp,
                    SpecialExperience = specialExp,
                    TimelinessRating = Math.Round(timelinessRating, 2),
                    WorkQualityRating = Math.Round(workQualityRating, 2),
                    CommunicationRating = Math.Round(communicationRating, 2)
                },
                WorkloadFactor = workloadFactor,
                ExperienceFactor = experienceFactor,
                RecScore = recScore,
                HeuristicScore = heuristicScore
            });
        }

        return items;
    }

    private async Task<List<SuitabilityResponseDTO>> EvaluateAndRankAsync(
        GroqTaskContext taskContext,
        List<CandidateEvaluationItem> candidateItems,
        CancellationToken cancellationToken = default)
    {
        if (candidateItems.Count == 0)
        {
            return new List<SuitabilityResponseDTO>();
        }

        if (_groqService.IsConfigured)
        {
            try
            {
                var candidates = candidateItems.Select(ci => ci.Metrics).ToList();
                var groqResult = await _groqService.EvaluateSuitabilityAsync(taskContext, candidates, cancellationToken);
                var recDict = groqResult.Recommendations.ToDictionary(r => r.EmployeeId);

                return candidateItems.Select(ci =>
                {
                    var hasGroq = recDict.TryGetValue(ci.Metrics.EmployeeId, out var groqRec);
                    return new SuitabilityResponseDTO
                    {
                        EmployeeId = ci.Metrics.EmployeeId,
                        EmployeeNumber = ci.Metrics.EmployeeNumber,
                        FullName = ci.Metrics.FullName,
                        Role = ci.Metrics.Role,
                        Workload = ci.Metrics.Workload,
                        SuitabilityScore = hasGroq ? groqRec!.Score : ci.HeuristicScore,
                        Rank = hasGroq ? groqRec!.Rank : null,
                        Rationale = hasGroq ? groqRec!.Rationale : null,
                        Factors = hasGroq ? groqRec!.Factors : null
                    };
                })
                .OrderBy(r => r.Rank ?? int.MaxValue)
                .ThenByDescending(r => r.SuitabilityScore)
                .ToList();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Groq evaluation failed for task {TaskId}; falling back to PostgreSQL heuristic score.", taskContext.TaskId);
            }
        }

        // Fallback: Ranked purely by verified PostgreSQL heuristic score
        var rankedHeuristic = candidateItems
            .OrderByDescending(ci => ci.HeuristicScore)
            .ThenBy(ci => ci.Metrics.Workload)
            .ToList();

        return rankedHeuristic.Select((ci, idx) => new SuitabilityResponseDTO
        {
            EmployeeId = ci.Metrics.EmployeeId,
            EmployeeNumber = ci.Metrics.EmployeeNumber,
            FullName = ci.Metrics.FullName,
            Role = ci.Metrics.Role,
            Workload = ci.Metrics.Workload,
            SuitabilityScore = ci.HeuristicScore,
            Rank = idx + 1,
            Rationale = $"Heuristic evaluation based on {ci.Metrics.Workload} active tasks and verified performance indicators."
        }).ToList();
    }

    public async Task<ApiResponseDTO<List<SuitabilityResponseDTO>>> GetSuitableEmployeesAsync(
        Guid taskId, UserRole callerRole, Guid callerDepartmentId)
    {
        var paged = await GetSuitableEmployeesPagedAsync(taskId, callerRole, callerDepartmentId, 1, 5);
        if (!paged.IsSuccess)
            return ApiResponseDTO<List<SuitabilityResponseDTO>>.Failure(paged.Message);

        return ApiResponseDTO<List<SuitabilityResponseDTO>>.Success(paged.Data?.Items ?? new List<SuitabilityResponseDTO>());
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>> GetSuitableEmployeesPagedAsync(
        Guid taskId, UserRole callerRole, Guid callerDepartmentId,
        int pageNumber = 1, int pageSize = 5)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var task = await _db.Tasks
            .AsNoTracking()
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task == null)
            return ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>.Failure("Task not found");

        if (!task.AssignedDepartmentId.HasValue)
            return ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>.Failure("Task has no assigned department");

        var eligibleRoles = GetEligibleRoles(callerRole);
        if (eligibleRoles.Length == 0)
            return ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>.Failure("Not authorized to view suitability");

        var candidateItems = await QueryCandidateMetricsAsync(
            task.AssignedDepartmentId.Value,
            eligibleRoles,
            task.Classification);

        var taskContext = new GroqTaskContext
        {
            TaskId = task.Id,
            Title = task.Title,
            Description = task.Description,
            Classification = (int)task.Classification,
            Priority = (int)task.PriorityLevel,
            RequiredRole = task.AssignmentScope.ToString()
        };

        var ranked = await EvaluateAndRankAsync(taskContext, candidateItems);

        var pagedItems = ranked
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>.Success(
            new PaginatedResponseDTO<SuitabilityResponseDTO>
            {
                Items = pagedItems,
                TotalCount = ranked.Count,
                PageNumber = pageNumber,
                PageSize = pageSize
            });
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>> GetSuitabilityPreviewAsync(
        Guid departmentId, int classification, UserRole callerRole,
        int pageNumber = 1, int pageSize = 5)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var eligibleRoles = GetEligibleRoles(callerRole);
        if (eligibleRoles.Length == 0)
            return ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>.Failure("Not authorized");

        var taskClassification = classification == 0 ? TaskClassification.RoutineDailyTask : TaskClassification.SpecialTask;

        var candidateItems = await QueryCandidateMetricsAsync(
            departmentId,
            eligibleRoles,
            taskClassification);

        var taskContext = new GroqTaskContext
        {
            TaskId = Guid.Empty,
            Title = classification == 0 ? "Routine Daily Task Preview" : "Special Task Preview",
            Classification = classification,
            Priority = 1
        };

        var ranked = await EvaluateAndRankAsync(taskContext, candidateItems);

        var pagedItems = ranked
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>.Success(
            new PaginatedResponseDTO<SuitabilityResponseDTO>
            {
                Items = pagedItems,
                TotalCount = ranked.Count,
                PageNumber = pageNumber,
                PageSize = pageSize
            });
    }

    public async Task<ApiResponseDTO<List<SuitabilityExplanationDTO>>> GetSuitabilityExplanationAsync(
        Guid taskId, Guid employeeId, UserRole callerRole, Guid callerDepartmentId)
    {
        var task = await _db.Tasks
            .AsNoTracking()
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task == null)
            return ApiResponseDTO<List<SuitabilityExplanationDTO>>.Failure("Task not found");

        if (!task.AssignedDepartmentId.HasValue)
            return ApiResponseDTO<List<SuitabilityExplanationDTO>>.Failure("Task has no assigned department");

        var eligibleRoles = GetEligibleRoles(callerRole);
        if (eligibleRoles.Length == 0)
            return ApiResponseDTO<List<SuitabilityExplanationDTO>>.Failure("Not authorized to view suitability");

        var candidateItems = await QueryCandidateMetricsAsync(
            task.AssignedDepartmentId.Value,
            eligibleRoles,
            task.Classification);

        var targetItem = candidateItems.FirstOrDefault(ci => ci.Metrics.EmployeeId == employeeId);
        if (targetItem == null)
        {
            return ApiResponseDTO<List<SuitabilityExplanationDTO>>.Failure("Employee not found or not eligible for this task");
        }

        var taskContext = new GroqTaskContext
        {
            TaskId = task.Id,
            Title = task.Title,
            Description = task.Description,
            Classification = (int)task.Classification,
            Priority = (int)task.PriorityLevel,
            RequiredRole = task.AssignmentScope.ToString()
        };

        var ranked = await EvaluateAndRankAsync(taskContext, candidateItems);
        var rankedRec = ranked.FirstOrDefault(r => r.EmployeeId == employeeId);

        var cfg = _configStore.GetConfig();
        var finalScore = rankedRec != null ? rankedRec.SuitabilityScore : targetItem.HeuristicScore;
        var rationale = rankedRec?.Rationale;
        var rank = rankedRec?.Rank;

        var isRoutine = task.Classification == TaskClassification.RoutineDailyTask;
        var completedTasks = isRoutine
            ? targetItem.Metrics.RoutineExperience
            : targetItem.Metrics.SpecialExperience;

        var workloadContribution = targetItem.WorkloadFactor * cfg.WorkloadWeight;
        var experienceContribution = targetItem.ExperienceFactor * cfg.ExperienceWeight;
        var recScoreContribution = targetItem.RecScore * cfg.RecScoreWeight;

        var explanation = $"{targetItem.Metrics.FullName} scored {Math.Round(finalScore, 4)}. " +
            $"They have {targetItem.Metrics.Workload} active task(s) (workload factor {Math.Round(targetItem.WorkloadFactor, 2)} × weight {cfg.WorkloadWeight} = {Math.Round(workloadContribution, 2)}), " +
            $"{completedTasks} completed {(isRoutine ? "routine" : "special")} tasks (experience factor {Math.Round(targetItem.ExperienceFactor, 2)} × weight {cfg.ExperienceWeight} = {Math.Round(experienceContribution, 2)}), " +
            $"and average recommendation score of {Math.Round(targetItem.RecScore, 2)} (rec score {Math.Round(targetItem.RecScore, 2)} × weight {cfg.RecScoreWeight} = {Math.Round(recScoreContribution, 2)})." +
            (!string.IsNullOrWhiteSpace(rationale) ? $" AI Rationale: {rationale}" : "");

        var explanationDto = new SuitabilityExplanationDTO
        {
            EmployeeId = targetItem.Metrics.EmployeeId,
            EmployeeNumber = targetItem.Metrics.EmployeeNumber,
            FullName = targetItem.Metrics.FullName,
            FinalScore = Math.Round(finalScore, 4),
            WorkloadFactor = Math.Round(targetItem.WorkloadFactor, 4),
            WorkloadWeight = cfg.WorkloadWeight,
            ExperienceFactor = Math.Round(targetItem.ExperienceFactor, 4),
            ExperienceWeight = cfg.ExperienceWeight,
            RecScore = Math.Round(targetItem.RecScore, 4),
            RecScoreWeight = cfg.RecScoreWeight,
            Explanation = explanation,
            Rank = rank,
            Rationale = rationale
        };

        return ApiResponseDTO<List<SuitabilityExplanationDTO>>.Success(new List<SuitabilityExplanationDTO> { explanationDto });
    }
}
