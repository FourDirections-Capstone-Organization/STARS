using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models;

/// <summary>
/// Stores liquidation correction metadata routed from FOMS (Integration 5).
/// Tracks the correction process, receipts, and synchronization status.
/// </summary>
public class TaskFomsLiquidationDetail
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TaskId { get; set; }

    [ForeignKey(nameof(TaskId))]
    public Task? Task { get; set; }

    [Required]
    [MaxLength(100)]
    public string RequestId { get; set; } = string.Empty;

    public int? LiquidationId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Requester { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? RequesterEmployeeId { get; set; }

    [MaxLength(100)]
    public string? DeliveryReference { get; set; }

    [Required]
    [MaxLength(50)]
    public string LiquidationStatus { get; set; } = "For Correction"; // "For Correction" or "Rejected"

    [Required]
    [MaxLength(1000)]
    public string CorrectionReason { get; set; } = string.Empty;

    public DateTime? DueDate { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal? Amount { get; set; }

    [MaxLength(50)]
    public string CorrectionStatus { get; set; } = "PendingCorrection"; // "PendingCorrection", "Corrected"

    [MaxLength(1000)]
    public string? CorrectedReceiptsUrl { get; set; }

    [MaxLength(1000)]
    public string? ResolutionRemarks { get; set; }

    /// <summary>
    /// Pending, CallbackSuccess, Failed
    /// </summary>
    [MaxLength(50)]
    public string FomsSyncStatus { get; set; } = "Pending";

    public DateTime? LastSyncedAt { get; set; }

    [MaxLength(500)]
    public string? LastSyncError { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
