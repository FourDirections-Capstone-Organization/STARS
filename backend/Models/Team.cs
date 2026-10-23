using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class Team
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public Guid? DepartmentId { get; set; }
    public Department? Department { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;

    public Guid CreatedById { get; set; }
    public User? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public Guid? TeamLeaderId { get; set; }
    public User? TeamLeader { get; set; }

    public ICollection<TeamMember> Members { get; set; } = new List<TeamMember>();
}
