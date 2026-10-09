using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Notifications;
using Backend.Modules.TaskManagement;

namespace Backend.Modules.DmsIntegration;

public class DmsIntegrationService : IDmsIntegrationService
{
    public const string HttpClientName = "dms";
    public const string ApiKeyHeaderName = "X-Api-Key";

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _http;
    private readonly DmsIntegrationSettings _settings;
    private readonly INotificationService _notificationService;
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<DmsIntegrationService> _logger;

    public DmsIntegrationService(
        AppDbContext db,
        IHttpClientFactory http,
        IOptions<DmsIntegrationSettings> settings,
        INotificationService notificationService,
        IAuditLogService auditLogService,
        ILogger<DmsIntegrationService> logger)
    {
        _db = db;
        _http = http;
        _settings = settings.Value;
        _notificationService = notificationService;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    public bool IsConfigured => _settings.CanCallDms;

    public static bool ValidateApiKey(string? provided, string? expected)
    {
        if (string.IsNullOrWhiteSpace(provided) || string.IsNullOrWhiteSpace(expected)) return false;
        var a = SHA256.HashData(Encoding.UTF8.GetBytes(provided));
        var b = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        return CryptographicOperations.FixedTimeEquals(a, b);
    }

    public async Task<ApiResponseDTO<TaskDeliveryDetailResponseDTO>> UpsertDeliveryDetailAsync(
        Guid taskId, UpsertTaskDeliveryDetailDTO dto, Guid userId)
    {
        var task = await _db.Tasks.FindAsync(taskId);
        if (task == null)
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure("Task not found");

        var detail = await _db.TaskDeliveryDetails.FirstOrDefaultAsync(d => d.TaskId == taskId);
        if (detail == null)
        {
            detail = new TaskDeliveryDetail
            {
                TaskId = taskId,
                RecipientName = dto.RecipientName.Trim(),
                RecipientContact = dto.RecipientContact.Trim(),
                DeliveryAddress = dto.DeliveryAddress.Trim(),
                Area = (dto.Area ?? string.Empty).Trim(),
                PackageDescription = (dto.PackageDescription ?? string.Empty).Trim(),
                CourierEmployeeId = dto.CourierEmployeeId?.Trim(),
                SenderAddress = dto.SenderAddress?.Trim(),
                SpecialInstructions = dto.SpecialInstructions?.Trim(),
                SyncStatus = "Pending",
                CreatedAt = DateTime.UtcNow
            };
            _db.TaskDeliveryDetails.Add(detail);
        }
        else
        {
            detail.RecipientName = dto.RecipientName.Trim();
            detail.RecipientContact = dto.RecipientContact.Trim();
            detail.DeliveryAddress = dto.DeliveryAddress.Trim();
            detail.Area = (dto.Area ?? string.Empty).Trim();
            detail.PackageDescription = (dto.PackageDescription ?? string.Empty).Trim();
            detail.CourierEmployeeId = dto.CourierEmployeeId?.Trim();
            detail.SenderAddress = dto.SenderAddress?.Trim();
            detail.SpecialInstructions = dto.SpecialInstructions?.Trim();
            detail.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            userId,
            AuditActionType.Update,
            "TaskDeliveryDetail",
            detail.Id,
            null,
            $"Delivery details updated for task '{task.Title}'",
            "DmsIntegration");

        return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Success(
            MapToDTO(detail), "Delivery details saved successfully");
    }

    public async Task<ApiResponseDTO<TaskDeliveryDetailResponseDTO>> GetDeliveryDetailAsync(Guid taskId)
    {
        var detail = await _db.TaskDeliveryDetails
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.TaskId == taskId);

        if (detail == null)
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure("No delivery details found for this task");

        return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Success(MapToDTO(detail));
    }

    public async Task<ApiResponseDTO<TaskDeliveryDetailResponseDTO>> CreateDeliveryOrderForTaskAsync(
        Guid taskId, Guid? reviewerId = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments).ThenInclude(a => a.AssignedUser)
            .Include(t => t.CreatedBy)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task == null)
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure("Task not found");

        var detail = await _db.TaskDeliveryDetails.FirstOrDefaultAsync(d => d.TaskId == taskId);
        if (detail == null)
        {
            // If no delivery details were pre-configured, synthesize defaults from task description
            detail = new TaskDeliveryDetail
            {
                TaskId = taskId,
                RecipientName = "Operations Dispatch",
                RecipientContact = "09123456789",
                DeliveryAddress = "Metro Manila",
                Area = "Manila",
                PackageDescription = task.Title,
                SyncStatus = "Pending",
                CreatedAt = DateTime.UtcNow
            };
            _db.TaskDeliveryDetails.Add(detail);
            await _db.SaveChangesAsync();
        }

        if (!IsConfigured)
        {
            detail.SyncStatus = "Failed";
            detail.SyncError = "DMS integration is not configured (DmsIntegration:BaseUrl or OutboundApiKey is empty).";
            detail.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure(detail.SyncError);
        }

        var assigneeUser = task.Assignments.FirstOrDefault()?.AssignedUser;
        var assigneeRef = assigneeUser != null
            ? $"{assigneeUser.EmployeeNumber} ({assigneeUser.FirstName} {assigneeUser.LastName})".Trim()
            : null;

        var creator = task.CreatedBy;
        var creatorName = creator != null
            ? $"{creator.FirstName} {creator.LastName}".Trim()
            : "STARS Operations";
        var senderName = creator != null
            ? $"{creator.FirstName} {creator.LastName} (STARS Operations)".Trim()
            : "STARS Operations";
        var senderAddress = !string.IsNullOrWhiteSpace(detail.SenderAddress)
            ? detail.SenderAddress.Trim()
            : "STARS Operations Office";
        var senderContact = creator?.ContactNumber ?? "09123456789";

        string? reviewerName = null;
        if (reviewerId.HasValue && reviewerId.Value != Guid.Empty)
        {
            var revUser = await _db.Users.FirstOrDefaultAsync(u => u.Id == reviewerId.Value);
            if (revUser != null)
                reviewerName = $"{revUser.FirstName} {revUser.LastName}".Trim();
        }

        var payload = new
        {
            starsTaskId = taskId,
            taskTitle = task.Title,
            senderName = senderName,
            senderAddress = senderAddress,
            senderContact = senderContact,
            recipientName = detail.RecipientName,
            recipientContact = detail.RecipientContact,
            deliveryAddress = detail.DeliveryAddress,
            area = string.IsNullOrWhiteSpace(detail.Area) ? "Manila" : detail.Area,
            packageDescription = string.IsNullOrWhiteSpace(detail.PackageDescription) ? task.Title : detail.PackageDescription,
            specialInstructions = detail.SpecialInstructions,
            encodedBy = creatorName,
            updatedBy = reviewerName ?? creatorName,
            priorityLevel = task.PriorityLevel.ToString(),
            courierEmployeeId = detail.CourierEmployeeId,
            assigneeReference = assigneeRef,
            taskCompletedAt = DateTime.UtcNow,
            coordinatorId = reviewerId?.ToString() ?? task.CreatedById.ToString()
        };

        try
        {
            var client = _http.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(
                HttpMethod.Post, $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/delivery-orders")
            {
                Content = JsonContent.Create(payload)
            };
            request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var response = await client.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                detail.SyncStatus = "Failed";
                detail.SyncError = $"DMS responded with {(int)response.StatusCode}: {Truncate(responseBody)}";
                detail.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();

                _logger.LogWarning("DMS delivery order creation failed for task {TaskId}: {Error}", taskId, detail.SyncError);
                return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure(detail.SyncError);
            }

            using var doc = JsonDocument.Parse(responseBody);
            var root = doc.RootElement;
            var waybillNo = root.TryGetProperty("waybillNo", out var wb) ? wb.GetString() : null;
            var orderId = root.TryGetProperty("orderId", out var oid) ? oid.GetInt32() : (int?)null;
            var status = root.TryGetProperty("status", out var st) ? st.GetString() : "Pending";

            detail.DmsWaybillNo = waybillNo;
            detail.DmsOrderId = orderId;
            detail.DmsStatus = status;
            detail.DmsRawStatus = status;
            detail.DmsLastSyncedAt = DateTime.UtcNow;
            detail.SyncStatus = "Synced";
            detail.SyncError = null;
            detail.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            await _auditLogService.LogAsync(
                reviewerId ?? task.CreatedById,
                AuditActionType.Create,
                "DeliveryOrder",
                taskId,
                null,
                $"DMS Delivery Order created successfully. Waybill: {waybillNo}, DMS Order ID: {orderId}",
                "DmsIntegration");

            _logger.LogInformation("Task {TaskId} mapped to DMS Waybill {WaybillNo}", taskId, waybillNo);
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Success(
                MapToDTO(detail), "Delivery order created successfully in DMS");
        }
        catch (Exception ex)
        {
            detail.SyncStatus = "Failed";
            detail.SyncError = $"Error communicating with DMS: {ex.Message}";
            detail.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            _logger.LogError(ex, "Failed to call DMS for task {TaskId}", taskId);
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure(detail.SyncError);
        }
    }

    public async Task<ApiResponseDTO<bool>> ProcessStatusUpdateAsync(DmsStatusWebhookDTO dto)
    {
        var detail = await _db.TaskDeliveryDetails
            .Include(d => d.Task)
            .FirstOrDefaultAsync(d => d.TaskId == dto.StarsTaskId || d.DmsWaybillNo == dto.WaybillNo);

        if (detail == null)
        {
            var targetTaskId = dto.StarsTaskId != Guid.Empty ? dto.StarsTaskId : Guid.NewGuid();
            var targetTask = await _db.Tasks.FirstOrDefaultAsync(t => t.Id == targetTaskId);
            if (targetTask == null)
            {
                var creatorId = await _db.Users.Select(u => u.Id).FirstOrDefaultAsync();
                targetTask = new Backend.Models.Task
                {
                    Id = targetTaskId,
                    Title = $"Delivery Tracking {dto.WaybillNo}",
                    Description = $"Delivery order synchronized from DMS (Waybill: {dto.WaybillNo})",
                    PriorityLevel = PriorityLevel.High,
                    Status = Backend.Models.Enums.TaskStatus.InProgress,
                    Classification = TaskClassification.SpecialTask,
                    CreatedById = creatorId,
                    Deadline = DateTime.UtcNow.AddDays(1),
                    CreatedAt = DateTime.UtcNow
                };
                _db.Tasks.Add(targetTask);
                await _db.SaveChangesAsync();
            }

            var initRecipientName = !string.IsNullOrWhiteSpace(dto.RecipientName)
                ? dto.RecipientName.Trim()
                : "Operations Dispatch";
            var initRecipientContact = !string.IsNullOrWhiteSpace(dto.RecipientContact)
                ? dto.RecipientContact.Trim()
                : "09123456789";
            var initDeliveryAddress = !string.IsNullOrWhiteSpace(dto.DeliveryAddress)
                ? dto.DeliveryAddress.Trim()
                : "Metro Manila";
            var initArea = !string.IsNullOrWhiteSpace(dto.Area)
                ? dto.Area.Trim()
                : "Manila";
            var initPackageDesc = !string.IsNullOrWhiteSpace(dto.PackageDescription)
                ? dto.PackageDescription.Trim()
                : targetTask.Title;

            detail = new TaskDeliveryDetail
            {
                TaskId = targetTask.Id,
                RecipientName = initRecipientName,
                RecipientContact = initRecipientContact,
                DeliveryAddress = initDeliveryAddress,
                Area = initArea,
                PackageDescription = initPackageDesc,
                DmsWaybillNo = dto.WaybillNo,
                DmsStatus = dto.Status,
                DmsRawStatus = dto.DmsStatus ?? dto.Status,
                DmsLastSyncedAt = dto.Timestamp.Kind == DateTimeKind.Utc ? dto.Timestamp : dto.Timestamp.ToUniversalTime(),
                DmsFailureReason = dto.FailureReason,
                DmsLatitude = dto.Latitude,
                DmsLongitude = dto.Longitude,
                SyncStatus = "Synced",
                CreatedAt = DateTime.UtcNow
            };
            _db.TaskDeliveryDetails.Add(detail);
            await _db.SaveChangesAsync();
        }

        detail.DmsStatus = dto.Status;
        detail.DmsRawStatus = dto.DmsStatus ?? dto.Status;
        detail.DmsLastSyncedAt = dto.Timestamp.Kind == DateTimeKind.Utc ? dto.Timestamp : dto.Timestamp.ToUniversalTime();
        detail.DmsFailureReason = dto.FailureReason;
        detail.DmsLatitude = dto.Latitude;
        detail.DmsLongitude = dto.Longitude;

        // If the webhook from DMS carries real recipient details, update them
        if (!string.IsNullOrWhiteSpace(dto.RecipientName))
            detail.RecipientName = dto.RecipientName.Trim();
        if (!string.IsNullOrWhiteSpace(dto.RecipientContact))
            detail.RecipientContact = dto.RecipientContact.Trim();
        if (!string.IsNullOrWhiteSpace(dto.DeliveryAddress))
            detail.DeliveryAddress = dto.DeliveryAddress.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Area))
            detail.Area = dto.Area.Trim();
        if (!string.IsNullOrWhiteSpace(dto.PackageDescription))
            detail.PackageDescription = dto.PackageDescription.Trim();

        detail.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // Notify Coordinator and Manager
        var task = detail.Task;
        if (task != null)
        {
            var notifRecipients = new List<Guid>();
            if (task.CreatedById != Guid.Empty)
                notifRecipients.Add(task.CreatedById);

            // Also find coordinators / managers of the assigned department
            var managersAndCoords = await _db.Users
                .Where(u => u.IsActive && !u.IsDeactivated && (u.Role == UserRole.Manager || u.Role == UserRole.Coordinator))
                .Select(u => u.Id)
                .Take(10)
                .ToListAsync();

            notifRecipients.AddRange(managersAndCoords);
            var distinctRecipients = notifRecipients.Distinct().ToList();

            var notifType = (dto.Status == "Completed" || dto.Status == "Delivered")
                ? NotificationType.TaskCompleted
                : NotificationType.TaskUpdated;

            var title = $"Delivery Status: {dto.Status}";
            var message = $"Delivery for task '{task.Title}' (Waybill: {dto.WaybillNo}) updated to '{dto.Status}'"
                + (string.IsNullOrWhiteSpace(dto.FailureReason) ? "." : $". Reason: {dto.FailureReason}");

            await _notificationService.SendBulkNotificationAsync(distinctRecipients, notifType, title, message, task.Id);
        }

        await _auditLogService.LogAsync(
            null,
            AuditActionType.StatusChange,
            "TaskDeliveryDetail",
            detail.Id,
            null,
            $"DMS delivery status sync for waybill {dto.WaybillNo} updated to {dto.Status}",
            "DmsIntegration");

        return ApiResponseDTO<bool>.Success(true, "Status updated successfully");
    }

    public async Task<ApiResponseDTO<int>> ProcessPerformanceBatchAsync(DmsPerformanceBatchDTO batch)
    {
        if (batch.Records == null || batch.Records.Count == 0)
            return ApiResponseDTO<int>.Success(0, "No records to process");

        int processed = 0;
        foreach (var rec in batch.Records)
        {
            if (string.IsNullOrWhiteSpace(rec.WaybillNo)) continue;

            var existing = await _db.DmsDeliveryPerformances
                .FirstOrDefaultAsync(p => p.WaybillNo == rec.WaybillNo);

            if (existing == null)
            {
                var entry = new DmsDeliveryPerformance
                {
                    WaybillNo = rec.WaybillNo,
                    StarsTaskId = rec.StarsTaskId != Guid.Empty ? rec.StarsTaskId : null,
                    DriverId = rec.DriverId,
                    CompletedAt = rec.CompletedAt.Kind == DateTimeKind.Utc ? rec.CompletedAt : rec.CompletedAt.ToUniversalTime(),
                    SlaTargetAt = rec.SlaTargetAt.Kind == DateTimeKind.Utc ? rec.SlaTargetAt : rec.SlaTargetAt.ToUniversalTime(),
                    IsOnTime = rec.IsOnTime,
                    ReceivedAt = DateTime.UtcNow
                };
                _db.DmsDeliveryPerformances.Add(entry);
            }
            else
            {
                existing.DriverId = rec.DriverId ?? existing.DriverId;
                existing.CompletedAt = rec.CompletedAt.Kind == DateTimeKind.Utc ? rec.CompletedAt : rec.CompletedAt.ToUniversalTime();
                existing.SlaTargetAt = rec.SlaTargetAt.Kind == DateTimeKind.Utc ? rec.SlaTargetAt : rec.SlaTargetAt.ToUniversalTime();
                existing.IsOnTime = rec.IsOnTime;
                existing.ReceivedAt = DateTime.UtcNow;
            }
            processed++;
        }

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            null,
            AuditActionType.Upload,
            "DmsDeliveryPerformance",
            null,
            null,
            $"Processed batch of {processed} delivery performance records from DMS",
            "DmsIntegration");

        return ApiResponseDTO<int>.Success(processed, $"Processed {processed} performance records");
    }

    public async Task<ApiResponseDTO<DmsPerformanceSummaryDTO>> GetPerformanceSummaryAsync(string? driverId = null)
    {
        var query = _db.DmsDeliveryPerformances.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(driverId))
            query = query.Where(p => p.DriverId == driverId.Trim());

        var list = await query
            .OrderByDescending(p => p.CompletedAt)
            .Take(500)
            .ToListAsync();

        var total = list.Count;
        var onTime = list.Count(p => p.IsOnTime);
        var late = total - onTime;
        var pct = total > 0 ? Math.Round((double)onTime / total * 100, 2) : 100.0;

        var dto = new DmsPerformanceSummaryDTO
        {
            TotalDeliveries = total,
            OnTimeCount = onTime,
            LateCount = late,
            OnTimePercentage = pct,
            DriverFilter = driverId,
            Records = list.Select(p => new DmsPerformanceRecordDTO
            {
                WaybillNo = p.WaybillNo,
                StarsTaskId = p.StarsTaskId ?? Guid.Empty,
                DriverId = p.DriverId,
                CompletedAt = p.CompletedAt,
                SlaTargetAt = p.SlaTargetAt,
                IsOnTime = p.IsOnTime
            }).ToList()
        };

        return ApiResponseDTO<DmsPerformanceSummaryDTO>.Success(dto);
    }

    private static TaskDeliveryDetailResponseDTO MapToDTO(TaskDeliveryDetail d) => new()
    {
        Id = d.Id,
        TaskId = d.TaskId,
        RecipientName = d.RecipientName,
        RecipientContact = d.RecipientContact,
        DeliveryAddress = d.DeliveryAddress,
        Area = d.Area,
        PackageDescription = d.PackageDescription,
        SenderAddress = d.SenderAddress,
        SpecialInstructions = d.SpecialInstructions,
        CourierEmployeeId = d.CourierEmployeeId,
        DmsWaybillNo = d.DmsWaybillNo,
        DmsOrderId = d.DmsOrderId,
        DmsStatus = d.DmsStatus,
        DmsRawStatus = d.DmsRawStatus,
        DmsLastSyncedAt = d.DmsLastSyncedAt,
        DmsFailureReason = d.DmsFailureReason,
        DmsLatitude = d.DmsLatitude,
        DmsLongitude = d.DmsLongitude,
        SyncStatus = d.SyncStatus,
        SyncError = d.SyncError,
        CreatedAt = d.CreatedAt,
        UpdatedAt = d.UpdatedAt
    };

    private static string Truncate(string s) => s.Length <= 300 ? s : s[..300];
}
