using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Email;
using Backend.Modules.TaskManagement;
using Task = System.Threading.Tasks.Task;

namespace Backend.Modules.Notifications;

public class NotificationService : INotificationService
{
    private readonly AppDbContext _db;
    private readonly IEmailService _emailService;
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(AppDbContext db, IEmailService emailService, IAuditLogService auditLogService, ILogger<NotificationService> logger)
    {
        _db = db;
        _emailService = emailService;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    private async Task AuditNotificationAsync(Guid? userId, Guid? taskId, string action, string description)
    {
        await _auditLogService.LogAsync(
            userId, AuditActionType.Create, "Notification", taskId, null,
            description, "Notifications");
    }

    public async Task<Notification> CreateNotificationAsync(
        Guid recipientId, NotificationType type, string title, string message, Guid? taskId = null)
    {
        var notification = new Notification
        {
            RecipientId = recipientId,
            Type = type,
            Title = title,
            Message = message,
            RelatedTaskId = taskId,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _db.Notifications.Add(notification);
        await _db.SaveChangesAsync();

        var recipient = await _db.Users.FindAsync(recipientId);
        var recipientName = recipient is not null
            ? $"{recipient.FirstName} {recipient.LastName}".Trim()
            : recipientId.ToString();

        await AuditNotificationAsync(recipientId, taskId, "created",
            $"Notification sent to {recipientName}: {title}");

        return notification;
    }

    public async Task SendNotificationAsync(
        Guid recipientId, NotificationType type, string title, string message, Guid? taskId = null)
    {
        await CreateNotificationAsync(recipientId, type, title, message, taskId);

        var recipient = await _db.Users.FindAsync(recipientId);
        if (recipient is not null)
        {
            var fullName = $"{recipient.FirstName} {recipient.LastName}".Trim();
            try
            {
                await _emailService.SendTaskNotificationEmailAsync(
                    recipient.Email, fullName, title, message);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send email notification to {Email}", recipient.Email);
            }
        }
    }

    public async Task SendBulkNotificationAsync(
        List<Guid> recipientIds, NotificationType type, string title, string message, Guid? taskId = null)
    {
        foreach (var recipientId in recipientIds)
        {
            await SendNotificationAsync(recipientId, type, title, message, taskId);
        }
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<NotificationResponseDTO>>> GetByRecipientAsync(
        Guid recipientId, int pageNumber = 1, int pageSize = 10,
        NotificationType? type = null, DateTime? dateFrom = null, DateTime? dateTo = null)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Notifications
            .Where(n => n.RecipientId == recipientId);

        if (type.HasValue)
            query = query.Where(n => n.Type == type.Value);

        if (dateFrom.HasValue)
        {
            var startUtc = DateTime.SpecifyKind(dateFrom.Value.Date, DateTimeKind.Utc);
            query = query.Where(n => n.CreatedAt >= startUtc);
        }

        if (dateTo.HasValue)
        {
            var endUtc = DateTime.SpecifyKind(dateTo.Value.Date.AddDays(1), DateTimeKind.Utc);
            query = query.Where(n => n.CreatedAt < endUtc);
        }

        var totalCount = await query.CountAsync();

        var notifications = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new NotificationResponseDTO
            {
                Id = n.Id,
                Type = n.Type,
                Title = n.Title,
                Message = n.Message,
                RelatedTaskId = n.RelatedTaskId,
                IsRead = n.IsRead,
                CreatedAt = n.CreatedAt
            })
            .ToListAsync();

        var paginatedResult = new PaginatedResponseDTO<NotificationResponseDTO>
        {
            Items = notifications,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize
        };

        return ApiResponseDTO<PaginatedResponseDTO<NotificationResponseDTO>>.Success(paginatedResult);
    }

    public async Task<ApiResponseDTO<int>> GetUnreadCountAsync(Guid recipientId)
    {
        var count = await _db.Notifications
            .CountAsync(n => n.RecipientId == recipientId && !n.IsRead);

        return ApiResponseDTO<int>.Success(count);
    }

    public async Task<ApiResponseDTO<bool>> MarkAsReadAsync(Guid notificationId, Guid recipientId)
    {
        var notification = await _db.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.RecipientId == recipientId);

        if (notification is null)
            return ApiResponseDTO<bool>.Failure("Notification not found");

        notification.IsRead = true;
        await _db.SaveChangesAsync();

        var user = await _db.Users.FindAsync(recipientId);
        var userName = user is not null ? $"{user.FirstName} {user.LastName}".Trim() : recipientId.ToString();

        await AuditNotificationAsync(recipientId, notification.RelatedTaskId, "read",
            $"Notification {notificationId} marked as read by {userName}");

        return ApiResponseDTO<bool>.Success(true);
    }

    public async Task<ApiResponseDTO<bool>> MarkAllAsReadAsync(Guid recipientId)
    {
        var unreadNotifications = await _db.Notifications
            .Where(n => n.RecipientId == recipientId && !n.IsRead)
            .ToListAsync();

        foreach (var notification in unreadNotifications)
        {
            notification.IsRead = true;
        }

        await _db.SaveChangesAsync();

        var user = await _db.Users.FindAsync(recipientId);
        var userName = user is not null ? $"{user.FirstName} {user.LastName}".Trim() : recipientId.ToString();

        await AuditNotificationAsync(recipientId, null, "read-all",
            $"All notifications marked as read by {userName} ({unreadNotifications.Count} notifications)");

        return ApiResponseDTO<bool>.Success(true, "All notifications marked as read");
    }
}