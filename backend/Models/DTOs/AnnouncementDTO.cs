using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;

namespace Backend.Models.DTOs;

public class CreateAnnouncementDTO
{
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required]
    [MaxLength(10000)]
    public string Content { get; set; } = string.Empty;

    public string? TargetRoles { get; set; }

    [Required]
    public DateTime EffectiveDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    [MaxLength(50)]
    public string? Priority { get; set; } = "Normal";

    public bool IsPublic { get; set; } = false;

    public IFormFile? Attachment { get; set; }
}

public class AnnouncementResponseDTO
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? TargetRoles { get; set; }
    public DateTime EffectiveDate { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public string Priority { get; set; } = "Normal";
    public bool IsPublic { get; set; }
    public string? AttachmentFileName { get; set; }
    public string? AttachmentContentType { get; set; }
    public long? AttachmentSizeBytes { get; set; }
    public bool HasAttachment => !string.IsNullOrEmpty(AttachmentFileName);
    public string CreatedByName { get; set; } = string.Empty;
    public string CreatedByRole { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public bool IsAcknowledged { get; set; }
    public int AcknowledgmentCount { get; set; }
    public List<AcknowledgmentUserDTO> Acknowledgments { get; set; } = new();
    public List<CommentDTO> Comments { get; set; } = new();
}

public class AcknowledgmentUserDTO
{
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public DateTime AcknowledgedAt { get; set; }
}

public class CommentDTO
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class AddCommentDTO
{
    [Required]
    [MaxLength(2000)]
    public string Content { get; set; } = string.Empty;
}

