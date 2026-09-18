using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Notifications;
using Task = System.Threading.Tasks.Task;
using BackendTask = Backend.Models.Task;

namespace Backend.Modules.TaskManagement;

public class TaskService : ITaskService
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notificationService;
    private readonly IDashboardService _dashboardService;
    private readonly IAuditLogService _auditLogService;
    private readonly ISlaRiskPredictionService _slaRiskService;

    public TaskService(AppDbContext db, INotificationService notificationService, IDashboardService dashboardService, IAuditLogService auditLogService, ISlaRiskPredictionService slaRiskService)
    {
        _db = db;
        _notificationService = notificationService;
        _dashboardService = dashboardService;
        _auditLogService = auditLogService;
        _slaRiskService = slaRiskService;
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> CreateAsync(CreateTaskDTO dto, Guid creatorId, string? ipAddress = null)
    {
        try
        {
            var creator = await _db.Users.FindAsync(creatorId);
            if (creator is null)
                return ApiResponseDTO<TaskResponseDTO>.Failure("Creator not found");

            if (creator.Role != UserRole.Coordinator && creator.Role != UserRole.Manager)
                return ApiResponseDTO<TaskResponseDTO>.Failure("Only Coordinators and Managers can create tasks");

            if (string.IsNullOrWhiteSpace(dto.Title))
                return ApiResponseDTO<TaskResponseDTO>.Failure("Task title is required");

            if (string.IsNullOrWhiteSpace(dto.Description))
                return ApiResponseDTO<TaskResponseDTO>.Failure("Task description is required");

            var now = DateTime.UtcNow;
            var deadline = dto.Deadline;
            var isSLALocked = false;

            if (dto.PriorityLevel == PriorityLevel.Urgent)
        {
            deadline = now.AddHours(24);
            isSLALocked = true;
        }
        else
        {
            if (!deadline.HasValue)
                return ApiResponseDTO<TaskResponseDTO>.Failure("Deadline is required for non-Urgent tasks");

            if (deadline.Value <= now)
                return ApiResponseDTO<TaskResponseDTO>.Failure("Deadline must be a future date/time");
        }

        var assignmentValidation = await ValidateAssignmentAsync(
            dto.AssignmentScope, dto.AssignedUserIds, dto.AssignedDepartmentId, dto.TeamId);

        if (!assignmentValidation.IsValid)
            return ApiResponseDTO<TaskResponseDTO>.Failure(assignmentValidation.ErrorMessage!);

        // Resolve the actual assignee set (team members when a TeamId is given).
        var resolvedAssignedUserIds = await ResolveAssignedUserIdsAsync(
            dto.AssignmentScope, dto.AssignedUserIds, dto.AssignedDepartmentId, dto.TeamId);

        // FR-039: Re-validate assignee availability at submission time
        if (dto.AssignmentScope == AssignmentScope.SingleEmployee || dto.AssignmentScope == AssignmentScope.Team)
        {
            foreach (var assignedUserId in resolvedAssignedUserIds)
            {
                var availabilityCheck = await _dashboardService.ValidateAssigneeAvailabilityAsync(assignedUserId);
                if (!availabilityCheck.IsSuccess)
                    return ApiResponseDTO<TaskResponseDTO>.Failure(availabilityCheck.Message);
            }
        }

        var uniqueTitle = await GenerateUniqueTaskTitleAsync(dto.Title);

        var task = new Models.Task
        {
            Title = uniqueTitle,
            Description = dto.Description.Trim(),
            PriorityLevel = dto.PriorityLevel,
            Classification = dto.Classification,
            Status = Models.Enums.TaskStatus.NotStarted,
            AssignmentScope = dto.AssignmentScope,
            Deadline = deadline.Value,
            IsSLALocked = isSLALocked,
            IsConfidential = dto.IsConfidential,
            CreatedById = creatorId,
            AssignedDepartmentId = dto.AssignedDepartmentId,
            TeamId = dto.AssignmentScope == AssignmentScope.Team ? dto.TeamId : null,
            CreatedAt = now
        };

        // FR-038: Default task department to creator's department for Coordinators
        if (!task.AssignedDepartmentId.HasValue && creator.Role == UserRole.Coordinator)
            task.AssignedDepartmentId = creator.DepartmentId;

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        var assignedUserIds = await ResolveAssignedUserIdsAsync(
            dto.AssignmentScope, dto.AssignedUserIds, dto.AssignedDepartmentId, dto.TeamId);

        foreach (var userId in assignedUserIds)
        {
            _db.TaskAssignments.Add(new TaskAssignment
            {
                TaskId = task.Id,
                AssignedUserId = userId,
                AssignedAt = now
            });
        }

        await _db.SaveChangesAsync();

        try { await _slaRiskService.PredictRiskAsync(task.Id); } catch { /* SLA prediction failure must not block task creation */ }

        try { await _auditLogService.LogAsync(creatorId, AuditActionType.Create, "Task", task.Id, ipAddress, $"Task '{task.Title}' created", "TaskManagement"); } catch { /* audit log failure must not block task creation */ }

        if (assignedUserIds.Count > 0)
        {
            try
            {
                var taskTitle = task.Title.Length > 50 ? task.Title[..50] + "..." : task.Title;
                await _notificationService.SendBulkNotificationAsync(
                    assignedUserIds,
                    NotificationType.TaskAssigned,
                    "New Task Assigned",
                    $"You have been assigned task '{taskTitle}' with deadline {task.Deadline:MMM dd, yyyy h:mm tt}.",
                    task.Id);
            }
            catch { /* notification failure must not block task creation */ }
        }

        return ApiResponseDTO<TaskResponseDTO>.Success(
            await MapToResponseDTOAsync(task, creatorId),
            "Task created and assigned successfully");
        }
        catch (Exception ex)
        {
            return ApiResponseDTO<TaskResponseDTO>.Failure($"Task creation failed: {ex.Message}");
        }
    }

    public async Task<ApiResponseDTO<TaskListResponseDTO>> GetAllAsync(
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId,
        int pageNumber = 1,
        int pageSize = 10,
        Models.Enums.TaskStatus? status = null,
        PriorityLevel? priority = null,
        TaskClassification? classification = null,
        Guid? assignedToUserId = null,
        Guid? departmentId = null,
        string? search = null,
        Models.Enums.TaskStatus? excludeStatus = null,
        List<Models.Enums.TaskStatus>? excludeStatuses = null)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Tasks
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .Include(t => t.Assignments)
                .ThenInclude(a => a.AssignedUser)
            .Include(t => t.Attachments)
            .AsQueryable();

        // TASK VISIBILITY FILTER (FR-010, FR-011, FR-012, FR-013)
        switch (requestUserRole)
        {
            case UserRole.Manager:
                break;

            case UserRole.Coordinator:
                if (requestUserDepartmentId.HasValue)
                    query = query.Where(t => t.AssignedDepartmentId == requestUserDepartmentId.Value);
                break;

            case UserRole.Dispatcher:
            case UserRole.Encoder:
            case UserRole.Courier:
            case UserRole.Accountant:
                query = query.Where(t => t.Assignments.Any(a => a.AssignedUserId == requestUserId));
                query = query.Where(t => !t.IsConfidential);
                break;
        }

        // Summary counts are computed from the visibility-filtered query BEFORE the
        // optional status/priority/classification filters are applied. This keeps the
        // tab badge counts accurate across ALL pages no matter which tab the caller
        // is currently viewing (e.g., narrowing to status=Completed must not zero out
        // the Active/Overdue badge counts).
        var nowUtc = DateTime.UtcNow;
        var activeCount = await query.CountAsync(t =>
            t.Status != Models.Enums.TaskStatus.Completed &&
            t.Status != Models.Enums.TaskStatus.Cancelled);
        var inProgressCount = await query.CountAsync(t =>
            t.Status == Models.Enums.TaskStatus.InProgress);
        var completedCount = await query.CountAsync(t =>
            t.Status == Models.Enums.TaskStatus.Completed);
        var overdueCount = await query.CountAsync(t =>
            t.Status != Models.Enums.TaskStatus.Completed &&
            t.Status != Models.Enums.TaskStatus.Cancelled &&
            (t.RevisedDeadline ?? t.Deadline) < nowUtc);

        if (status.HasValue)
            query = query.Where(t => t.Status == status.Value);

        // The "Active" tab shows every non-completed and non-cancelled status, so the caller can pass
        // excludeStatus or excludeStatuses to drop statuses (e.g. Completed, Cancelled) from the result BEFORE
        // pagination. This keeps server pages consistent with the client-side
        // Active-tab filter — otherwise a Completed/Cancelled task landing mid-list silently
        // shrinks that page's visible row count.
        if (excludeStatuses != null && excludeStatuses.Any())
            query = query.Where(t => !excludeStatuses.Contains(t.Status));
        else if (excludeStatus.HasValue)
            query = query.Where(t => t.Status != excludeStatus.Value);

        if (priority.HasValue)
            query = query.Where(t => t.PriorityLevel == priority.Value);

        if (classification.HasValue)
            query = query.Where(t => t.Classification == classification.Value);

        if (assignedToUserId.HasValue)
            query = query.Where(t => t.Assignments.Any(a => a.AssignedUserId == assignedToUserId.Value));

        if (departmentId.HasValue)
            query = query.Where(t => t.AssignedDepartmentId == departmentId.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchLower = search.ToLower();
            query = query.Where(t =>
                t.Title.ToLower().Contains(searchLower) ||
                t.Description.ToLower().Contains(searchLower));
        }

        var totalCount = await query.CountAsync();

        var tasks = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var response = new List<TaskResponseDTO>();
        foreach (var task in tasks)
        {
            response.Add(await MapToResponseDTOAsync(task, requestUserId));
        }

        var paginatedResult = new TaskListResponseDTO
        {
            Items = response,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize,
            ActiveCount = activeCount,
            InProgressCount = inProgressCount,
            CompletedCount = completedCount,
            OverdueCount = overdueCount
        };

        return ApiResponseDTO<TaskListResponseDTO>.Success(paginatedResult);
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> GetByIdAsync(Guid id, Guid requestUserId, UserRole requestUserRole)
    {
        var task = await _db.Tasks
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .Include(t => t.Assignments)
                .ThenInclude(a => a.AssignedUser)
            .Include(t => t.Attachments)
                .ThenInclude(a => a.UploadedBy)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (task is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task not found");

        // ACCESS CHECK (FR-010, FR-013)
        if (requestUserRole == UserRole.Dispatcher ||
            requestUserRole == UserRole.Encoder ||
            requestUserRole == UserRole.Courier ||
            requestUserRole == UserRole.Accountant)
        {
            if (task.IsConfidential)
                return ApiResponseDTO<TaskResponseDTO>.Failure("Access denied: task is confidential");

            var isAssigned = task.Assignments.Any(a => a.AssignedUserId == requestUserId);
            if (!isAssigned)
                return ApiResponseDTO<TaskResponseDTO>.Failure("Access denied: task is not assigned to you");
        }

        return ApiResponseDTO<TaskResponseDTO>.Success(await MapToResponseDTOAsync(task, requestUserId));
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> UpdateAsync(Guid id, UpdateTaskDTO dto, Guid requestUserId, string? ipAddress = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (task is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task not found");

        var requestUser = await _db.Users.FindAsync(requestUserId);
        if (requestUser is null || (requestUser.Role != UserRole.Coordinator && requestUser.Role != UserRole.Manager))
            return ApiResponseDTO<TaskResponseDTO>.Failure("Only Coordinators and Managers can update tasks");

        if (requestUser.Role == UserRole.Coordinator 
            && requestUser.DepartmentId != task.AssignedDepartmentId)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Cannot update tasks from another department");

        if (task.Status == Models.Enums.TaskStatus.Completed)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Cannot modify a completed task");

        if (task.Status == Models.Enums.TaskStatus.Cancelled)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Cannot modify a cancelled task");

        var oldTitle = task.Title;
        var oldStatus = task.Status.ToString();
        var oldPriority = task.PriorityLevel.ToString();

        if (!string.IsNullOrWhiteSpace(dto.Title))
            task.Title = dto.Title.Trim();

        if (!string.IsNullOrWhiteSpace(dto.Description))
            task.Description = dto.Description.Trim();

        if (dto.PriorityLevel.HasValue)
        {
            task.PriorityLevel = dto.PriorityLevel.Value;

            if (dto.PriorityLevel.Value == PriorityLevel.Urgent)
            {
                task.Deadline = task.CreatedAt.AddHours(24);
                task.IsSLALocked = true;
            }
            else
            {
                task.IsSLALocked = false;
            }
        }

        if (dto.Classification.HasValue)
            task.Classification = dto.Classification.Value;

        if (dto.Deadline.HasValue && !task.IsSLALocked)
        {
            if (dto.Deadline.Value <= DateTime.UtcNow)
                return ApiResponseDTO<TaskResponseDTO>.Failure("Deadline must be a future date/time");

            task.Deadline = dto.Deadline.Value;
        }

        if (dto.AssignmentScope.HasValue)
            task.AssignmentScope = dto.AssignmentScope.Value;

        if (dto.AssignedDepartmentId.HasValue)
            task.AssignedDepartmentId = dto.AssignedDepartmentId;

        if (dto.TeamId.HasValue)
            task.TeamId = dto.TeamId;

        if (dto.IsConfidential.HasValue)
            task.IsConfidential = dto.IsConfidential.Value;

        // FR-039: Re-validate assignee availability at submission time
        if (dto.AssignedUserIds != null || dto.TeamId.HasValue)
        {
            var scope = dto.AssignmentScope ?? task.AssignmentScope;
            if (scope == AssignmentScope.SingleEmployee || scope == AssignmentScope.Team)
            {
                var resolvedForCheck = dto.AssignedUserIds
                    ?? await ResolveAssignedUserIdsAsync(scope, null, null, dto.TeamId ?? task.TeamId);
                foreach (var assignedUserId in resolvedForCheck)
                {
                    var availabilityCheck = await _dashboardService.ValidateAssigneeAvailabilityAsync(assignedUserId);
                    if (!availabilityCheck.IsSuccess)
                        return ApiResponseDTO<TaskResponseDTO>.Failure(availabilityCheck.Message);
                }
            }

            _db.TaskAssignments.RemoveRange(task.Assignments);

            var resolvedAssignees = dto.AssignedUserIds
                ?? await ResolveAssignedUserIdsAsync(scope, null, null, dto.TeamId ?? task.TeamId);

            foreach (var userId in resolvedAssignees)
            {
                _db.TaskAssignments.Add(new TaskAssignment
                {
                    TaskId = task.Id,
                    AssignedUserId = userId,
                    AssignedAt = DateTime.UtcNow
                });
            }
        }

        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var changes = new List<string>();
        if (oldTitle != task.Title) changes.Add("title");
        if (oldStatus != task.Status.ToString()) changes.Add("status");
        if (oldPriority != task.PriorityLevel.ToString()) changes.Add("priority");

        if (changes.Count > 0)
        {
            await _auditLogService.LogAsync(
                requestUserId,
                AuditActionType.Update,
                "Task",
                task.Id,
                ipAddress,
                $"Task updated: {string.Join(", ", changes)}",
                "TaskManagement",
                oldValue: $"{{\"Title\":\"{oldTitle}\",\"Status\":\"{oldStatus}\",\"Priority\":\"{oldPriority}\"}}",
                newValue: $"{{\"Title\":\"{task.Title}\",\"Status\":\"{task.Status}\",\"Priority\":\"{task.PriorityLevel}\"}}");
        }

        var currentAssigneeIds = task.Assignments.Select(a => a.AssignedUserId).ToList();
        if (currentAssigneeIds.Count > 0)
        {
            var taskTitle = task.Title.Length > 50 ? task.Title[..50] + "..." : task.Title;
            await _notificationService.SendBulkNotificationAsync(
                currentAssigneeIds,
                NotificationType.TaskUpdated,
                "Task Updated",
                $"Task '{taskTitle}' has been updated. Check the latest details.",
                task.Id);
        }

        return ApiResponseDTO<TaskResponseDTO>.Success(
            await MapToResponseDTOAsync(task, requestUserId),
            "Task updated successfully");
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<TaskAssigneeDTO>>> GetAssignableUsersAsync(int pageNumber = 1, int pageSize = 10)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var assignableRoles = new[] { UserRole.Dispatcher, UserRole.Encoder, UserRole.Courier, UserRole.Accountant };

        var query = _db.Users
            .Include(u => u.Department)
            .Where(u => assignableRoles.Contains(u.Role) && u.IsActive && !u.IsDeactivated);

        var totalCount = await query.CountAsync();

        var users = await query
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        // Compute workload: count active (non-completed, non-cancelled) task assignments per user
        var activeTaskIds = await _db.Tasks
            .Where(t => t.Status != Backend.Models.Enums.TaskStatus.Completed &&
                        t.Status != Backend.Models.Enums.TaskStatus.Cancelled)
            .Select(t => t.Id)
            .ToListAsync();

        var allAssignments = await _db.TaskAssignments.ToListAsync();
        var workloadMap = allAssignments
            .Where(a => activeTaskIds.Contains(a.TaskId))
            .GroupBy(a => a.AssignedUserId)
            .ToDictionary(g => g.Key, g => g.Count());

        var result = users.Select(u => new TaskAssigneeDTO
        {
            UserId = u.Id,
            FullName = $"{u.FirstName} {u.MiddleName} {u.LastName} {u.Suffix}"
                .Replace("  ", " ").Trim(),
            EmployeeNumber = u.EmployeeNumber,
            Role = u.Role.ToString(),
            AvailabilityStatus = u.AvailabilityStatus.ToString(),
            IsAvailable = u.AvailabilityStatus == AvailabilityStatus.Active,
            Department = u.Department?.Name ?? "",
            DepartmentId = u.DepartmentId,
            Workload = workloadMap.TryGetValue(u.Id, out var count) ? count : 0
        }).ToList();

        var paginatedResult = new PaginatedResponseDTO<TaskAssigneeDTO>
        {
            Items = result,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize
        };

        return ApiResponseDTO<PaginatedResponseDTO<TaskAssigneeDTO>>.Success(paginatedResult);
    }



    private async Task<(bool IsValid, string? ErrorMessage)> ValidateAssignmentAsync(
        AssignmentScope scope, List<Guid>? userIds, Guid? departmentId, Guid? teamId = null)
    {
        switch (scope)
        {
            case AssignmentScope.SingleEmployee:
                if (userIds is null || userIds.Count == 0)
                    return (false, "At least one assigned user is required for SingleEmployee scope");

                if (userIds.Count != 1)
                    return (false, "Exactly one user must be assigned for SingleEmployee scope");

                var userExists = await _db.Users
                    .AnyAsync(u => u.Id == userIds[0] && u.IsActive && !u.IsDeactivated);

                if (!userExists)
                    return (false, "Selected user is inactive or does not exist");

                var userRole = await _db.Users
                    .Where(u => u.Id == userIds[0])
                    .Select(u => u.Role)
                    .FirstOrDefaultAsync();

                var allowedRoles = new[] { UserRole.Dispatcher, UserRole.Encoder, UserRole.Courier, UserRole.Accountant };
                if (!allowedRoles.Contains(userRole))
                    return (false, "Assigned user must be an active Dispatcher, Encoder, Courier, or Accountant");

                return (true, null);

            case AssignmentScope.Team:
                if (teamId.HasValue)
                {
                    var team = await _db.Teams
                        .Include(t => t.Members)
                        .FirstOrDefaultAsync(t => t.Id == teamId.Value && t.IsActive);

                    if (team is null)
                        return (false, "Selected team is inactive or does not exist");

                    var activeMemberCount = await _db.TeamMembers
                        .CountAsync(tm => tm.TeamId == teamId.Value
                            && tm.User != null && tm.User.IsActive && !tm.User.IsDeactivated);

                    if (activeMemberCount == 0)
                        return (false, "Selected team has no active members");

                    return (true, null);
                }

                if (userIds is null || userIds.Count == 0)
                    return (false, "At least one team member is required for Team scope");

                foreach (var userId in userIds)
                {
                    var exists = await _db.Users
                        .AnyAsync(u => u.Id == userId && u.IsActive && !u.IsDeactivated);

                    if (!exists)
                        return (false, $"User {userId} is inactive or does not exist");
                }

                return (true, null);

            case AssignmentScope.Department:
                if (!departmentId.HasValue)
                    return (false, "Department is required for Department scope");

                var deptExists = await _db.Departments
                    .AnyAsync(d => d.Id == departmentId.Value && d.IsActive);

                if (!deptExists)
                    return (false, "Selected department is inactive or does not exist");

                var deptUserCount = await _db.Users
                    .CountAsync(u => u.DepartmentId == departmentId.Value
                        && u.IsActive
                        && !u.IsDeactivated);

                if (deptUserCount == 0)
                    return (false, "Selected department has no active users to assign the task to");

                return (true, null);

            default:
                return (false, "Invalid assignment scope");
        }
    }
    
    private async Task<List<Guid>> ResolveAssignedUserIdsAsync(
        AssignmentScope scope, List<Guid>? userIds, Guid? departmentId, Guid? teamId = null)
    {
        switch (scope)
        {
            case AssignmentScope.SingleEmployee:
                return userIds ?? new List<Guid>();

            case AssignmentScope.Team:
                if (teamId.HasValue)
                {
                    return await _db.TeamMembers
                        .Where(tm => tm.TeamId == teamId.Value
                            && tm.User != null && tm.User.IsActive && !tm.User.IsDeactivated)
                        .Select(tm => tm.UserId)
                        .ToListAsync();
                }

                return userIds ?? new List<Guid>();

            case AssignmentScope.Department:
                if (!departmentId.HasValue)
                    return new List<Guid>();

                return await _db.Users
                    .Where(u => u.DepartmentId == departmentId.Value
                        && u.IsActive
                        && !u.IsDeactivated)
                    .Select(u => u.Id)
                    .ToListAsync();

            default:
                return new List<Guid>();
        }
    }

    private async Task<TaskResponseDTO> MapToResponseDTOAsync(Models.Task task, Guid? currentUserId = null)
    {
        // Explicit Loading to Task
        await _db.Entry(task).Reference(t => t.CreatedBy).LoadAsync();
        await _db.Entry(task).Reference(t => t.AssignedDepartment).LoadAsync();
        await _db.Entry(task).Reference(t => t.Team).LoadAsync();
        await _db.Entry(task).Collection(t => t.Assignments).LoadAsync();

        foreach (var assignment in task.Assignments)
        {
            await _db.Entry(assignment).Reference(a => a.AssignedUser).LoadAsync();
        }

        var myAssignment = currentUserId.HasValue
            ? task.Assignments.FirstOrDefault(a => a.AssignedUserId == currentUserId.Value)
            : null;

        return new TaskResponseDTO
        {
            Id = task.Id,
            Title = task.Title,
            Description = task.Description,
            PriorityLevel = task.PriorityLevel,
            Classification = task.Classification,
            Status = task.Status,
            AssignmentScope = task.AssignmentScope,
            Deadline = task.Deadline,
            IsSLALocked = task.IsSLALocked,
            SlaRiskLevel = task.SlaRiskLevel,
            IsConfidential = task.IsConfidential,
            CreatedById = task.CreatedById,
            CreatedByName = task.CreatedBy is not null
                ? $"{task.CreatedBy.FirstName} {task.CreatedBy.LastName}".Trim()
                : null,
            AssignedDepartmentId = task.AssignedDepartmentId,
            AssignedDepartmentName = task.AssignedDepartment?.Name,
            TeamId = task.TeamId,
            TeamName = task.Team?.Name,
            ProgressNotes = task.ProgressNotes,
            ReviewRemarks = task.ReviewRemarks,
            PushBackComment = task.PushBackComment,
            HoldReason = task.HoldReason,
            CancellationReason = task.CancellationReason,
            IsApproved = task.IsApproved,
            PreviousStatus = task.PreviousStatus,
            RevisedDeadline = task.RevisedDeadline,
            HeldAt = task.HeldAt,
                Assignees = task.Assignments.Select(a => new TaskAssigneeDTO
                {
                    UserId = a.AssignedUserId,
                    FullName = a.AssignedUser is not null
                        ? $"{a.AssignedUser.FirstName} {a.AssignedUser.MiddleName} {a.AssignedUser.LastName} {a.AssignedUser.Suffix}"
                            .Replace("  ", " ").Trim()
                        : "Unknown",
                    EmployeeNumber = a.AssignedUser?.EmployeeNumber ?? "",
                    Role = a.AssignedUser?.Role.ToString(),
                    AvailabilityStatus = a.AssignedUser?.AvailabilityStatus.ToString(),
                    IsAvailable = a.AssignedUser?.AvailabilityStatus == AvailabilityStatus.Active,
                    Department = a.AssignedUser?.Department?.Name ?? "",
                    CompletionPercentage = a.CompletionPercentage,
                }).ToList(),
                MyCompletionPercentage = myAssignment?.CompletionPercentage,
                AttachmentCount = task.Attachments?.Count ?? 0,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt
        };
    }

    public async Task SeedDemoTasksAsync()
    {
        var manager = await _db.Users.FirstOrDefaultAsync(u => u.Email == "manager@stars.com");
        if (manager is null) return;

        var existingTaskCount = await _db.Tasks.CountAsync();
        if (existingTaskCount > 0) return;

        var departments = await _db.Departments.ToListAsync();
        var coordinatorDept = departments.FirstOrDefault(d => d.Name == "Coordinator and Customer Service Team");
        var dispatchDept = departments.FirstOrDefault(d => d.Name == "Dispatch Team");
        var forwardingDept = departments.FirstOrDefault(d => d.Name == "Forwarding and Delivery Team");

        var users = await _db.Users.ToListAsync();
        var crd1 = users.First(u => u.EmployeeNumber == "CRD001");
        var crd2 = users.First(u => u.EmployeeNumber == "CRD002");
        var dsp1 = users.First(u => u.EmployeeNumber == "DSP001");
        var dsp2 = users.First(u => u.EmployeeNumber == "DSP002");
        var enc1 = users.First(u => u.EmployeeNumber == "ENC001");
        var enc2 = users.First(u => u.EmployeeNumber == "ENC002");
        var crs1 = users.First(u => u.EmployeeNumber == "CRS001");
        var crs2 = users.First(u => u.EmployeeNumber == "CRS002");

        var now = DateTime.UtcNow;
        var demoSeeds = new[]
        {
            new
            {
                Title = "Urgent Delivery - Downtown Manila",
                Description = "High-priority parcel requiring immediate dispatch to downtown Manila. Customer is expecting delivery within 4 hours.",
                Priority = PriorityLevel.Urgent,
                Classification = TaskClassification.SpecialTask,
                Status = Models.Enums.TaskStatus.InProgress,
                Scope = AssignmentScope.Team,
                Deadline = now.AddHours(4),
                DeptId = dispatchDept?.Id,
                UserIds = new[] { dsp1.Id, crs1.Id }
            },
            new
            {
                Title = "Route Optimization - Quezon City",
                Description = "Analyze and optimize delivery routes in Quezon City area for better efficiency and fuel savings.",
                Priority = PriorityLevel.High,
                Classification = TaskClassification.SpecialTask,
                Status = Models.Enums.TaskStatus.NotStarted,
                Scope = AssignmentScope.SingleEmployee,
                Deadline = now.AddDays(3),
                DeptId = dispatchDept?.Id,
                UserIds = new[] { dsp2.Id }
            },
            new
            {
                Title = "End-of-Day Package Sorting",
                Description = "Sort all incoming packages by destination area and update tracking records before end of shift.",
                Priority = PriorityLevel.Medium,
                Classification = TaskClassification.RoutineDailyTask,
                Status = Models.Enums.TaskStatus.InProgress,
                Scope = AssignmentScope.Team,
                Deadline = now.AddDays(1),
                DeptId = forwardingDept?.Id,
                UserIds = new[] { enc1.Id, enc2.Id }
            },
            new
            {
                Title = "Client A - Bulk Shipment Preparation",
                Description = "Prepare and label bulk shipment for Client A. Includes 50 boxes requiring special handling documentation.",
                Priority = PriorityLevel.High,
                Classification = TaskClassification.SpecialTask,
                Status = Models.Enums.TaskStatus.DonePendingReview,
                Scope = AssignmentScope.Team,
                Deadline = now.AddDays(2),
                DeptId = coordinatorDept?.Id,
                UserIds = new[] { crd1.Id, crs2.Id }
            },
            new
            {
                Title = "Monthly Inventory Reconciliation",
                Description = "Conduct end-of-month inventory count for all stored parcels and supplies. Submit reconciliation report.",
                Priority = PriorityLevel.Low,
                Classification = TaskClassification.RoutineDailyTask,
                Status = Models.Enums.TaskStatus.Completed,
                Scope = AssignmentScope.SingleEmployee,
                Deadline = now.AddDays(-1),
                DeptId = forwardingDept?.Id,
                UserIds = new[] { enc1.Id }
            },
            new
            {
                Title = "Vehicle Maintenance Inspection",
                Description = "All delivery vehicles due for routine maintenance check. Inspect brakes, tires, and engine oil levels.",
                Priority = PriorityLevel.Medium,
                Classification = TaskClassification.RoutineDailyTask,
                Status = Models.Enums.TaskStatus.OnHold,
                Scope = AssignmentScope.SingleEmployee,
                Deadline = now.AddDays(5),
                DeptId = dispatchDept?.Id,
                UserIds = new[] { crs1.Id }
            },
            new
            {
                Title = "New Route Planning - Makati CBD",
                Description = "Plan and map out efficient delivery routes for the new Makati CBD coverage area. Coordinate with dispatchers.",
                Priority = PriorityLevel.High,
                Classification = TaskClassification.SpecialTask,
                Status = Models.Enums.TaskStatus.InProgress,
                Scope = AssignmentScope.Team,
                Deadline = now.AddDays(7),
                DeptId = dispatchDept?.Id,
                UserIds = new[] { crd2.Id, dsp1.Id }
            },
        };

        foreach (var seed in demoSeeds)
        {
            var task = new BackendTask
            {
                Title = seed.Title,
                Description = seed.Description,
                PriorityLevel = seed.Priority,
                Classification = seed.Classification,
                Status = seed.Status,
                AssignmentScope = seed.Scope,
                Deadline = seed.Deadline,
                IsSLALocked = seed.Priority == PriorityLevel.Urgent,
                CreatedById = manager.Id,
                AssignedDepartmentId = seed.DeptId,
                CreatedAt = now
            };

            _db.Tasks.Add(task);
            await _db.SaveChangesAsync();

            foreach (var uid in seed.UserIds)
            {
                _db.TaskAssignments.Add(new TaskAssignment
                {
                    TaskId = task.Id,
                    AssignedUserId = uid,
                    AssignedAt = now
                });
            }
        }

        await _db.SaveChangesAsync();
    }

    public async Task<string> GenerateUniqueTaskTitleAsync(string requestedTitle)
    {
        if (string.IsNullOrWhiteSpace(requestedTitle))
            return requestedTitle;

        var trimmed = requestedTitle.Trim();
        var lowerTrimmed = trimmed.ToLower();
        var prefix = lowerTrimmed + " ";

        var candidateTitles = await _db.Tasks
            .Where(t => t.Title.ToLower() == lowerTrimmed || t.Title.ToLower().StartsWith(prefix))
            .Select(t => t.Title)
            .ToListAsync();

        return ResolveIncrementalTitle(trimmed, candidateTitles);
    }

    public static string ResolveIncrementalTitle(string baseTitle, IEnumerable<string> existingTitles)
    {
        if (string.IsNullOrWhiteSpace(baseTitle))
            return baseTitle;

        var trimmed = baseTitle.Trim();
        var pattern = $@"^{Regex.Escape(trimmed)}(?:\s+(\d+))?$";
        var regex = new Regex(pattern, RegexOptions.IgnoreCase);

        bool baseExists = false;
        var existingSuffixes = new HashSet<int>();

        foreach (var title in existingTitles)
        {
            if (string.IsNullOrWhiteSpace(title))
                continue;

            var match = regex.Match(title.Trim());
            if (match.Success)
            {
                if (match.Groups[1].Success && int.TryParse(match.Groups[1].Value, out var num))
                {
                    existingSuffixes.Add(num);
                }
                else
                {
                    baseExists = true;
                }
            }
        }

        if (!baseExists)
            return trimmed;

        int nextNumber = 1;
        while (existingSuffixes.Contains(nextNumber))
        {
            nextNumber++;
        }

        return $"{trimmed} {nextNumber}";
    }
}