using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.TaskManagement;

public interface ITaskWorkflowService
{
    Task<ApiResponseDTO<TaskResponseDTO>> UpdateStatusAsync(Guid taskId, TaskStatusUpdateDTO dto, Guid userId, string? ipAddress = null);
    Task<ApiResponseDTO<TaskResponseDTO>> UpdateProgressAsync(Guid taskId, TaskProgressUpdateDTO dto, Guid userId, string? ipAddress = null);
    Task<ApiResponseDTO<TaskResponseDTO>> ReviewTaskAsync(Guid taskId, ReviewTaskDTO dto, Guid reviewerId, string? ipAddress = null);
    Task<ApiResponseDTO<TaskResponseDTO>> PlaceOnHoldAsync(Guid taskId, PlaceOnHoldDTO dto, Guid coordinatorId, string? ipAddress = null);
    Task<ApiResponseDTO<TaskResponseDTO>> ResumeTaskAsync(Guid taskId, ResumeTaskDTO dto, Guid coordinatorId, string? ipAddress = null);
    Task<ApiResponseDTO<TaskResponseDTO>> CancelTaskAsync(Guid taskId, CancelTaskDTO dto, Guid coordinatorId, string? ipAddress = null);
    Task<ApiResponseDTO<TaskResponseDTO>> RestoreTaskAsync(Guid taskId, Guid coordinatorId, string? ipAddress = null);
}