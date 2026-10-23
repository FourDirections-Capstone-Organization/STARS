namespace Backend.Models.DTOs;

public class TeamMemberDTO
{
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string EmployeeNumber { get; set; } = string.Empty;
    public string? Role { get; set; }
    public string? Department { get; set; }
    public string? AvailabilityStatus { get; set; }
    public bool IsAvailable { get; set; }
    public bool IsLeader { get; set; }
    public DateTime JoinedAt { get; set; }
}

public class TeamResponseDTO
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public string? Description { get; set; }
    public Guid? TeamLeaderId { get; set; }
    public string? TeamLeaderName { get; set; }
    public bool IsActive { get; set; }
    public int MemberCount { get; set; }
    public List<TeamMemberDTO> Members { get; set; } = new();
    public DateTime CreatedAt { get; set; }
}
