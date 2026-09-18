using System.ComponentModel.DataAnnotations;
using Backend.Models.Enums;

namespace Backend.Models.DTOs;

public class UpdateTaskTemplateDTO
{
    [MaxLength(150)]
    public string? TemplateName { get; set; }

    [MaxLength(150)]
    public string? DefaultTitle { get; set; }

    [MaxLength(2000)]
    public string? DefaultDescription { get; set; }

    public PriorityLevel? DefaultPriorityLevel { get; set; }

    public TaskClassification? DefaultClassification { get; set; }

    public AssignmentScope? DefaultAssignmentScope { get; set; }

    public Guid? DefaultAssigneeId { get; set; }

    public bool? ClearDefaultAssignee { get; set; }

    public Guid? DefaultDepartmentId { get; set; }

    public RecurrenceRule? RecurrenceRule { get; set; }

    public DateTime? RecurrenceStartDate { get; set; }

    public bool? IsActive { get; set; }
}
