using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.UserAccountManagement;

public interface IUserService
{
    Task<ApiResponseDTO<UserResponseDTO>> RegisterAsync(RegisterUserDTO dto);
    Task<ApiResponseDTO<PaginatedResponseDTO<UserResponseDTO>>> GetAllAsync(int pageNumber = 1, int pageSize = 10, string? search = null, string? role = null, Guid? departmentId = null, string? status = null);
    Task<ApiResponseDTO<UserResponseDTO>> GetByIdAsync(Guid id);
    Task<ApiResponseDTO<UserResponseDTO>> GetByEmployeeNumberAsync(string employeeNumber);
    Task<ApiResponseDTO<UserResponseDTO>> UpdateAsync(Guid id, UpdateUserDTO dto, Guid? requestUserId = null);
    Task<ApiResponseDTO<bool>> DeactivateAsync(Guid id, Guid? requestUserId = null);
    Task<ApiResponseDTO<bool>> ActivateAsync(Guid id, Guid? requestUserId = null);
    Task<ApiResponseDTO<string>> GenerateEmployeeNumberAsync();
    System.Threading.Tasks.Task SeedDefaultManagerAsync();
    System.Threading.Tasks.Task SeedTestAccountsAsync();
}
