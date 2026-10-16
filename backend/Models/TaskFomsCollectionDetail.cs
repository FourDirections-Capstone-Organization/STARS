using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models;

/// <summary>
/// Stores collection follow-up metadata for overdue accounts routed from FOMS (Integration 3).
/// </summary>
public class TaskFomsCollectionDetail
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TaskId { get; set; }

    [ForeignKey(nameof(TaskId))]
    public Task? Task { get; set; }

    [Required]
    [MaxLength(100)]
    public string InvoiceNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ClientAccountId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string ClientName { get; set; } = string.Empty;

    [Column(TypeName = "decimal(18,2)")]
    public decimal AmountDue { get; set; }

    public int DaysOverdue { get; set; }

    [MaxLength(50)]
    public string AgingStatus { get; set; } = "1-30";

    public DateTime? DueDate { get; set; }

    [MaxLength(150)]
    public string? ClientContactPerson { get; set; }

    [MaxLength(50)]
    public string? ClientContactNumber { get; set; }

    [MaxLength(500)]
    public string? ClientAddress { get; set; }

    public DateTime RoutedAt { get; set; } = DateTime.UtcNow;
}
