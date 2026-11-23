using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.TaskManagement;

public interface IAttachmentService
{
    Task<ApiResponseDTO<TaskAttachmentResponseDTO>> UploadAsync(
        Guid taskId, IFormFile file, string? description, Guid uploaderId, string? ipAddress = null);
    Task<ApiResponseDTO<PaginatedResponseDTO<TaskAttachmentResponseDTO>>> GetByTaskIdAsync(Guid taskId, int pageNumber = 1, int pageSize = 10);
    Task<ApiResponseDTO<TaskAttachment>> GetByIdAsync(Guid id);
    Task<ApiResponseDTO<bool>> CanUserAccessAttachmentAsync(Guid attachmentId, Guid userId, Backend.Models.Enums.UserRole userRole);
    Task<ApiResponseDTO<bool>> DeleteAsync(Guid id, Guid? userId = null, string? ipAddress = null);
}