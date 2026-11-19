using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

/// <summary>
/// Payload sent from FOMS to STARS when an invoice has been finalized and needs client endorsement (Integration 1).
/// </summary>
public class FomsEndorsementRequestDTO
{
    [Required]
    [MaxLength(100)]
    public string InvoiceNumber { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ClientAccountId { get; set; }

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
    [EmailAddress]
    public string? ClientEmail { get; set; }

    [Required]
    public decimal InvoiceAmount { get; set; }

    public DateTime? BillingDate { get; set; }

    public DateTime? SentDate { get; set; }

    public DateTime? DueDate { get; set; }

    [MaxLength(1000)]
    public string? InvoiceDocumentUrl { get; set; }

    [MaxLength(1000)]
    public string? Remarks { get; set; }
}

/// <summary>
/// Response returned by STARS to FOMS upon receiving an endorsement request.
/// </summary>
public class FomsEndorsementResponseDTO
{
    public bool IsSuccess { get; set; }
    public Guid StarsTaskId { get; set; }
    public string StarsTaskNumber { get; set; } = string.Empty;
    public string InvoiceNumber { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? AssignedTo { get; set; }
    public string Message { get; set; } = string.Empty;
}

/// <summary>
/// Callback payload sent from STARS to FOMS once the client signs the receiving copy and the task is approved (Integration 1).
/// </summary>
public class StarsEndorsementCompletionDTO
{
    [Required]
    public string InvoiceNumber { get; set; } = string.Empty;

    public Guid StarsTaskId { get; set; }

    public string StarsTaskNumber { get; set; } = string.Empty;

    public string CompletionResult { get; set; } = "Completed";

    public string DeliveryResult { get; set; } = "Delivered"; // "Delivered" or "Refused"

    public Guid? CoordinatorId { get; set; }

    [Required]
    public DateTime ActualReceivedDate { get; set; }

    [MaxLength(1000)]
    public string? SignedCopyUrl { get; set; }

    [MaxLength(1000)]
    public string? DeliveryRemarks { get; set; }

    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;

    public string? CompletedBy { get; set; }
}

/// <summary>
/// Webhook payload sent from FOMS to STARS when an invoice payment status changes (Integration 2).
/// </summary>
public class FomsPaymentStatusDTO
{
    [Required]
    [MaxLength(100)]
    public string ClientAccountId { get; set; } = string.Empty;

    [MaxLength(200)]
    public string ClientName { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string InvoiceNumber { get; set; } = string.Empty;

    /// <summary>
    /// Current invoice/payment status: Draft, Approved, Sent, Overdue, Paid.
    /// </summary>
    [MaxLength(50)]
    public string CurrentStatus { get; set; } = string.Empty;

    /// <summary>
    /// Document/Invoice status: Sent, Received, Approved, Disputed, etc.
    /// </summary>
    [MaxLength(50)]
    public string? InvoiceStatus { get; set; }

    /// <summary>
    /// Strict payment state per FR-039: "Unpaid" or "Paid"
    /// </summary>
    [MaxLength(50)]
    public string? PaymentStatus { get; set; }

    /// <summary>
    /// Due indicator: "Normal", "Due Soon", "Overdue", "Disputed"
    /// </summary>
    [MaxLength(50)]
    public string? DueStatus { get; set; }

    /// <summary>
    /// Aging bracket: "Not Yet Due", "Due Soon", "Current", "1-30", "31-60", "61-90", "90+"
    /// </summary>
    [MaxLength(50)]
    public string? AgingBucket { get; set; }

    public DateTime? DueDate { get; set; }

    public decimal TotalAmount { get; set; }

    public decimal AmountPaid { get; set; }

    public decimal OutstandingBalance { get; set; }

    public DateTime? NextDueDate { get; set; }

    public DateTime? LastPaymentDate { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Webhook payload sent from FOMS to STARS when an account is overdue or due soon (Integration 3).
/// </summary>
public class FomsOverdueAlertDTO
{
    [Required]
    [MaxLength(100)]
    public string InvoiceNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ClientAccountId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string ClientName { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? ClientContactPerson { get; set; }

    [MaxLength(50)]
    public string? ClientContactNumber { get; set; }

    [MaxLength(150)]
    [EmailAddress]
    public string? ClientEmail { get; set; }

    [MaxLength(500)]
    public string? ClientAddress { get; set; }

    [Required]
    public decimal AmountDue { get; set; }

    public DateTime? DueDate { get; set; }

    public int DaysOverdue { get; set; }

    /// <summary>
    /// Aging category: Current, 1-30, 31-60, 61-90, 90+
    /// </summary>
    [MaxLength(50)]
    public string AgingStatus { get; set; } = "1-30";

    public DateTime AlertTimestamp { get; set; } = DateTime.UtcNow;

    [MaxLength(1000)]
    public string? Remarks { get; set; }
}

/// <summary>
/// Input DTO for an assignee submitting a signed receiving copy and received date in STARS.
/// </summary>
public class SubmitSignedEndorsementDTO
{
    [Required]
    public DateTime ActualReceivedDate { get; set; }

    [MaxLength(1000)]
    public string? SignedCopyUrl { get; set; }

    [MaxLength(1000)]
    public string? DeliveryRemarks { get; set; }
}

/// <summary>
/// DTO for triggering an endorsement completion callback manually or for headless testing.
/// </summary>
public class TriggerEndorsementCompletionDTO
{
    public Guid TaskId { get; set; }
    public DateTime? ActualReceivedDate { get; set; }
    public string? SignedCopyUrl { get; set; }
    public string? DeliveryRemarks { get; set; }
}

/// <summary>
/// Aggregate financial summary for STARS Dashboard (Integration 2 / FR-038).
/// </summary>
public class FomsDashboardFinancialSummaryDTO
{
    public decimal TotalOutstandingBalance { get; set; }
    public decimal TotalOverdueBalance { get; set; }
    public int TotalInvoicesTracked { get; set; }
    public int OverdueInvoicesCount { get; set; }
    public int PaidInvoicesCount { get; set; }
    public int PendingInvoicesCount { get; set; }
    public List<FomsClientFinancialSummaryItemDTO> TopOutstandingClients { get; set; } = new();
    public DateTime LastUpdatedAt { get; set; } = DateTime.UtcNow;
}

public class FomsClientFinancialSummaryItemDTO
{
    public string ClientAccountId { get; set; } = string.Empty;
    public string ClientName { get; set; } = string.Empty;
    public decimal OutstandingBalance { get; set; }
    public int OverdueInvoicesCount { get; set; }
    public string LatestStatus { get; set; } = string.Empty;
    public DateTime? NextDueDate { get; set; }
}

public class LinkEndorsementTaskDTO
{
    [Required]
    public Guid TaskId { get; set; }

    [Required]
    public string InvoiceNumber { get; set; } = string.Empty;

    public string? ClientName { get; set; }

    public decimal? InvoiceAmount { get; set; }
}

/// <summary>
/// Callback payload sent from STARS to FOMS once collection follow-up is completed (Integration 3 / FOMS FR-033).
/// </summary>
public class StarsCollectionOutcomeDTO
{
    [Required]
    public string InvoiceNumber { get; set; } = string.Empty;

    public Guid StarsTaskId { get; set; }

    public string StarsTaskNumber { get; set; } = string.Empty;

    [Required]
    public string Outcome { get; set; } = "Promised to Pay"; // "Promised to Pay", "Disputed", "Unreachable"

    public DateTime? PromisedPaymentDate { get; set; }

    public string ActionTaken { get; set; } = "Client Contact";

    public string? Notes { get; set; }

    public Guid? CoordinatorId { get; set; }

    public string? CoordinatorName { get; set; }

    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Input DTO for an assignee/coordinator submitting a collection outcome in STARS.
/// </summary>
public class SubmitCollectionOutcomeDTO
{
    [Required]
    public string Outcome { get; set; } = "Promised to Pay"; // "Promised to Pay", "Disputed", "Unreachable"

    public DateTime? PromisedPaymentDate { get; set; }

    [Required]
    public string ActionTaken { get; set; } = "Client Contact";

    public string? Notes { get; set; }
}

/// <summary>
/// Trigger DTO for dispatching collection outcome callback manually or in headless tests.
/// </summary>
public class TriggerCollectionOutcomeDTO
{
    public Guid TaskId { get; set; }

    public string Outcome { get; set; } = "Promised to Pay";

    public DateTime? PromisedPaymentDate { get; set; }

    public string ActionTaken { get; set; } = "Client Contact";

    public string? Notes { get; set; }

    public Guid? CoordinatorId { get; set; }

    public string? CoordinatorName { get; set; }
}

