using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class CreateDepartmentDTO
{
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }
}

public class UpdateDepartmentDTO
{
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }
}

public class DepartmentResponseDTO
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public int UserCount { get; set; }
    public int PositionCount { get; set; }
}

public class AssignDepartmentDTO
{
    [Required]
    public Guid EmployeeId { get; set; }

    [Required]
    public Guid DepartmentId { get; set; }

    public Guid? JobPositionId { get; set; }
}

public class DepartmentMemberDTO
{
    public Guid Id { get; set; }
    public string EmployeeNumber { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string? JobPositionId { get; set; }
    public string? JobPositionName { get; set; }
    public bool IsActive { get; set; }
}

public class DepartmentRosterDTO
{
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int UserCount { get; set; }
    public List<DepartmentMemberDTO> Members { get; set; } = new();
}
