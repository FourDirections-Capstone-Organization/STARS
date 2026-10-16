using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models;

/// <summary>
/// Stores real-time financial tracking status of invoices and client balances pushed from FOMS (Integration 2 / FR-038).
/// </summary>
public class FomsClientFinancialStatus
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(100)]
    public string ClientAccountId { get; set; } = string.Empty;

    [MaxLength(200)]
    public string ClientName { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string InvoiceNumber { get; set; } = string.Empty;

    /// <summary>
    /// Current invoice status from FOMS: Draft, Approved, Sent, Overdue, Paid.
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string CurrentStatus { get; set; } = string.Empty;

    [Column(TypeName = "decimal(18,2)")]
    public decimal TotalAmount { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal AmountPaid { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal OutstandingBalance { get; set; }

    public DateTime? NextDueDate { get; set; }

    public DateTime? LastPaymentDate { get; set; }

    public DateTime LastUpdatedFromFoms { get; set; } = DateTime.UtcNow;
}
