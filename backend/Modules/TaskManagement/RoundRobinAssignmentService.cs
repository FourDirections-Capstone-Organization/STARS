using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models.Enums;

namespace Backend.Modules.TaskManagement;

public class RoundRobinAssignmentService : IRoundRobinAssignmentService
{
    private readonly AppDbContext _db;
    private readonly ILogger<RoundRobinAssignmentService> _logger;

    public RoundRobinAssignmentService(AppDbContext db, ILogger<RoundRobinAssignmentService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<Guid?> PickAssigneeAsync(Guid? departmentId, Guid? teamId = null, CancellationToken ct = default)
    {
        var query = _db.Users
            .Where(u => u.IsActive && !u.IsDeactivated)
            .Where(u => u.AvailabilityStatus == AvailabilityStatus.Active)
            .Where(u => u.Role != UserRole.Manager);

        if (departmentId.HasValue)
        {
            query = query.Where(u => u.DepartmentId == departmentId.Value);
        }

        if (teamId.HasValue)
        {
            query = query.Where(u => _db.TeamMembers.Any(tm => tm.TeamId == teamId.Value && tm.UserId == u.Id));
        }

        var candidates = await query.ToListAsync(ct);
        if (candidates.Count == 0)
        {
            _logger.LogInformation("Round-robin: No available active employees found for Dept={DeptId}, Team={TeamId}",
                departmentId, teamId);
            return null;
        }

        var candidateIds = candidates.Select(c => c.Id).ToList();

        // Count active tasks for each candidate (tasks not Completed or Cancelled)
        var activeTaskCounts = await _db.TaskAssignments
            .Where(ta => candidateIds.Contains(ta.AssignedUserId))
            .Where(ta => ta.Task != null && ta.Task.Status != Models.Enums.TaskStatus.Completed && ta.Task.Status != Models.Enums.TaskStatus.Cancelled)
            .GroupBy(ta => ta.AssignedUserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, ct);

        // Find most recent assignment date for each candidate (to tie-break by longest time since last assigned)
        var lastAssignments = await _db.TaskAssignments
            .Where(ta => candidateIds.Contains(ta.AssignedUserId))
            .GroupBy(ta => ta.AssignedUserId)
            .Select(g => new { UserId = g.Key, LastAssignedAt = g.Max(ta => ta.AssignedAt) })
            .ToDictionaryAsync(x => x.UserId, x => x.LastAssignedAt, ct);

        var winner = candidates
            .OrderBy(u => activeTaskCounts.GetValueOrDefault(u.Id, 0))
            .ThenBy(u => lastAssignments.GetValueOrDefault(u.Id, DateTime.MinValue))
            .ThenBy(u => u.CreatedAt)
            .FirstOrDefault();

        if (winner != null)
        {
            _logger.LogInformation("Round-robin selected User={UserId} ({Name}) with {Count} active tasks for Dept={DeptId}",
                winner.Id, $"{winner.FirstName} {winner.LastName}", activeTaskCounts.GetValueOrDefault(winner.Id, 0), departmentId);
        }

        return winner?.Id;
    }
}
