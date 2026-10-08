using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Notifications;
using Task = System.Threading.Tasks.Task;

namespace Backend.Modules.TaskManagement;

public class TaskWorkflowService : ITaskWorkflowService
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notificationService;
    private readonly IAuditLogService _auditLogService;
    private readonly IServiceProvider _serviceProvider;

    public TaskWorkflowService(
        AppDbContext db,
        INotificationService notificationService,
        IAuditLogService auditLogService,
        IServiceProvider serviceProvider)
    {
        _db = db;
        _notificationService = notificationService;
        _auditLogService = auditLogService;
        _serviceProvider = serviceProvider;
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> UpdateStatusAsync(
        Guid taskId, TaskStatusUpdateDTO dto, Guid userId, string? ipAddress = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task not found");

        var user = await _db.Users.FindAsync(userId);
        if (user is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("User not found");

        var currentStatus = task.Status;
        var newStatus = dto.NewStatus;

        var transitionCheck = ValidateTransition(currentStatus, newStatus, user, task, userId);
        if (!transitionCheck.IsValid)
            return ApiResponseDTO<TaskResponseDTO>.Failure(transitionCheck.ErrorMessage!);

        task.Status = newStatus;
        if (!string.IsNullOrWhiteSpace(dto.ProgressNotes))
            task.ProgressNotes = dto.ProgressNotes.Trim();
        task.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            userId,
            AuditActionType.StatusChange,
            "Task",
            taskId,
            ipAddress,
            $"Task status changed from {currentStatus} to {newStatus}",
            "TaskManagement",
            oldValue: currentStatus.ToString(),
            newValue: newStatus.ToString());

        var assigneeIds = task.Assignments.Select(a => a.AssignedUserId).ToList();
        if (assigneeIds.Count > 0)
        {
            var taskTitle = task.Title.Length > 50 ? task.Title[..50] + "..." : task.Title;
            await _notificationService.SendBulkNotificationAsync(
                assigneeIds,
                NotificationType.TaskUpdated,
                "Task Status Updated",
                $"Task '{taskTitle}' status changed to {newStatus}.",
                task.Id);
        }

        return ApiResponseDTO<TaskResponseDTO>.Success(
            await MapToResponseDTOAsync(task),
            "Task status updated successfully");
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> UpdateProgressAsync(
        Guid taskId, TaskProgressUpdateDTO dto, Guid userId, string? ipAddress = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task not found");

        var user = await _db.Users.FindAsync(userId);
        if (user is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("User not found");

        // Tasks on hold are read-only for the assignee until resumed.
        if (task.Status == Models.Enums.TaskStatus.OnHold)
            return ApiResponseDTO<TaskResponseDTO>.Failure("On Hold tasks cannot be updated until they are resumed");

        var assignment = task.Assignments.FirstOrDefault(a => a.AssignedUserId == userId);
        if (assignment is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("You are not assigned to this task");

        var newPercentage = Math.Clamp(dto.CompletionPercentage, 0, 100);
        var oldPercentage = assignment.CompletionPercentage;
        if (oldPercentage == newPercentage)
            return ApiResponseDTO<TaskResponseDTO>.Success(
                await MapToResponseDTOAsync(task, userId),
                "Progress updated successfully");

        assignment.CompletionPercentage = newPercentage;
        task.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            userId,
            AuditActionType.Update,
            "Task",
            taskId,
            ipAddress,
            $"Task progress percentage changed from {oldPercentage}% to {newPercentage}%",
            "TaskManagement",
            oldValue: $"{oldPercentage}%",
            newValue: $"{newPercentage}%");

        return ApiResponseDTO<TaskResponseDTO>.Success(
            await MapToResponseDTOAsync(task, userId),
            "Progress updated successfully");
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> ReviewTaskAsync(
        Guid taskId, ReviewTaskDTO dto, Guid reviewerId, string? ipAddress = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task not found");

        var reviewer = await _db.Users.FindAsync(reviewerId);
        if (reviewer is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("User not found");

        if (reviewer.Role != UserRole.Coordinator && reviewer.Role != UserRole.Manager)
            return ApiResponseDTO<TaskResponseDTO>.Failure(
                "Only Coordinators and Managers can review tasks");

        if (task.Status != Models.Enums.TaskStatus.DonePendingReview)
            return ApiResponseDTO<TaskResponseDTO>.Failure(
                "Only tasks in Done/Pending Review status can be reviewed");

        if (dto.IsApproved)
        {
            task.Status = Models.Enums.TaskStatus.Completed;
            task.IsApproved = true;
            if (!string.IsNullOrWhiteSpace(dto.Remarks))
                task.ReviewRemarks = dto.Remarks.Trim();
            task.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            await _auditLogService.LogAsync(
                reviewerId,
                AuditActionType.StatusChange,
                "Task",
                taskId,
                ipAddress,
                $"Task status changed from DonePendingReview to Completed (approved)",
                "TaskManagement",
                oldValue: "DonePendingReview",
                newValue: "Completed");

            var assigneeIds = task.Assignments.Select(a => a.AssignedUserId).ToList();
            if (assigneeIds.Count > 0)
            {
                var taskTitle = task.Title.Length > 50 ? task.Title[..50] + "..." : task.Title;
                await _notificationService.SendBulkNotificationAsync(
                    assigneeIds,
                    NotificationType.TaskCompleted,
                    "Task Completed",
                    $"Task '{taskTitle}' has been approved and completed.",
                    task.Id);
            }

            // Trigger Integration 1: Task Completion -> Delivery Order Creation
            try
            {
                var dmsService = _serviceProvider.GetService<Backend.Modules.DmsIntegration.IDmsIntegrationService>();
                if (dmsService != null && dmsService.IsConfigured)
                {
                    await dmsService.CreateDeliveryOrderForTaskAsync(taskId, reviewerId);
                }
            }
            catch
            {
                // Task approval must never fail if DMS is temporarily unreachable
            }

            return ApiResponseDTO<TaskResponseDTO>.Success(
                await MapToResponseDTOAsync(task),
                "Task approved and officially closed");
        }
        else
        {
            if (string.IsNullOrWhiteSpace(dto.Remarks))
                return ApiResponseDTO<TaskResponseDTO>.Failure(
                    "Remarks are required when returning a task for rework");

            task.Status = Models.Enums.TaskStatus.InProgress;
            task.IsApproved = false;
            task.ReviewRemarks = dto.Remarks.Trim();
            task.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            await _auditLogService.LogAsync(
                reviewerId,
                AuditActionType.StatusChange,
                "Task",
                taskId,
                ipAddress,
                $"Task status changed from DonePendingReview to InProgress (returned for rework)",
                "TaskManagement",
                oldValue: "DonePendingReview",
                newValue: "InProgress");

            var reworkAssigneeIds = task.Assignments.Select(a => a.AssignedUserId).ToList();
            if (reworkAssigneeIds.Count > 0)
            {
                var taskTitle = task.Title.Length > 50 ? task.Title[..50] + "..." : task.Title;
                await _notificationService.SendBulkNotificationAsync(
                    reworkAssigneeIds,
                    NotificationType.TaskUpdated,
                    "Task Returned for Rework",
                    $"Task '{taskTitle}' has been returned for rework. Remarks: {dto.Remarks}.",
                    task.Id);
            }

            return ApiResponseDTO<TaskResponseDTO>.Success(
                await MapToResponseDTOAsync(task),
                "Task returned for rework");
        }
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> PlaceOnHoldAsync(
        Guid taskId, PlaceOnHoldDTO dto, Guid coordinatorId, string? ipAddress = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task not found");

        var coordinator = await _db.Users.FindAsync(coordinatorId);
        if (coordinator is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("User not found");

        if (coordinator.Role != UserRole.Coordinator && coordinator.Role != UserRole.Manager)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Only Coordinators and Managers can place tasks on hold");

        if (task.Status != Models.Enums.TaskStatus.NotStarted && task.Status != Models.Enums.TaskStatus.InProgress)
            return ApiResponseDTO<TaskResponseDTO>.Failure(
                "Only tasks in Not Started or In Progress status can be placed on hold");

        if (string.IsNullOrWhiteSpace(dto.HoldReason))
            return ApiResponseDTO<TaskResponseDTO>.Failure("Hold reason is required");

        task.PreviousStatus = task.Status;
        task.Status = Models.Enums.TaskStatus.OnHold;
        task.HoldReason = dto.HoldReason.Trim();
        task.HeldAt = DateTime.UtcNow;
        task.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            coordinatorId,
            AuditActionType.StatusChange,
            "Task",
            taskId,
            ipAddress,
            $"Task placed on hold. Reason: {dto.HoldReason}",
            "TaskManagement",
            oldValue: task.PreviousStatus?.ToString(),
            newValue: "OnHold");

        var assigneeIds = task.Assignments.Select(a => a.AssignedUserId).ToList();
        if (assigneeIds.Count > 0)
        {
            var taskTitle = task.Title.Length > 50 ? task.Title[..50] + "..." : task.Title;
            await _notificationService.SendBulkNotificationAsync(
                assigneeIds,
                NotificationType.TaskOnHold,
                "Task On Hold",
                $"Task '{taskTitle}' has been placed on hold. Reason: {dto.HoldReason}.",
                task.Id);
        }

        return ApiResponseDTO<TaskResponseDTO>.Success(
            await MapToResponseDTOAsync(task),
            "Task placed on hold successfully");
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> ResumeTaskAsync(
        Guid taskId, ResumeTaskDTO dto, Guid coordinatorId, string? ipAddress = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task not found");

        var coordinator = await _db.Users.FindAsync(coordinatorId);
        if (coordinator is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("User not found");

        if (coordinator.Role != UserRole.Coordinator && coordinator.Role != UserRole.Manager)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Only Coordinators and Managers can resume tasks");

        if (task.Status != Models.Enums.TaskStatus.OnHold)
            return ApiResponseDTO<TaskResponseDTO>.Failure(
                "Only tasks in On Hold status can be resumed");

        if (dto.RevisedDeadline <= DateTime.UtcNow)
            return ApiResponseDTO<TaskResponseDTO>.Failure(
                "Revised deadline is required and must be a future date/time");

        if (!task.PreviousStatus.HasValue)
            return ApiResponseDTO<TaskResponseDTO>.Failure(
                "Cannot resume task: previous status not recorded");

        task.Status = task.PreviousStatus.Value;
        task.RevisedDeadline = dto.RevisedDeadline;
        task.Deadline = dto.RevisedDeadline;
        task.PreviousStatus = null;
        task.HoldReason = null;
        task.HeldAt = null;
        task.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            coordinatorId,
            AuditActionType.StatusChange,
            "Task",
            taskId,
            ipAddress,
            $"Task resumed from OnHold to {task.Status}",
            "TaskManagement",
            oldValue: "OnHold",
            newValue: task.Status.ToString());

        var assigneeIds = task.Assignments.Select(a => a.AssignedUserId).ToList();
        if (assigneeIds.Count > 0)
        {
            var taskTitle = task.Title.Length > 50 ? task.Title[..50] + "..." : task.Title;
            await _notificationService.SendBulkNotificationAsync(
                assigneeIds,
                NotificationType.TaskResumed,
                "Task Resumed",
                $"Task '{taskTitle}' has been resumed. New deadline: {dto.RevisedDeadline:MMM dd, yyyy h:mm tt}.",
                task.Id);
        }

        return ApiResponseDTO<TaskResponseDTO>.Success(
            await MapToResponseDTOAsync(task),
            "Task resumed successfully");
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> CancelTaskAsync(
        Guid taskId, CancelTaskDTO dto, Guid coordinatorId, string? ipAddress = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task not found");

        var coordinator = await _db.Users.FindAsync(coordinatorId);
        if (coordinator is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("User not found");

        if (coordinator.Role != UserRole.Coordinator && coordinator.Role != UserRole.Manager)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Only Coordinators and Managers can cancel tasks");

        if (task.Status == Models.Enums.TaskStatus.Completed)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Completed tasks cannot be cancelled");

        if (task.Status == Models.Enums.TaskStatus.Cancelled)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task is already cancelled");

        if (string.IsNullOrWhiteSpace(dto.CancellationReason))
            return ApiResponseDTO<TaskResponseDTO>.Failure("Cancellation reason is required");

        if (!dto.IsConfirmed)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Cancellation must be confirmed");

        task.PreviousStatus = task.Status;
        task.Status = Models.Enums.TaskStatus.Cancelled;
        task.CancellationReason = dto.CancellationReason.Trim();
        task.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            coordinatorId,
            AuditActionType.StatusChange,
            "Task",
            taskId,
            ipAddress,
            $"Task cancelled. Reason: {dto.CancellationReason}",
            "TaskManagement",
            oldValue: task.PreviousStatus?.ToString() ?? "Unknown",
            newValue: "Cancelled");

        var cancelRecipientIds = task.Assignments.Select(a => a.AssignedUserId).ToList();
        if (task.CreatedById != Guid.Empty)
            cancelRecipientIds.Add(task.CreatedById);
        cancelRecipientIds = cancelRecipientIds.Distinct().ToList();

        if (cancelRecipientIds.Count > 0)
        {
            var taskTitle = task.Title.Length > 50 ? task.Title[..50] + "..." : task.Title;
            await _notificationService.SendBulkNotificationAsync(
                cancelRecipientIds,
                NotificationType.TaskCancelled,
                "Task Cancelled",
                $"Task '{taskTitle}' has been cancelled. Reason: {dto.CancellationReason}.",
                task.Id);
        }

        return ApiResponseDTO<TaskResponseDTO>.Success(
            await MapToResponseDTOAsync(task),
            "Task cancelled successfully");
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> RestoreTaskAsync(
        Guid taskId, Guid coordinatorId, string? ipAddress = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Task not found");

        var coordinator = await _db.Users.FindAsync(coordinatorId);
        if (coordinator is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("User not found");

        if (coordinator.Role != UserRole.Coordinator && coordinator.Role != UserRole.Manager)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Only Coordinators and Managers can restore tasks");

        if (task.Status != Models.Enums.TaskStatus.Cancelled)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Only cancelled tasks in the bin can be restored");

        var restoredStatus = task.PreviousStatus ?? (task.Assignments.Any() ? Models.Enums.TaskStatus.InProgress : Models.Enums.TaskStatus.NotStarted);
        if (restoredStatus == Models.Enums.TaskStatus.Cancelled || restoredStatus == Models.Enums.TaskStatus.Completed)
            restoredStatus = Models.Enums.TaskStatus.NotStarted;

        task.Status = restoredStatus;
        task.PreviousStatus = null;
        task.CancellationReason = null;
        task.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            coordinatorId,
            AuditActionType.StatusChange,
            "Task",
            taskId,
            ipAddress,
            $"Task restored from Cancelled to {task.Status}",
            "TaskManagement",
            oldValue: "Cancelled",
            newValue: task.Status.ToString());

        var recipientIds = task.Assignments.Select(a => a.AssignedUserId).ToList();
        if (task.CreatedById != Guid.Empty)
            recipientIds.Add(task.CreatedById);
        recipientIds = recipientIds.Distinct().ToList();

        if (recipientIds.Count > 0)
        {
            var taskTitle = task.Title.Length > 50 ? task.Title[..50] + "..." : task.Title;
            await _notificationService.SendBulkNotificationAsync(
                recipientIds,
                NotificationType.TaskResumed,
                "Task Restored",
                $"Task '{taskTitle}' has been restored from the bin.",
                task.Id);
        }

        return ApiResponseDTO<TaskResponseDTO>.Success(
            await MapToResponseDTOAsync(task),
            "Task restored successfully");
    }

    private (bool IsValid, string? ErrorMessage) ValidateTransition(
        Models.Enums.TaskStatus currentStatus, Models.Enums.TaskStatus newStatus, User user, Models.Task task, Guid userId)
    {
        if (currentStatus == Models.Enums.TaskStatus.Completed)
            return (false, "Completed tasks cannot be modified");

        if (currentStatus == Models.Enums.TaskStatus.Cancelled)
            return (false, "Cancelled tasks cannot be modified");

        if (currentStatus == Models.Enums.TaskStatus.OnHold)
            return (false, "On Hold tasks must be resumed before status changes");

        var allowedTransitions = new Dictionary<(Models.Enums.TaskStatus, UserRole), Models.Enums.TaskStatus[]>
        {
            { (Models.Enums.TaskStatus.NotStarted, UserRole.Dispatcher), new[] { Models.Enums.TaskStatus.InProgress } },
            { (Models.Enums.TaskStatus.NotStarted, UserRole.Encoder), new[] { Models.Enums.TaskStatus.InProgress } },
            { (Models.Enums.TaskStatus.NotStarted, UserRole.Courier), new[] { Models.Enums.TaskStatus.InProgress } },
            { (Models.Enums.TaskStatus.NotStarted, UserRole.Accountant), new[] { Models.Enums.TaskStatus.InProgress } },

            { (Models.Enums.TaskStatus.InProgress, UserRole.Dispatcher), new[] { Models.Enums.TaskStatus.DonePendingReview } },
            { (Models.Enums.TaskStatus.InProgress, UserRole.Encoder), new[] { Models.Enums.TaskStatus.DonePendingReview } },
            { (Models.Enums.TaskStatus.InProgress, UserRole.Courier), new[] { Models.Enums.TaskStatus.DonePendingReview } },
            { (Models.Enums.TaskStatus.InProgress, UserRole.Accountant), new[] { Models.Enums.TaskStatus.DonePendingReview } },

            { (Models.Enums.TaskStatus.DonePendingReview, UserRole.Coordinator), new[] { Models.Enums.TaskStatus.Completed } },
            { (Models.Enums.TaskStatus.DonePendingReview, UserRole.Manager), new[] { Models.Enums.TaskStatus.Completed } },
        };

        var key = (currentStatus, user.Role);
        if (!allowedTransitions.ContainsKey(key))
        {
            return (false, $"Invalid status transition from {currentStatus} for role {user.Role}");
        }

        var allowedNextStates = allowedTransitions[key];
        if (!allowedNextStates.Contains(newStatus))
        {
            return (false, $"Status sequence violation - cannot transition from {currentStatus} to {newStatus}");
        }

        if (currentStatus == Models.Enums.TaskStatus.NotStarted || currentStatus == Models.Enums.TaskStatus.InProgress)
        {
            var isAssigned = task.Assignments.Any(a => a.AssignedUserId == userId);
            if (!isAssigned)
                return (false, "You are not the assigned employee for this task");
        }

        return (true, null);
    }

    private async Task<TaskResponseDTO> MapToResponseDTOAsync(Models.Task task, Guid? currentUserId = null)
    {
        await _db.Entry(task).Reference(t => t.CreatedBy).LoadAsync();
        await _db.Entry(task).Reference(t => t.AssignedDepartment).LoadAsync();
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
            IsConfidential = task.IsConfidential,
            CreatedById = task.CreatedById,
            CreatedByName = task.CreatedBy is not null
                ? $"{task.CreatedBy.FirstName} {task.CreatedBy.LastName}".Trim()
                : null,
            AssignedDepartmentId = task.AssignedDepartmentId,
            AssignedDepartmentName = task.AssignedDepartment?.Name,
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
                CompletionPercentage = a.CompletionPercentage,
            }).ToList(),
            MyCompletionPercentage = myAssignment?.CompletionPercentage,
            AttachmentCount = task.Attachments?.Count ?? 0,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt
        };
    }
}