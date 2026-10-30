using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Backend.Models;

public class EvaluationTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(50)]
    public string? TargetRole { get; set; }

    public Guid? DepartmentId { get; set; }
    public Department? Department { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// When true, AI recommendation generation is enabled for reviews using this template.
    /// </summary>
    public bool IsAiEnabled { get; set; } = true;

    public Guid? CreatedById { get; set; }
    public User? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<EvaluationSection> Sections { get; set; } = new List<EvaluationSection>();
    public ICollection<RatingBand> RatingBands { get; set; } = new List<RatingBand>();
    [JsonIgnore]
    public ICollection<PerformanceReview> Reviews { get; set; } = new List<PerformanceReview>();
}

