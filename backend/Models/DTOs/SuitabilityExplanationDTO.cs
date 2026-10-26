namespace Backend.Models.DTOs;

public class SuitabilityExplanationDTO
{
    public Guid EmployeeId { get; set; }
    public string EmployeeNumber { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public double FinalScore { get; set; }

    public double WorkloadFactor { get; set; }
    public double WorkloadWeight { get; set; }
    public double ExperienceFactor { get; set; }
    public double ExperienceWeight { get; set; }
    public double RecScore { get; set; }
    public double RecScoreWeight { get; set; }

    public string Explanation { get; set; } = string.Empty;
    public int? Rank { get; set; }
    public string? Rationale { get; set; }
}
