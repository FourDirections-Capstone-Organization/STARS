using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.TaskManagement;

public interface ITeamService
{
    Task<ApiResponseDTO<PaginatedResponseDTO<TeamResponseDTO>>> GetAllAsync(int pageNumber = 1, int pageSize = 50, string? search = null, bool includeInactive = false);
    Task<ApiResponseDTO<TeamResponseDTO>> GetByIdAsync(Guid id);
    Task<ApiResponseDTO<TeamResponseDTO>> CreateAsync(CreateTeamDTO dto, Guid createdById);
    Task<ApiResponseDTO<TeamResponseDTO>> UpdateAsync(Guid id, UpdateTeamDTO dto, Guid updatedById);
    Task<ApiResponseDTO<bool>> DeleteAsync(Guid id, Guid userId);
    Task<ApiResponseDTO<TeamResponseDTO>> AddMembersAsync(Guid teamId, AddTeamMembersDTO dto, Guid userId);
    Task<ApiResponseDTO<TeamResponseDTO>> RemoveMemberAsync(Guid teamId, Guid memberUserId, Guid userId);
    Task<ApiResponseDTO<TeamResponseDTO>> TransferMemberAsync(Guid memberUserId, Guid newTeamId, Guid userId);
    Task<ApiResponseDTO<PaginatedResponseDTO<TeamTaskDTO>>> GetTeamTasksAsync(Guid teamId, int pageNumber = 1, int pageSize = 10, string? search = null, int? status = null, int? priority = null);
    Task<ApiResponseDTO<List<TeamWorkloadDTO>>> GetTeamWorkloadAsync(Guid teamId);
}
