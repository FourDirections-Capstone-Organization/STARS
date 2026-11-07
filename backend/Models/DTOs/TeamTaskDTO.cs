namespace Backend.Models.DTOs;

public class TeamTaskDTO
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Enums.PriorityLevel PriorityLevel { get; set; }
    public string Priority => PriorityLevel.ToString();
    public Enums.TaskStatus Status { get; set; }
    public Enums.AssignmentScope AssignmentScope { get; set; }
    public DateTime Deadline { get; set; }
    public bool IsConfidential { get; set; }
    public string? CreatedByName { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<TaskAssigneeDTO> Assignees { get; set; } = new();
}
