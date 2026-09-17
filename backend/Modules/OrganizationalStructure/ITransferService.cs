using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.OrganizationalStructure;

public interface ITransferService
{
    Task<ApiResponseDTO<bool>> TransferUserAsync(Guid userId, TransferUserDTO dto, Guid managerUserId);
}
