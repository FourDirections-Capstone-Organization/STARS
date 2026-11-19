using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models;

/// <summary>
/// Read-only client account reference data synchronized from FOMS (Integration 4 / FOMS FR-007, FR-010).
/// FOMS is the sole system of record for client corporate profiles.
/// Enables internal Coordinator Management Scoping (FR-011), task visibility scoping (FR-010),
/// Manager oversight (FR-012), and inactive account gate enforcement.
/// </summary>
public class FomsClientAccount
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(100)]
    public string ClientAccountId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string ClientName { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? ContactPerson { get; set; }

    [MaxLength(50)]
    public string? ContactNumber { get; set; }

    [MaxLength(150)]
    public string? Email { get; set; }

    [MaxLength(500)]
    public string? Address { get; set; }

    [MaxLength(50)]
    public string? AccountHandlerEmployeeNumber { get; set; }

    public Guid? AccountHandlerUserId { get; set; }

    public virtual User? AccountHandlerUser { get; set; }

    [Required]
    [MaxLength(50)]
    public string Status { get; set; } = "Active";

    public Guid? AssignedCoordinatorId { get; set; }

    public virtual User? AssignedCoordinator { get; set; }

    public DateTime LastSyncedAt { get; set; } = DateTime.UtcNow;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
