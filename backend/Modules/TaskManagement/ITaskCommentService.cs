using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Microsoft.AspNetCore.Http;

namespace Backend.Modules.TaskManagement;

public interface ITaskCommentService
{
    Task<ApiResponseDTO<TaskCommentResponseDTO>> CreateAsync(
        Guid taskId, string? content, List<IFormFile>? attachments, Guid authorId);
    Task<ApiResponseDTO<PaginatedResponseDTO<TaskCommentResponseDTO>>> GetByTaskIdAsync(Guid taskId, int pageNumber = 1, int pageSize = 10);
    Task<ApiResponseDTO<TaskCommentResponseDTO>> UpdateAsync(
        Guid commentId, string newContent, Guid userId);
    Task<ApiResponseDTO<bool>> DeleteAsync(Guid commentId, Guid userId);
    Task<ApiResponseDTO<TaskCommentAttachment>> GetAttachmentAsync(Guid commentId, Guid attachmentId);
    Task<ApiResponseDTO<TaskComment>> GetLegacyAttachmentAsync(Guid commentId);
    Task<ApiResponseDTO<bool>> CanUserAccessTaskCommentsAsync(Guid taskId, Guid userId, UserRole userRole);
}
