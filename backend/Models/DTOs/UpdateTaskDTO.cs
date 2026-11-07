using System.ComponentModel.DataAnnotations;
using Backend.Models.Enums;

namespace Backend.Models.DTOs;

public class UpdateTaskDTO
{
    [MaxLength(150)]
    public string? Title { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    public PriorityLevel? PriorityLevel { get; set; }
    public PriorityLevel? Priority { get; set; }

    public TaskClassification? Classification { get; set; }

    public AssignmentScope? AssignmentScope { get; set; }

    public DateTime? Deadline { get; set; }

    public List<Guid>? AssignedUserIds { get; set; }

    public Guid? AssignedDepartmentId { get; set; }

    /// <summary>Required for Team scope — the team the task is assigned to.</summary>
    public Guid? TeamId { get; set; }

    public bool? IsConfidential { get; set; }
}