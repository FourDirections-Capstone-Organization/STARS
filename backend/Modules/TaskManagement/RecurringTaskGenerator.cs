using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.Enums;
using Backend.Modules.Notifications;
using Task = System.Threading.Tasks.Task;

namespace Backend.Modules.TaskManagement;

public class RecurringTaskGenerator : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<RecurringTaskGenerator> _logger;
    private readonly TimeSpan _checkInterval = TimeSpan.FromHours(1);

    public RecurringTaskGenerator(IServiceProvider serviceProvider, ILogger<RecurringTaskGenerator> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Recurring Task Generator started. Checking every {Interval} hour(s)",
            _checkInterval.TotalHours);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await GenerateDueTasksAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during recurring task generation");
            }

            await Task.Delay(_checkInterval, stoppingToken);
        }
    }

    private async Task GenerateDueTasksAsync(CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var notificationService = scope.ServiceProvider.GetRequiredService<INotificationService>();

        var now = DateTime.UtcNow;

        var dueTemplates = await db.TaskTemplates
            .Include(t => t.DefaultAssignee)
            .Include(t => t.CreatedBy)
            .Where(t => t.IsActive && t.NextGenerationDate <= now)
            .ToListAsync(stoppingToken);

        foreach (var template in dueTemplates)
        {
            try
            {
                var deadline = template.DefaultPriorityLevel == PriorityLevel.Urgent
                    ? now.AddHours(24)
                    : now.AddDays(7);

                var lowerTitle = template.DefaultTitle.Trim().ToLower();
                var prefix = lowerTitle + " ";
                var candidateTitles = await db.Tasks
                    .Where(t => t.Title.ToLower() == lowerTitle || t.Title.ToLower().StartsWith(prefix))
                    .Select(t => t.Title)
                    .ToListAsync(stoppingToken);
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
                    CreatedById = template.CreatedById,
                    AssignedDepartmentId = template.DefaultDepartmentId,
                    CreatedAt = now
                };

                db.Tasks.Add(task);
                await db.SaveChangesAsync(stoppingToken);

                var assigneeIds = new List<Guid>();

                if (template.DefaultAssigneeId.HasValue)
                {
                    var assigneeAvailable = await db.Users
                        .AnyAsync(u => u.Id == template.DefaultAssigneeId.Value
                            && u.IsActive && !u.IsDeactivated, stoppingToken);

                    if (assigneeAvailable)
                    {
                        assigneeIds.Add(template.DefaultAssigneeId.Value);
                    }
                    else
                    {
                        _logger.LogWarning(
                            "Template {TemplateName}: designated assignee is unavailable. Task created as Unassigned.",
                            template.TemplateName);

                        if (template.CreatedById != Guid.Empty)
                        {
                            await notificationService.SendNotificationAsync(
                                template.CreatedById,
                                NotificationType.TemplateTaskUnassigned,
                                "Template Task Unassigned",
                                $"Template task '{task.Title}' could not be auto-assigned - " +
                                $"designated assignee is unavailable. Please route manually.",
                                task.Id);
                        }
                    }
                }

                if (template.DefaultAssignmentScope == AssignmentScope.Department
                    && template.DefaultDepartmentId.HasValue)
                {
                    var deptUsers = await db.Users
                        .Where(u => u.DepartmentId == template.DefaultDepartmentId.Value
                            && u.IsActive && !u.IsDeactivated)
                        .Select(u => u.Id)
                        .ToListAsync(stoppingToken);

                    assigneeIds.AddRange(deptUsers);
                }

                assigneeIds = assigneeIds.Distinct().ToList();

                foreach (var userId in assigneeIds)
                {
                    db.TaskAssignments.Add(new TaskAssignment
                    {
                        TaskId = task.Id,
                        AssignedUserId = userId,
                        AssignedAt = now
                    });
                }

                template.LastGeneratedDate = now;
                template.NextGenerationDate = TaskTemplateService.CalculateNextGenerationDate(
                    now, template.RecurrenceRule);

                await db.SaveChangesAsync(stoppingToken);

                foreach (var userId in assigneeIds)
                {
                    await notificationService.SendNotificationAsync(
                        userId,
                        NotificationType.TaskAssigned,
                        "New Recurring Task Assigned",
                        $"You have been assigned recurring task '{task.Title}'.",
                        task.Id);
                }

                _logger.LogInformation(
                    "Auto-generated task {TaskId} from template {TemplateName}. Next generation: {NextDate}",
                    task.Id, template.TemplateName, template.NextGenerationDate);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate task from template {TemplateName}",
                    template.TemplateName);
            }
        }
    }
}
