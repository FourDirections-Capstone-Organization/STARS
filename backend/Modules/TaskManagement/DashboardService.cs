using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.TaskManagement;

public class DashboardService : IDashboardService
{
    private readonly AppDbContext _db;

    public DashboardService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponseDTO<DashboardMetricsDTO>> GetDashboardMetricsAsync(
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId,
        DashboardFilterDTO? filters = null)
    {
        var activeStatuses = new HashSet<Models.Enums.TaskStatus>
        {
            Models.Enums.TaskStatus.NotStarted,
            Models.Enums.TaskStatus.InProgress,
            Models.Enums.TaskStatus.DonePendingReview
        };

        var query = _db.Tasks
            .Include(t => t.AssignedDepartment)
            .Include(t => t.Assignments)
                .ThenInclude(a => a.AssignedUser)
            .AsQueryable();

        if (requestUserRole == UserRole.Coordinator)
            query = query.Where(t => t.CreatedById == requestUserId || t.Assignments.Any(a => a.AssignedUserId == requestUserId));

        if (filters != null)
        {
            if (filters.DateRangeStart.HasValue)
                query = query.Where(t => t.CreatedAt >= filters.DateRangeStart.Value.ToUniversalTime());

            if (filters.DateRangeEnd.HasValue)
                query = query.Where(t => t.CreatedAt <= filters.DateRangeEnd.Value.ToUniversalTime().Date.AddDays(1));

            if (filters.DepartmentId.HasValue)
                query = query.Where(t => t.AssignedDepartmentId == filters.DepartmentId.Value);

            if (filters.Status.HasValue)
                query = query.Where(t => t.Status == filters.Status.Value);

            if (filters.EmployeeId.HasValue)
                query = query.Where(t => t.Assignments.Any(a => a.AssignedUserId == filters.EmployeeId.Value));

            if (filters.AssignmentScope.HasValue)
                query = query.Where(t => t.AssignmentScope == filters.AssignmentScope.Value);
        }

        var allTasks = await query.ToListAsync();

        var activeTasks = allTasks.Where(t => activeStatuses.Contains(t.Status)).ToList();
        var now = DateTime.UtcNow;
        var overdueTasks = activeTasks.Where(t => (t.RevisedDeadline ?? t.Deadline) < now).ToList();

        var employeeWorkload = activeTasks
            .SelectMany(t => t.Assignments.Select(a => new { a.AssignedUserId, Task = t }))
            .GroupBy(x => x.AssignedUserId)
            .Select(g =>
            {
                var firstAssignment = g.First();
                var user = firstAssignment.Task.Assignments
                    .FirstOrDefault(a => a.AssignedUserId == g.Key)?.AssignedUser;

                return new WorkloadItemDTO
                {
                    EmployeeId = g.Key,
                    EmployeeName = user is not null
                        ? $"{user.FirstName} {user.LastName}".Trim()
                        : "Unknown",
                    EmployeeNumber = user?.EmployeeNumber ?? "",
                    Role = user?.Role.ToString() ?? "",
                    Department = user?.Department?.Name ?? "",
                    ActiveTaskCount = g.Count(),
                    OverdueTaskCount = g.Count(x => (x.Task.RevisedDeadline ?? x.Task.Deadline) < now),
                    AvailabilityStatus = new AvailabilityStatusDTO
                    {
                        Status = user?.AvailabilityStatus.ToString() ?? "Unknown",
                        IsAvailable = user?.AvailabilityStatus == AvailabilityStatus.Active
                    }
                };
            })
            .OrderByDescending(w => w.ActiveTaskCount)
            .ToList();

        // ── Department workload summary ─────────────────────────────────────────
        // For coordinators, scoped to tasks handled by that coordinator account.
        var deptWorkloadQuery = _db.Tasks
            .Include(t => t.AssignedDepartment)
            .Include(t => t.Assignments)
            .Where(t => t.AssignedDepartmentId.HasValue && activeStatuses.Contains(t.Status))
            .AsQueryable();

        if (requestUserRole == UserRole.Coordinator)
            deptWorkloadQuery = deptWorkloadQuery.Where(t => t.CreatedById == requestUserId || t.Assignments.Any(a => a.AssignedUserId == requestUserId));

        if (filters != null)
        {
            if (filters.DateRangeStart.HasValue)
                deptWorkloadQuery = deptWorkloadQuery.Where(t => t.CreatedAt >= filters.DateRangeStart.Value.ToUniversalTime());

            if (filters.DateRangeEnd.HasValue)
                deptWorkloadQuery = deptWorkloadQuery.Where(t => t.CreatedAt <= filters.DateRangeEnd.Value.ToUniversalTime().Date.AddDays(1));

            if (filters.DepartmentId.HasValue)
                deptWorkloadQuery = deptWorkloadQuery.Where(t => t.AssignedDepartmentId == filters.DepartmentId.Value);

            if (filters.Status.HasValue)
                deptWorkloadQuery = deptWorkloadQuery.Where(t => t.Status == filters.Status.Value);

            if (filters.EmployeeId.HasValue)
                deptWorkloadQuery = deptWorkloadQuery.Where(t => t.Assignments.Any(a => a.AssignedUserId == filters.EmployeeId.Value));

            if (filters.AssignmentScope.HasValue)
                deptWorkloadQuery = deptWorkloadQuery.Where(t => t.AssignmentScope == filters.AssignmentScope.Value);
        }

        var departmentWorkloadTasks = await deptWorkloadQuery.ToListAsync();

        var departmentWorkload = departmentWorkloadTasks
            .GroupBy(t => t.AssignedDepartmentId!.Value)
            .Select(g => new DepartmentWorkloadDTO
            {
                DepartmentId = g.Key,
                DepartmentName = g.First().AssignedDepartment?.Name ?? "Unknown",
                TotalActiveTasks = g.Count(),
                TotalOverdueTasks = g.Count(t => (t.RevisedDeadline ?? t.Deadline) < now),
                EmployeeCount = g.SelectMany(t => t.Assignments)
                    .Select(a => a.AssignedUserId)
                    .Distinct()
                    .Count()
            })
            .OrderByDescending(d => d.TotalActiveTasks)
            .ToList();

        var completedToday = allTasks
            .Count(t => t.Status == Models.Enums.TaskStatus.Completed
                && t.UpdatedAt.HasValue
                && t.UpdatedAt.Value.Date == now.Date);

        var metrics = new DashboardMetricsDTO
        {
            TotalActiveTasks = activeTasks.Count,
            OverdueTaskCount = overdueTasks.Count,
            NotStartedCount = activeTasks.Count(t => t.Status == Models.Enums.TaskStatus.NotStarted),
            InProgressCount = activeTasks.Count(t => t.Status == Models.Enums.TaskStatus.InProgress),
            DonePendingReviewCount = activeTasks.Count(t => t.Status == Models.Enums.TaskStatus.DonePendingReview),
            OnHoldCount = allTasks.Count(t => t.Status == Models.Enums.TaskStatus.OnHold),
            CompletedTodayCount = completedToday,
            EmployeeWorkload = employeeWorkload,
            DepartmentWorkload = departmentWorkload
        };

        return ApiResponseDTO<DashboardMetricsDTO>.Success(metrics);
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<DepartmentWorkloadDTO>>> GetWorkloadByDepartmentAsync(
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId,
        int pageNumber = 1,
        int pageSize = 10,
        DashboardFilterDTO? filters = null)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var activeStatuses = new HashSet<Models.Enums.TaskStatus>
        {
            Models.Enums.TaskStatus.NotStarted,
            Models.Enums.TaskStatus.InProgress,
            Models.Enums.TaskStatus.DonePendingReview
        };

        var query = _db.Tasks
            .Include(t => t.AssignedDepartment)
            .Include(t => t.Assignments)
            .AsQueryable();

        if (requestUserRole == UserRole.Coordinator)
            query = query.Where(t => t.CreatedById == requestUserId || t.Assignments.Any(a => a.AssignedUserId == requestUserId));

        if (filters != null)
        {
            if (filters.DateRangeStart.HasValue)
                query = query.Where(t => t.CreatedAt >= filters.DateRangeStart.Value.ToUniversalTime());

            if (filters.DateRangeEnd.HasValue)
                query = query.Where(t => t.CreatedAt <= filters.DateRangeEnd.Value.ToUniversalTime().Date.AddDays(1));

            if (filters.DepartmentId.HasValue)
                query = query.Where(t => t.AssignedDepartmentId == filters.DepartmentId.Value);
        }

        var tasks = await query
            .Where(t => t.AssignedDepartmentId.HasValue && activeStatuses.Contains(t.Status))
            .ToListAsync();
        var now = DateTime.UtcNow;

        var departmentWorkload = tasks
            .Where(t => t.AssignedDepartmentId.HasValue)
            .GroupBy(t => t.AssignedDepartmentId!.Value)
            .Select(g => new DepartmentWorkloadDTO
            {
                DepartmentId = g.Key,
                DepartmentName = g.First().AssignedDepartment?.Name ?? "Unknown",
                TotalActiveTasks = g.Count(),
                TotalOverdueTasks = g.Count(t => (t.RevisedDeadline ?? t.Deadline) < now),
                EmployeeCount = g.SelectMany(t => t.Assignments)
                    .Select(a => a.AssignedUserId)
                    .Distinct()
                    .Count()
            })
            .OrderByDescending(d => d.TotalActiveTasks)
            .ToList();

        var totalCount = departmentWorkload.Count;
        var pagedItems = departmentWorkload
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        var paginatedResult = new PaginatedResponseDTO<DepartmentWorkloadDTO>
        {
            Items = pagedItems,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize
        };

        return ApiResponseDTO<PaginatedResponseDTO<DepartmentWorkloadDTO>>.Success(paginatedResult);
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<EmployeeAvailabilityResponseDTO>>> GetEmployeeAvailabilityAsync(
        int pageNumber = 1, int pageSize = 10, Guid? departmentId = null)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Users
            .Include(u => u.Department)
            .Where(u => u.IsActive && !u.IsDeactivated)
            .AsQueryable();

        if (departmentId.HasValue)
            query = query.Where(u => u.DepartmentId == departmentId.Value);

        var totalCount = await query.CountAsync();

        var users = await query
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var result = users.Select(u => new EmployeeAvailabilityResponseDTO
        {
            UserId = u.Id,
            FullName = $"{u.FirstName} {u.MiddleName} {u.LastName} {u.Suffix}"
                .Replace("  ", " ").Trim(),
            EmployeeNumber = u.EmployeeNumber,
            Role = u.Role.ToString(),
            Department = u.Department?.Name ?? "",
            AvailabilityStatus = u.AvailabilityStatus,
            IsAvailable = u.AvailabilityStatus == AvailabilityStatus.Active
        }).ToList();

        var paginatedResult = new PaginatedResponseDTO<EmployeeAvailabilityResponseDTO>
        {
            Items = result,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize
        };

        return ApiResponseDTO<PaginatedResponseDTO<EmployeeAvailabilityResponseDTO>>.Success(paginatedResult);
    }

    public async Task<ApiResponseDTO<bool>> ValidateAssigneeAvailabilityAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user is null)
            return ApiResponseDTO<bool>.Failure("Employee not found");

        if (!user.IsActive || user.IsDeactivated)
            return ApiResponseDTO<bool>.Failure("Employee is deactivated");

        if (user.AvailabilityStatus != AvailabilityStatus.Active)
            return ApiResponseDTO<bool>.Failure(
                $"Selected employee is currently unavailable ({user.AvailabilityStatus}). Please choose another employee.");

        return ApiResponseDTO<bool>.Success(true);
    }
}
