using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class DmsDeliveryPerformance
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(50)]
    public string WaybillNo { get; set; } = string.Empty;

    public Guid? StarsTaskId { get; set; }

    [MaxLength(50)]
    public string? DriverId { get; set; }

    public DateTime CompletedAt { get; set; }

    public DateTime SlaTargetAt { get; set; }

    public bool IsOnTime { get; set; }

    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
}
