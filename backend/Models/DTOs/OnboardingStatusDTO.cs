namespace Backend.Models.DTOs;

public class OnboardingStatusDTO
{
    public string EmployeeNumber { get; set; } = string.Empty;
    public bool IsPasswordChanged { get; set; }
    public bool IsEmailVerified { get; set; }
    public bool HasAcceptedTerms { get; set; }
    public List<string> AllowedSystems { get; set; } = new();
}
