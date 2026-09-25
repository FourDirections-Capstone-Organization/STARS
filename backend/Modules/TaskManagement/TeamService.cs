using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Utilities;
using TaskStatus = Backend.Models.Enums.TaskStatus;

namespace Backend.Modules.TaskManagement;

public class TeamService : ITeamService
{
    private readonly AppDbContext _db;
    private readonly IAuditLogService _auditLogService;

    public TeamService(AppDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }

    private static string FullName(User u) =>
        $"{u.FirstName} {u.MiddleName} {u.LastName} {u.Suffix}".Replace("  ", " ").Trim();

    private static TeamMemberDTO MapMember(TeamMember m) => new TeamMemberDTO
    {
        UserId = m.UserId,
        FullName = m.User is not null ? FullName(m.User) : "Unknown",
        EmployeeNumber = m.User?.EmployeeNumber ?? "",
        Role = m.User?.Role.ToString(),
        Department = m.User?.Department?.Name ?? "",
        AvailabilityStatus = m.User?.AvailabilityStatus.ToString(),
        IsAvailable = m.User?.AvailabilityStatus == AvailabilityStatus.Active,
        JoinedAt = m.JoinedAt,
    };

    public async Task<ApiResponseDTO<PaginatedResponseDTO<TeamResponseDTO>>> GetAllAsync(
        int pageNumber = 1, int pageSize = 50, string? search = null, bool includeInactive = false)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.Teams
            .Include(t => t.Department)
            .Include(t => t.Members).ThenInclude(m => m.User).ThenInclude(u => u!.Department)
            .AsQueryable();

        if (!includeInactive)
            query = query.Where(t => t.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(t => t.Name.ToLower().Contains(term)
                || t.Description!.ToLower().Contains(term));
        }

        var totalCount = await query.CountAsync();

        var teams = await query
            .OrderBy(t => t.Name)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var result = new PaginatedResponseDTO<TeamResponseDTO>
        {
            Items = teams.Select(t => new TeamResponseDTO
            {
                Id = t.Id,
                Name = t.Name,
                DepartmentId = t.DepartmentId,
                DepartmentName = t.Department?.Name,
                Description = t.Description,
                IsActive = t.IsActive,
                CreatedAt = t.CreatedAt,
                MemberCount = t.Members.Count,
                Members = t.Members.Select(MapMember).ToList(),
            }).ToList(),
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize,
        };

        return ApiResponseDTO<PaginatedResponseDTO<TeamResponseDTO>>.Success(result);
    }

    public async Task<ApiResponseDTO<TeamResponseDTO>> GetByIdAsync(Guid id)
    {
        var team = await _db.Teams
            .Include(t => t.Department)
            .Include(t => t.Members).ThenInclude(m => m.User).ThenInclude(u => u!.Department)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (team is null)
            return ApiResponseDTO<TeamResponseDTO>.Failure("Team not found");

        return ApiResponseDTO<TeamResponseDTO>.Success(new TeamResponseDTO
        {
            Id = team.Id,
            Name = team.Name,
            DepartmentId = team.DepartmentId,
            DepartmentName = team.Department?.Name,
            Description = team.Description,
            IsActive = team.IsActive,
            CreatedAt = team.CreatedAt,
            MemberCount = team.Members.Count,
            Members = team.Members.Select(MapMember).ToList(),
        });
    }

    public async Task<ApiResponseDTO<TeamResponseDTO>> CreateAsync(CreateTeamDTO dto, Guid createdById)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return ApiResponseDTO<TeamResponseDTO>.Failure("Team name is required");

        var nameExists = await _db.Teams.AnyAsync(t => t.Name.ToLower() == dto.Name.Trim().ToLower());
        if (nameExists)
            return ApiResponseDTO<TeamResponseDTO>.Failure("A team with this name already exists");

        if (dto.DepartmentId.HasValue)
        {
            var deptExists = await _db.Departments.AnyAsync(d => d.Id == dto.DepartmentId.Value);
            if (!deptExists)
                return ApiResponseDTO<TeamResponseDTO>.Failure("Selected department does not exist");
        }

        var memberIds = (dto.MemberUserIds ?? new List<Guid>()).Distinct().ToList();
        if (memberIds.Count > 0)
        {
            var validCount = await _db.Users.CountAsync(u => memberIds.Contains(u.Id) && u.IsActive && !u.IsDeactivated);
            if (validCount != memberIds.Count)
                return ApiResponseDTO<TeamResponseDTO>.Failure("One or more selected employees do not exist or are inactive");

            var alreadyAssigned = await _db.TeamMembers
                .Where(tm => memberIds.Contains(tm.UserId))
                .Select(tm => tm.UserId)
                .ToListAsync();
            if (alreadyAssigned.Count > 0)
                return ApiResponseDTO<TeamResponseDTO>.Failure(
                    "One or more selected employees already belong to another team");
        }

        var team = new Team
        {
            Name = dto.Name.Trim(),
            DepartmentId = dto.DepartmentId,
            Description = dto.Description?.Trim(),
            CreatedById = createdById,
        };
        _db.Teams.Add(team);

        foreach (var userId in memberIds)
        {
            _db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = userId });
        }

        await _db.SaveChangesAsync();

        try
        {
            await _auditLogService.LogAsync(createdById, AuditActionType.Create, "Team", team.Id, null,
                $"Team '{team.Name}' created with {memberIds.Count} member(s)", "TaskManagement");
        }
        catch { /* audit failure must not block creation */ }

        var created = await _db.Teams
            .Include(t => t.Department)
            .Include(t => t.Members).ThenInclude(m => m.User).ThenInclude(u => u!.Department)
            .FirstAsync(t => t.Id == team.Id);

        return ApiResponseDTO<TeamResponseDTO>.Success(new TeamResponseDTO
        {
            Id = created.Id,
            Name = created.Name,
            DepartmentId = created.DepartmentId,
            DepartmentName = created.Department?.Name,
            Description = created.Description,
            IsActive = created.IsActive,
            CreatedAt = created.CreatedAt,
            MemberCount = created.Members.Count,
            Members = created.Members.Select(MapMember).ToList(),
        }, "Team created successfully");
    }

    public async Task<ApiResponseDTO<TeamResponseDTO>> UpdateAsync(Guid id, UpdateTeamDTO dto, Guid updatedById)
    {
        var team = await _db.Teams
            .Include(t => t.Department)
            .Include(t => t.Members).ThenInclude(m => m.User).ThenInclude(u => u!.Department)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (team is null)
            return ApiResponseDTO<TeamResponseDTO>.Failure("Team not found");

        if (string.IsNullOrWhiteSpace(dto.Name))
            return ApiResponseDTO<TeamResponseDTO>.Failure("Team name is required");

        var nameConflict = await _db.Teams.AnyAsync(t => t.Id != id && t.Name.ToLower() == dto.Name.Trim().ToLower());
        if (nameConflict)
            return ApiResponseDTO<TeamResponseDTO>.Failure("A team with this name already exists");

        team.Name = dto.Name.Trim();
        team.DepartmentId = dto.DepartmentId;
        team.Description = dto.Description?.Trim();
        team.IsActive = dto.IsActive;
        team.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        try
        {
            await _auditLogService.LogAsync(updatedById, AuditActionType.Update, "Team", team.Id, null,
                $"Team '{team.Name}' updated", "TaskManagement");
        }
        catch { }

        return ApiResponseDTO<TeamResponseDTO>.Success(new TeamResponseDTO
        {
            Id = team.Id,
            Name = team.Name,
            DepartmentId = team.DepartmentId,
            DepartmentName = team.Department?.Name,
            Description = team.Description,
            IsActive = team.IsActive,
            CreatedAt = team.CreatedAt,
            MemberCount = team.Members.Count,
            Members = team.Members.Select(MapMember).ToList(),
        }, "Team updated successfully");
    }

    public async Task<ApiResponseDTO<bool>> DeleteAsync(Guid id, Guid userId)
    {
        var team = await _db.Teams.FirstOrDefaultAsync(t => t.Id == id);
        if (team is null)
            return ApiResponseDTO<bool>.Failure("Team not found");

        var teamName = team.Name;

        // Any task still pointing at this team becomes unassigned to a team.
        await _db.Tasks
            .Where(t => t.TeamId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.TeamId, (Guid?)null));

        // Deleting the team cascades to its TeamMembers rows, so every member
        // becomes unassigned to a team.
        _db.Teams.Remove(team);
        await _db.SaveChangesAsync();

        try
        {
            await _auditLogService.LogAsync(userId, AuditActionType.Delete, "Team", team.Id, null,
                $"Team '{teamName}' deleted; members unassigned", "TaskManagement");
        }
        catch { }

        return ApiResponseDTO<bool>.Success(true, "Team deleted and members unassigned");
    }

    public async Task<ApiResponseDTO<TeamResponseDTO>> AddMembersAsync(Guid teamId, AddTeamMembersDTO dto, Guid userId)
    {
        var team = await _db.Teams
            .Include(t => t.Department)
            .Include(t => t.Members).ThenInclude(m => m.User).ThenInclude(u => u!.Department)
            .FirstOrDefaultAsync(t => t.Id == teamId);

        if (team is null)
            return ApiResponseDTO<TeamResponseDTO>.Failure("Team not found");

        var memberIds = dto.MemberUserIds.Distinct().ToList();
        if (memberIds.Count == 0)
            return ApiResponseDTO<TeamResponseDTO>.Failure("At least one employee must be selected");

        var existingIds = team.Members.Select(m => m.UserId).ToHashSet();
        var newIds = memberIds.Where(id => !existingIds.Contains(id)).ToList();

        if (newIds.Count > 0)
        {
            var validCount = await _db.Users.CountAsync(u => newIds.Contains(u.Id) && u.IsActive && !u.IsDeactivated);
            if (validCount != newIds.Count)
                return ApiResponseDTO<TeamResponseDTO>.Failure("One or more selected employees do not exist or are inactive");

            var alreadyAssigned = await _db.TeamMembers
                .Where(tm => newIds.Contains(tm.UserId))
                .Select(tm => tm.UserId)
                .ToListAsync();
            if (alreadyAssigned.Count > 0)
                return ApiResponseDTO<TeamResponseDTO>.Failure(
                    "One or more selected employees already belong to another team");

            foreach (var newId in newIds)
            {
                _db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = newId });
            }
            await _db.SaveChangesAsync();
        }

        // Refresh members after the insert.
        await _db.Entry(team).Collection(t => t.Members).Query().Include(m => m.User).ThenInclude(u => u!.Department).LoadAsync();

        return ApiResponseDTO<TeamResponseDTO>.Success(new TeamResponseDTO
        {
            Id = team.Id,
            Name = team.Name,
            DepartmentId = team.DepartmentId,
            DepartmentName = team.Department?.Name,
            Description = team.Description,
            IsActive = team.IsActive,
            CreatedAt = team.CreatedAt,
            MemberCount = team.Members.Count,
            Members = team.Members.Select(MapMember).ToList(),
        }, $"{newIds.Count} member(s) added");
    }

    public async Task<ApiResponseDTO<TeamResponseDTO>> RemoveMemberAsync(Guid teamId, Guid memberUserId, Guid userId)
    {
        var team = await _db.Teams
            .Include(t => t.Department)
            .Include(t => t.Members).ThenInclude(m => m.User).ThenInclude(u => u!.Department)
            .FirstOrDefaultAsync(t => t.Id == teamId);

        if (team is null)
            return ApiResponseDTO<TeamResponseDTO>.Failure("Team not found");

        var member = team.Members.FirstOrDefault(m => m.UserId == memberUserId);
        if (member is null)
            return ApiResponseDTO<TeamResponseDTO>.Failure("Employee is not a member of this team");

        _db.TeamMembers.Remove(member);
        await _db.SaveChangesAsync();
        team.Members.Remove(member);

        try
        {
            await _auditLogService.LogAsync(userId, AuditActionType.Update, "Team", team.Id, null,
                $"Member removed from team '{team.Name}'", "TaskManagement");
        }
        catch { }

        return ApiResponseDTO<TeamResponseDTO>.Success(new TeamResponseDTO
        {
            Id = team.Id,
            Name = team.Name,
            DepartmentId = team.DepartmentId,
            DepartmentName = team.Department?.Name,
            Description = team.Description,
            IsActive = team.IsActive,
            CreatedAt = team.CreatedAt,
            MemberCount = team.Members.Count,
            Members = team.Members.Select(MapMember).ToList(),
        }, "Member removed");
    }

    public async Task<ApiResponseDTO<TeamResponseDTO>> TransferMemberAsync(Guid memberUserId, Guid newTeamId, Guid userId)
    {
        var newTeam = await _db.Teams
            .Include(t => t.Department)
            .Include(t => t.Members).ThenInclude(m => m.User).ThenInclude(u => u!.Department)
            .FirstOrDefaultAsync(t => t.Id == newTeamId);

        if (newTeam is null)
            return ApiResponseDTO<TeamResponseDTO>.Failure("Team not found");

        if (!newTeam.IsActive)
            return ApiResponseDTO<TeamResponseDTO>.Failure("Team is inactive and cannot accept members");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == memberUserId && u.IsActive && !u.IsDeactivated);
        if (user is null)
            return ApiResponseDTO<TeamResponseDTO>.Failure("Employee not found or inactive");

        // Remove the employee from their current team (if any) first.
        var currentMembership = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.UserId == memberUserId);

        if (currentMembership is not null)
            _db.TeamMembers.Remove(currentMembership);

        // A user is allowed to belong to only one team, so (re)creating the
        // membership is safe after the removal above.
        _db.TeamMembers.Add(new TeamMember { TeamId = newTeam.Id, UserId = memberUserId });

        await _db.SaveChangesAsync();

        try
        {
            await _auditLogService.LogAsync(userId, AuditActionType.Update, "Team", newTeam.Id, null,
                $"Employee '{user.FirstName} {user.LastName}' transferred to team '{newTeam.Name}'", "TaskManagement");
        }
        catch { }

        // Refresh members after the change.
        await _db.Entry(newTeam).Collection(t => t.Members).Query().Include(m => m.User).ThenInclude(u => u!.Department).LoadAsync();

        return ApiResponseDTO<TeamResponseDTO>.Success(new TeamResponseDTO
        {
            Id = newTeam.Id,
            Name = newTeam.Name,
            DepartmentId = newTeam.DepartmentId,
            DepartmentName = newTeam.Department?.Name,
            Description = newTeam.Description,
            IsActive = newTeam.IsActive,
            CreatedAt = newTeam.CreatedAt,
            MemberCount = newTeam.Members.Count,
            Members = newTeam.Members.Select(MapMember).ToList(),
        }, "Employee transferred to team");
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<TeamTaskDTO>>> GetTeamTasksAsync(
        Guid teamId, int pageNumber = 1, int pageSize = 10, string? search = null, int? status = null, int? priority = null)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var teamExists = await _db.Teams.AnyAsync(t => t.Id == teamId);
        if (!teamExists)
            return ApiResponseDTO<PaginatedResponseDTO<TeamTaskDTO>>.Failure("Team not found");

        var query = _db.Tasks
            .Include(t => t.Assignments).ThenInclude(a => a.AssignedUser).ThenInclude(u => u!.Department)
            .Include(t => t.CreatedBy)
            .Where(t => t.TeamId == teamId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(t => t.Title.ToLower().Contains(term)
                || t.Description!.ToLower().Contains(term));
        }

        if (status.HasValue && Enum.IsDefined(typeof(TaskStatus), status.Value))
            query = query.Where(t => (int)t.Status == status.Value);

        if (priority.HasValue && Enum.IsDefined(typeof(PriorityLevel), priority.Value))
            query = query.Where(t => (int)t.PriorityLevel == priority.Value);

        var totalCount = await query.CountAsync();

        var tasks = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var result = new PaginatedResponseDTO<TeamTaskDTO>
        {
            Items = tasks.Select(t => new TeamTaskDTO
            {
                Id = t.Id,
                Title = t.Title,
                Description = t.Description,
                PriorityLevel = t.PriorityLevel,
                Status = t.Status,
                AssignmentScope = t.AssignmentScope,
                Deadline = t.Deadline,
                IsConfidential = t.IsConfidential,
                CreatedByName = t.CreatedBy is not null
                    ? $"{t.CreatedBy.FirstName} {t.CreatedBy.LastName}".Trim()
                    : null,
                CreatedAt = t.CreatedAt,
                Assignees = t.Assignments.Select(a => new TaskAssigneeDTO
                {
                    UserId = a.AssignedUserId,
                    FullName = a.AssignedUser is not null
                        ? $"{a.AssignedUser.FirstName} {a.AssignedUser.MiddleName} {a.AssignedUser.LastName} {a.AssignedUser.Suffix}".Replace("  ", " ").Trim()
                        : "Unknown",
                    EmployeeNumber = a.AssignedUser?.EmployeeNumber ?? "",
                    Role = a.AssignedUser?.Role.ToString(),
                    Department = a.AssignedUser?.Department?.Name ?? "",
                    CompletionPercentage = a.CompletionPercentage,
                }).ToList(),
            }).ToList(),
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize,
        };

        return ApiResponseDTO<PaginatedResponseDTO<TeamTaskDTO>>.Success(result);
    }

    public async Task<ApiResponseDTO<List<TeamWorkloadDTO>>> GetTeamWorkloadAsync(Guid teamId)
    {
        var team = await _db.Teams
            .Include(t => t.Members).ThenInclude(m => m.User)
            .FirstOrDefaultAsync(t => t.Id == teamId);

        if (team is null)
            return ApiResponseDTO<List<TeamWorkloadDTO>>.Failure("Team not found");

        var memberIds = team.Members.Select(m => m.UserId).ToList();
        var assignments = await _db.TaskAssignments
            .Where(a => memberIds.Contains(a.AssignedUserId))
            .Include(a => a.AssignedUser)
            .Include(a => a.Task)
            .ToListAsync();

        var workload = memberIds.Select(id =>
        {
            var user = team.Members.FirstOrDefault(m => m.UserId == id)?.User;
            var userAssignments = assignments.Where(a => a.AssignedUserId == id).ToList();
            var total = userAssignments.Count;
            var completed = userAssignments.Count(a => a.Task.Status == TaskStatus.Completed);
            var inProgress = userAssignments.Count(a => a.Task.Status == TaskStatus.InProgress || a.Task.Status == TaskStatus.NotStarted);
            var onHold = userAssignments.Count(a => a.Task.Status == TaskStatus.OnHold);
            var pendingReview = userAssignments.Count(a => a.Task.Status == TaskStatus.DonePendingReview);
            return new TeamWorkloadDTO
            {
                UserId = id,
                FullName = user is not null ? FullName(user) : "Unknown",
                TotalTasks = total,
                CompletedTasks = completed,
                InProgressTasks = inProgress,
                OnHoldTasks = onHold,
                PendingReviewTasks = pendingReview,
                CompletionRate = total > 0 ? Math.Round(completed * 100.0 / total, 1) : 0,
                AverageCompletionPercentage = total > 0 ? Math.Round(userAssignments.Average(a => a.CompletionPercentage), 1) : 0,
            };
        }).OrderByDescending(w => w.TotalTasks).ToList();

        return ApiResponseDTO<List<TeamWorkloadDTO>>.Success(workload);
    }
}
