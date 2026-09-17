using Backend.Models;
using Backend.Models.DTOs;
using Backend.Data;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;
using Microsoft.EntityFrameworkCore;

namespace Backend.Modules.OrganizationalStructure;

public class TransferService : ITransferService
{
    private readonly AppDbContext _db;
    private readonly IAuditLogService _auditLogService;

    public TransferService(AppDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }

    public async Task<ApiResponseDTO<bool>> TransferUserAsync(Guid userId, TransferUserDTO dto)
    {
        // Check if the user exists and is active
        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user is null)
            return ApiResponseDTO<bool>.Failure("User not found");
        
        if (user.IsDeactivated || !user.IsActive)
            return ApiResponseDTO<bool>.Failure("Cannot transfer a deactivated or inactive user");

        var oldDeptName = user.Department?.Name ?? "Unassigned";
        var oldPosName = user.JobPosition?.Name ?? "Unassigned";

        // Check if the new department exists and is active
        var department = await _db.Departments
            .FirstOrDefaultAsync(d => d.Id == dto.NewDepartmentId && d.IsActive);
        if (department is null)
            return ApiResponseDTO<bool>.Failure("Target department not found or is inactive");

        // Check if the new job position exists and is active
        var jobPosition = await _db.JobPositions
            .FirstOrDefaultAsync(jp => jp.Id == dto.NewJobPositionId && jp.IsActive);
        if (jobPosition is null)
            return ApiResponseDTO<bool>.Failure("Target job position not found or is inactive");

        // Verify the job position belongs to the target department
        if (jobPosition.DepartmentId != dto.NewDepartmentId)
            return ApiResponseDTO<bool>.Failure("Job position does not belong to the target department");

        // Update the user's department and job position
        user.DepartmentId = dto.NewDepartmentId;
        user.JobPositionId = dto.NewJobPositionId;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var empName = $"{user.FirstName} {user.LastName}".Trim();
        await _auditLogService.LogAsync(
            userId,
            AuditActionType.Update,
            "UserTransfer",
            user.Id,
            null,
            $"Employee transfer completed for {empName} (#{user.EmployeeNumber}): From [{oldDeptName} / {oldPosName}] to [{department.Name} / {jobPosition.Name}]. Hierarchy position updated.",
            "Organizational Structure");

        return ApiResponseDTO<bool>.Success(true, "User transferred successfully");
    }
}

