using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class CreateTeamDTO
{
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public Guid? DepartmentId { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    public List<Guid>? MemberUserIds { get; set; }
}

public class UpdateTeamDTO
{
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public Guid? DepartmentId { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;
}

public class AddTeamMembersDTO
{
    [MinLength(1)]
    public List<Guid> MemberUserIds { get; set; } = new();
}

public class TeamWorkloadDTO
{
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public int TotalTasks { get; set; }
    public int CompletedTasks { get; set; }
    public int InProgressTasks { get; set; }
    public int OnHoldTasks { get; set; }
    public int PendingReviewTasks { get; set; }
    public double CompletionRate { get; set; }
    public double AverageCompletionPercentage { get; set; }
}
