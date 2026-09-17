using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.OrganizationalStructure;

public interface IDepartmentService
{
    Task<ApiResponseDTO<PaginatedResponseDTO<DepartmentResponseDTO>>> GetAllAsync(int pageNumber = 1, int pageSize = 10);
    Task<ApiResponseDTO<DepartmentResponseDTO>> GetByIdAsync(Guid id);
    Task<ApiResponseDTO<DepartmentResponseDTO>> CreateAsync(CreateDepartmentDTO dto, Guid managerUserId);
    Task<ApiResponseDTO<DepartmentResponseDTO>> UpdateAsync(Guid id, UpdateDepartmentDTO dto, Guid managerUserId);
    Task<ApiResponseDTO<bool>> DeleteAsync(Guid id, Guid managerUserId);
    Task<ApiResponseDTO<DepartmentRosterDTO>> AssignEmployeeDepartmentAsync(AssignDepartmentDTO dto, Guid managerUserId);
    Task<ApiResponseDTO<DepartmentRosterDTO>> GetDepartmentRosterAsync(Guid departmentId);
    Task<ApiResponseDTO<List<DepartmentRosterDTO>>> GetAllDepartmentRostersAsync();
    System.Threading.Tasks.Task SeedDefaultDepartmentsAsync();
    System.Threading.Tasks.Task SeedDefaultPositionsAsync();
}
