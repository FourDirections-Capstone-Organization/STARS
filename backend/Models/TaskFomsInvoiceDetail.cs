using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models;

/// <summary>
/// Links a STARS task to an endorsement request for a finalized invoice from FOMS (Integration 1).
/// </summary>
public class TaskFomsInvoiceDetail
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
    [MaxLength(200)]
    public string ClientName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? ClientAddress { get; set; }

    [MaxLength(150)]
    public string? ClientContactPerson { get; set; }

    [MaxLength(50)]
    public string? ClientContactNumber { get; set; }

    [MaxLength(150)]
    public string? ClientEmail { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal InvoiceAmount { get; set; }

    public DateTime? BillingDate { get; set; }

    public DateTime? DueDate { get; set; }

    [MaxLength(1000)]
    public string? InvoiceDocumentUrl { get; set; }

    [MaxLength(1000)]
    public string? SignedReceivingCopyUrl { get; set; }

    public DateTime? ActualReceivedDate { get; set; }

    [MaxLength(1000)]
    public string? DeliveryRemarks { get; set; }

    /// <summary>
    /// PendingEndorsement, Delivered, Endorsed, Completed, Failed
    /// </summary>
    [MaxLength(50)]
    public string EndorsementStatus { get; set; } = "PendingEndorsement";

    /// <summary>
    /// Pending, Synced, Failed
    /// </summary>
    [MaxLength(50)]
    public string FomsSyncStatus { get; set; } = "Pending";

    public DateTime? LastSyncedAt { get; set; }

    [MaxLength(500)]
    public string? LastSyncError { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
