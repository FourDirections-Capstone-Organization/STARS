using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;

namespace Backend.Modules.RoleBasedAccessControl;

public class RoleService : IRoleService
{
    private readonly AppDbContext _db;
    private readonly IAuditLogService _auditLogService;

    public RoleService(AppDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }


    public ApiResponseDTO<List<RoleResponseDTO>> GetAllRoles()
    {
        var roles = new List<RoleResponseDTO>
        {
            new RoleResponseDTO
            {
                Role = UserRole.Manager,
                DisplayName = "Manager",
                Description = "Full system access including user management and audit logs",
                Permissions = GetPermissionsForRole(UserRole.Manager)
            },
            new RoleResponseDTO
            {
                Role = UserRole.Coordinator,
                DisplayName = "Coordinator",
                Description = "Can manage tasks, view team tasks, and mark tasks as confidential",
                Permissions = GetPermissionsForRole(UserRole.Coordinator)
            },
            new RoleResponseDTO
            {
                Role = UserRole.Dispatcher,
                DisplayName = "Dispatcher",
                Description = "Can view and update assigned tasks",
                Permissions = GetPermissionsForRole(UserRole.Dispatcher)
            },
            new RoleResponseDTO
            {
                Role = UserRole.Encoder,
                DisplayName = "Encoder",
                Description = "Can view and update assigned tasks",
                Permissions = GetPermissionsForRole(UserRole.Encoder)
            },
            new RoleResponseDTO
            {
                Role = UserRole.Courier,
                DisplayName = "Courier/Driver",
                Description = "Can view and update assigned delivery tasks",
                Permissions = GetPermissionsForRole(UserRole.Courier)
            },
            new RoleResponseDTO
            {
                Role = UserRole.Accountant,
                DisplayName = "Accountant",
                Description = "Can view and update assigned financial tasks",
                Permissions = GetPermissionsForRole(UserRole.Accountant)
            }
        };

        return ApiResponseDTO<List<RoleResponseDTO>>.Success(roles);
    }

    public ApiResponseDTO<RoleResponseDTO> GetRoleByType(UserRole role)
    {
        var roleInfo = new RoleResponseDTO
        {
            Role = role,
            DisplayName = GetDisplayName(role),
            Description = GetDescription(role),
            Permissions = GetPermissionsForRole(role)
        };

        return ApiResponseDTO<RoleResponseDTO>.Success(roleInfo);
    }

    public async Task<ApiResponseDTO<UserPermissionsDTO>> GetUserPermissions(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user is null)
            return ApiResponseDTO<UserPermissionsDTO>.Failure("User not found");

        var permissions = new UserPermissionsDTO
        {
            UserId = user.Id,
            Role = user.Role,
            Permissions = GetPermissionsForRole(user.Role),
            CanViewAllTasks = user.Role == UserRole.Manager,
            CanManageUsers = user.Role == UserRole.Manager,
            CanViewConfidentialTasks = user.Role == UserRole.Manager || user.Role == UserRole.Coordinator,
            CanAccessAuditLogs = user.Role == UserRole.Manager
        };

        return ApiResponseDTO<UserPermissionsDTO>.Success(permissions);
    }

    public async Task<ApiResponseDTO<bool>> UpdateUserRoleAsync(Guid userId, UpdateUserRoleDTO dto, Guid requestUserId)
    {
        var requester = await _db.Users.FindAsync(requestUserId);
        if (requester is null || requester.Role != UserRole.Manager)
            return ApiResponseDTO<bool>.Failure("Only Managers can update user roles");

        var user = await _db.Users.FindAsync(userId);
        if (user is null)
            return ApiResponseDTO<bool>.Failure("User not found");

        if (userId == requestUserId)
            return ApiResponseDTO<bool>.Failure("Cannot change your own role");

        var oldRole = user.Role;
        user.Role = dto.NewRole;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var empName = $"{user.FirstName} {user.LastName}".Trim();
        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Update,
            "UserRole",
            user.Id,
            null,
            $"User role updated from {oldRole} to {user.Role} for {empName} (#{user.EmployeeNumber}). Hierarchy level automatically updated to {dto.NewRole}. Reason: {dto.Reason ?? "Not specified"}",
            "Role Management");

        return ApiResponseDTO<bool>.Success(true, "User role updated successfully");
    }


    private List<string> GetPermissionsForRole(UserRole role)
    {
        var permissions = new List<string>();

        // Base permissions for all roles
        permissions.Add("ViewOwnProfile");
        permissions.Add("UpdateOwnProfile");
        permissions.Add("ViewAssignedTasks");
        permissions.Add("UpdateAssignedTasks");

        switch (role)
        {
            case UserRole.Manager:
                permissions.Add("ViewAllTasks");
                permissions.Add("CreateTasks");
                permissions.Add("AssignTasks");
                permissions.Add("DeleteTasks");
                permissions.Add("ViewAllUsers");
                permissions.Add("CreateUsers");
                permissions.Add("UpdateUsers");
                permissions.Add("DeactivateUsers");
                permissions.Add("ViewAuditLogs");
                permissions.Add("ViewConfidentialTasks");
                permissions.Add("ManageDepartments");
                permissions.Add("ManageRoles");
                break;

            case UserRole.Coordinator:
                permissions.Add("ViewDepartmentTasks");
                permissions.Add("CreateTasks");
                permissions.Add("AssignTasks");
                permissions.Add("MarkTasksConfidential");
                permissions.Add("ViewConfidentialTasks");
                permissions.Add("ViewDepartmentUsers");
                break;

            case UserRole.Dispatcher:
                permissions.Add("UpdateTaskStatus");
                break;

            case UserRole.Encoder:
                permissions.Add("UpdateTaskStatus");
                break;

            case UserRole.Courier:
                permissions.Add("UpdateTaskStatus");
                permissions.Add("UpdateDeliveryStatus");
                break;

            case UserRole.Accountant:
                permissions.Add("UpdateTaskStatus");
                break;
        }

        return permissions;
    }

    private string GetDisplayName(UserRole role)
    {
        return role switch
        {
            UserRole.Manager => "Manager",
            UserRole.Coordinator => "Coordinator",
            UserRole.Dispatcher => "Dispatcher",
            UserRole.Encoder => "Encoder",
            UserRole.Courier => "Courier/Driver",
            UserRole.Accountant => "Accountant",
            _ => role.ToString()
        };
    }

    private string GetDescription(UserRole role)
    {
        return role switch
        {
            UserRole.Manager => "Full system access including user management and audit logs",
            UserRole.Coordinator => "Can manage tasks, view team tasks, and mark tasks as confidential",
            UserRole.Dispatcher => "Can view and update assigned tasks",
            UserRole.Encoder => "Can view and update assigned tasks",
            UserRole.Courier => "Can view and update assigned delivery tasks",
            UserRole.Accountant => "Can view and update assigned financial tasks",
            _ => ""
        };
    }
}
