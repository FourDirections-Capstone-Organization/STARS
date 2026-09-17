using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;

namespace Backend.Modules.OrganizationalStructure;

public class HierarchyService : IHierarchyService
{
    private readonly AppDbContext _db;
    private readonly IAuditLogService _auditLogService;

    public HierarchyService(AppDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }

    public static (string LevelName, int LevelNumber) DeriveHierarchyLevel(UserRole role)
    {
        return role switch
        {
            UserRole.Manager => ("Manager", 1),
            UserRole.Coordinator => ("Coordinator", 2),
            UserRole.Dispatcher => ("Dispatcher / Encoder / Courier", 3),
            UserRole.Encoder => ("Dispatcher / Encoder / Courier", 3),
            UserRole.Courier => ("Dispatcher / Encoder / Courier", 3),
            _ => ("Dispatcher / Encoder / Courier", 3)
        };
    }

    public async Task<ApiResponseDTO<HierarchyStructureResponseDTO>> GetHierarchyStructureAsync()
    {
        var users = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .Where(u => u.IsActive && !u.IsDeactivated)
            .OrderBy(u => u.Role)
            .ThenBy(u => u.LastName)
            .ToListAsync();

        var response = new HierarchyStructureResponseDTO();

        foreach (var u in users)
        {
            var (levelName, levelNumber) = DeriveHierarchyLevel(u.Role);
            var item = new HierarchyEmployeeDTO
            {
                Id = u.Id,
                EmployeeNumber = u.EmployeeNumber,
                FullName = $"{u.FirstName} {u.LastName}".Trim(),
                Email = u.Email,
                Role = u.Role.ToString(),
                HierarchyLevel = levelName,
                HierarchyLevelNumber = levelNumber,
                DepartmentId = u.DepartmentId,
                DepartmentName = u.Department?.Name ?? "Unassigned",
                JobPositionId = u.JobPositionId,
                JobPositionName = u.JobPosition?.Name ?? "Unassigned",
                IsActive = u.IsActive && !u.IsDeactivated
            };

            if (levelNumber == 1)
            {
                response.Managers.Add(item);
            }
            else if (levelNumber == 2)
            {
                response.Coordinators.Add(item);
            }
            else
            {
                response.Staff.Add(item);
            }
        }

        response.TotalEmployees = users.Count;
        return ApiResponseDTO<HierarchyStructureResponseDTO>.Success(response);
    }

    public async Task<ApiResponseDTO<HierarchyEmployeeDTO>> GetEmployeeHierarchyAsync(Guid employeeId)
    {
        var u = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(x => x.Id == employeeId);

        if (u is null)
            return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Employee not found");

        var (levelName, levelNumber) = DeriveHierarchyLevel(u.Role);
        return ApiResponseDTO<HierarchyEmployeeDTO>.Success(new HierarchyEmployeeDTO
        {
            Id = u.Id,
            EmployeeNumber = u.EmployeeNumber,
            FullName = $"{u.FirstName} {u.LastName}".Trim(),
            Email = u.Email,
            Role = u.Role.ToString(),
            HierarchyLevel = levelName,
            HierarchyLevelNumber = levelNumber,
            DepartmentId = u.DepartmentId,
            DepartmentName = u.Department?.Name ?? "Unassigned",
            JobPositionId = u.JobPositionId,
            JobPositionName = u.JobPosition?.Name ?? "Unassigned",
            IsActive = u.IsActive && !u.IsDeactivated
        });
    }

    public async Task<ApiResponseDTO<List<HierarchyEmployeeDTO>>> SearchEmployeesAsync(string query)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return ApiResponseDTO<List<HierarchyEmployeeDTO>>.Success(new List<HierarchyEmployeeDTO>());
        }

        var q = query.Trim().ToLower();
        var users = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .Where(u => u.IsActive && !u.IsDeactivated)
            .Where(u => u.EmployeeNumber.ToLower().Contains(q)
                || u.FirstName.ToLower().Contains(q)
                || u.LastName.ToLower().Contains(q)
                || u.Email.ToLower().Contains(q))
            .Take(15)
            .ToListAsync();

        var result = users.Select(u =>
        {
            var (levelName, levelNumber) = DeriveHierarchyLevel(u.Role);
            return new HierarchyEmployeeDTO
            {
                Id = u.Id,
                EmployeeNumber = u.EmployeeNumber,
                FullName = $"{u.FirstName} {u.LastName}".Trim(),
                Email = u.Email,
                Role = u.Role.ToString(),
                HierarchyLevel = levelName,
                HierarchyLevelNumber = levelNumber,
                DepartmentId = u.DepartmentId,
                DepartmentName = u.Department?.Name ?? "Unassigned",
                JobPositionId = u.JobPositionId,
                JobPositionName = u.JobPosition?.Name ?? "Unassigned",
                IsActive = u.IsActive && !u.IsDeactivated
            };
        }).ToList();

        return ApiResponseDTO<List<HierarchyEmployeeDTO>>.Success(result);
    }

    public async Task<ApiResponseDTO<HierarchyEmployeeDTO>> MapEmployeeHierarchyAsync(MapHierarchyDTO dto, Guid requestUserId)
    {
        var requester = await _db.Users.FindAsync(requestUserId);
        if (requester is null || requester.Role != UserRole.Manager)
            return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Only Managers are permitted to map corporate hierarchy");

        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == dto.EmployeeId);

        if (user is null)
            return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Employee account not found in database");

        if (user.IsDeactivated || !user.IsActive)
            return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Cannot map deactivated employee account");

        var (levelName, levelNumber) = DeriveHierarchyLevel(user.Role);

        // Department validation if provided
        if (dto.DepartmentId.HasValue)
        {
            var dept = await _db.Departments.FirstOrDefaultAsync(d => d.Id == dto.DepartmentId.Value && d.IsActive);
            if (dept is null)
                return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Target department not found or is inactive");

            user.DepartmentId = dto.DepartmentId.Value;
        }

        // Job position validation if provided
        if (dto.JobPositionId.HasValue)
        {
            var pos = await _db.JobPositions.FirstOrDefaultAsync(p => p.Id == dto.JobPositionId.Value && p.IsActive);
            if (pos is null)
                return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Target job position not found or is inactive");

            if (user.DepartmentId.HasValue && pos.DepartmentId != user.DepartmentId.Value)
                return ApiResponseDTO<HierarchyEmployeeDTO>.Failure("Job position does not belong to the assigned department");

            user.JobPositionId = dto.JobPositionId.Value;
        }

        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        // Reload updated navigation properties
        await _db.Entry(user).Reference(u => u.Department).LoadAsync();
        await _db.Entry(user).Reference(u => u.JobPosition).LoadAsync();

        var deptName = user.Department?.Name ?? "Unassigned";
        var posName = user.JobPosition?.Name ?? "Unassigned";
        var empName = $"{user.FirstName} {user.LastName}".Trim();

        // Record Audit Log transaction
        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Update,
            "HierarchyMapping",
            user.Id,
            null,
            $"Hierarchy position confirmed/updated for {empName} (#{user.EmployeeNumber}): Level {levelNumber} ({levelName}) - Role: {user.Role}, Department: {deptName}, Position: {posName}",
            "Organizational Structure");

        return ApiResponseDTO<HierarchyEmployeeDTO>.Success(new HierarchyEmployeeDTO
        {
            Id = user.Id,
            EmployeeNumber = user.EmployeeNumber,
            FullName = empName,
            Email = user.Email,
            Role = user.Role.ToString(),
            HierarchyLevel = levelName,
            HierarchyLevelNumber = levelNumber,
            DepartmentId = user.DepartmentId,
            DepartmentName = deptName,
            JobPositionId = user.JobPositionId,
            JobPositionName = posName,
            IsActive = user.IsActive && !user.IsDeactivated
        }, "Employee hierarchy mapping confirmed and saved successfully");
    }
}
