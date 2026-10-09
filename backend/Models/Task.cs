using System.ComponentModel.DataAnnotations;
using Backend.Models.Enums;

namespace Backend.Models;

public class Task
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(32)]
    public string TaskNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [Required]
    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    public PriorityLevel PriorityLevel { get; set; }

    public TaskClassification Classification { get; set; }

    public Enums.TaskStatus Status { get; set; } = Enums.TaskStatus.NotStarted;

    public AssignmentScope AssignmentScope { get; set; }

    [Required]
    public DateTime Deadline { get; set; }

    public bool IsSLALocked { get; set; } = false;

    public SlaRiskLevel SlaRiskLevel { get; set; } = SlaRiskLevel.Low;

    public bool IsConfidential { get; set; } = false;

    public Guid CreatedById { get; set; }
    public User? CreatedBy { get; set; }

    public Guid? AssignedDepartmentId { get; set; }
    public Department? AssignedDepartment { get; set; }

    /// <summary>
    /// When a task is assigned to a Team scope, the team it belongs to.
    /// </summary>
    public Guid? TeamId { get; set; }
    public Team? Team { get; set; }

    public string? HoldReason { get; set; }
    public string? CancellationReason { get; set; }
    public string? ProgressNotes { get; set; }
    public string? ReviewRemarks { get; set; }
    public string? PushBackComment { get; set; }
    public bool? IsApproved { get; set; }
    public Enums.TaskStatus? PreviousStatus { get; set; }
    public DateTime? RevisedDeadline { get; set; }
    public DateTime? HeldAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<TaskAssignment> Assignments { get; set; } = new List<TaskAssignment>();
    public ICollection<TaskAttachment> Attachments { get; set; } = new List<TaskAttachment>();
}