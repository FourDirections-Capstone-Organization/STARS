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

    private string? _courierEmployeeId;

    [MaxLength(50)]
    public string? CourierEmployeeId
    {
        get => _courierEmployeeId;
        set => _courierEmployeeId = value?.Trim();
    }

    [MaxLength(50)]
    public string? DriverId
    {
        get => _courierEmployeeId;
        set
        {
            if (string.IsNullOrWhiteSpace(_courierEmployeeId))
                _courierEmployeeId = value?.Trim();
        }
    }

    [MaxLength(50)]
    public string? DriverEmployeeId
    {
        get => _courierEmployeeId;
        set
        {
            if (string.IsNullOrWhiteSpace(_courierEmployeeId))
                _courierEmployeeId = value?.Trim();
        }
    }

    private string? _courierFullName;

    [MaxLength(200)]
    public string? CourierFullName
    {
        get => _courierFullName;
        set => _courierFullName = value?.Trim();
    }

    [MaxLength(200)]
    public string? DriverName
    {
        get => _courierFullName;
        set
        {
            if (string.IsNullOrWhiteSpace(_courierFullName))
                _courierFullName = value?.Trim();
        }
    }

    [MaxLength(500)]
    public string? SenderAddress { get; set; }

    [MaxLength(1000)]
    public string? SpecialInstructions { get; set; }

    public int? DmsOrderId { get; set; }

    [MaxLength(50)]
    public string? DmsWaybillNo { get; set; }

    [MaxLength(50)]
    public string? DmsStatus { get; set; }

    [MaxLength(100)]
    public string? TaskType { get; set; }

    [MaxLength(100)]
    public string? PackageType { get; set; }

    [MaxLength(50)]
    public string? Weight { get; set; }

    public int? ItemCount { get; set; }
}

public class DmsPendingOrderDTO
{
    public int OrderId { get; set; }
    public string WaybillNo { get; set; } = string.Empty;
    public string ClientName { get; set; } = string.Empty;
    public string ClientType { get; set; } = string.Empty;
    public string ContactNumber { get; set; } = string.Empty;
    public string SenderAddress { get; set; } = string.Empty;
    public string RecipientName { get; set; } = string.Empty;
    public string RecipientContact { get; set; } = string.Empty;
    public string RecipientAddress { get; set; } = string.Empty;
    public string Area { get; set; } = string.Empty;
    public string Route { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string TaskType { get; set; } = string.Empty;
    public string PackageType { get; set; } = string.Empty;
    public string PackageDescription { get; set; } = string.Empty;
    public int ItemCount { get; set; } = 1;
    public string Weight { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public string? SpecialInstructions { get; set; }
    public DateTime OrderDate { get; set; }

    private DateTime _expectedDelivery;
    public DateTime ExpectedDelivery
    {
        get => _expectedDelivery;
        set
        {
            _expectedDelivery = NormalizeDateOnly(value);
            if (string.IsNullOrWhiteSpace(_expectedDeliveryDate) && value != default)
            {
                _expectedDeliveryDate = _expectedDelivery.ToString("yyyy-MM-dd");
            }
        }
    }

    private string? _expectedDeliveryDate;
    public string? ExpectedDeliveryDate
    {
        get => _expectedDeliveryDate ?? (_expectedDelivery != default ? _expectedDelivery.ToString("yyyy-MM-dd") : null);
        set
        {
            _expectedDeliveryDate = value?.Trim();
            if (_expectedDelivery == default && !string.IsNullOrWhiteSpace(value) && DateTime.TryParse(value, out var d))
            {
                _expectedDelivery = DateTime.SpecifyKind(d.Date, DateTimeKind.Utc);
            }
        }
    }

    private string? _driverEmployeeId;
    public string? DriverEmployeeId
    {
        get => _driverEmployeeId;
        set => _driverEmployeeId = value?.Trim();
    }

    public string? DriverId
    {
        get => _driverEmployeeId;
        set
        {
            if (string.IsNullOrWhiteSpace(_driverEmployeeId))
                _driverEmployeeId = value?.Trim();
        }
    }

    public string? CourierEmployeeId
    {
        get => _driverEmployeeId;
        set
        {
            if (string.IsNullOrWhiteSpace(_driverEmployeeId))
                _driverEmployeeId = value?.Trim();
        }
    }

    public string? DriverName { get; set; }
    public string? CourierFullName
    {
        get => DriverName;
        set
        {
            if (string.IsNullOrWhiteSpace(DriverName))
                DriverName = value?.Trim();
        }
    }

    public bool? DriverIsActive { get; set; }
    public bool? CourierIsActive
    {
        get => DriverIsActive;
        set
        {
            if (!DriverIsActive.HasValue)
                DriverIsActive = value;
        }
    }

    public static DateTime NormalizeDateOnly(DateTime dt)
    {
        if (dt == default) return dt;
        return DateTime.SpecifyKind(dt.Date, DateTimeKind.Utc);
    }
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
    public string? SenderAddress { get; set; }
    public string? SpecialInstructions { get; set; }
    public string? CourierEmployeeId { get; set; }
    public string? DriverId => CourierEmployeeId;
    public string? DriverEmployeeId => CourierEmployeeId;
    public string? CourierFullName { get; set; }
    public string? DriverName => CourierFullName;
    public bool? CourierIsActive { get; set; }
    public bool? DriverIsActive => CourierIsActive;
    public string? PodUrl { get; set; }
    public string? PodFileName { get; set; }
    public DateTime? PodUploadedAt { get; set; }
    public string? PodUploadedBy { get; set; }
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
    public DateTime? ExpectedDelivery { get; set; }
    public string? ExpectedDeliveryDate { get; set; }
    public string? TaskType { get; set; }
    public string? PackageType { get; set; }
    public string? Weight { get; set; }
    public int? ItemCount { get; set; }
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

    private string? _driverId;
    public string? DriverId
    {
        get => _driverId;
        set => _driverId = value?.Trim();
    }

    public string? CourierEmployeeId
    {
        get => _driverId;
        set
        {
            if (string.IsNullOrWhiteSpace(_driverId))
                _driverId = value?.Trim();
        }
    }

    public string? DriverEmployeeId
    {
        get => _driverId;
        set
        {
            if (string.IsNullOrWhiteSpace(_driverId))
                _driverId = value?.Trim();
        }
    }

    private string? _driverName;

    public string? DriverName
    {
        get => _driverName;
        set => _driverName = value?.Trim();
    }

    public string? CourierFullName
    {
        get => _driverName;
        set
        {
            if (string.IsNullOrWhiteSpace(_driverName))
                _driverName = value?.Trim();
        }
    }

    public string? FailureReason { get; set; }

    public double? Latitude { get; set; }

    public double? Longitude { get; set; }

    public int? HistoryId { get; set; }

    public string? RecipientName { get; set; }
    public string? RecipientContact { get; set; }
    public string? DeliveryAddress { get; set; }
    public string? Area { get; set; }
    public string? PackageDescription { get; set; }

    public string? PodUrl { get; set; }
    public string? PodImage { get; set; }
    public string? PotImage { get; set; }

    public string? TaskType { get; set; }
    public string? PackageType { get; set; }
    public string? Weight { get; set; }
    public int? ItemCount { get; set; }
}

public class DmsPerformanceRecordDTO
{
    public string? DriverId { get; set; }
    public string? DriverEmployeeId => DriverId;
    public string? CourierEmployeeId => DriverId;
    public string? DriverName { get; set; }
    public string? CourierFullName => DriverName;
    public bool? DriverIsActive { get; set; }
    public bool? CourierIsActive => DriverIsActive;
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

public class DmsDeliveryItemDTO
{
    public Guid TaskId { get; set; }
    public string TaskTitle { get; set; } = string.Empty;
    public string? TaskNumber { get; set; }
    public string? TaskReferenceNumber { get; set; }
    public string RecipientName { get; set; } = string.Empty;
    public string RecipientContact { get; set; } = string.Empty;
    public string DeliveryAddress { get; set; } = string.Empty;
    public string? Area { get; set; }
    public string? PackageDescription { get; set; }
    public string? SenderAddress { get; set; }
    public string? SpecialInstructions { get; set; }
    public string? CourierEmployeeId { get; set; }
    public string? DriverId => CourierEmployeeId;
    public string? DriverEmployeeId => CourierEmployeeId;
    public string? CourierFullName { get; set; }
    public string? DriverName => CourierFullName;
    public bool? CourierIsActive { get; set; }
    public bool? DriverIsActive => CourierIsActive;
    public string? PodUrl { get; set; }
    public DateTime? PodUploadedAt { get; set; }
    public string? DmsWaybillNo { get; set; }
    public int? DmsOrderId { get; set; }
    public string DmsStatus { get; set; } = string.Empty;
    public string? DmsRawStatus { get; set; }
    public DateTime? DmsLastSyncedAt { get; set; }
    public string? DmsFailureReason { get; set; }
    public double? DmsLatitude { get; set; }
    public double? DmsLongitude { get; set; }
    public string SyncStatus { get; set; } = string.Empty;
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public DateTime? ExpectedDelivery { get; set; }
    public string? ExpectedDeliveryDate { get; set; }
    public string? TaskType { get; set; }
    public string? PackageType { get; set; }
    public string? Weight { get; set; }
    public int? ItemCount { get; set; }
}

public class TaskPodResponseDTO
{
    public Guid TaskId { get; set; }
    public string? WaybillNo { get; set; }
    public string? PodUrl { get; set; }
    public string? FileName { get; set; }
    public string? FileType { get; set; }
    public long? FileSize { get; set; }
    public DateTime? UploadedAt { get; set; }
    public string? UploadedByName { get; set; }
    public string? DownloadUrl { get; set; }
    public bool HasPod => !string.IsNullOrWhiteSpace(PodUrl) || !string.IsNullOrWhiteSpace(DownloadUrl);
}
