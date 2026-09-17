using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;

namespace Backend.Modules.Notifications;

public class AnnouncementService : IAnnouncementService
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notificationService;
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<AnnouncementService> _logger;

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".jpg", ".jpeg", ".png"
    };
    private const long MaxAttachmentSizeBytes = 10 * 1024 * 1024; // 10MB

    public AnnouncementService(
        AppDbContext db,
        INotificationService notificationService,
        IAuditLogService auditLogService,
        ILogger<AnnouncementService> logger)
    {
        _db = db;
        _notificationService = notificationService;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    public async Task<ApiResponseDTO<AnnouncementResponseDTO>> CreateAsync(CreateAnnouncementDTO dto, Guid creatorId)
    {
        var creator = await _db.Users.FindAsync(creatorId);
        if (creator is null)
            return ApiResponseDTO<AnnouncementResponseDTO>.Failure("Creator not found");

        if (creator.Role != UserRole.Coordinator && creator.Role != UserRole.Manager)
            return ApiResponseDTO<AnnouncementResponseDTO>.Failure("Only Coordinators and Managers can publish announcements");

        if (string.IsNullOrWhiteSpace(dto.Title))
            return ApiResponseDTO<AnnouncementResponseDTO>.Failure("Announcement title is required");

        if (string.IsNullOrWhiteSpace(dto.Content))
            return ApiResponseDTO<AnnouncementResponseDTO>.Failure("Announcement content is required");

        if (dto.ExpiryDate.HasValue && dto.ExpiryDate.Value < dto.EffectiveDate)
            return ApiResponseDTO<AnnouncementResponseDTO>.Failure("Expiry date must not precede effective date");

        var announcementId = Guid.NewGuid();
        string? attachmentFileName = null;
        string? attachmentFilePath = null;
        string? attachmentContentType = null;
        long? attachmentSizeBytes = null;

        if (dto.Attachment is not null && dto.Attachment.Length > 0)
        {
            if (dto.Attachment.Length > MaxAttachmentSizeBytes)
                return ApiResponseDTO<AnnouncementResponseDTO>.Failure("Attachment size cannot exceed 10MB");

            var ext = Path.GetExtension(dto.Attachment.FileName);
            if (string.IsNullOrEmpty(ext) || !AllowedExtensions.Contains(ext))
                return ApiResponseDTO<AnnouncementResponseDTO>.Failure("Only PDF, JPG, and PNG files are allowed as attachments");

            try
            {
                var uploadDir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "announcements", announcementId.ToString());
                if (!Directory.Exists(uploadDir))
                    Directory.CreateDirectory(uploadDir);

                var uniqueFileName = $"{Guid.NewGuid()}{ext}";
                var fullFilePath = Path.Combine(uploadDir, uniqueFileName);

                using (var stream = new FileStream(fullFilePath, FileMode.Create))
                {
                    await dto.Attachment.CopyToAsync(stream);
                }

                attachmentFileName = Path.GetFileName(dto.Attachment.FileName);
                attachmentFilePath = fullFilePath;
                attachmentContentType = dto.Attachment.ContentType ?? "application/octet-stream";
                attachmentSizeBytes = dto.Attachment.Length;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to save announcement attachment");
                return ApiResponseDTO<AnnouncementResponseDTO>.Failure("Failed to upload attachment file");
            }
        }

        var priority = string.IsNullOrWhiteSpace(dto.Priority) ? "Normal" : dto.Priority.Trim();
        if (priority != "Normal" && priority != "Important" && priority != "Urgent")
        {
            priority = "Normal";
        }

        var announcement = new Announcement
        {
            Id = announcementId,
            Title = dto.Title.Trim(),
            Content = dto.Content.Trim(),
            TargetRoles = dto.TargetRoles?.Trim(),
            EffectiveDate = DateTime.SpecifyKind(dto.EffectiveDate, DateTimeKind.Utc),
            ExpiryDate = dto.ExpiryDate.HasValue ? DateTime.SpecifyKind(dto.ExpiryDate.Value, DateTimeKind.Utc) : null,
            Priority = priority,
            IsPublic = dto.IsPublic,
            AttachmentFileName = attachmentFileName,
            AttachmentFilePath = attachmentFilePath,
            AttachmentContentType = attachmentContentType,
            AttachmentSizeBytes = attachmentSizeBytes,
            CreatedById = creatorId,
            IsPublished = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Announcements.Add(announcement);
        await _db.SaveChangesAsync();

        // 6. Targeted users receive in-app notifications
        var recipients = await GetTargetUserIds(dto.TargetRoles, dto.IsPublic);
        if (recipients.Count > 0)
        {
            var previewTitle = announcement.Title.Length > 100 ? announcement.Title[..100] + "..." : announcement.Title;
            var notificationTitle = priority == "Urgent" ? $"[URGENT] {previewTitle}" : (priority == "Important" ? $"[IMPORTANT] {previewTitle}" : $"Announcement: {previewTitle}");
            await _notificationService.SendBulkNotificationAsync(
                recipients, NotificationType.TaskAssigned, notificationTitle,
                $"{announcement.Title}", null);
        }

        var creatorName = $"{creator.FirstName} {creator.LastName}".Trim();
        var targetAudienceLabel = dto.IsPublic ? "Public (All Users)" : (string.IsNullOrWhiteSpace(dto.TargetRoles) ? "All Users" : dto.TargetRoles);
        
        // 7. Audit Log entry
        await _auditLogService.LogAsync(creatorId, AuditActionType.Create, "Announcement", announcement.Id, null,
            $"Announcement published: '{announcement.Title}' by {creatorName}. Priority: {priority}, Target: {targetAudienceLabel}", "Announcements");

        return ApiResponseDTO<AnnouncementResponseDTO>.Success(
            MapToDTO(announcement, creatorName, creator.Role.ToString(), false, 0, new(), new()),
            "Announcement published successfully");
    }

    public async Task<ApiResponseDTO<List<AnnouncementResponseDTO>>> GetActiveAsync(string? userRole, Guid? currentUserId)
    {
        var now = DateTime.UtcNow;

        var query = _db.Announcements
            .Include(a => a.CreatedBy)
            .Where(a => a.IsPublished && a.EffectiveDate <= now)
            .Where(a => !a.ExpiryDate.HasValue || a.ExpiryDate.Value >= now);

        if (!string.IsNullOrEmpty(userRole) && userRole != "Manager" && userRole != "Coordinator")
        {
            // Regular employees only see if IsPublic OR TargetRoles contains role OR TargetRoles contains "All" or empty
            query = query.Where(a => a.IsPublic
                || string.IsNullOrEmpty(a.TargetRoles)
                || a.TargetRoles.Contains("All")
                || a.TargetRoles.Contains(userRole));
        }

        var announcements = await query
            .OrderByDescending(a => a.Priority == "Urgent" ? 3 : (a.Priority == "Important" ? 2 : 1))
            .ThenByDescending(a => a.CreatedAt)
            .ToListAsync();

        var result = new List<AnnouncementResponseDTO>();
        foreach (var a in announcements)
        {
            var name = a.CreatedBy is not null ? $"{a.CreatedBy.FirstName} {a.CreatedBy.LastName}".Trim() : "Unknown";
            var role = a.CreatedBy?.Role.ToString() ?? "";

            var acknowledgments = await _db.AnnouncementAcknowledgments
                .Where(x => x.AnnouncementId == a.Id)
                .Include(x => x.User)
                .ToListAsync();

            var comments = await _db.AnnouncementComments
                .Where(c => c.AnnouncementId == a.Id)
                .Include(c => c.User)
                .OrderBy(c => c.CreatedAt)
                .ToListAsync();

            var isAcknowledged = currentUserId.HasValue && acknowledgments.Any(x => x.UserId == currentUserId.Value);

            result.Add(MapToDTO(a, name, role, isAcknowledged, acknowledgments.Count,
                acknowledgments.Select(x => new AcknowledgmentUserDTO
                {
                    UserId = x.UserId,
                    FullName = x.User is not null ? $"{x.User.FirstName} {x.User.LastName}".Trim() : "Unknown",
                    AcknowledgedAt = x.CreatedAt
                }).ToList(),
                comments.Select(c => new CommentDTO
                {
                    Id = c.Id,
                    UserId = c.UserId,
                    FullName = c.User is not null ? $"{c.User.FirstName} {c.User.LastName}".Trim() : "Unknown",
                    Content = c.Content,
                    CreatedAt = c.CreatedAt
                }).ToList()));
        }

        return ApiResponseDTO<List<AnnouncementResponseDTO>>.Success(result);
    }

    public async Task<ApiResponseDTO<List<AnnouncementResponseDTO>>> GetAllAsync()
    {
        var announcements = await _db.Announcements
            .Include(a => a.CreatedBy)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        var result = announcements.Select(a =>
        {
            var name = a.CreatedBy is not null ? $"{a.CreatedBy.FirstName} {a.CreatedBy.LastName}".Trim() : "Unknown";
            var role = a.CreatedBy?.Role.ToString() ?? "";
            return MapToDTO(a, name, role, false, 0, new(), new());
        }).ToList();

        return ApiResponseDTO<List<AnnouncementResponseDTO>>.Success(result);
    }

    public async Task<ApiResponseDTO<bool>> AcknowledgeAsync(Guid announcementId, Guid userId)
    {
        var announcement = await _db.Announcements.FindAsync(announcementId);
        if (announcement is null)
            return ApiResponseDTO<bool>.Failure("Announcement not found");

        var existing = await _db.AnnouncementAcknowledgments
            .AnyAsync(x => x.AnnouncementId == announcementId && x.UserId == userId);

        if (existing)
            return ApiResponseDTO<bool>.Failure("You have already acknowledged this announcement");

        _db.AnnouncementAcknowledgments.Add(new AnnouncementAcknowledgment
        {
            AnnouncementId = announcementId,
            UserId = userId
        });
        await _db.SaveChangesAsync();

        var user = await _db.Users.FindAsync(userId);
        var userName = user is not null ? $"{user.FirstName} {user.LastName}".Trim() : "Unknown";
        await _auditLogService.LogAsync(userId, AuditActionType.Create, "AnnouncementAcknowledgment", announcementId, null,
            $"User {userName} acknowledged announcement '{announcement.Title}'", "Announcements");

        return ApiResponseDTO<bool>.Success(true, "Announcement acknowledged");
    }

    public async Task<ApiResponseDTO<CommentDTO>> AddCommentAsync(Guid announcementId, Guid userId, string content)
    {
        var announcement = await _db.Announcements.FindAsync(announcementId);
        if (announcement is null)
            return ApiResponseDTO<CommentDTO>.Failure("Announcement not found");

        var comment = new AnnouncementComment
        {
            AnnouncementId = announcementId,
            UserId = userId,
            Content = content.Trim()
        };
        _db.AnnouncementComments.Add(comment);
        await _db.SaveChangesAsync();

        var user = await _db.Users.FindAsync(userId);
        var userName = user is not null ? $"{user.FirstName} {user.LastName}".Trim() : "Unknown";
        await _auditLogService.LogAsync(userId, AuditActionType.Create, "AnnouncementComment", announcementId, null,
            $"User {userName} commented on announcement '{announcement.Title}'", "Announcements");

        return ApiResponseDTO<CommentDTO>.Success(new CommentDTO
        {
            Id = comment.Id,
            UserId = userId,
            FullName = userName,
            Content = comment.Content,
            CreatedAt = comment.CreatedAt
        }, "Comment added");
    }

    public async Task<(byte[] FileBytes, string ContentType, string FileName)?> GetAttachmentAsync(Guid announcementId)
    {
        var announcement = await _db.Announcements.FindAsync(announcementId);
        if (announcement is null || string.IsNullOrEmpty(announcement.AttachmentFilePath))
            return null;

        if (!File.Exists(announcement.AttachmentFilePath))
            return null;

        var bytes = await File.ReadAllBytesAsync(announcement.AttachmentFilePath);
        var contentType = announcement.AttachmentContentType ?? "application/octet-stream";
        var fileName = announcement.AttachmentFileName ?? "attachment";

        return (bytes, contentType, fileName);
    }

    private async Task<List<Guid>> GetTargetUserIds(string? targetRoles, bool isPublic)
    {
        if (isPublic || string.IsNullOrEmpty(targetRoles) || targetRoles.Contains("All"))
            return await _db.Users.Where(u => u.IsActive && !u.IsDeactivated).Select(u => u.Id).ToListAsync();

        var roles = targetRoles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var roleEnums = roles.Select(r => Enum.TryParse<UserRole>(r, true, out var val) ? val : (UserRole?)null)
            .Where(r => r.HasValue).Select(r => r!.Value).ToList();

        return await _db.Users.Where(u => roleEnums.Contains(u.Role) && u.IsActive && !u.IsDeactivated)
            .Select(u => u.Id).ToListAsync();
    }

    private static AnnouncementResponseDTO MapToDTO(Announcement a, string creatorName, string creatorRole,
        bool isAcknowledged, int ackCount, List<AcknowledgmentUserDTO> acks, List<CommentDTO> comments)
    {
        return new AnnouncementResponseDTO
        {
            Id = a.Id,
            Title = a.Title,
            Content = a.Content,
            TargetRoles = a.TargetRoles,
            EffectiveDate = a.EffectiveDate,
            ExpiryDate = a.ExpiryDate,
            Priority = a.Priority ?? "Normal",
            IsPublic = a.IsPublic,
            AttachmentFileName = a.AttachmentFileName,
            AttachmentContentType = a.AttachmentContentType,
            AttachmentSizeBytes = a.AttachmentSizeBytes,
            CreatedByName = creatorName,
            CreatedByRole = creatorRole,
            CreatedAt = a.CreatedAt,
            IsAcknowledged = isAcknowledged,
            AcknowledgmentCount = ackCount,
            Acknowledgments = acks,
            Comments = comments
        };
    }
}

