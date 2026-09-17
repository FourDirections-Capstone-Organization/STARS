using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.Notifications;

public interface IAnnouncementService
{
    Task<ApiResponseDTO<AnnouncementResponseDTO>> CreateAsync(CreateAnnouncementDTO dto, Guid creatorId);
    Task<ApiResponseDTO<List<AnnouncementResponseDTO>>> GetActiveAsync(string? userRole, Guid? currentUserId);
    Task<ApiResponseDTO<List<AnnouncementResponseDTO>>> GetAllAsync();
    Task<ApiResponseDTO<bool>> AcknowledgeAsync(Guid announcementId, Guid userId);
    Task<ApiResponseDTO<CommentDTO>> AddCommentAsync(Guid announcementId, Guid userId, string content);
    Task<(byte[] FileBytes, string ContentType, string FileName)?> GetAttachmentAsync(Guid announcementId);
}

