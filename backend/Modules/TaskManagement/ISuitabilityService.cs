using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.TaskManagement;

public interface ISuitabilityService
{
    Task<ApiResponseDTO<List<SuitabilityResponseDTO>>> GetSuitableEmployeesAsync(
        Guid taskId, UserRole callerRole, Guid callerDepartmentId);

    Task<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>> GetSuitableEmployeesPagedAsync(
        Guid taskId, UserRole callerRole, Guid callerDepartmentId,
        int pageNumber = 1, int pageSize = 5);

    Task<ApiResponseDTO<List<SuitabilityExplanationDTO>>> GetSuitabilityExplanationAsync(
        Guid taskId, Guid employeeId, UserRole callerRole, Guid callerDepartmentId);

    Task<ApiResponseDTO<PaginatedResponseDTO<SuitabilityResponseDTO>>> GetSuitabilityPreviewAsync(
        Guid? departmentId, int classification, UserRole callerRole,
        int pageNumber = 1, int pageSize = 5);
}
