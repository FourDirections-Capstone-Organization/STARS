namespace Backend.Modules.TaskManagement;

public interface IRoundRobinAssignmentService
{
    /// <summary>
    /// Selects an employee using round-robin logic:
    /// 1. Skips anyone Offline or OnLeave (only AvailabilityStatus.Active).
    /// 2. Selects the employee with the minimum number of active (non-completed, non-cancelled) tasks.
    /// 3. In case of a tie, selects whoever hasn't been assigned something in the longest time.
    /// 4. Returns null if nobody is available.
    /// </summary>
    Task<Guid?> PickAssigneeAsync(Guid? departmentId, Guid? teamId = null, CancellationToken ct = default);
}
