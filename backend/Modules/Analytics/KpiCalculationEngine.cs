using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using BackendTask = Backend.Models.Task;

namespace Backend.Modules.Analytics;

public class KpiCalculationEngine : IKpiCalculationEngine
{
    private readonly AppDbContext _db;
    private readonly ILogger<KpiCalculationEngine> _logger;
    private readonly ISafeFormulaParser _formulaParser;
    private readonly IKpiVariableRegistry _variableRegistry;

    public KpiCalculationEngine(
        AppDbContext db,
        ILogger<KpiCalculationEngine> logger,
        ISafeFormulaParser? formulaParser = null,
        IKpiVariableRegistry? variableRegistry = null)
    {
        _db = db;
        _logger = logger;
        _formulaParser = formulaParser ?? new SafeFormulaParser();
        _variableRegistry = variableRegistry ?? new KpiVariableRegistry();
    }

    #region Single Employee Evaluation

    public async System.Threading.Tasks.Task<EmployeeKpiEvaluationResultDTO> CalculateEmployeeKpiAsync(
        Guid employeeId,
        DateTime startDate,
        DateTime endDate,
        Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedStart = DateTime.SpecifyKind(startDate, DateTimeKind.Utc);
        var normalizedEnd = DateTime.SpecifyKind(endDate, DateTimeKind.Utc);

        if (normalizedStart > normalizedEnd)
        {
            (normalizedStart, normalizedEnd) = (normalizedEnd, normalizedStart);
        }

        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == employeeId, cancellationToken);

        if (user == null)
        {
            throw new KeyNotFoundException($"Employee with ID '{employeeId}' was not found.");
        }

        // Resolve prospective KPI configuration
        var configuration = await ResolveConfigurationAsync(user, normalizedStart, normalizedEnd, configurationId, cancellationToken);

        // Fetch employee's assigned tasks relevant to the timeframe
        var tasks = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.Attachments)
            .Where(t => t.Assignments.Any(a => a.AssignedUserId == employeeId))
            .Where(t => (t.CreatedAt >= normalizedStart && t.CreatedAt <= normalizedEnd)
                     || ((t.UpdatedAt ?? t.CreatedAt) >= normalizedStart && (t.UpdatedAt ?? t.CreatedAt) <= normalizedEnd)
                     || t.Assignments.Any(a => a.AssignedUserId == employeeId && a.AssignedAt >= normalizedStart && a.AssignedAt <= normalizedEnd))
            .ToListAsync(cancellationToken);

        // Fetch rework audit logs for completed tasks
        var completedTasks = tasks.Where(t => t.Status == Backend.Models.Enums.TaskStatus.Completed).ToList();
        var completedTaskIds = completedTasks.Select(t => t.Id).ToList();

        var reworkTaskIds = new HashSet<Guid>();
        if (completedTaskIds.Count > 0)
        {
            var reworkLogs = await _db.AuditLogs
                .Where(a => a.TargetEntity == "Task"
                    && a.TargetEntityId.HasValue
                    && completedTaskIds.Contains(a.TargetEntityId.Value)
                    && a.ActionType == AuditActionType.StatusChange
                    && ((a.OldValue == "DonePendingReview" && a.NewValue == "InProgress")
                        || (a.Description != null && a.Description.Contains("rework"))))
                .Select(a => a.TargetEntityId!.Value)
                .Distinct()
                .ToListAsync(cancellationToken);

            foreach (var id in reworkLogs)
            {
                reworkTaskIds.Add(id);
            }
        }

        return CalculateFromTasks(user, tasks, reworkTaskIds, normalizedStart, normalizedEnd, configuration);
    }

    public EmployeeKpiEvaluationResultDTO CalculateFromTasks(
        User employee,
        IReadOnlyList<BackendTask> tasks,
        IReadOnlySet<Guid> reworkTaskIds,
        DateTime startDate,
        DateTime endDate,
        KpiConfiguration? configuration = null)
    {
        var config = configuration ?? CreateDefaultFallbackConfiguration();

        int totalAssigned = tasks.Count;
        var completedTasks = tasks.Where(t => t.Status == Backend.Models.Enums.TaskStatus.Completed).ToList();
        int completedCount = completedTasks.Count;

        int onTimeCount = 0;
        int inFullCount = 0;
        int otifCount = 0;
        int reworkCount = 0;
        double totalHandlingHours = 0.0;

        foreach (var task in completedTasks)
        {
            var completionTime = task.UpdatedAt ?? task.CreatedAt;
            var effectiveDeadline = task.RevisedDeadline ?? task.Deadline;
            bool isOnTime = completionTime <= effectiveDeadline;
            if (isOnTime) onTimeCount++;

            bool isInFull = task.Attachments != null && task.Attachments.Count > 0;
            if (isInFull) inFullCount++;

            if (isOnTime && isInFull) otifCount++;

            bool hasRework = reworkTaskIds.Contains(task.Id) || !string.IsNullOrWhiteSpace(task.PushBackComment);
            if (hasRework) reworkCount++;

            var assignment = task.Assignments?.FirstOrDefault(a => a.AssignedUserId == employee.Id);
            var startTime = assignment?.AssignedAt ?? task.CreatedAt;
            var endTime = task.UpdatedAt ?? task.CreatedAt;
            if (endTime < startTime) endTime = startTime;

            totalHandlingHours += (endTime - startTime).TotalHours;
        }

        int accurateCount = Math.Max(0, completedCount - reworkCount);

        var (metrics, overallScore, overallRating) = EvaluateMetrics(
            config,
            totalAssigned,
            completedCount,
            onTimeCount,
            inFullCount,
            otifCount,
            reworkCount,
            accurateCount,
            totalHandlingHours);

        return new EmployeeKpiEvaluationResultDTO
        {
            EmployeeId = employee.Id,
            EmployeeName = $"{employee.FirstName} {employee.LastName}".Trim(),
            EmployeeNumber = employee.EmployeeNumber,
            DepartmentId = employee.DepartmentId,
            DepartmentName = employee.Department?.Name,
            JobPositionTitle = employee.JobPosition?.Name,
            Role = employee.Role.ToString(),
            PeriodStart = startDate,
            PeriodEnd = endDate,
            ConfigurationId = config.Id,
            ConfigurationTitle = config.Title,
            TotalAssignedTasks = totalAssigned,
            CompletedTasksCount = completedCount,
            OnTimeTasksCount = onTimeCount,
            InFullTasksCount = inFullCount,
            OtifTasksCount = otifCount,
            ReworkTasksCount = reworkCount,
            AccurateTasksCount = accurateCount,
            TotalHandlingHours = Math.Round(totalHandlingHours, 2),
            OverallScore = overallScore,
            OverallRating = overallRating,
            Metrics = metrics
        };
    }

    #endregion

    #region Hierarchical Scope Aggregation

    public async System.Threading.Tasks.Task<DepartmentKpiEvaluationResultDTO> CalculateDepartmentKpiAsync(
        Guid departmentId,
        DateTime startDate,
        DateTime endDate,
        UserRole? roleFilter = null,
        Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedStart = DateTime.SpecifyKind(startDate, DateTimeKind.Utc);
        var normalizedEnd = DateTime.SpecifyKind(endDate, DateTimeKind.Utc);

        if (normalizedStart > normalizedEnd)
        {
            (normalizedStart, normalizedEnd) = (normalizedEnd, normalizedStart);
        }

        var department = await _db.Departments
            .Include(d => d.Users)
                .ThenInclude(u => u.JobPosition)
            .FirstOrDefaultAsync(d => d.Id == departmentId, cancellationToken);

        if (department == null)
        {
            throw new KeyNotFoundException($"Department with ID '{departmentId}' was not found.");
        }

        var teams = await _db.Teams
            .Include(t => t.TeamLeader)
            .Include(t => t.Members)
                .ThenInclude(m => m.User)
            .Where(t => t.DepartmentId == departmentId && t.IsActive)
            .ToListAsync(cancellationToken);

        var matchingUsers = department.Users.AsEnumerable();
        if (roleFilter.HasValue)
        {
            matchingUsers = matchingUsers.Where(u => u.Role == roleFilter.Value);
        }
        var userList = matchingUsers.OrderBy(u => u.FirstName).ThenBy(u => u.LastName).ToList();

        var employeeEvaluations = new List<EmployeeKpiEvaluationResultDTO>();
        foreach (var user in userList)
        {
            var eval = await CalculateEmployeeKpiAsync(user.Id, normalizedStart, normalizedEnd, configurationId, cancellationToken);
            employeeEvaluations.Add(eval);
        }

        var config = await ResolveConfigurationForScopeAsync(departmentId, roleFilter, normalizedStart, normalizedEnd, configurationId, cancellationToken);

        return AggregateDepartmentEvaluation(
            department,
            teams,
            employeeEvaluations,
            normalizedStart,
            normalizedEnd,
            roleFilter?.ToString(),
            config);
    }

    public async System.Threading.Tasks.Task<TeamKpiEvaluationResultDTO> CalculateTeamKpiAsync(
        Guid teamId,
        DateTime startDate,
        DateTime endDate,
        UserRole? roleFilter = null,
        Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedStart = DateTime.SpecifyKind(startDate, DateTimeKind.Utc);
        var normalizedEnd = DateTime.SpecifyKind(endDate, DateTimeKind.Utc);

        if (normalizedStart > normalizedEnd)
        {
            (normalizedStart, normalizedEnd) = (normalizedEnd, normalizedStart);
        }

        var team = await _db.Teams
            .Include(t => t.Department)
            .Include(t => t.TeamLeader)
            .Include(t => t.Members)
                .ThenInclude(m => m.User)
                    .ThenInclude(u => u!.JobPosition)
            .Include(t => t.Members)
                .ThenInclude(m => m.User)
                    .ThenInclude(u => u!.Department)
            .FirstOrDefaultAsync(t => t.Id == teamId, cancellationToken);

        if (team == null)
        {
            throw new KeyNotFoundException($"Team with ID '{teamId}' was not found.");
        }

        var memberUsers = team.Members
            .Where(m => m.User != null)
            .Select(m => m.User!)
            .DistinctBy(u => u.Id)
            .AsEnumerable();

        if (roleFilter.HasValue)
        {
            memberUsers = memberUsers.Where(u => u.Role == roleFilter.Value);
        }
        var userList = memberUsers.OrderBy(u => u.FirstName).ThenBy(u => u.LastName).ToList();

        var memberEvaluations = new List<EmployeeKpiEvaluationResultDTO>();
        foreach (var user in userList)
        {
            var eval = await CalculateEmployeeKpiAsync(user.Id, normalizedStart, normalizedEnd, configurationId, cancellationToken);
            memberEvaluations.Add(eval);
        }

        var config = await ResolveConfigurationForScopeAsync(team.DepartmentId, roleFilter, normalizedStart, normalizedEnd, configurationId, cancellationToken);

        return AggregateTeamEvaluation(
            team,
            memberEvaluations,
            normalizedStart,
            normalizedEnd,
            roleFilter?.ToString(),
            config);
    }

    public async System.Threading.Tasks.Task<KpiHierarchyScopeResultDTO> CalculateHierarchicalScopeAsync(
        Guid? departmentId,
        Guid? teamId,
        DateTime startDate,
        DateTime endDate,
        UserRole? roleFilter = null,
        Guid? configurationId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedStart = DateTime.SpecifyKind(startDate, DateTimeKind.Utc);
        var normalizedEnd = DateTime.SpecifyKind(endDate, DateTimeKind.Utc);

        if (normalizedStart > normalizedEnd)
        {
            (normalizedStart, normalizedEnd) = (normalizedEnd, normalizedStart);
        }

        if (teamId.HasValue)
        {
            var teamResult = await CalculateTeamKpiAsync(teamId.Value, normalizedStart, normalizedEnd, roleFilter, configurationId, cancellationToken);
            return new KpiHierarchyScopeResultDTO
            {
                ScopeLevel = "Team",
                ScopeId = teamResult.TeamId,
                ScopeName = teamResult.TeamName,
                ParentScopeId = teamResult.DepartmentId,
                ParentScopeName = teamResult.DepartmentName,
                PeriodStart = normalizedStart,
                PeriodEnd = normalizedEnd,
                RoleFilter = roleFilter?.ToString(),
                ConfigurationId = teamResult.ConfigurationId,
                ConfigurationTitle = teamResult.ConfigurationTitle,
                TotalDepartments = teamResult.DepartmentId.HasValue ? 1 : 0,
                TotalTeams = 1,
                TotalEmployees = teamResult.TotalMembers,
                TotalAssignedTasks = teamResult.TotalAssignedTasks,
                CompletedTasksCount = teamResult.CompletedTasksCount,
                OnTimeTasksCount = teamResult.OnTimeTasksCount,
                InFullTasksCount = teamResult.InFullTasksCount,
                OtifTasksCount = teamResult.OtifTasksCount,
                ReworkTasksCount = teamResult.ReworkTasksCount,
                AccurateTasksCount = teamResult.AccurateTasksCount,
                TotalHandlingHours = teamResult.TotalHandlingHours,
                OverallScore = teamResult.OverallScore,
                AverageEmployeeScore = teamResult.AverageEmployeeScore,
                OverallRating = teamResult.OverallRating,
                Metrics = teamResult.Metrics,
                Teams = new List<TeamKpiSummaryDTO>
                {
                    new()
                    {
                        TeamId = teamResult.TeamId,
                        TeamName = teamResult.TeamName,
                        DepartmentId = teamResult.DepartmentId,
                        DepartmentName = teamResult.DepartmentName,
                        TeamLeaderId = teamResult.TeamLeaderId,
                        TeamLeaderName = teamResult.TeamLeaderName,
                        MemberCount = teamResult.TotalMembers,
                        TotalAssignedTasks = teamResult.TotalAssignedTasks,
                        CompletedTasksCount = teamResult.CompletedTasksCount,
                        OverallScore = teamResult.OverallScore,
                        OverallRating = teamResult.OverallRating
                    }
                },
                Employees = teamResult.Employees
            };
        }

        if (departmentId.HasValue)
        {
            var deptResult = await CalculateDepartmentKpiAsync(departmentId.Value, normalizedStart, normalizedEnd, roleFilter, configurationId, cancellationToken);
            return new KpiHierarchyScopeResultDTO
            {
                ScopeLevel = "Department",
                ScopeId = deptResult.DepartmentId,
                ScopeName = deptResult.DepartmentName,
                PeriodStart = normalizedStart,
                PeriodEnd = normalizedEnd,
                RoleFilter = roleFilter?.ToString(),
                ConfigurationId = deptResult.ConfigurationId,
                ConfigurationTitle = deptResult.ConfigurationTitle,
                TotalDepartments = 1,
                TotalTeams = deptResult.TotalTeams,
                TotalEmployees = deptResult.TotalEmployees,
                TotalAssignedTasks = deptResult.TotalAssignedTasks,
                CompletedTasksCount = deptResult.CompletedTasksCount,
                OnTimeTasksCount = deptResult.OnTimeTasksCount,
                InFullTasksCount = deptResult.InFullTasksCount,
                OtifTasksCount = deptResult.OtifTasksCount,
                ReworkTasksCount = deptResult.ReworkTasksCount,
                AccurateTasksCount = deptResult.AccurateTasksCount,
                TotalHandlingHours = deptResult.TotalHandlingHours,
                OverallScore = deptResult.OverallScore,
                AverageEmployeeScore = deptResult.AverageEmployeeScore,
                OverallRating = deptResult.OverallRating,
                Metrics = deptResult.Metrics,
                Departments = new List<DepartmentKpiSummaryDTO>
                {
                    new()
                    {
                        DepartmentId = deptResult.DepartmentId,
                        DepartmentName = deptResult.DepartmentName,
                        TotalEmployees = deptResult.TotalEmployees,
                        TotalTeams = deptResult.TotalTeams,
                        TotalAssignedTasks = deptResult.TotalAssignedTasks,
                        CompletedTasksCount = deptResult.CompletedTasksCount,
                        OverallScore = deptResult.OverallScore,
                        OverallRating = deptResult.OverallRating
                    }
                },
                Teams = deptResult.Teams,
                Employees = deptResult.Employees
            };
        }

        // Company / All active departments level
        var departments = await _db.Departments
            .Where(d => d.IsActive)
            .OrderBy(d => d.Name)
            .ToListAsync(cancellationToken);

        var deptSummaries = new List<DepartmentKpiSummaryDTO>();
        var allTeamSummaries = new List<TeamKpiSummaryDTO>();
        var allEmployeeEvaluations = new List<EmployeeKpiEvaluationResultDTO>();

        foreach (var dept in departments)
        {
            var deptEval = await CalculateDepartmentKpiAsync(dept.Id, normalizedStart, normalizedEnd, roleFilter, configurationId, cancellationToken);
            deptSummaries.Add(new DepartmentKpiSummaryDTO
            {
                DepartmentId = dept.Id,
                DepartmentName = dept.Name,
                TotalEmployees = deptEval.TotalEmployees,
                TotalTeams = deptEval.TotalTeams,
                TotalAssignedTasks = deptEval.TotalAssignedTasks,
                CompletedTasksCount = deptEval.CompletedTasksCount,
                OverallScore = deptEval.OverallScore,
                OverallRating = deptEval.OverallRating
            });
            allTeamSummaries.AddRange(deptEval.Teams);
            allEmployeeEvaluations.AddRange(deptEval.Employees);
        }

        var config = await ResolveConfigurationForScopeAsync(null, roleFilter, normalizedStart, normalizedEnd, configurationId, cancellationToken);

        int totalAssigned = allEmployeeEvaluations.Sum(e => e.TotalAssignedTasks);
        int completedCount = allEmployeeEvaluations.Sum(e => e.CompletedTasksCount);
        int onTimeCount = allEmployeeEvaluations.Sum(e => e.OnTimeTasksCount);
        int inFullCount = allEmployeeEvaluations.Sum(e => e.InFullTasksCount);
        int otifCount = allEmployeeEvaluations.Sum(e => e.OtifTasksCount);
        int reworkCount = allEmployeeEvaluations.Sum(e => e.ReworkTasksCount);
        int accurateCount = allEmployeeEvaluations.Sum(e => e.AccurateTasksCount);
        double totalHandlingHours = Math.Round(allEmployeeEvaluations.Sum(e => e.TotalHandlingHours), 2);

        var (companyMetrics, companyScore, companyRating) = EvaluateMetrics(
            config,
            totalAssigned,
            completedCount,
            onTimeCount,
            inFullCount,
            otifCount,
            reworkCount,
            accurateCount,
            totalHandlingHours);

        double avgEmpScore = allEmployeeEvaluations.Count > 0
            ? Math.Round(allEmployeeEvaluations.Average(e => e.OverallScore), 2)
            : 0.0;

        return new KpiHierarchyScopeResultDTO
        {
            ScopeLevel = "Company",
            ScopeId = null,
            ScopeName = "All Departments",
            PeriodStart = normalizedStart,
            PeriodEnd = normalizedEnd,
            RoleFilter = roleFilter?.ToString(),
            ConfigurationId = config.Id,
            ConfigurationTitle = config.Title,
            TotalDepartments = departments.Count,
            TotalTeams = allTeamSummaries.Count,
            TotalEmployees = allEmployeeEvaluations.Count,
            TotalAssignedTasks = totalAssigned,
            CompletedTasksCount = completedCount,
            OnTimeTasksCount = onTimeCount,
            InFullTasksCount = inFullCount,
            OtifTasksCount = otifCount,
            ReworkTasksCount = reworkCount,
            AccurateTasksCount = accurateCount,
            TotalHandlingHours = totalHandlingHours,
            OverallScore = companyScore,
            AverageEmployeeScore = avgEmpScore,
            OverallRating = companyRating,
            Metrics = companyMetrics,
            Departments = deptSummaries,
            Teams = allTeamSummaries,
            Employees = allEmployeeEvaluations.OrderBy(e => e.EmployeeName).ToList()
        };
    }

    public DepartmentKpiEvaluationResultDTO AggregateDepartmentEvaluation(
        Department department,
        IReadOnlyList<Team> teams,
        IReadOnlyList<EmployeeKpiEvaluationResultDTO> employeeEvaluations,
        DateTime startDate,
        DateTime endDate,
        string? roleFilter = null,
        KpiConfiguration? configuration = null)
    {
        var config = configuration ?? CreateDefaultFallbackConfiguration();

        int totalAssigned = employeeEvaluations.Sum(e => e.TotalAssignedTasks);
        int completedCount = employeeEvaluations.Sum(e => e.CompletedTasksCount);
        int onTimeCount = employeeEvaluations.Sum(e => e.OnTimeTasksCount);
        int inFullCount = employeeEvaluations.Sum(e => e.InFullTasksCount);
        int otifCount = employeeEvaluations.Sum(e => e.OtifTasksCount);
        int reworkCount = employeeEvaluations.Sum(e => e.ReworkTasksCount);
        int accurateCount = employeeEvaluations.Sum(e => e.AccurateTasksCount);
        double totalHandlingHours = Math.Round(employeeEvaluations.Sum(e => e.TotalHandlingHours), 2);

        var (metrics, overallScore, overallRating) = EvaluateMetrics(
            config,
            totalAssigned,
            completedCount,
            onTimeCount,
            inFullCount,
            otifCount,
            reworkCount,
            accurateCount,
            totalHandlingHours);

        double avgEmployeeScore = employeeEvaluations.Count > 0
            ? Math.Round(employeeEvaluations.Average(e => e.OverallScore), 2)
            : 0.0;

        // Build Team summaries for this department
        var teamSummaries = new List<TeamKpiSummaryDTO>();
        foreach (var team in teams)
        {
            var memberUserIds = team.Members?.Select(m => m.UserId).ToHashSet() ?? new HashSet<Guid>();
            var teamEmployeeEvals = employeeEvaluations.Where(e => memberUserIds.Contains(e.EmployeeId)).ToList();

            int teamAssigned = teamEmployeeEvals.Sum(e => e.TotalAssignedTasks);
            int teamCompleted = teamEmployeeEvals.Sum(e => e.CompletedTasksCount);
            int teamOnTime = teamEmployeeEvals.Sum(e => e.OnTimeTasksCount);
            int teamInFull = teamEmployeeEvals.Sum(e => e.InFullTasksCount);
            int teamOtif = teamEmployeeEvals.Sum(e => e.OtifTasksCount);
            int teamRework = teamEmployeeEvals.Sum(e => e.ReworkTasksCount);
            int teamAccurate = teamEmployeeEvals.Sum(e => e.AccurateTasksCount);
            double teamHandlingHours = teamEmployeeEvals.Sum(e => e.TotalHandlingHours);

            var (_, teamOverallScore, teamOverallRating) = EvaluateMetrics(
                config,
                teamAssigned,
                teamCompleted,
                teamOnTime,
                teamInFull,
                teamOtif,
                teamRework,
                teamAccurate,
                teamHandlingHours);

            int memberCount = team.Members != null
                ? (string.IsNullOrWhiteSpace(roleFilter)
                    ? team.Members.Count
                    : team.Members.Count(m => m.User != null && string.Equals(m.User.Role.ToString(), roleFilter, StringComparison.OrdinalIgnoreCase)))
                : 0;

            teamSummaries.Add(new TeamKpiSummaryDTO
            {
                TeamId = team.Id,
                TeamName = team.Name,
                DepartmentId = department.Id,
                DepartmentName = department.Name,
                TeamLeaderId = team.TeamLeaderId,
                TeamLeaderName = team.TeamLeader != null
                    ? $"{team.TeamLeader.FirstName} {team.TeamLeader.LastName}".Trim()
                    : null,
                MemberCount = memberCount,
                TotalAssignedTasks = teamAssigned,
                CompletedTasksCount = teamCompleted,
                OverallScore = teamOverallScore,
                OverallRating = teamOverallRating
            });
        }

        return new DepartmentKpiEvaluationResultDTO
        {
            DepartmentId = department.Id,
            DepartmentName = department.Name,
            PeriodStart = startDate,
            PeriodEnd = endDate,
            RoleFilter = roleFilter,
            ConfigurationId = config.Id,
            ConfigurationTitle = config.Title,
            TotalEmployees = employeeEvaluations.Count,
            TotalTeams = teams.Count,
            TotalAssignedTasks = totalAssigned,
            CompletedTasksCount = completedCount,
            OnTimeTasksCount = onTimeCount,
            InFullTasksCount = inFullCount,
            OtifTasksCount = otifCount,
            ReworkTasksCount = reworkCount,
            AccurateTasksCount = accurateCount,
            TotalHandlingHours = totalHandlingHours,
            OverallScore = overallScore,
            AverageEmployeeScore = avgEmployeeScore,
            OverallRating = overallRating,
            Metrics = metrics,
            Teams = teamSummaries,
            Employees = employeeEvaluations.OrderBy(e => e.EmployeeName).ToList()
        };
    }

    public TeamKpiEvaluationResultDTO AggregateTeamEvaluation(
        Team team,
        IReadOnlyList<EmployeeKpiEvaluationResultDTO> memberEvaluations,
        DateTime startDate,
        DateTime endDate,
        string? roleFilter = null,
        KpiConfiguration? configuration = null)
    {
        var config = configuration ?? CreateDefaultFallbackConfiguration();

        int totalAssigned = memberEvaluations.Sum(e => e.TotalAssignedTasks);
        int completedCount = memberEvaluations.Sum(e => e.CompletedTasksCount);
        int onTimeCount = memberEvaluations.Sum(e => e.OnTimeTasksCount);
        int inFullCount = memberEvaluations.Sum(e => e.InFullTasksCount);
        int otifCount = memberEvaluations.Sum(e => e.OtifTasksCount);
        int reworkCount = memberEvaluations.Sum(e => e.ReworkTasksCount);
        int accurateCount = memberEvaluations.Sum(e => e.AccurateTasksCount);
        double totalHandlingHours = Math.Round(memberEvaluations.Sum(e => e.TotalHandlingHours), 2);

        var (metrics, overallScore, overallRating) = EvaluateMetrics(
            config,
            totalAssigned,
            completedCount,
            onTimeCount,
            inFullCount,
            otifCount,
            reworkCount,
            accurateCount,
            totalHandlingHours);

        double avgEmployeeScore = memberEvaluations.Count > 0
            ? Math.Round(memberEvaluations.Average(e => e.OverallScore), 2)
            : 0.0;

        return new TeamKpiEvaluationResultDTO
        {
            TeamId = team.Id,
            TeamName = team.Name,
            DepartmentId = team.DepartmentId,
            DepartmentName = team.Department?.Name,
            TeamLeaderId = team.TeamLeaderId,
            TeamLeaderName = team.TeamLeader != null
                ? $"{team.TeamLeader.FirstName} {team.TeamLeader.LastName}".Trim()
                : null,
            PeriodStart = startDate,
            PeriodEnd = endDate,
            RoleFilter = roleFilter,
            ConfigurationId = config.Id,
            ConfigurationTitle = config.Title,
            TotalMembers = memberEvaluations.Count,
            TotalAssignedTasks = totalAssigned,
            CompletedTasksCount = completedCount,
            OnTimeTasksCount = onTimeCount,
            InFullTasksCount = inFullCount,
            OtifTasksCount = otifCount,
            ReworkTasksCount = reworkCount,
            AccurateTasksCount = accurateCount,
            TotalHandlingHours = totalHandlingHours,
            OverallScore = overallScore,
            AverageEmployeeScore = avgEmployeeScore,
            OverallRating = overallRating,
            Metrics = metrics,
            Employees = memberEvaluations.OrderBy(e => e.EmployeeName).ToList()
        };
    }

    public (List<KpiMetricValueDTO> Metrics, double OverallScore, string OverallRating) EvaluateMetrics(
        KpiConfiguration config,
        int totalAssigned,
        int completedCount,
        int onTimeCount,
        int inFullCount,
        int otifCount,
        int reworkCount,
        int accurateCount,
        double totalHandlingHours)
    {
        double completionRate = totalAssigned == 0 ? 0.0 : Math.Round((double)completedCount / totalAssigned * 100.0, 2);
        double otifRate = completedCount == 0 ? 0.0 : Math.Round((double)otifCount / completedCount * 100.0, 2);
        double accuracyRate = completedCount == 0 ? 0.0 : Math.Round((double)accurateCount / completedCount * 100.0, 2);
        double ahtHours = completedCount == 0 ? 0.0 : Math.Round(totalHandlingHours / completedCount, 2);

        var metrics = new List<KpiMetricValueDTO>();
        var itemsToEvaluate = (config.Items != null && config.Items.Count > 0)
            ? config.Items.OrderBy(i => i.Order).ToList()
            : CreateDefaultFallbackConfiguration().Items.ToList();

        IReadOnlyDictionary<string, double>? resolvedVariables = null;

        foreach (var item in itemsToEvaluate)
        {
            double actualValue;

            if (item.IsCustomFormula || !string.IsNullOrWhiteSpace(item.CustomFormula))
            {
                if (string.IsNullOrWhiteSpace(item.CustomFormula))
                {
                    _logger.LogWarning("KPI Item {MetricCode} has IsCustomFormula=true but empty CustomFormula expression.", item.MetricCode);
                    actualValue = 0.0;
                }
                else
                {
                    resolvedVariables ??= _variableRegistry.ResolveVariableValues(
                        totalAssigned,
                        completedCount,
                        onTimeCount,
                        inFullCount,
                        otifCount,
                        reworkCount,
                        accurateCount,
                        totalHandlingHours);

                    try
                    {
                        var raw = _formulaParser.Evaluate(item.CustomFormula, resolvedVariables);
                        actualValue = double.IsNaN(raw) || double.IsInfinity(raw) ? 0.0 : Math.Round(raw, 2);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to evaluate custom formula '{Formula}' for metric '{MetricCode}'. Defaulting to 0.0.", item.CustomFormula, item.MetricCode);
                        actualValue = 0.0;
                    }
                }
            }
            else
            {
                actualValue = item.MetricCode.ToUpperInvariant() switch
                {
                    "OTIF" => otifRate,
                    "ORDER_ACCURACY" => accuracyRate,
                    "COMPLETION_RATE" or "TASK_COMPLETION_RATE" => completionRate,
                    "AHT" or "AVERAGE_HANDLING_TIME" => ahtHours,
                    _ => 0.0
                };
            }

            string rating = EvaluateThreshold(actualValue, item);
            double weightedScore = CalculateWeightedScore(actualValue, item);

            metrics.Add(new KpiMetricValueDTO
            {
                MetricCode = item.MetricCode,
                Name = item.Name,
                ActualValue = actualValue,
                Unit = item.Unit,
                TargetValue = item.TargetValue,
                Weight = item.Weight,
                GreenThreshold = item.GreenThreshold,
                AmberThreshold = item.AmberThreshold,
                RedThreshold = item.RedThreshold,
                IsLowerBetter = item.IsLowerBetter,
                IsCustomFormula = item.IsCustomFormula || !string.IsNullOrWhiteSpace(item.CustomFormula),
                CustomFormula = item.CustomFormula,
                Rating = rating,
                WeightedScore = weightedScore
            });
        }

        double overallScore = Math.Round(metrics.Sum(m => m.WeightedScore), 2);
        string overallRating = DetermineOverallRating(metrics, overallScore, totalAssigned, config.OverallGreenThreshold, config.OverallAmberThreshold);

        return (metrics, overallScore, overallRating);
    }

    #endregion

    #region Configuration Resolution & Helpers

    private async System.Threading.Tasks.Task<KpiConfiguration> ResolveConfigurationAsync(
        User user,
        DateTime startDate,
        DateTime endDate,
        Guid? configurationId,
        CancellationToken cancellationToken)
    {
        if (configurationId.HasValue)
        {
            var specified = await _db.KpiConfigurations
                .Include(c => c.Items)
                .FirstOrDefaultAsync(c => c.Id == configurationId.Value, cancellationToken);

            if (specified != null) return specified;
        }

        var userRoleStr = user.Role.ToString();

        // 1. Prospective configuration matching role and department
        var activeConfigs = await _db.KpiConfigurations
            .Include(c => c.Items)
            .Where(c => c.IsActive && c.EffectiveStartDate <= endDate && (c.EffectiveEndDate == null || c.EffectiveEndDate >= startDate))
            .OrderByDescending(c => c.EffectiveStartDate)
            .ToListAsync(cancellationToken);

        var matched = activeConfigs.FirstOrDefault(c => c.DepartmentId == user.DepartmentId && string.Equals(c.TargetRole, userRoleStr, StringComparison.OrdinalIgnoreCase))
            ?? activeConfigs.FirstOrDefault(c => c.DepartmentId == user.DepartmentId && string.IsNullOrEmpty(c.TargetRole))
            ?? activeConfigs.FirstOrDefault(c => c.DepartmentId == null && string.Equals(c.TargetRole, userRoleStr, StringComparison.OrdinalIgnoreCase))
            ?? activeConfigs.FirstOrDefault(c => c.DepartmentId == null && string.IsNullOrEmpty(c.TargetRole));

        if (matched != null) return matched;

        // Fallback to default seeded configuration
        var defaultSeed = await _db.KpiConfigurations
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == KpiDefaultSeeder.DefaultConfigurationId, cancellationToken);

        return defaultSeed ?? CreateDefaultFallbackConfiguration();
    }

    private async System.Threading.Tasks.Task<KpiConfiguration> ResolveConfigurationForScopeAsync(
        Guid? departmentId,
        UserRole? roleFilter,
        DateTime startDate,
        DateTime endDate,
        Guid? configurationId,
        CancellationToken cancellationToken)
    {
        if (configurationId.HasValue)
        {
            var specified = await _db.KpiConfigurations
                .Include(c => c.Items)
                .FirstOrDefaultAsync(c => c.Id == configurationId.Value, cancellationToken);

            if (specified != null) return specified;
        }

        var targetRoleStr = roleFilter?.ToString();

        var activeConfigs = await _db.KpiConfigurations
            .Include(c => c.Items)
            .Where(c => c.IsActive && c.EffectiveStartDate <= endDate && (c.EffectiveEndDate == null || c.EffectiveEndDate >= startDate))
            .OrderByDescending(c => c.EffectiveStartDate)
            .ToListAsync(cancellationToken);

        KpiConfiguration? matched = null;
        if (departmentId.HasValue && !string.IsNullOrWhiteSpace(targetRoleStr))
        {
            matched = activeConfigs.FirstOrDefault(c => c.DepartmentId == departmentId.Value && string.Equals(c.TargetRole, targetRoleStr, StringComparison.OrdinalIgnoreCase));
        }

        if (matched == null && departmentId.HasValue)
        {
            matched = activeConfigs.FirstOrDefault(c => c.DepartmentId == departmentId.Value && string.IsNullOrEmpty(c.TargetRole));
        }

        if (matched == null && !string.IsNullOrWhiteSpace(targetRoleStr))
        {
            matched = activeConfigs.FirstOrDefault(c => c.DepartmentId == null && string.Equals(c.TargetRole, targetRoleStr, StringComparison.OrdinalIgnoreCase));
        }

        if (matched == null)
        {
            matched = activeConfigs.FirstOrDefault(c => c.DepartmentId == null && string.IsNullOrEmpty(c.TargetRole));
        }

        if (matched != null) return matched;

        var defaultSeed = await _db.KpiConfigurations
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == KpiDefaultSeeder.DefaultConfigurationId, cancellationToken);

        return defaultSeed ?? CreateDefaultFallbackConfiguration();
    }

    private static string EvaluateThreshold(double actualValue, KpiItem item)
    {
        if (item.IsLowerBetter)
        {
            if (actualValue <= item.GreenThreshold)
                return "Green";
            if (actualValue <= item.AmberThreshold)
                return "Amber";
            return "Red";
        }

        if (actualValue >= item.GreenThreshold)
            return "Green";
        if (actualValue >= item.AmberThreshold)
            return "Amber";
        return "Red";
    }

    private static double CalculateWeightedScore(double actualValue, KpiItem item)
    {
        if (item.TargetValue <= 0 || item.Weight <= 0) return 0.0;

        if (item.IsLowerBetter)
        {
            if (actualValue <= 0) return item.Weight;
            if (actualValue <= item.TargetValue) return item.Weight;
            double ratio = Math.Max(0.0, item.TargetValue / actualValue);
            return Math.Round(Math.Min(1.0, ratio) * item.Weight, 2);
        }
        else
        {
            double ratio = Math.Max(0.0, actualValue / item.TargetValue);
            return Math.Round(Math.Min(1.0, ratio) * item.Weight, 2);
        }
    }

    public static string DetermineOverallRating(
        List<KpiMetricValueDTO> metrics,
        double overallScore,
        int totalAssigned,
        double greenThreshold = 85.0,
        double amberThreshold = 70.0)
    {
        if (totalAssigned == 0) return "Amber";

        if (metrics.Any(m => m.Rating == "Red") || overallScore < amberThreshold)
            return "Red";

        if (metrics.Any(m => m.Rating == "Amber") || overallScore < greenThreshold)
            return "Amber";

        return "Green";
    }

    public static KpiConfiguration CreateDefaultFallbackConfiguration()
    {
        return new KpiConfiguration
        {
            Id = KpiDefaultSeeder.DefaultConfigurationId,
            Title = "Default Logistics Operations KPI",
            Description = "Standard prospective evaluation configuration containing the 4 canonical logistics KPIs.",
            IsActive = true,
            EffectiveStartDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            OverallGreenThreshold = 85.0,
            OverallAmberThreshold = 70.0,
            OverallRedThreshold = 60.0,
            Items = new List<KpiItem>
            {
                new()
                {
                    Id = KpiDefaultSeeder.DefaultOtifItemId,
                    MetricCode = "OTIF",
                    Name = "On-Time In-Full Rate",
                    Weight = 25.0,
                    Unit = "%",
                    TargetValue = 95.0,
                    GreenThreshold = 90.0,
                    AmberThreshold = 75.0,
                    RedThreshold = 60.0,
                    IsLowerBetter = false,
                    Order = 1
                },
                new()
                {
                    Id = KpiDefaultSeeder.DefaultAccuracyItemId,
                    MetricCode = "ORDER_ACCURACY",
                    Name = "Order Accuracy Rate",
                    Weight = 25.0,
                    Unit = "%",
                    TargetValue = 98.0,
                    GreenThreshold = 95.0,
                    AmberThreshold = 85.0,
                    RedThreshold = 70.0,
                    IsLowerBetter = false,
                    Order = 2
                },
                new()
                {
                    Id = KpiDefaultSeeder.DefaultCompletionItemId,
                    MetricCode = "COMPLETION_RATE",
                    Name = "Task Completion Rate",
                    Weight = 25.0,
                    Unit = "%",
                    TargetValue = 95.0,
                    GreenThreshold = 90.0,
                    AmberThreshold = 80.0,
                    RedThreshold = 70.0,
                    IsLowerBetter = false,
                    Order = 3
                },
                new()
                {
                    Id = KpiDefaultSeeder.DefaultAhtItemId,
                    MetricCode = "AHT",
                    Name = "Average Handling Time",
                    Weight = 25.0,
                    Unit = "hours",
                    TargetValue = 4.0,
                    GreenThreshold = 4.0,
                    AmberThreshold = 8.0,
                    RedThreshold = 12.0,
                    IsLowerBetter = true,
                    Order = 4
                }
            }
        };
    }

    #endregion
}
