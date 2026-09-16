using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class DuplicateCheckDTO
{
    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }
}

public class DuplicateCheckResultDTO
{
    public bool HasDuplicates { get; set; }
    public int MatchCount { get; set; }
    public List<DuplicateMatchDTO> Matches { get; set; } = new();
}

public class DuplicateMatchDTO
{
    public Guid TaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public double SimilarityPercentage { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class DuplicateDecisionDTO
{
    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    [Required]
    public string Decision { get; set; } = string.Empty;

    public int MatchCount { get; set; }

    public double? TopSimilarity { get; set; }

    public List<Guid>? MatchedTaskIds { get; set; }
}
