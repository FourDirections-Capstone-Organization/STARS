using BackendTask = Backend.Models.Task;
using Backend.Models;
using Backend.Models.DTOs;

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
}
