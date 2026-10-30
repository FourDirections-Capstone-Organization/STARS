using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class RatingBand
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TemplateId { get; set; }
    public EvaluationTemplate? Template { get; set; }

    [Required]
    [MaxLength(100)]
    public string Label { get; set; } = string.Empty;

    public double MinScore { get; set; }

    public double MaxScore { get; set; }

    [MaxLength(30)]
    public string? Color { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    public int Order { get; set; } = 1;
}

