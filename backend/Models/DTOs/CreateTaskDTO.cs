using System.ComponentModel.DataAnnotations;
using Backend.Models.Enums;

namespace Backend.Models.DTOs;

public class CreateTaskDTO
{
    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [Required]
    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Explicit priority level for the task. Defaults to Medium if omitted.
    /// </summary>
    public PriorityLevel? PriorityLevel { get; set; }

    /// <summary>
    /// Optional alias allowing callers to pass 'Priority' instead of 'PriorityLevel'.
    /// </summary>
    public PriorityLevel? Priority { get; set; }

    [Required]
    public TaskClassification Classification { get; set; }

    [Required]
    public AssignmentScope AssignmentScope { get; set; }

    public DateTime? Deadline { get; set; }

    public List<Guid>? AssignedUserIds { get; set; }

    public Guid? AssignedDepartmentId { get; set; }

    /// <summary>Required for Team scope — the team the task is assigned to.</summary>
    public Guid? TeamId { get; set; }

    public bool IsConfidential { get; set; } = false;
}