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

    public async Task<ApiResponseDTO<bool>> TransferUserAsync(Guid userId, TransferUserDTO dto, Guid managerUserId)
    {
        // 1. Only Manager (Admin) is allowed to transfer employees
        var manager = await _db.Users.FindAsync(managerUserId);
        if (manager is null || manager.Role != UserRole.Manager)
            return ApiResponseDTO<bool>.Failure("Only Managers are allowed to transfer employees between departments and teams");

        // 2. Require confirmation
        if (!dto.Confirmed)
            return ApiResponseDTO<bool>.Failure("Transfer confirmation is required before finalizing the transfer");

        // 3. Find employee account in database
        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user is null)
            return ApiResponseDTO<bool>.Failure("Employee account not found in database");
        
        if (user.IsDeactivated || !user.IsActive)
            return ApiResponseDTO<bool>.Failure("Cannot transfer a deactivated or inactive employee");

        var oldDeptName = user.Department?.Name ?? "Unassigned";
        var oldPosName = user.JobPosition?.Name ?? "Unassigned";

        // 4. Validate destination department (Must be one of the 3 client departments)
        var department = await _db.Departments
            .FirstOrDefaultAsync(d => d.Id == dto.NewDepartmentId && d.IsActive);

        if (department is null)
            return ApiResponseDTO<bool>.Failure("Target department not found or is inactive. Must select Coordinator & Customer Service Team, Dispatch Team, or Forwarding Team.");

        if (user.DepartmentId == dto.NewDepartmentId)
            return ApiResponseDTO<bool>.Failure($"Employee is already assigned to {department.Name}");

        // 5. Check/Assign job position
        JobPosition? jobPosition = null;
        if (dto.NewJobPositionId.HasValue)
        {
            jobPosition = await _db.JobPositions
                .FirstOrDefaultAsync(jp => jp.Id == dto.NewJobPositionId.Value && jp.IsActive && jp.DepartmentId == dto.NewDepartmentId);

            if (jobPosition is null)
                return ApiResponseDTO<bool>.Failure("Target job position not found or does not belong to the destination department");

            user.JobPositionId = jobPosition.Id;
        }
        else
        {
            // Pick default first position in department if available, or reset
            var defaultPos = await _db.JobPositions
                .FirstOrDefaultAsync(jp => jp.DepartmentId == dto.NewDepartmentId && jp.IsActive);
            user.JobPositionId = defaultPos?.Id;
            jobPosition = defaultPos;
        }

        // 6. Update employee's department record and task visibility scope
        user.DepartmentId = dto.NewDepartmentId;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var empName = $"{user.FirstName} {user.LastName}".Trim();
        var posDisplay = jobPosition?.Name ?? "Unassigned Position";
        var effectiveStr = dto.EffectiveDate.ToString("yyyy-MM-dd");

        // 7. Record transaction in Audit Log
        await _auditLogService.LogAsync(
            managerUserId,
            AuditActionType.Update,
            "UserTransfer",
            user.Id,
            null,
            $"Employee transfer confirmed by Manager for {empName} (#{user.EmployeeNumber}): Transferred from [{oldDeptName} / {oldPosName}] to [{department.Name} / {posDisplay}]. Effective Date: {effectiveStr}. Task visibility and assignment scope updated.",
            "Employee Management");

        return ApiResponseDTO<bool>.Success(true, $"Employee {empName} successfully transferred to {department.Name}");
    }
}
