using System.ComponentModel.DataAnnotations;

namespace Backend.Models.DTOs;

public class UpsertTaskDeliveryDetailDTO
{
    [Required]
    [MaxLength(100)]
    public string RecipientName { get; set; } = string.Empty;

    [Required]
    [MaxLength(30)]
    public string RecipientContact { get; set; } = string.Empty;

    [Required]
    [MaxLength(500)]
    public string DeliveryAddress { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Area { get; set; }

    [MaxLength(500)]
    public string? PackageDescription { get; set; }

    [MaxLength(50)]
    public string? CourierEmployeeId { get; set; }
}

public class TriggerDispatchDTO
{
    public Guid? TaskId { get; set; }
}

public class TaskDeliveryDetailResponseDTO
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public string RecipientName { get; set; } = string.Empty;
    public string RecipientContact { get; set; } = string.Empty;
    public string DeliveryAddress { get; set; } = string.Empty;
    public string Area { get; set; } = string.Empty;
    public string PackageDescription { get; set; } = string.Empty;
    public string? CourierEmployeeId { get; set; }
    public string? DmsWaybillNo { get; set; }
    public int? DmsOrderId { get; set; }
    public string? DmsStatus { get; set; }
    public string? DmsRawStatus { get; set; }
    public DateTime? DmsLastSyncedAt { get; set; }
    public string? DmsFailureReason { get; set; }
    public double? DmsLatitude { get; set; }
    public double? DmsLongitude { get; set; }
    public string SyncStatus { get; set; } = string.Empty;
    public string? SyncError { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class DmsStatusWebhookDTO
{
    [Required]
    public string WaybillNo { get; set; } = string.Empty;

    [Required]
    public Guid StarsTaskId { get; set; }

    [Required]
    public string Status { get; set; } = string.Empty;

    public string? DmsStatus { get; set; }

    public DateTime Timestamp { get; set; }

    public string? DriverId { get; set; }

    public string? FailureReason { get; set; }

    public double? Latitude { get; set; }

    public double? Longitude { get; set; }

    public int? HistoryId { get; set; }
}

public class DmsPerformanceRecordDTO
{
    public string? DriverId { get; set; }
    public string WaybillNo { get; set; } = string.Empty;
    public Guid StarsTaskId { get; set; }
    public DateTime CompletedAt { get; set; }
    public DateTime SlaTargetAt { get; set; }
    public bool IsOnTime { get; set; }
}

public class DmsPerformanceBatchDTO
{
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public List<DmsPerformanceRecordDTO> Records { get; set; } = new();
}

public class DmsPerformanceSummaryDTO
{
    public int TotalDeliveries { get; set; }
    public int OnTimeCount { get; set; }
    public int LateCount { get; set; }
    public double OnTimePercentage { get; set; }
    public string? DriverFilter { get; set; }
    public List<DmsPerformanceRecordDTO> Records { get; set; } = new();
}
