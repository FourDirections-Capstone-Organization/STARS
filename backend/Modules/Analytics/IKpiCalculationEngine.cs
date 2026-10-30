using BackendTask = Backend.Models.Task;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.Analytics;

public interface IKpiCalculationEngine
{
    System.Threading.Tasks.Task<EmployeeKpiEvaluationResultDTO> CalculateEmployeeKpiAsync(
        Guid employeeId,
        DateTime startDate,
        DateTime endDate,
        Guid? configurationId = null,
        CancellationToken cancellationToken = default);

    EmployeeKpiEvaluationResultDTO CalculateFromTasks(
        User employee,
        IReadOnlyList<BackendTask> tasks,
        IReadOnlySet<Guid> reworkTaskIds,
        DateTime startDate,
        DateTime endDate,
        KpiConfiguration? configuration = null);

    System.Threading.Tasks.Task<DepartmentKpiEvaluationResultDTO> CalculateDepartmentKpiAsync(
        Guid departmentId,
        DateTime startDate,
        DateTime endDate,
        UserRole? roleFilter = null,
        Guid? configurationId = null,
        CancellationToken cancellationToken = default);

    System.Threading.Tasks.Task<TeamKpiEvaluationResultDTO> CalculateTeamKpiAsync(
        Guid teamId,
        DateTime startDate,
        DateTime endDate,
        UserRole? roleFilter = null,
        Guid? configurationId = null,
        CancellationToken cancellationToken = default);

    System.Threading.Tasks.Task<KpiHierarchyScopeResultDTO> CalculateHierarchicalScopeAsync(
        Guid? departmentId,
        Guid? teamId,
        DateTime startDate,
        DateTime endDate,
        UserRole? roleFilter = null,
        Guid? configurationId = null,
        CancellationToken cancellationToken = default);

    DepartmentKpiEvaluationResultDTO AggregateDepartmentEvaluation(
        Department department,
        IReadOnlyList<Team> teams,
        IReadOnlyList<EmployeeKpiEvaluationResultDTO> employeeEvaluations,
        DateTime startDate,
        DateTime endDate,
        string? roleFilter = null,
        KpiConfiguration? configuration = null);

    TeamKpiEvaluationResultDTO AggregateTeamEvaluation(
        Team team,
        IReadOnlyList<EmployeeKpiEvaluationResultDTO> memberEvaluations,
        DateTime startDate,
        DateTime endDate,
        string? roleFilter = null,
        KpiConfiguration? configuration = null);

    (List<KpiMetricValueDTO> Metrics, double OverallScore, string OverallRating) EvaluateMetrics(
        KpiConfiguration config,
        int totalAssigned,
        int completedCount,
        int onTimeCount,
        int inFullCount,
        int otifCount,
        int reworkCount,
        int accurateCount,
        double totalHandlingHours);
}
