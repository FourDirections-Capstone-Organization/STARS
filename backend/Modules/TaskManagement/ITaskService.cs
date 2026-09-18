using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Task = System.Threading.Tasks.Task;

namespace Backend.Modules.TaskManagement;

public interface ITaskService
{
    Task<ApiResponseDTO<TaskResponseDTO>> CreateAsync(CreateTaskDTO dto, Guid creatorId, string? ipAddress = null);
    Task<ApiResponseDTO<TaskListResponseDTO>> GetAllAsync(
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
        List<Models.Enums.TaskStatus>? excludeStatuses = null);
    Task<ApiResponseDTO<TaskResponseDTO>> GetByIdAsync(Guid id, Guid requestUserId, UserRole requestUserRole);
    Task<ApiResponseDTO<TaskResponseDTO>> UpdateAsync(Guid id, UpdateTaskDTO dto, Guid requestUserId, string? ipAddress = null);
    Task<ApiResponseDTO<PaginatedResponseDTO<TaskAssigneeDTO>>> GetAssignableUsersAsync(int pageNumber = 1, int pageSize = 10);
    Task<string> GenerateUniqueTaskTitleAsync(string requestedTitle);
    Task SeedDemoTasksAsync();
}