using System.ComponentModel.DataAnnotations;
using Backend.Models.Enums;

namespace Backend.Models;

public class Announcement
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required]
    [MaxLength(10000)]
    public string Content { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? TargetRoles { get; set; }

    [Required]
    public DateTime EffectiveDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    [MaxLength(50)]
    public string Priority { get; set; } = "Normal";

    public bool IsPublic { get; set; } = false;

    [MaxLength(255)]
    public string? AttachmentFileName { get; set; }

    [MaxLength(500)]
    public string? AttachmentFilePath { get; set; }

    [MaxLength(100)]
    public string? AttachmentContentType { get; set; }

    public long? AttachmentSizeBytes { get; set; }

    public Guid CreatedById { get; set; }
    public User? CreatedBy { get; set; }

    public bool IsPublished { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

