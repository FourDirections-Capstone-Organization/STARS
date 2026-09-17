using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class HierarchyEmployeeDTO
{
    public Guid Id { get; set; }
    public string EmployeeNumber { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string HierarchyLevel { get; set; } = string.Empty; // "Manager", "Coordinator", "Dispatcher / Encoder / Courier"
    public int HierarchyLevelNumber { get; set; } // 1, 2, 3
    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public Guid? JobPositionId { get; set; }
    public string? JobPositionName { get; set; }
    public bool IsActive { get; set; }
}

public class HierarchyStructureResponseDTO
{
    public List<HierarchyEmployeeDTO> Managers { get; set; } = new(); // Level 1
    public List<HierarchyEmployeeDTO> Coordinators { get; set; } = new(); // Level 2
    public List<HierarchyEmployeeDTO> Staff { get; set; } = new(); // Level 3: Dispatcher / Encoder / Courier
    public int TotalEmployees { get; set; }
}

public class MapHierarchyDTO
{
    [Required]
    public Guid EmployeeId { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? JobPositionId { get; set; }
}
