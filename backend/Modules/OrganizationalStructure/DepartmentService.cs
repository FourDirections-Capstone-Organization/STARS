using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.TaskManagement;

namespace Backend.Modules.OrganizationalStructure;

public class DepartmentService : IDepartmentService
{
    private readonly AppDbContext _db;
    private readonly IAuditLogService _auditLogService;

    public static readonly string[] ClientDepartments = new[]
    {
        "Coordinator & Customer Service Team",
        "Dispatch Team",
        "Forwarding Team"
    };

    public DepartmentService(AppDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<DepartmentResponseDTO>>> GetAllAsync(int pageNumber = 1, int pageSize = 10)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Departments
            .Where(d => d.IsActive)
            .Include(d => d.Users)
            .Include(d => d.JobPositions);

        var totalCount = await query.CountAsync();

        var departments = await query
            .OrderBy(d => d.Name)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new DepartmentResponseDTO
            {
                Id = d.Id,
                Name = d.Name,
                Description = d.Description,
                IsActive = d.IsActive,
                CreatedAt = d.CreatedAt,
                UserCount = d.Users.Count(u => u.IsActive && !u.IsDeactivated),
                PositionCount = d.JobPositions.Count(jp => jp.IsActive)
            })
            .ToListAsync();

        var paginatedResult = new PaginatedResponseDTO<DepartmentResponseDTO>
        {
            Items = departments,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize
        };

        return ApiResponseDTO<PaginatedResponseDTO<DepartmentResponseDTO>>.Success(paginatedResult);
    }

    public async Task<ApiResponseDTO<DepartmentResponseDTO>> GetByIdAsync(Guid id)
    {
        var department = await _db.Departments
            .Include(d => d.Users)
            .Include(d => d.JobPositions)
            .FirstOrDefaultAsync(d => d.Id == id && d.IsActive);

        if (department is null)
            return ApiResponseDTO<DepartmentResponseDTO>.Failure("Department not found");

        var response = new DepartmentResponseDTO
        {
            Id = department.Id,
            Name = department.Name,
            Description = department.Description,
            IsActive = department.IsActive,
            CreatedAt = department.CreatedAt,
            UserCount = department.Users.Count(u => u.IsActive && !u.IsDeactivated),
            PositionCount = department.JobPositions.Count(jp => jp.IsActive)
        };

        return ApiResponseDTO<DepartmentResponseDTO>.Success(response);
    }

    public async Task<ApiResponseDTO<DepartmentResponseDTO>> CreateAsync(CreateDepartmentDTO dto, Guid managerUserId)
    {
        var manager = await _db.Users.FindAsync(managerUserId);
        if (manager is null || manager.Role != UserRole.Manager)
            return ApiResponseDTO<DepartmentResponseDTO>.Failure("Only Managers are allowed to create department groupings");

        var exists = await _db.Departments
            .AnyAsync(d => d.Name.ToLower() == dto.Name.ToLower() && d.IsActive);

        if (exists)
            return ApiResponseDTO<DepartmentResponseDTO>.Failure("Department with this name already exists");

        var department = new Department
        {
            Name = dto.Name,
            Description = dto.Description,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Departments.Add(department);
        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            managerUserId,
            AuditActionType.Create,
            "Department",
            department.Id,
            null,
            $"Department '{department.Name}' created by Manager",
            "Department Management");

        var response = new DepartmentResponseDTO
        {
            Id = department.Id,
            Name = department.Name,
            Description = department.Description,
            IsActive = department.IsActive,
            CreatedAt = department.CreatedAt,
            UserCount = 0,
            PositionCount = 0
        };

        return ApiResponseDTO<DepartmentResponseDTO>.Success(response, "Department created successfully");
    }

    public async Task<ApiResponseDTO<DepartmentResponseDTO>> UpdateAsync(Guid id, UpdateDepartmentDTO dto, Guid managerUserId)
    {
        var manager = await _db.Users.FindAsync(managerUserId);
        if (manager is null || manager.Role != UserRole.Manager)
            return ApiResponseDTO<DepartmentResponseDTO>.Failure("Only Managers are allowed to modify department groupings");

        var department = await _db.Departments
            .Include(d => d.Users)
            .Include(d => d.JobPositions)
            .FirstOrDefaultAsync(d => d.Id == id && d.IsActive);

        if (department is null)
            return ApiResponseDTO<DepartmentResponseDTO>.Failure("Department not found");

        var nameConflict = await _db.Departments
            .AnyAsync(d => d.Id != id && d.Name.ToLower() == dto.Name.ToLower() && d.IsActive);

        if (nameConflict)
            return ApiResponseDTO<DepartmentResponseDTO>.Failure("Department with this name already exists.");

        var oldName = department.Name;
        department.Name = dto.Name;
        department.Description = dto.Description;
        department.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            managerUserId,
            AuditActionType.Update,
            "Department",
            department.Id,
            null,
            $"Department '{oldName}' updated to '{department.Name}' by Manager",
            "Department Management");

        var response = new DepartmentResponseDTO
        {
            Id = department.Id,
            Name = department.Name,
            Description = department.Description,
            IsActive = department.IsActive,
            CreatedAt = department.CreatedAt,
            UserCount = department.Users.Count(u => u.IsActive && !u.IsDeactivated),
            PositionCount = department.JobPositions.Count(jp => jp.IsActive)
        };

        return ApiResponseDTO<DepartmentResponseDTO>.Success(response, "Department updated successfully");
    }

    public async Task<ApiResponseDTO<bool>> DeleteAsync(Guid id, Guid managerUserId)
    {
        var manager = await _db.Users.FindAsync(managerUserId);
        if (manager is null || manager.Role != UserRole.Manager)
            return ApiResponseDTO<bool>.Failure("Only Managers are allowed to modify department groupings");

        var department = await _db.Departments
            .Include(d => d.Users)
            .FirstOrDefaultAsync(d => d.Id == id);

        if (department is null)
            return ApiResponseDTO<bool>.Failure("Department not found");

        if (!department.IsActive)
            return ApiResponseDTO<bool>.Failure("Department is already inactive");

        var hasActiveUsers = department.Users.Any(u => u.IsActive && !u.IsDeactivated);
        if (hasActiveUsers)
            return ApiResponseDTO<bool>.Failure("Cannot deactivate department with active users. Assign or transfer users first.");

        department.IsActive = false;
        department.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            managerUserId,
            AuditActionType.Delete,
            "Department",
            department.Id,
            null,
            $"Department '{department.Name}' deactivated by Manager",
            "Department Management");

        return ApiResponseDTO<bool>.Success(true, "Department deactivated successfully");
    }

    public async Task<ApiResponseDTO<DepartmentRosterDTO>> AssignEmployeeDepartmentAsync(AssignDepartmentDTO dto, Guid managerUserId)
    {
        var manager = await _db.Users.FindAsync(managerUserId);
        if (manager is null || manager.Role != UserRole.Manager)
            return ApiResponseDTO<DepartmentRosterDTO>.Failure("Only Managers are allowed to assign employees to departments");

        var employee = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == dto.EmployeeId);

        if (employee is null)
            return ApiResponseDTO<DepartmentRosterDTO>.Failure("Employee account not found in database");

        if (employee.IsDeactivated || !employee.IsActive)
            return ApiResponseDTO<DepartmentRosterDTO>.Failure("Cannot assign a deactivated employee account");

        var department = await _db.Departments
            .FirstOrDefaultAsync(d => d.Id == dto.DepartmentId && d.IsActive);

        if (department is null)
            return ApiResponseDTO<DepartmentRosterDTO>.Failure("Selected department not found or is inactive. Must select Coordinator & Customer Service Team, Dispatch Team, or Forwarding Team.");

        var oldDeptName = employee.Department?.Name ?? "Unassigned";

        employee.DepartmentId = department.Id;

        if (dto.JobPositionId.HasValue)
        {
            var jobPos = await _db.JobPositions
                .FirstOrDefaultAsync(jp => jp.Id == dto.JobPositionId.Value && jp.IsActive && jp.DepartmentId == department.Id);

            if (jobPos is not null)
            {
                employee.JobPositionId = jobPos.Id;
            }
        }
        else if (employee.JobPosition != null && employee.JobPosition.DepartmentId != department.Id)
        {
            employee.JobPositionId = null;
        }

        employee.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var empFullName = $"{employee.FirstName} {employee.LastName}".Trim();

        await _auditLogService.LogAsync(
            managerUserId,
            AuditActionType.Update,
            "DepartmentAssignment",
            employee.Id,
            null,
            $"Employee {empFullName} (#{employee.EmployeeNumber}) assigned to department: '{department.Name}' (Previous: '{oldDeptName}'). Position updated.",
            "Department Management");

        var roster = await GetDepartmentRosterAsync(department.Id);
        return ApiResponseDTO<DepartmentRosterDTO>.Success(roster.Data!, $"Employee {empFullName} successfully assigned to {department.Name}");
    }

    public async Task<ApiResponseDTO<DepartmentRosterDTO>> GetDepartmentRosterAsync(Guid departmentId)
    {
        var dept = await _db.Departments
            .Include(d => d.Users.Where(u => u.IsActive && !u.IsDeactivated))
                .ThenInclude(u => u.JobPosition)
            .FirstOrDefaultAsync(d => d.Id == departmentId && d.IsActive);

        if (dept is null)
            return ApiResponseDTO<DepartmentRosterDTO>.Failure("Department not found");

        var members = dept.Users
            .Where(u => u.IsActive && !u.IsDeactivated)
            .OrderBy(u => u.Role)
            .ThenBy(u => u.LastName)
            .Select(u => new DepartmentMemberDTO
            {
                Id = u.Id,
                EmployeeNumber = u.EmployeeNumber,
                FullName = $"{u.FirstName} {u.LastName}".Trim(),
                Email = u.Email,
                Role = u.Role.ToString(),
                JobPositionId = u.JobPositionId?.ToString(),
                JobPositionName = u.JobPosition?.Name ?? "—",
                IsActive = u.IsActive && !u.IsDeactivated
            })
            .ToList();

        var roster = new DepartmentRosterDTO
        {
            DepartmentId = dept.Id,
            DepartmentName = dept.Name,
            Description = dept.Description,
            UserCount = members.Count,
            Members = members
        };

        return ApiResponseDTO<DepartmentRosterDTO>.Success(roster);
    }

    public async Task<ApiResponseDTO<List<DepartmentRosterDTO>>> GetAllDepartmentRostersAsync()
    {
        var departments = await _db.Departments
            .Where(d => d.IsActive)
            .Include(d => d.Users.Where(u => u.IsActive && !u.IsDeactivated))
                .ThenInclude(u => u.JobPosition)
            .OrderBy(d => d.Name)
            .ToListAsync();

        var list = new List<DepartmentRosterDTO>();

        foreach (var dept in departments)
        {
            var members = dept.Users
                .Where(u => u.IsActive && !u.IsDeactivated)
                .OrderBy(u => u.Role)
                .ThenBy(u => u.LastName)
                .Select(u => new DepartmentMemberDTO
                {
                    Id = u.Id,
                    EmployeeNumber = u.EmployeeNumber,
                    FullName = $"{u.FirstName} {u.LastName}".Trim(),
                    Email = u.Email,
                    Role = u.Role.ToString(),
                    JobPositionId = u.JobPositionId?.ToString(),
                    JobPositionName = u.JobPosition?.Name ?? "—",
                    IsActive = u.IsActive && !u.IsDeactivated
                })
                .ToList();

            list.Add(new DepartmentRosterDTO
            {
                DepartmentId = dept.Id,
                DepartmentName = dept.Name,
                Description = dept.Description,
                UserCount = members.Count,
                Members = members
            });
        }

        return ApiResponseDTO<List<DepartmentRosterDTO>>.Success(list);
    }

    public async System.Threading.Tasks.Task SeedDefaultDepartmentsAsync()
    {
        // Define the EXACT 3 client departments
        var canonicalDepts = new Dictionary<string, string>
        {
            ["Coordinator & Customer Service Team"] = "Handles customer coordination, operations scheduling, and client service operations",
            ["Dispatch Team"] = "Manages task dispatching, logistics execution, and fleet tracking",
            ["Forwarding Team"] = "Handles forwarding, cargo transit, deliveries, and data encoding"
        };

        // Old variants to canonical map
        var migrationMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Coordinator and Customer Service Team"] = "Coordinator & Customer Service Team",
            ["Coordinator & Customer Service Team"] = "Coordinator & Customer Service Team",
            ["Dispatch Team"] = "Dispatch Team",
            ["Forwarding and Delivery Team"] = "Forwarding Team",
            ["Forwarding Team (Vismin Airline Cargo Forwarders)"] = "Forwarding Team",
            ["Forwarding Team"] = "Forwarding Team",
            ["Accounting Team"] = "Coordinator & Customer Service Team" // Map any legacy accounting to Coordinator/CS
        };

        // Ensure canonical 3 exist
        foreach (var kvp in canonicalDepts)
        {
            var existing = await _db.Departments.FirstOrDefaultAsync(d => d.Name.ToLower() == kvp.Key.ToLower());
            if (existing is null)
            {
                _db.Departments.Add(new Department
                {
                    Name = kvp.Key,
                    Description = kvp.Value,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
            else
            {
                existing.Name = kvp.Key; // exact casing
                existing.IsActive = true;
                if (string.IsNullOrEmpty(existing.Description))
                    existing.Description = kvp.Value;
            }
        }
        await _db.SaveChangesAsync();

        // Migrate all legacy/other departments to the 3 client departments
        var allDepts = await _db.Departments.ToListAsync();
        var canonicalEntities = allDepts
            .Where(d => canonicalDepts.ContainsKey(d.Name))
            .ToDictionary(d => d.Name, d => d);

        foreach (var dept in allDepts.Where(d => !canonicalDepts.ContainsKey(d.Name)).ToList())
        {
            var targetName = migrationMap.TryGetValue(dept.Name, out var mapped) ? mapped : "Coordinator & Customer Service Team";
            if (canonicalEntities.TryGetValue(targetName, out var targetDept))
            {
                var usersToMove = await _db.Users.Where(u => u.DepartmentId == dept.Id).ToListAsync();
                foreach (var u in usersToMove)
                    u.DepartmentId = targetDept.Id;

                var posToMove = await _db.JobPositions.Where(p => p.DepartmentId == dept.Id).ToListAsync();
                foreach (var p in posToMove)
                    p.DepartmentId = targetDept.Id;

                dept.IsActive = false;
            }
        }
        await _db.SaveChangesAsync();

        // Ensure EVERY active employee belongs to exactly one of the three departments
        var unassignedUsers = await _db.Users
            .Where(u => u.IsActive && !u.IsDeactivated && (u.DepartmentId == null || !_db.Departments.Any(d => d.Id == u.DepartmentId && d.IsActive)))
            .ToListAsync();

        if (unassignedUsers.Count > 0)
        {
            var coordDept = canonicalEntities["Coordinator & Customer Service Team"];
            var dispatchDept = canonicalEntities["Dispatch Team"];
            var forwardingDept = canonicalEntities["Forwarding Team"];

            foreach (var user in unassignedUsers)
            {
                user.DepartmentId = user.Role switch
                {
                    UserRole.Manager => coordDept.Id,
                    UserRole.Coordinator => coordDept.Id,
                    UserRole.Dispatcher => dispatchDept.Id,
                    UserRole.Courier => forwardingDept.Id,
                    UserRole.Encoder => forwardingDept.Id,
                    _ => forwardingDept.Id
                };
                user.UpdatedAt = DateTime.UtcNow;
            }
            await _db.SaveChangesAsync();
        }
    }

    public async System.Threading.Tasks.Task SeedDefaultPositionsAsync()
    {
        var departments = await _db.Departments.Where(d => d.IsActive).ToListAsync();

        var defaultPositions = new[]
        {
            // Coordinator & Customer Service Team
            new { Name = "Operational Manager", DeptName = "Coordinator & Customer Service Team" },
            new { Name = "Customer Service Lead", DeptName = "Coordinator & Customer Service Team" },

            // Dispatch Team
            new { Name = "Operational Admin", DeptName = "Dispatch Team" },
            new { Name = "Dispatcher Specialist", DeptName = "Dispatch Team" },
            new { Name = "Operational Team", DeptName = "Dispatch Team" },

            // Forwarding Team
            new { Name = "Operational Admin", DeptName = "Forwarding Team" },
            new { Name = "Forwarding Specialist", DeptName = "Forwarding Team" },
            new { Name = "Courier / Driver", DeptName = "Forwarding Team" },
            new { Name = "Encoder", DeptName = "Forwarding Team" }
        };

        foreach (var pos in defaultPositions)
        {
            var dept = departments.FirstOrDefault(d => d.Name == pos.DeptName);
            if (dept is null) continue;

            var exists = await _db.JobPositions
                .AnyAsync(jp => jp.Name.ToLower() == pos.Name.ToLower() && jp.DepartmentId == dept.Id);

            if (!exists)
            {
                _db.JobPositions.Add(new JobPosition
                {
                    Name = pos.Name,
                    DepartmentId = dept.Id,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        await _db.SaveChangesAsync();
    }
}
