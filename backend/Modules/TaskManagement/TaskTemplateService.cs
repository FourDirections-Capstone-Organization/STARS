using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Notifications;

namespace Backend.Modules.TaskManagement;

public class TaskTemplateService : ITaskTemplateService
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notificationService;
    private readonly IAuditLogService _auditLogService;

    public TaskTemplateService(AppDbContext db, INotificationService notificationService, IAuditLogService auditLogService)
    {
        _db = db;
        _notificationService = notificationService;
        _auditLogService = auditLogService;
    }

    public async Task<ApiResponseDTO<TaskTemplateResponseDTO>> CreateAsync(
        CreateTaskTemplateDTO dto, Guid creatorId)
    {
        var creator = await _db.Users.FindAsync(creatorId);
        if (creator is null)
            return ApiResponseDTO<TaskTemplateResponseDTO>.Failure("Creator not found");

        if (creator.Role != UserRole.Coordinator && creator.Role != UserRole.Manager)
            return ApiResponseDTO<TaskTemplateResponseDTO>.Failure(
                "Only Coordinators and Managers can create task templates");

        if (dto.DefaultAssigneeId.HasValue)
        {
            var assigneeExists = await _db.Users
                .AnyAsync(u => u.Id == dto.DefaultAssigneeId.Value && u.IsActive && !u.IsDeactivated);

            if (!assigneeExists)
                return ApiResponseDTO<TaskTemplateResponseDTO>.Failure(
                    "Default assignee is inactive or does not exist");
        }

        if (dto.DefaultDepartmentId.HasValue)
        {
            var deptExists = await _db.Departments
                .AnyAsync(d => d.Id == dto.DefaultDepartmentId.Value && d.IsActive);

            if (!deptExists)
                return ApiResponseDTO<TaskTemplateResponseDTO>.Failure(
                    "Default department is inactive or does not exist");
        }

        // The frontend sends date-only strings (Kind=Unspecified); PostgreSQL timestamptz
        // requires Utc, so normalize before storing or computing derived dates.
        var recurrenceStart = DateTime.SpecifyKind(dto.RecurrenceStartDate, DateTimeKind.Utc);

        var nextGenDate = CalculateNextGenerationDate(recurrenceStart, dto.RecurrenceRule);

        var template = new TaskTemplate
        {
            TemplateName = dto.TemplateName.Trim(),
            DefaultTitle = dto.DefaultTitle.Trim(),
            DefaultDescription = dto.DefaultDescription.Trim(),
            DefaultPriorityLevel = dto.DefaultPriorityLevel,
            DefaultClassification = dto.DefaultClassification,
            DefaultAssignmentScope = dto.DefaultAssignmentScope,
            DefaultAssigneeId = dto.DefaultAssigneeId,
            DefaultDepartmentId = dto.DefaultDepartmentId,
            RecurrenceRule = dto.RecurrenceRule,
            RecurrenceStartDate = recurrenceStart,
            NextGenerationDate = nextGenDate,
            IsActive = dto.IsActive,
            CreatedById = creatorId,
            CreatedAt = DateTime.UtcNow
        };

        _db.TaskTemplates.Add(template);
        await _db.SaveChangesAsync();

        if (template.DefaultAssigneeId.HasValue)
            await _db.Entry(template).Reference(t => t.DefaultAssignee).LoadAsync();
        if (template.DefaultDepartmentId.HasValue)
            await _db.Entry(template).Reference(t => t.DefaultDepartment).LoadAsync();
        await _db.Entry(template).Reference(t => t.CreatedBy).LoadAsync();

        await _auditLogService.LogAsync(
            creatorId,
            AuditActionType.Create,
            "TaskTemplate",
            template.Id,
            null,
            $"Task template '{template.TemplateName}' created",
            "TaskManagement");

        return ApiResponseDTO<TaskTemplateResponseDTO>.Success(
            await MapToResponseDTOAsync(template),
            "Task template created successfully");
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<TaskTemplateResponseDTO>>> GetAllAsync(int pageNumber = 1, int pageSize = 10)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.TaskTemplates
            .Include(t => t.DefaultAssignee)
            .Include(t => t.DefaultDepartment)
            .Include(t => t.CreatedBy);

        var totalCount = await query.CountAsync();

        var templates = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var response = new List<TaskTemplateResponseDTO>();
        foreach (var template in templates)
        {
            response.Add(await MapToResponseDTOAsync(template));
        }

        var paginatedResult = new PaginatedResponseDTO<TaskTemplateResponseDTO>
        {
            Items = response,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize
        };

        return ApiResponseDTO<PaginatedResponseDTO<TaskTemplateResponseDTO>>.Success(paginatedResult);
    }

    public async Task<ApiResponseDTO<TaskTemplateResponseDTO>> GetByIdAsync(Guid id)
    {
        var template = await _db.TaskTemplates
            .Include(t => t.DefaultAssignee)
            .Include(t => t.DefaultDepartment)
            .Include(t => t.CreatedBy)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template is null)
            return ApiResponseDTO<TaskTemplateResponseDTO>.Failure("Template not found");

        return ApiResponseDTO<TaskTemplateResponseDTO>.Success(await MapToResponseDTOAsync(template));
    }

    public async Task<ApiResponseDTO<TaskTemplateResponseDTO>> UpdateAsync(
        Guid id, UpdateTaskTemplateDTO dto)
    {
        var template = await _db.TaskTemplates
            .Include(t => t.DefaultAssignee)
            .Include(t => t.DefaultDepartment)
            .Include(t => t.CreatedBy)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template is null)
            return ApiResponseDTO<TaskTemplateResponseDTO>.Failure("Template not found");

        // Capture old values before mutation (AL-002 step 7)
        var oldTemplateName = template.TemplateName;
        var oldDefaultTitle = template.DefaultTitle;
        var oldDefaultDescription = template.DefaultDescription;
        var oldPriority = template.DefaultPriorityLevel.ToString();
        var oldClassification = template.DefaultClassification.ToString();
        var oldScope = template.DefaultAssignmentScope.ToString();
        var oldAssignee = template.DefaultAssigneeId?.ToString() ?? string.Empty;
        var oldDepartment = template.DefaultDepartmentId?.ToString() ?? string.Empty;
        var oldRecurrence = template.RecurrenceRule.ToString();
        var oldIsActive = template.IsActive.ToString();

        if (!string.IsNullOrWhiteSpace(dto.TemplateName))
            template.TemplateName = dto.TemplateName.Trim();

        if (!string.IsNullOrWhiteSpace(dto.DefaultTitle))
            template.DefaultTitle = dto.DefaultTitle.Trim();

        if (!string.IsNullOrWhiteSpace(dto.DefaultDescription))
            template.DefaultDescription = dto.DefaultDescription.Trim();

        if (dto.DefaultPriorityLevel.HasValue)
            template.DefaultPriorityLevel = dto.DefaultPriorityLevel.Value;

        if (dto.DefaultClassification.HasValue)
            template.DefaultClassification = dto.DefaultClassification.Value;

        if (dto.DefaultAssignmentScope.HasValue)
            template.DefaultAssignmentScope = dto.DefaultAssignmentScope.Value;

        if (dto.ClearDefaultAssignee == true)
        {
            template.DefaultAssigneeId = null;
        }
        else if (dto.DefaultAssigneeId.HasValue)
        {
            var assigneeExists = await _db.Users
                .AnyAsync(u => u.Id == dto.DefaultAssigneeId.Value && u.IsActive && !u.IsDeactivated);

            if (!assigneeExists)
                return ApiResponseDTO<TaskTemplateResponseDTO>.Failure(
                    "Default assignee is inactive or does not exist");

            template.DefaultAssigneeId = dto.DefaultAssigneeId;
        }

        if (dto.DefaultDepartmentId.HasValue)
            template.DefaultDepartmentId = dto.DefaultDepartmentId;

        if (dto.RecurrenceRule.HasValue || dto.RecurrenceStartDate.HasValue)
        {
            var rule = dto.RecurrenceRule ?? template.RecurrenceRule;
            var startDate = dto.RecurrenceStartDate ?? template.RecurrenceStartDate;
            // Normalize to Utc (the frontend sends date-only strings) so PostgreSQL timestamptz accepts it.
            var normalizedStart = DateTime.SpecifyKind(startDate, DateTimeKind.Utc);
            template.RecurrenceRule = rule;
            template.RecurrenceStartDate = normalizedStart;
            template.NextGenerationDate = CalculateNextGenerationDate(normalizedStart, rule);
        }

        if (dto.IsActive.HasValue)
            template.IsActive = dto.IsActive.Value;

        template.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        if (template.DefaultAssigneeId.HasValue)
            await _db.Entry(template).Reference(t => t.DefaultAssignee).LoadAsync();
        else
            template.DefaultAssignee = null;

        if (template.DefaultDepartmentId.HasValue)
            await _db.Entry(template).Reference(t => t.DefaultDepartment).LoadAsync();
        else
            template.DefaultDepartment = null;

        await _db.Entry(template).Reference(t => t.CreatedBy).LoadAsync();

        // AL-002 step 7: capture Old Value and New Value for changed template fields
        var oldParts = new List<string>();
        var newParts = new List<string>();
        void Track(string field, string oldVal, string newVal)
        {
            if (oldVal != newVal)
            {
                oldParts.Add($"\"{field}\":\"{oldVal}\"");
                newParts.Add($"\"{field}\":\"{newVal}\"");
            }
        }
        Track("TemplateName", oldTemplateName, template.TemplateName);
        Track("DefaultTitle", oldDefaultTitle ?? string.Empty, template.DefaultTitle ?? string.Empty);
        Track("DefaultDescription", oldDefaultDescription ?? string.Empty, template.DefaultDescription ?? string.Empty);
        Track("DefaultPriorityLevel", oldPriority, template.DefaultPriorityLevel.ToString());
        Track("DefaultClassification", oldClassification, template.DefaultClassification.ToString());
        Track("DefaultAssignmentScope", oldScope, template.DefaultAssignmentScope.ToString());
        Track("DefaultAssigneeId", oldAssignee, template.DefaultAssigneeId?.ToString() ?? string.Empty);
        Track("DefaultDepartmentId", oldDepartment, template.DefaultDepartmentId?.ToString() ?? string.Empty);
        Track("RecurrenceRule", oldRecurrence, template.RecurrenceRule.ToString());
        Track("IsActive", oldIsActive, template.IsActive.ToString());

        await _auditLogService.LogAsync(
            template.CreatedById,
            AuditActionType.Update,
            "TaskTemplate",
            template.Id,
            null,
            $"Task template '{template.TemplateName}' updated",
            "TaskManagement",
            oldValue: oldParts.Count > 0 ? "{" + string.Join(",", oldParts) + "}" : null,
            newValue: newParts.Count > 0 ? "{" + string.Join(",", newParts) + "}" : null);

        return ApiResponseDTO<TaskTemplateResponseDTO>.Success(
            await MapToResponseDTOAsync(template),
            "Task template updated successfully");
    }

    public async Task<ApiResponseDTO<bool>> DeleteAsync(Guid id, Guid requestUserId)
    {
        var template = await _db.TaskTemplates.FindAsync(id);

        if (template is null)
            return ApiResponseDTO<bool>.Failure("Template not found");

        _db.TaskTemplates.Remove(template);
        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Delete,
            "TaskTemplate",
            template.Id,
            null,
            $"Task template '{template.TemplateName}' deleted",
            "TaskManagement");

        return ApiResponseDTO<bool>.Success(true, "Template deleted successfully");
    }

    public async Task<ApiResponseDTO<TaskResponseDTO>> DeployManuallyAsync(Guid id, Guid coordinatorId)
    {
        var template = await _db.TaskTemplates
            .Include(t => t.DefaultAssignee)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template is null)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Template not found");

        if (!template.IsActive)
            return ApiResponseDTO<TaskResponseDTO>.Failure("Template is Inactive and cannot be deployed");

        var now = DateTime.UtcNow;
        var deadline = CalculateDeadline(template.DefaultPriorityLevel, now);

        var lowerTitle = template.DefaultTitle.Trim().ToLower();
        var prefix = lowerTitle + " ";
        var candidateTitles = await _db.Tasks
            .Where(t => t.Title.ToLower() == lowerTitle || t.Title.ToLower().StartsWith(prefix))
            .Select(t => t.Title)
            .ToListAsync();
        var uniqueTitle = TaskService.ResolveIncrementalTitle(template.DefaultTitle, candidateTitles);

        var task = new Models.Task
        {
            Title = uniqueTitle,
            Description = template.DefaultDescription,
            PriorityLevel = template.DefaultPriorityLevel,
            Classification = template.DefaultClassification,
            Status = Models.Enums.TaskStatus.NotStarted,
            AssignmentScope = template.DefaultAssignmentScope,
            Deadline = deadline,
            IsSLALocked = template.DefaultPriorityLevel == PriorityLevel.Urgent,
            CreatedById = coordinatorId,
            AssignedDepartmentId = template.DefaultDepartmentId,
            CreatedAt = now
        };

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        var assigneeIds = new List<Guid>();

        if (template.DefaultAssigneeId.HasValue)
        {
            var assigneeAvailable = await _db.Users
                .AnyAsync(u => u.Id == template.DefaultAssigneeId.Value
                    && u.IsActive && !u.IsDeactivated);

            if (assigneeAvailable)
            {
                assigneeIds.Add(template.DefaultAssigneeId.Value);
            }
        }

        if (template.DefaultAssignmentScope == AssignmentScope.Department
            && template.DefaultDepartmentId.HasValue)
        {
            var deptUsers = await _db.Users
                .Where(u => u.DepartmentId == template.DefaultDepartmentId.Value
                    && u.IsActive && !u.IsDeactivated)
                .Select(u => u.Id)
                .ToListAsync();

            assigneeIds.AddRange(deptUsers);
        }

        assigneeIds = assigneeIds.Distinct().ToList();

        foreach (var userId in assigneeIds)
        {
            _db.TaskAssignments.Add(new TaskAssignment
            {
                TaskId = task.Id,
                AssignedUserId = userId,
                AssignedAt = now
            });
        }

        if (assigneeIds.Count > 0)
            await _db.SaveChangesAsync();

        foreach (var userId in assigneeIds)
        {
            await _notificationService.SendNotificationAsync(
                userId,
                NotificationType.TaskAssigned,
                "New Task Assigned",
                $"You have been assigned task '{task.Title}' (deployed from template).",
                task.Id);
        }

        await _db.Entry(task).Reference(t => t.CreatedBy).LoadAsync();
        await _db.Entry(task).Collection(t => t.Assignments).LoadAsync();

        await _auditLogService.LogAsync(
            coordinatorId,
            AuditActionType.Create,
            "TaskTemplate",
            template.Id,
            null,
            $"Manual deployment from template '{template.TemplateName}' created task '{task.Title}'",
            "TaskManagement");

        return ApiResponseDTO<TaskResponseDTO>.Success(
            await MapTaskToResponseDTOAsync(task),
            "Task deployed manually successfully");
    }

    public static DateTime CalculateNextGenerationDate(DateTime fromDate, RecurrenceRule rule)
    {
        return rule switch
        {
            RecurrenceRule.Daily => fromDate.AddDays(1),
            RecurrenceRule.Weekly => fromDate.AddDays(7),
            RecurrenceRule.Monthly => fromDate.AddMonths(1),
            _ => fromDate.AddDays(1)
        };
    }

    private static DateTime CalculateDeadline(PriorityLevel priority, DateTime createdAt)
    {
        if (priority == PriorityLevel.Urgent)
            return createdAt.AddHours(24);

        return createdAt.AddDays(7);
    }

    private async Task<TaskTemplateResponseDTO> MapToResponseDTOAsync(TaskTemplate template)
    {
        return new TaskTemplateResponseDTO
        {
            Id = template.Id,
            TemplateName = template.TemplateName,
            DefaultTitle = template.DefaultTitle,
            DefaultDescription = template.DefaultDescription,
            DefaultPriorityLevel = template.DefaultPriorityLevel,
            DefaultClassification = template.DefaultClassification,
            DefaultAssignmentScope = template.DefaultAssignmentScope,
            DefaultAssigneeId = template.DefaultAssigneeId,
            DefaultAssigneeName = template.DefaultAssignee is not null
                ? $"{template.DefaultAssignee.FirstName} {template.DefaultAssignee.LastName}".Trim()
                : null,
            DefaultDepartmentId = template.DefaultDepartmentId,
            DefaultDepartmentName = template.DefaultDepartment?.Name,
            RecurrenceRule = template.RecurrenceRule,
            RecurrenceStartDate = template.RecurrenceStartDate,
            NextGenerationDate = template.NextGenerationDate,
            LastGeneratedDate = template.LastGeneratedDate,
            IsActive = template.IsActive,
            CreatedById = template.CreatedById,
            CreatedByName = template.CreatedBy is not null
                ? $"{template.CreatedBy.FirstName} {template.CreatedBy.LastName}".Trim()
                : null,
            CreatedAt = template.CreatedAt
        };
    }

    private async Task<TaskResponseDTO> MapTaskToResponseDTOAsync(Models.Task task)
    {
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
            Assignees = task.Assignments.Select(a => new TaskAssigneeDTO
            {
                UserId = a.AssignedUserId,
                FullName = a.AssignedUser is not null
                    ? $"{a.AssignedUser.FirstName} {a.AssignedUser.LastName}".Trim()
                    : "Unknown",
                EmployeeNumber = a.AssignedUser?.EmployeeNumber ?? "",
                Role = a.AssignedUser?.Role.ToString()
            }).ToList(),
            AttachmentCount = 0,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt
        };
    }
}
