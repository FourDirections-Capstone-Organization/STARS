using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;

namespace Backend.Modules.OrganizationalStructure;

public class HierarchyService : IHierarchyService
{
    private readonly AppDbContext _db;
    private readonly IAuditLogService _auditLogService;

    public HierarchyService(AppDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }

    public static (string LevelName, int LevelNumber) DeriveHierarchyLevel(UserRole role)
    {
        return role switch
        {
            UserRole.Manager => ("Manager", 1),
            UserRole.Coordinator => ("Coordinator", 2),
            UserRole.Dispatcher => ("Dispatcher / Encoder / Courier", 3),
            UserRole.Encoder => ("Dispatcher / Encoder / Courier", 3),
            UserRole.Courier => ("Dispatcher / Encoder / Courier", 3),
            _ => ("Dispatcher / Encoder / Courier", 3)
        };
    }

    public async Task<ApiResponseDTO<HierarchyStructureResponseDTO>> GetHierarchyStructureAsync()
    {
        var users = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .Where(u => u.IsActive && !u.IsDeactivated)
            .OrderBy(u => u.Role)
            .ThenBy(u => u.LastName)
            .ToListAsync();

        var response = new HierarchyStructureResponseDTO();

        foreach (var u in users)
        {
            var (levelName, levelNumber) = DeriveHierarchyLevel(u.Role);
            var item = new HierarchyEmployeeDTO
            {
                Id = u.Id,
                EmployeeNumber = u.EmployeeNumber,
                FullName = $"{u.FirstName} {u.LastName}".Trim(),
                Email = u.Email,
                Role = u.Role.ToString(),
                HierarchyLevel = levelName,
                HierarchyLevelNumber = levelNumber,
                DepartmentId = u.DepartmentId,
                DepartmentName = u.Department?.Name ?? "Unassigned",
                JobPositionId = u.JobPositionId,
                JobPositionName = u.JobPosition?.Name ?? "Unassigned",
                IsActive = u.IsActive && !u.IsDeactivated
            };

            if (levelNumber == 1)
            {
                response.Managers.Add(item);
            }
            else if (levelNumber == 2)
            {
                response.Coordinators.Add(item);
            }
            else
            {
                response.Staff.Add(item);
            }
        }

        response.TotalEmployees = users.Count;
        return ApiResponseDTO<HierarchyStructureResponseDTO>.Success(response);
    }

    public async Task<ApiResponseDTO<HierarchyEmployeeDTO>> GetEmployeeHierarchyAsync(Guid employeeId)
    {
        var u = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(x => x.Id == employeeId);

        if (u is null)
            return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Employee not found");

        var (levelName, levelNumber) = DeriveHierarchyLevel(u.Role);
        return ApiResponseDTO<HierarchyEmployeeDTO>.Success(new HierarchyEmployeeDTO
        {
            Id = u.Id,
            EmployeeNumber = u.EmployeeNumber,
            FullName = $"{u.FirstName} {u.LastName}".Trim(),
            Email = u.Email,
            Role = u.Role.ToString(),
            HierarchyLevel = levelName,
            HierarchyLevelNumber = levelNumber,
            DepartmentId = u.DepartmentId,
            DepartmentName = u.Department?.Name ?? "Unassigned",
            JobPositionId = u.JobPositionId,
            JobPositionName = u.JobPosition?.Name ?? "Unassigned",
            IsActive = u.IsActive && !u.IsDeactivated
        });
    }

    public async Task<ApiResponseDTO<List<HierarchyEmployeeDTO>>> SearchEmployeesAsync(string query)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return ApiResponseDTO<List<HierarchyEmployeeDTO>>.Success(new List<HierarchyEmployeeDTO>());
        }

        var q = query.Trim().ToLower();
        var users = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .Where(u => u.IsActive && !u.IsDeactivated)
            .Where(u => u.EmployeeNumber.ToLower().Contains(q)
                || u.FirstName.ToLower().Contains(q)
                || u.LastName.ToLower().Contains(q)
                || u.Email.ToLower().Contains(q))
            .Take(15)
            .ToListAsync();

        var result = users.Select(u =>
        {
            var (levelName, levelNumber) = DeriveHierarchyLevel(u.Role);
            return new HierarchyEmployeeDTO
            {
                Id = u.Id,
                EmployeeNumber = u.EmployeeNumber,
                FullName = $"{u.FirstName} {u.LastName}".Trim(),
                Email = u.Email,
                Role = u.Role.ToString(),
                HierarchyLevel = levelName,
                HierarchyLevelNumber = levelNumber,
                DepartmentId = u.DepartmentId,
                DepartmentName = u.Department?.Name ?? "Unassigned",
                JobPositionId = u.JobPositionId,
                JobPositionName = u.JobPosition?.Name ?? "Unassigned",
                IsActive = u.IsActive && !u.IsDeactivated
            };
        }).ToList();

        return ApiResponseDTO<List<HierarchyEmployeeDTO>>.Success(result);
    }

    public async Task<ApiResponseDTO<HierarchyEmployeeDTO>> MapEmployeeHierarchyAsync(MapHierarchyDTO dto, Guid requestUserId)
    {
        var requester = await _db.Users.FindAsync(requestUserId);
        if (requester is null || requester.Role != UserRole.Manager)
            return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Only Managers are permitted to map corporate hierarchy");

        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == dto.EmployeeId);

        if (user is null)
            return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Employee account not found in database");

        if (user.IsDeactivated || !user.IsActive)
            return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Cannot map deactivated employee account");

        var (levelName, levelNumber) = DeriveHierarchyLevel(user.Role);

        // Department validation if provided
        if (dto.DepartmentId.HasValue)
        {
            var dept = await _db.Departments.FirstOrDefaultAsync(d => d.Id == dto.DepartmentId.Value && d.IsActive);
            if (dept is null)
                return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Target department not found or is inactive");

            user.DepartmentId = dto.DepartmentId.Value;
        }

        // Job position validation if provided
        if (dto.JobPositionId.HasValue)
        {
            var pos = await _db.JobPositions.FirstOrDefaultAsync(p => p.Id == dto.JobPositionId.Value && p.IsActive);
            if (pos is null)
                return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Target job position not found or is inactive");

            if (user.DepartmentId.HasValue && pos.DepartmentId != user.DepartmentId.Value)
                return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Job position does not belong to the assigned department");

            user.JobPositionId = dto.JobPositionId.Value;
        }

        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        // Reload updated navigation properties
        await _db.Entry(user).Reference(u => u.Department).LoadAsync();
        await _db.Entry(user).Reference(u => u.JobPosition).LoadAsync();

        var deptName = user.Department?.Name ?? "Unassigned";
        var posName = user.JobPosition?.Name ?? "Unassigned";
        var empName = $"{user.FirstName} {user.LastName}".Trim();

        // Record Audit Log transaction
        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Update,
            "HierarchyMapping",
            user.Id,
            null,
            $"Hierarchy position confirmed/updated for {empName} (#{user.EmployeeNumber}): Level {levelNumber} ({levelName}) - Role: {user.Role}, Department: {deptName}, Position: {posName}",
            "Organizational Structure");

        return ApiResponseDTO<HierarchyEmployeeDTO>.Success(new HierarchyEmployeeDTO
        {
            Id = user.Id,
            EmployeeNumber = user.EmployeeNumber,
            FullName = empName,
            Email = user.Email,
            Role = user.Role.ToString(),
            HierarchyLevel = levelName,
            HierarchyLevelNumber = levelNumber,
            DepartmentId = user.DepartmentId,
            DepartmentName = deptName,
            JobPositionId = user.JobPositionId,
            JobPositionName = posName,
            IsActive = user.IsActive && !user.IsDeactivated
        }, "Employee hierarchy mapping confirmed and saved successfully");
    }

    public async Task<ApiResponseDTO<EmployeeDashboardDTO>> GetEmployeeDashboardAsync(
        Guid employeeId,
        Guid requestUserId,
        UserRole requestUserRole)
    {
        var emp = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == employeeId);

        if (emp is null)
            return ApiResponseDTO<EmployeeDashboardDTO>.Failure("Employee not found");

        var reportsTo = await ResolveSupervisorAsync(emp);

        var presenceStatus = emp.LastActivityAt.HasValue
            && (DateTime.UtcNow - emp.LastActivityAt.Value).TotalMinutes <= 15
            ? "Online"
            : "Offline";

        var assignedTasks = await _db.Tasks
            .Where(t => t.Assignments.Any(a => a.AssignedUserId == employeeId))
            .Select(t => new
            {
                t.Id,
                t.Status,
                t.PriorityLevel,
                t.Deadline,
                t.RevisedDeadline,
                t.CreatedAt,
                t.UpdatedAt
            })
            .ToListAsync();

        var totalCreatedTasks = await _db.Tasks
            .CountAsync(t => t.CreatedById == employeeId);

        var now = DateTime.UtcNow;
        var totalAssigned = assignedTasks.Count;
        var completedCount = assignedTasks.Count(t => t.Status == Models.Enums.TaskStatus.Completed);
        var inProgressCount = assignedTasks.Count(t => t.Status == Models.Enums.TaskStatus.InProgress);
        var pendingCount = assignedTasks.Count(t => t.Status == Models.Enums.TaskStatus.NotStarted || t.Status == Models.Enums.TaskStatus.DonePendingReview);
        var overdueCount = assignedTasks.Count(t =>
            (t.RevisedDeadline ?? t.Deadline) < now
            && t.Status != Models.Enums.TaskStatus.Completed
            && t.Status != Models.Enums.TaskStatus.Cancelled);

        var statusBreakdown = new List<TaskStatusBreakdownItem>();
        if (totalAssigned > 0)
        {
            var completed = assignedTasks.Count(t => t.Status == Models.Enums.TaskStatus.Completed);
            var overdue = assignedTasks.Count(t => (t.RevisedDeadline ?? t.Deadline) < now && t.Status != Models.Enums.TaskStatus.Completed && t.Status != Models.Enums.TaskStatus.Cancelled);
            var inProgress = assignedTasks.Count(t => t.Status == Models.Enums.TaskStatus.InProgress && (t.RevisedDeadline ?? t.Deadline) >= now);
            var pending = assignedTasks.Count(t => (t.Status == Models.Enums.TaskStatus.NotStarted || t.Status == Models.Enums.TaskStatus.DonePendingReview) && (t.RevisedDeadline ?? t.Deadline) >= now);
            var onHold = assignedTasks.Count(t => t.Status == Models.Enums.TaskStatus.OnHold && (t.RevisedDeadline ?? t.Deadline) >= now);
            var cancelled = assignedTasks.Count(t => t.Status == Models.Enums.TaskStatus.Cancelled);

            statusBreakdown.Add(new TaskStatusBreakdownItem { Status = "Completed", Count = completed, Percentage = Math.Round((double)completed / totalAssigned * 100, 1) });
            statusBreakdown.Add(new TaskStatusBreakdownItem { Status = "In Progress", Count = inProgress, Percentage = Math.Round((double)inProgress / totalAssigned * 100, 1) });
            statusBreakdown.Add(new TaskStatusBreakdownItem { Status = "Pending", Count = pending, Percentage = Math.Round((double)pending / totalAssigned * 100, 1) });
            statusBreakdown.Add(new TaskStatusBreakdownItem { Status = "Overdue", Count = overdue, Percentage = Math.Round((double)overdue / totalAssigned * 100, 1) });
            if (onHold > 0)
                statusBreakdown.Add(new TaskStatusBreakdownItem { Status = "On Hold", Count = onHold, Percentage = Math.Round((double)onHold / totalAssigned * 100, 1) });
            if (cancelled > 0)
                statusBreakdown.Add(new TaskStatusBreakdownItem { Status = "Cancelled", Count = cancelled, Percentage = Math.Round((double)cancelled / totalAssigned * 100, 1) });
        }

        var priorityDistribution = new List<TaskPriorityDistributionItem>();
        if (totalAssigned > 0)
        {
            priorityDistribution.Add(new TaskPriorityDistributionItem
            {
                Priority = "Urgent",
                Count = assignedTasks.Count(t => t.PriorityLevel == PriorityLevel.Urgent)
            });
            priorityDistribution.Add(new TaskPriorityDistributionItem
            {
                Priority = "High",
                Count = assignedTasks.Count(t => t.PriorityLevel == PriorityLevel.High)
            });
            priorityDistribution.Add(new TaskPriorityDistributionItem
            {
                Priority = "Medium",
                Count = assignedTasks.Count(t => t.PriorityLevel == PriorityLevel.Medium)
            });
            priorityDistribution.Add(new TaskPriorityDistributionItem
            {
                Priority = "Low",
                Count = assignedTasks.Count(t => t.PriorityLevel == PriorityLevel.Low)
            });
        }

        var completionTrend = new List<TaskCompletionTrendItem>();
        var completedTasks = assignedTasks
            .Where(t => t.Status == Models.Enums.TaskStatus.Completed)
            .OrderBy(t => t.UpdatedAt ?? t.CreatedAt)
            .ToList();

        if (completedTasks.Any())
        {
            completionTrend = completedTasks
                .GroupBy(t => new { (t.UpdatedAt ?? t.CreatedAt).Year, (t.UpdatedAt ?? t.CreatedAt).Month })
                .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month)
                .Select(g => new TaskCompletionTrendItem
                {
                    Period = new DateTime(g.Key.Year, g.Key.Month, 1).ToString("MMM yyyy"),
                    CompletedCount = g.Count()
                })
                .ToList();
        }

        var dashboard = new EmployeeDashboardDTO
        {
            EmployeeId = emp.Id,
            EmployeeNumber = emp.EmployeeNumber,
            FullName = $"{emp.FirstName} {emp.LastName}".Trim(),
            Email = emp.Email,
            Role = emp.Role.ToString(),
            DepartmentName = emp.Department?.Name ?? "Unassigned",
            JobPositionName = emp.JobPosition?.Name ?? "Unassigned",
            AvailabilityStatus = emp.AvailabilityStatus.ToString(),
            PresenceStatus = presenceStatus,
            IsActive = emp.IsActive && !emp.IsDeactivated,

            ReportsTo = reportsTo,
            SupervisorName = reportsTo.SupervisorName,
            SupervisorRole = reportsTo.SupervisorRole,
            SupervisorEmployeeNumber = reportsTo.SupervisorEmployeeNumber,
            ReportingRelation = reportsTo.ReportingRelation,

            TotalAssignedTasks = totalAssigned,
            TotalCreatedTasks = totalCreatedTasks,
            CompletedCount = completedCount,
            InProgressCount = inProgressCount,
            PendingCount = pendingCount,
            OverdueCount = overdueCount,

            StatusBreakdown = statusBreakdown,
            PriorityDistribution = priorityDistribution,
            CompletionTrend = completionTrend
        };

        return ApiResponseDTO<EmployeeDashboardDTO>.Success(dashboard);
    }

    public async Task<EmployeeReportsToDTO> ResolveSupervisorAsync(User emp)
    {
        var (_, levelNumber) = DeriveHierarchyLevel(emp.Role);

        // Level 1: Manager -> Reports to Executive Board / Top Level
        if (levelNumber == 1)
        {
            return new EmployeeReportsToDTO
            {
                SupervisorId = null,
                SupervisorName = "Executive Board",
                SupervisorRole = "Executive Management",
                SupervisorEmployeeNumber = null,
                ReportingRelation = "Executive Board"
            };
        }

        // Level 2: Coordinator -> Reports to Manager
        if (levelNumber == 2)
        {
            var manager = await _db.Users
                .Where(u => u.Role == UserRole.Manager && u.Id != emp.Id)
                .OrderByDescending(u => u.IsActive && !u.IsDeactivated)
                .ThenBy(u => u.LastName)
                .FirstOrDefaultAsync();

            if (manager != null)
            {
                return new EmployeeReportsToDTO
                {
                    SupervisorId = manager.Id,
                    SupervisorName = $"{manager.FirstName} {manager.LastName}".Trim(),
                    SupervisorRole = manager.Role.ToString(),
                    SupervisorEmployeeNumber = manager.EmployeeNumber,
                    ReportingRelation = "Manager"
                };
            }

            return new EmployeeReportsToDTO
            {
                SupervisorId = null,
                SupervisorName = "Executive Management",
                SupervisorRole = "Executive Management",
                SupervisorEmployeeNumber = null,
                ReportingRelation = "Executive Management"
            };
        }

        // Level 3: Execution Staff (Dispatcher, Encoder, Courier, etc.)
        // Priority 1: Team Leader if assigned to a team via TeamMember
        var teamMember = await _db.TeamMembers
            .Include(tm => tm.Team)
            .Where(tm => tm.UserId == emp.Id && tm.Team != null && tm.Team.IsActive && tm.Team.TeamLeaderId.HasValue && tm.Team.TeamLeaderId != emp.Id)
            .FirstOrDefaultAsync();

        if (teamMember?.Team?.TeamLeaderId != null)
        {
            var leader = await _db.Users.FirstOrDefaultAsync(u => u.Id == teamMember.Team.TeamLeaderId.Value);
            if (leader != null)
            {
                return new EmployeeReportsToDTO
                {
                    SupervisorId = leader.Id,
                    SupervisorName = $"{leader.FirstName} {leader.LastName}".Trim(),
                    SupervisorRole = leader.Role.ToString(),
                    SupervisorEmployeeNumber = leader.EmployeeNumber,
                    ReportingRelation = "Team Leader"
                };
            }
        }

        // Priority 2: Department Coordinator if assigned to a Department
        if (emp.DepartmentId.HasValue)
        {
            var deptCoordinator = await _db.Users
                .Where(u => u.DepartmentId == emp.DepartmentId.Value && u.Role == UserRole.Coordinator && u.Id != emp.Id)
                .OrderByDescending(u => u.IsActive && !u.IsDeactivated)
                .ThenBy(u => u.LastName)
                .FirstOrDefaultAsync();

            if (deptCoordinator != null)
            {
                return new EmployeeReportsToDTO
                {
                    SupervisorId = deptCoordinator.Id,
                    SupervisorName = $"{deptCoordinator.FirstName} {deptCoordinator.LastName}".Trim(),
                    SupervisorRole = deptCoordinator.Role.ToString(),
                    SupervisorEmployeeNumber = deptCoordinator.EmployeeNumber,
                    ReportingRelation = "Department Coordinator"
                };
            }
        }

        // Priority 3: Fallback to Manager
        var fallbackManager = await _db.Users
            .Where(u => u.Role == UserRole.Manager && u.Id != emp.Id)
            .OrderByDescending(u => u.IsActive && !u.IsDeactivated)
            .ThenBy(u => u.LastName)
            .FirstOrDefaultAsync();

        if (fallbackManager != null)
        {
            return new EmployeeReportsToDTO
            {
                SupervisorId = fallbackManager.Id,
                SupervisorName = $"{fallbackManager.FirstName} {fallbackManager.LastName}".Trim(),
                SupervisorRole = fallbackManager.Role.ToString(),
                SupervisorEmployeeNumber = fallbackManager.EmployeeNumber,
                ReportingRelation = "Manager"
            };
        }

        // Priority 4: Executive fallback if no manager account exists
        return new EmployeeReportsToDTO
        {
            SupervisorId = null,
            SupervisorName = "Executive Management",
            SupervisorRole = "Executive Management",
            SupervisorEmployeeNumber = null,
            ReportingRelation = "Executive Management"
        };
    }
}

