using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.OrganizationalStructure;

public interface IHierarchyService
{
    Task<ApiResponseDTO<HierarchyStructureResponseDTO>> GetHierarchyStructureAsync();
    Task<ApiResponseDTO<HierarchyEmployeeDTO>> GetEmployeeHierarchyAsync(Guid employeeId);
    Task<ApiResponseDTO<List<HierarchyEmployeeDTO>>> SearchEmployeesAsync(string query);
    Task<ApiResponseDTO<HierarchyEmployeeDTO>> MapEmployeeHierarchyAsync(MapHierarchyDTO dto, Guid requestUserId);
}
