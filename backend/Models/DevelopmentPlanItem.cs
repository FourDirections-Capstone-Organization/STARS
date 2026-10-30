using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class DevelopmentPlanItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ReviewId { get; set; }
    public PerformanceReview? Review { get; set; }

    public Guid EmployeeId { get; set; }
    public User? Employee { get; set; }

    [Required]
    [MaxLength(500)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? SuccessMeasure { get; set; }

    [MaxLength(100)]
    public string? Timeframe { get; set; }

    public DateTime? TargetCompletionDate { get; set; }

    public bool IsCompleted { get; set; } = false;

    public DateTime? CompletedAt { get; set; }

    public Guid? CompletedById { get; set; }
    public User? CompletedBy { get; set; }

    public Guid? CreatedById { get; set; }
    public User? CreatedBy { get; set; }

    [MaxLength(1000)]
    public string? ManagerNotes { get; set; }

    [MaxLength(1000)]
    public string? EmployeeNotes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

