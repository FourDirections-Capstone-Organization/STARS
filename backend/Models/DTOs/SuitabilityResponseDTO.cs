namespace Backend.Models.DTOs;

public class SuitabilityResponseDTO
{
    public Guid EmployeeId { get; set; }
    public string EmployeeNumber { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public int Workload { get; set; }
    public double SuitabilityScore { get; set; }
    public int? Rank { get; set; }
    public string? Rationale { get; set; }
}
