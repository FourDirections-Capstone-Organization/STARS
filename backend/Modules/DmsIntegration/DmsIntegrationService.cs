using System.Net;
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

        var incomingCourierFullName = !string.IsNullOrWhiteSpace(dto.CourierFullName)
            ? dto.CourierFullName.Trim()
            : (!string.IsNullOrWhiteSpace(dto.DriverName) ? dto.DriverName.Trim() : null);

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
                CourierFullName = incomingCourierFullName,
                SenderAddress = dto.SenderAddress?.Trim(),
                SpecialInstructions = dto.SpecialInstructions?.Trim(),
                DmsOrderId = dto.DmsOrderId,
                DmsWaybillNo = dto.DmsWaybillNo?.Trim(),
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
            if (!string.IsNullOrWhiteSpace(incomingCourierFullName))
            {
                detail.CourierFullName = incomingCourierFullName;
            }
            detail.SenderAddress = dto.SenderAddress?.Trim();
            detail.SpecialInstructions = dto.SpecialInstructions?.Trim();
            if (!string.IsNullOrWhiteSpace(dto.TaskType)) detail.TaskType = dto.TaskType.Trim();
            if (!string.IsNullOrWhiteSpace(dto.PackageType)) detail.PackageType = dto.PackageType.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Weight)) detail.Weight = dto.Weight.Trim();
            if (dto.ItemCount.HasValue && dto.ItemCount > 0) detail.ItemCount = dto.ItemCount.Value;
            if (dto.DmsOrderId.HasValue) detail.DmsOrderId = dto.DmsOrderId;
            if (!string.IsNullOrWhiteSpace(dto.DmsWaybillNo)) detail.DmsWaybillNo = dto.DmsWaybillNo.Trim();
            detail.UpdatedAt = DateTime.UtcNow;
        }

        User? driverUser = null;
        if (!string.IsNullOrWhiteSpace(detail.CourierEmployeeId))
        {
            driverUser = await _db.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.EmployeeNumber == detail.CourierEmployeeId);

            if (driverUser != null && string.IsNullOrWhiteSpace(detail.CourierFullName))
            {
                detail.CourierFullName = $"{driverUser.FirstName} {driverUser.LastName}".Trim();
            }
        }

        if (!string.IsNullOrWhiteSpace(dto.DmsStatus))
        {
            detail.DmsStatus = dto.DmsStatus.Trim();
            detail.DmsRawStatus = dto.DmsStatus.Trim();
            detail.DmsLastSyncedAt = DateTime.UtcNow;

            var normStatus = dto.DmsStatus.Trim().ToLowerInvariant();
            if (normStatus == "delivered" || normStatus == "completed")
            {
                task.Status = Backend.Models.Enums.TaskStatus.Completed;
                task.UpdatedAt = DateTime.UtcNow;
                task.IsApproved = true;
            }
            else if (normStatus == "in transit" || normStatus == "dispatched" || normStatus == "picked up" || normStatus == "out for delivery" || normStatus == "for pickup" || normStatus == "assigned" || normStatus == "processing")
            {
                if (task.Status != Backend.Models.Enums.TaskStatus.Completed)
                {
                    task.Status = Backend.Models.Enums.TaskStatus.InProgress;
                    task.UpdatedAt = DateTime.UtcNow;
                }
            }
            else if (normStatus == "cancelled" || normStatus == "canceled")
            {
                task.Status = Backend.Models.Enums.TaskStatus.Cancelled;
                task.UpdatedAt = DateTime.UtcNow;
            }
            else if (normStatus == "pending" || normStatus == "not started")
            {
                task.Status = Backend.Models.Enums.TaskStatus.NotStarted;
                task.UpdatedAt = DateTime.UtcNow;
            }
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

        if (detail.Task == null) detail.Task = task;

        return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Success(
            MapToDTO(detail, driverUser), "Delivery details saved successfully");
    }

    public async Task<ApiResponseDTO<TaskDeliveryDetailResponseDTO>> GetDeliveryDetailAsync(Guid taskId)
    {
        var detail = await _db.TaskDeliveryDetails
            .Include(d => d.Task)
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.TaskId == taskId);

        if (detail == null)
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure("No delivery details found for this task");

        User? driverUser = null;
        if (!string.IsNullOrWhiteSpace(detail.CourierEmployeeId))
        {
            driverUser = await _db.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.EmployeeNumber == detail.CourierEmployeeId);
        }

        var podAttachment = await GetOrFetchPodAttachmentAsync(taskId, detail.DmsWaybillNo);

        return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Success(MapToDTO(detail, driverUser, podAttachment));
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

        var taskDisplayId = !string.IsNullOrWhiteSpace(task.TaskNumber)
            ? task.TaskNumber
            : task.Id.ToString()[..8].ToUpper();

        var specialInstructionsFormatted = !string.IsNullOrWhiteSpace(detail.SpecialInstructions)
            ? $"{detail.SpecialInstructions.Trim()} (Referenced to STARS Task ID: {taskDisplayId})"
            : $"(Referenced to STARS Task ID: {taskDisplayId})";

        var targetDeadline = task.RevisedDeadline ?? task.Deadline;
        var deadlineDateOnly = targetDeadline != default ? targetDeadline.ToString("yyyy-MM-dd") : null;

        var driverUser = !string.IsNullOrWhiteSpace(detail.CourierEmployeeId)
            ? await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.EmployeeNumber == detail.CourierEmployeeId)
            : null;
        var driverFullName = driverUser != null
            ? $"{driverUser.FirstName} {driverUser.LastName}".Trim()
            : (!string.IsNullOrWhiteSpace(detail.CourierFullName) ? detail.CourierFullName.Trim() : null);

        if (driverUser != null && string.IsNullOrWhiteSpace(detail.CourierFullName))
        {
            detail.CourierFullName = driverFullName;
        }

        var payload = new
        {
            starsTaskId = taskId,
            starsTaskNumber = taskDisplayId,
            taskStatus = "Approved",
            taskTitle = task.Title,
            senderName = senderName,
            senderAddress = senderAddress,
            senderContact = senderContact,
            recipientName = detail.RecipientName,
            recipientContact = detail.RecipientContact,
            deliveryAddress = detail.DeliveryAddress,
            area = string.IsNullOrWhiteSpace(detail.Area) ? "Manila" : detail.Area,
            packageDescription = string.IsNullOrWhiteSpace(detail.PackageDescription) ? task.Title : detail.PackageDescription,
            specialInstructions = specialInstructionsFormatted,
            encodedBy = creatorName,
            updatedBy = reviewerName ?? creatorName,
            priorityLevel = task.PriorityLevel.ToString(),
            courierEmployeeId = detail.CourierEmployeeId,
            driverEmployeeId = detail.CourierEmployeeId,
            driverId = detail.CourierEmployeeId,
            driverName = driverFullName,
            courierName = driverFullName,
            courierFullName = driverFullName,
            expectedDelivery = deadlineDateOnly,
            expectedDeliveryDate = deadlineDateOnly,
            deadline = deadlineDateOnly,
            assigneeReference = assigneeRef,
            taskCompletedAt = DateTime.UtcNow,
            coordinatorId = reviewerId?.ToString() ?? task.CreatedById.ToString(),
            existingOrderId = detail.DmsOrderId
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

            string? drvId = null;
            if (root.TryGetProperty("driverEmployeeId", out var deiProp) && deiProp.ValueKind == JsonValueKind.String)
                drvId = deiProp.GetString();
            else if (root.TryGetProperty("driverId", out var diProp) && diProp.ValueKind == JsonValueKind.String)
                drvId = diProp.GetString();
            else if (root.TryGetProperty("courierEmployeeId", out var ceiProp) && ceiProp.ValueKind == JsonValueKind.String)
                drvId = ceiProp.GetString();

            if (!string.IsNullOrWhiteSpace(drvId))
                detail.CourierEmployeeId = drvId.Trim();

            string? drvName = null;
            if (root.TryGetProperty("driverName", out var dnProp) && dnProp.ValueKind == JsonValueKind.String)
                drvName = dnProp.GetString();
            else if (root.TryGetProperty("courierName", out var cnProp) && cnProp.ValueKind == JsonValueKind.String)
                drvName = cnProp.GetString();
            else if (root.TryGetProperty("courierFullName", out var cfnProp) && cfnProp.ValueKind == JsonValueKind.String)
                drvName = cfnProp.GetString();
            else if (root.TryGetProperty("driverFullName", out var dfnProp) && dfnProp.ValueKind == JsonValueKind.String)
                drvName = dfnProp.GetString();

            if (!string.IsNullOrWhiteSpace(drvName))
                detail.CourierFullName = drvName.Trim();

            if (driverUser == null && !string.IsNullOrWhiteSpace(detail.CourierEmployeeId))
            {
                driverUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.EmployeeNumber == detail.CourierEmployeeId);
                if (driverUser != null && string.IsNullOrWhiteSpace(detail.CourierFullName))
                {
                    detail.CourierFullName = $"{driverUser.FirstName} {driverUser.LastName}".Trim();
                }
            }

            var normStatus = (status ?? "").Trim().ToLowerInvariant();
            if (normStatus == "delivered" || normStatus == "completed")
            {
                task.Status = Backend.Models.Enums.TaskStatus.Completed;
                task.UpdatedAt = DateTime.UtcNow;
                task.IsApproved = true;
                if (task.Assignments != null)
                {
                    foreach (var a in task.Assignments)
                    {
                        a.CompletionPercentage = 100;
                    }
                }

                if (!string.IsNullOrWhiteSpace(detail.DmsWaybillNo))
                {
                    var existingPerf = await _db.DmsDeliveryPerformances
                        .FirstOrDefaultAsync(p => p.WaybillNo == detail.DmsWaybillNo);

                    var completedAt = detail.DmsLastSyncedAt ?? DateTime.UtcNow;
                    var slaTarget = task.RevisedDeadline ?? task.Deadline;
                    var isOnTime = completedAt <= slaTarget;
                    var driverId = !string.IsNullOrWhiteSpace(detail.CourierEmployeeId)
                        ? detail.CourierEmployeeId
                        : "Field Courier";

                    if (existingPerf == null)
                    {
                        _db.DmsDeliveryPerformances.Add(new DmsDeliveryPerformance
                        {
                            WaybillNo = detail.DmsWaybillNo,
                            StarsTaskId = detail.TaskId,
                            DriverId = driverId,
                            CompletedAt = completedAt.Kind == DateTimeKind.Utc ? completedAt : completedAt.ToUniversalTime(),
                            SlaTargetAt = slaTarget.Kind == DateTimeKind.Utc ? slaTarget : slaTarget.ToUniversalTime(),
                            IsOnTime = isOnTime,
                            ReceivedAt = DateTime.UtcNow
                        });
                    }
                    else
                    {
                        existingPerf.DriverId = driverId;
                        existingPerf.CompletedAt = completedAt.Kind == DateTimeKind.Utc ? completedAt : completedAt.ToUniversalTime();
                        existingPerf.SlaTargetAt = slaTarget.Kind == DateTimeKind.Utc ? slaTarget : slaTarget.ToUniversalTime();
                        existingPerf.IsOnTime = isOnTime;
                    }
                }
            }
            else if (normStatus == "in transit" || normStatus == "dispatched" || normStatus == "picked up" || normStatus == "out for delivery" || normStatus == "for pickup" || normStatus == "assigned" || normStatus == "processing")
            {
                if (task.Status != Backend.Models.Enums.TaskStatus.Completed)
                {
                    task.Status = Backend.Models.Enums.TaskStatus.InProgress;
                    task.UpdatedAt = DateTime.UtcNow;
                }
            }

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
                MapToDTO(detail, driverUser), "Delivery order created successfully in DMS");
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

    public async Task<ApiResponseDTO<TaskDeliveryDetailResponseDTO>> SyncDeliveryStatusForTaskAsync(
        Guid taskId, Guid? triggeredByUserId = null)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task == null)
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure("Task not found");

        var detail = await _db.TaskDeliveryDetails.FirstOrDefaultAsync(d => d.TaskId == taskId);
        if (detail == null)
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure("No delivery details found for this task");

        // If already delivered, ensure STARS task status is aligned and return success
        var currentStatus = (detail.DmsRawStatus ?? detail.DmsStatus ?? "").Trim().ToLowerInvariant();
        if (currentStatus == "delivered" || currentStatus == "completed")
        {
            if (task.Status != Backend.Models.Enums.TaskStatus.Completed)
            {
                task.Status = Backend.Models.Enums.TaskStatus.Completed;
                task.UpdatedAt = DateTime.UtcNow;
                task.IsApproved = true;
                if (task.Assignments != null)
                {
                    foreach (var a in task.Assignments)
                    {
                        a.CompletionPercentage = 100;
                    }
                }
                detail.SyncStatus = "Synced";
                detail.SyncError = null;
                detail.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Success(
                MapToDTO(detail), "Delivery order is already marked as delivered");
        }

        if (!IsConfigured)
        {
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure("DMS integration is not configured");
        }

        try
        {
            var client = _http.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(
                HttpMethod.Get, $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/delivery-orders/{taskId}");
            request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var response = await client.SendAsync(request);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                // Order hasn't been created yet in DMS, dispatch/create it
                return await CreateDeliveryOrderForTaskAsync(taskId, triggeredByUserId);
            }

            var responseBody = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                // If outbound check fails but local detail is already Delivered, do not fail
                if (currentStatus == "delivered" || currentStatus == "completed")
                {
                    return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Success(
                        MapToDTO(detail), "Delivery order is already delivered");
                }

                detail.SyncStatus = "Failed";
                detail.SyncError = $"DMS responded with {(int)response.StatusCode}: {Truncate(responseBody)}";
                detail.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();

                return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure(detail.SyncError);
            }

            using var doc = JsonDocument.Parse(responseBody);
            var root = doc.RootElement;
            var waybillNo = root.TryGetProperty("waybillNo", out var wb) ? wb.GetString() : detail.DmsWaybillNo;
            var orderId = root.TryGetProperty("orderId", out var oid) ? oid.GetInt32() : detail.DmsOrderId;
            var status = root.TryGetProperty("status", out var st) ? st.GetString() : (detail.DmsRawStatus ?? detail.DmsStatus ?? "Pending");

            detail.DmsWaybillNo = waybillNo;
            detail.DmsOrderId = orderId;
            detail.DmsStatus = status;
            detail.DmsRawStatus = status;
            detail.DmsLastSyncedAt = DateTime.UtcNow;
            detail.SyncStatus = "Synced";
            detail.SyncError = null;
            detail.UpdatedAt = DateTime.UtcNow;

            string? drvId = null;
            if (root.TryGetProperty("driverEmployeeId", out var deiProp) && deiProp.ValueKind == JsonValueKind.String)
                drvId = deiProp.GetString();
            else if (root.TryGetProperty("driverId", out var diProp) && diProp.ValueKind == JsonValueKind.String)
                drvId = diProp.GetString();
            else if (root.TryGetProperty("courierEmployeeId", out var ceiProp) && ceiProp.ValueKind == JsonValueKind.String)
                drvId = ceiProp.GetString();

            if (!string.IsNullOrWhiteSpace(drvId))
                detail.CourierEmployeeId = drvId.Trim();

            string? drvName = null;
            if (root.TryGetProperty("driverName", out var dnProp) && dnProp.ValueKind == JsonValueKind.String)
                drvName = dnProp.GetString();
            else if (root.TryGetProperty("courierName", out var cnProp) && cnProp.ValueKind == JsonValueKind.String)
                drvName = cnProp.GetString();
            else if (root.TryGetProperty("courierFullName", out var cfnProp) && cfnProp.ValueKind == JsonValueKind.String)
                drvName = cfnProp.GetString();
            else if (root.TryGetProperty("driverFullName", out var dfnProp) && dfnProp.ValueKind == JsonValueKind.String)
                drvName = dfnProp.GetString();

            if (!string.IsNullOrWhiteSpace(drvName))
                detail.CourierFullName = drvName.Trim();

            User? driverUser = null;
            if (!string.IsNullOrWhiteSpace(detail.CourierEmployeeId))
            {
                driverUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.EmployeeNumber == detail.CourierEmployeeId);
                if (driverUser != null && string.IsNullOrWhiteSpace(detail.CourierFullName))
                {
                    detail.CourierFullName = $"{driverUser.FirstName} {driverUser.LastName}".Trim();
                }
            }

            var normStatus = (status ?? "").Trim().ToLowerInvariant();
            if (normStatus == "delivered" || normStatus == "completed")
            {
                task.Status = Backend.Models.Enums.TaskStatus.Completed;
                task.UpdatedAt = DateTime.UtcNow;
                task.IsApproved = true;
                if (task.Assignments != null)
                {
                    foreach (var a in task.Assignments)
                    {
                        a.CompletionPercentage = 100;
                    }
                }
            }
            else if (normStatus == "in transit" || normStatus == "out for delivery" || normStatus == "picked up" || normStatus == "assigned" || normStatus == "processing" || normStatus == "for pickup")
            {
                if (task.Status != Backend.Models.Enums.TaskStatus.Completed)
                {
                    task.Status = Backend.Models.Enums.TaskStatus.InProgress;
                    task.UpdatedAt = DateTime.UtcNow;
                }
            }
            else if (normStatus == "cancelled" || normStatus == "canceled")
            {
                task.Status = Backend.Models.Enums.TaskStatus.Cancelled;
                task.UpdatedAt = DateTime.UtcNow;
            }

            // Sync Proof of Delivery (POD) if returned in DMS response
            string? podCandidate = null;
            if (root.TryGetProperty("podImage", out var podP) && podP.ValueKind == JsonValueKind.String)
                podCandidate = podP.GetString();
            else if (root.TryGetProperty("podUrl", out var podU) && podU.ValueKind == JsonValueKind.String)
                podCandidate = podU.GetString();
            else if (root.TryGetProperty("potImage", out var potP) && potP.ValueKind == JsonValueKind.String)
                podCandidate = potP.GetString();

            if (!string.IsNullOrWhiteSpace(podCandidate))
            {
                var existingPod = await _db.TaskAttachments
                    .FirstOrDefaultAsync(a => a.TaskId == taskId && a.Description != null && a.Description.Contains("Proof of Delivery"));
                if (existingPod == null)
                {
                    var fn = ExtractFileName(podCandidate, $"POD_{waybillNo ?? taskId.ToString()[..8]}.jpg");
                    var ext = Path.GetExtension(fn);
                    _db.TaskAttachments.Add(new TaskAttachment
                    {
                        Id = Guid.NewGuid(),
                        TaskId = taskId,
                        FileName = fn,
                        FilePath = podCandidate,
                        FileSize = 0,
                        FileType = string.IsNullOrWhiteSpace(ext) ? ".jpg" : ext,
                        Description = "Proof of Delivery (POD) from DMS",
                        UploadedById = task.CreatedById,
                        CreatedAt = DateTime.UtcNow
                    });
                }
            }

            await _db.SaveChangesAsync();

            await _auditLogService.LogAsync(
                triggeredByUserId ?? task.CreatedById,
                AuditActionType.Update,
                "DeliveryOrder",
                taskId,
                null,
                $"DMS Delivery Order status synchronized: {status} (Waybill: {waybillNo})",
                "DmsIntegration");

            var podAttachment = await _db.TaskAttachments
                .AsNoTracking()
                .Where(a => a.TaskId == taskId && a.Description != null && a.Description.Contains("Proof of Delivery"))
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefaultAsync();

            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Success(
                MapToDTO(detail, driverUser, podAttachment), "Delivery status synchronized successfully from DMS");
        }
        catch (Exception ex)
        {
            if (currentStatus == "delivered" || currentStatus == "completed")
            {
                return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Success(
                    MapToDTO(detail), "Delivery order is already delivered");
            }

            detail.SyncStatus = "Failed";
            detail.SyncError = $"Error communicating with DMS: {ex.Message}";
            detail.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            _logger.LogError(ex, "Failed to sync DMS status for task {TaskId}", taskId);
            return ApiResponseDTO<TaskDeliveryDetailResponseDTO>.Failure(detail.SyncError);
        }
    }

    public async Task<ApiResponseDTO<bool>> ProcessStatusUpdateAsync(DmsStatusWebhookDTO dto)
    {
        var incomingDriver = !string.IsNullOrWhiteSpace(dto.DriverId)
            ? dto.DriverId.Trim()
            : (!string.IsNullOrWhiteSpace(dto.DriverEmployeeId)
                ? dto.DriverEmployeeId.Trim()
                : (!string.IsNullOrWhiteSpace(dto.CourierEmployeeId) ? dto.CourierEmployeeId.Trim() : null));

        var incomingDriverName = !string.IsNullOrWhiteSpace(dto.CourierFullName)
            ? dto.CourierFullName.Trim()
            : (!string.IsNullOrWhiteSpace(dto.DriverName) ? dto.DriverName.Trim() : null);

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
                TaskType = !string.IsNullOrWhiteSpace(dto.TaskType) ? dto.TaskType.Trim() : "Standard Delivery",
                PackageType = !string.IsNullOrWhiteSpace(dto.PackageType) ? dto.PackageType.Trim() : "Parcel",
                Weight = !string.IsNullOrWhiteSpace(dto.Weight) ? dto.Weight.Trim() : "—",
                ItemCount = dto.ItemCount.HasValue && dto.ItemCount > 0 ? dto.ItemCount.Value : 1,
                CourierEmployeeId = incomingDriver,
                CourierFullName = incomingDriverName,
                DmsWaybillNo = dto.WaybillNo,
                DmsStatus = dto.DmsStatus ?? dto.Status,
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

        detail.DmsStatus = dto.DmsStatus ?? dto.Status;
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
        if (!string.IsNullOrWhiteSpace(dto.TaskType))
            detail.TaskType = dto.TaskType.Trim();
        if (!string.IsNullOrWhiteSpace(dto.PackageType))
            detail.PackageType = dto.PackageType.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Weight))
            detail.Weight = dto.Weight.Trim();
        if (dto.ItemCount.HasValue && dto.ItemCount > 0)
            detail.ItemCount = dto.ItemCount.Value;

        if (!string.IsNullOrWhiteSpace(incomingDriver))
            detail.CourierEmployeeId = incomingDriver;

        if (!string.IsNullOrWhiteSpace(incomingDriverName))
            detail.CourierFullName = incomingDriverName;

        if (string.IsNullOrWhiteSpace(detail.CourierFullName) && !string.IsNullOrWhiteSpace(detail.CourierEmployeeId))
        {
            var driverUser = await _db.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.EmployeeNumber == detail.CourierEmployeeId);
            if (driverUser != null)
            {
                detail.CourierFullName = $"{driverUser.FirstName} {driverUser.LastName}".Trim();
            }
        }

        detail.UpdatedAt = DateTime.UtcNow;

        // Auto-synchronize Proof of Delivery (POD) if provided in webhook payload
        var podCandidate = !string.IsNullOrWhiteSpace(dto.PodUrl)
            ? dto.PodUrl
            : (!string.IsNullOrWhiteSpace(dto.PodImage) ? dto.PodImage : dto.PotImage);

        if (!string.IsNullOrWhiteSpace(podCandidate))
        {
            var existingPod = await _db.TaskAttachments
                .FirstOrDefaultAsync(a => a.TaskId == detail.TaskId && a.Description != null && a.Description.Contains("Proof of Delivery"));
            if (existingPod == null)
            {
                var fn = ExtractFileName(podCandidate, $"POD_{dto.WaybillNo ?? detail.TaskId.ToString()[..8]}.jpg");
                var ext = Path.GetExtension(fn);
                _db.TaskAttachments.Add(new TaskAttachment
                {
                    Id = Guid.NewGuid(),
                    TaskId = detail.TaskId,
                    FileName = fn,
                    FilePath = podCandidate,
                    FileSize = 0,
                    FileType = string.IsNullOrWhiteSpace(ext) ? ".jpg" : ext,
                    Description = "Proof of Delivery (POD) from DMS",
                    UploadedById = detail.Task?.CreatedById ?? Guid.Empty,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        // Auto-synchronize STARS Task status with DMS status
        var task = detail.Task ?? await _db.Tasks.Include(t => t.Assignments).FirstOrDefaultAsync(t => t.Id == detail.TaskId);
        if (task != null)
        {
            var normStatus = (dto.DmsStatus ?? dto.Status ?? "").Trim().ToLowerInvariant();
            if (normStatus == "delivered" || normStatus == "completed")
            {
                task.Status = Backend.Models.Enums.TaskStatus.Completed;
                task.UpdatedAt = DateTime.UtcNow;
                task.IsApproved = true;

                if (task.Assignments != null)
                {
                    foreach (var a in task.Assignments)
                    {
                        a.CompletionPercentage = 100;
                    }
                }

                // Automatically synchronize into DmsDeliveryPerformances for live SLA analytics
                if (!string.IsNullOrWhiteSpace(detail.DmsWaybillNo))
                {
                    var existingPerf = await _db.DmsDeliveryPerformances
                        .FirstOrDefaultAsync(p => p.WaybillNo == detail.DmsWaybillNo);

                    var completedAt = detail.DmsLastSyncedAt ?? DateTime.UtcNow;
                    var slaTarget = task.RevisedDeadline ?? task.Deadline;
                    var isOnTime = completedAt <= slaTarget;
                    var driverId = !string.IsNullOrWhiteSpace(detail.CourierEmployeeId)
                        ? detail.CourierEmployeeId
                        : (!string.IsNullOrWhiteSpace(dto.DriverId) ? dto.DriverId : "Field Courier");

                    if (existingPerf == null)
                    {
                        _db.DmsDeliveryPerformances.Add(new DmsDeliveryPerformance
                        {
                            WaybillNo = detail.DmsWaybillNo,
                            StarsTaskId = detail.TaskId,
                            DriverId = driverId,
                            CompletedAt = completedAt.Kind == DateTimeKind.Utc ? completedAt : completedAt.ToUniversalTime(),
                            SlaTargetAt = slaTarget.Kind == DateTimeKind.Utc ? slaTarget : slaTarget.ToUniversalTime(),
                            IsOnTime = isOnTime,
                            ReceivedAt = DateTime.UtcNow
                        });
                    }
                    else
                    {
                        existingPerf.DriverId = driverId;
                        existingPerf.CompletedAt = completedAt.Kind == DateTimeKind.Utc ? completedAt : completedAt.ToUniversalTime();
                        existingPerf.SlaTargetAt = slaTarget.Kind == DateTimeKind.Utc ? slaTarget : slaTarget.ToUniversalTime();
                        existingPerf.IsOnTime = isOnTime;
                    }
                }
            }
            else if (normStatus == "in transit" || normStatus == "dispatched" || normStatus == "picked up" || normStatus == "out for delivery" || normStatus == "for pickup" || normStatus == "assigned" || normStatus == "processing")
            {
                if (task.Status != Backend.Models.Enums.TaskStatus.Completed)
                {
                    task.Status = Backend.Models.Enums.TaskStatus.InProgress;
                    task.UpdatedAt = DateTime.UtcNow;
                }
            }
            else if (normStatus == "cancelled" || normStatus == "canceled")
            {
                task.Status = Backend.Models.Enums.TaskStatus.Cancelled;
                task.UpdatedAt = DateTime.UtcNow;
            }

            // Notify Coordinator and Manager
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

            var notifType = (normStatus == "completed" || normStatus == "delivered")
                ? NotificationType.TaskCompleted
                : NotificationType.TaskUpdated;

            var displayStatus = dto.DmsStatus ?? dto.Status;
            var title = $"Delivery Status: {displayStatus}";
            var message = $"Delivery for task '{task.Title}' (Waybill: {dto.WaybillNo}) updated to '{displayStatus}'"
                + (string.IsNullOrWhiteSpace(dto.FailureReason) ? "." : $". Reason: {dto.FailureReason}");

            await _notificationService.SendBulkNotificationAsync(distinctRecipients, notifType, title, message, task.Id);
        }

        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            null,
            AuditActionType.StatusChange,
            "TaskDeliveryDetail",
            detail.Id,
            null,
            $"DMS delivery status sync for waybill {dto.WaybillNo} updated to {dto.DmsStatus ?? dto.Status}",
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

        // Also merge delivered / completed items from TaskDeliveryDetails that have a waybill
        // so all existing and live delivered waybills immediately appear in delivery analytics
        var deliveredDetails = await _db.TaskDeliveryDetails
            .Include(d => d.Task)
            .AsNoTracking()
            .Where(d => !string.IsNullOrEmpty(d.DmsWaybillNo))
            .Where(d => d.DmsStatus == "Delivered" || d.DmsStatus == "Completed" ||
                        (d.Task != null && d.Task.Status == Backend.Models.Enums.TaskStatus.Completed))
            .ToListAsync();

        var existingWaybills = new HashSet<string>(list.Select(p => p.WaybillNo), StringComparer.OrdinalIgnoreCase);

        foreach (var d in deliveredDetails)
        {
            if (string.IsNullOrWhiteSpace(d.DmsWaybillNo)) continue;
            if (existingWaybills.Contains(d.DmsWaybillNo)) continue;

            var dDriver = !string.IsNullOrWhiteSpace(d.CourierEmployeeId) ? d.CourierEmployeeId : "Field Courier";
            if (!string.IsNullOrWhiteSpace(driverId) && !string.Equals(dDriver, driverId.Trim(), StringComparison.OrdinalIgnoreCase))
                continue;

            var completedAt = d.DmsLastSyncedAt ?? d.UpdatedAt ?? d.CreatedAt;
            var slaTarget = d.Task?.RevisedDeadline ?? d.Task?.Deadline ?? d.CreatedAt.AddHours(24);
            var isOnTime = completedAt <= slaTarget;

            list.Add(new DmsDeliveryPerformance
            {
                WaybillNo = d.DmsWaybillNo,
                StarsTaskId = d.TaskId,
                DriverId = dDriver,
                CompletedAt = completedAt,
                SlaTargetAt = slaTarget,
                IsOnTime = isOnTime,
                ReceivedAt = d.CreatedAt
            });
            existingWaybills.Add(d.DmsWaybillNo);
        }

        list = list.OrderByDescending(p => p.CompletedAt).ToList();

        var total = list.Count;
        var onTime = list.Count(p => p.IsOnTime);
        var late = total - onTime;
        var pct = total > 0 ? Math.Round((double)onTime / total * 100, 2) : 100.0;

        // Resolve driver names in a single batch query (Zero N+1)
        var distinctDriverIds = list
            .Select(p => p.DriverId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();

        var driverUsers = await _db.Users
            .AsNoTracking()
            .Where(u => distinctDriverIds.Contains(u.EmployeeNumber))
            .ToListAsync();

        var driverDict = driverUsers.ToDictionary(u => u.EmployeeNumber, StringComparer.OrdinalIgnoreCase);

        var records = list.Select(p =>
        {
            string? driverName = null;
            bool? driverIsActive = null;

            if (!string.IsNullOrWhiteSpace(p.DriverId) && driverDict.TryGetValue(p.DriverId, out var u))
            {
                driverName = $"{u.FirstName} {u.LastName}".Trim();
                driverIsActive = u.IsActive && !u.IsDeactivated;
            }
            else if (!string.IsNullOrWhiteSpace(p.DriverId))
            {
                driverName = p.DriverId;
            }

            return new DmsPerformanceRecordDTO
            {
                WaybillNo = p.WaybillNo,
                StarsTaskId = p.StarsTaskId ?? Guid.Empty,
                DriverId = p.DriverId,
                DriverName = driverName,
                DriverIsActive = driverIsActive,
                CompletedAt = p.CompletedAt,
                SlaTargetAt = p.SlaTargetAt,
                IsOnTime = p.IsOnTime
            };
        }).ToList();

        var dto = new DmsPerformanceSummaryDTO
        {
            TotalDeliveries = total,
            OnTimeCount = onTime,
            LateCount = late,
            OnTimePercentage = pct,
            DriverFilter = driverId,
            Records = records
        };

        return ApiResponseDTO<DmsPerformanceSummaryDTO>.Success(dto);
    }

    public async Task<ApiResponseDTO<List<DmsDeliveryItemDTO>>> GetAllDeliveriesAsync()
    {
        var details = await _db.TaskDeliveryDetails
            .Include(d => d.Task)
            .OrderByDescending(d => d.CreatedAt)
            .ThenByDescending(d => d.Task != null ? d.Task.CreatedAt : d.CreatedAt)
            .ThenByDescending(d => d.DmsOrderId ?? 0)
            .ToListAsync();

        var courierIds = details
            .Select(d => d.CourierEmployeeId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();

        var taskIds = details.Select(d => d.TaskId).ToList();

        var driverUsers = await _db.Users
            .AsNoTracking()
            .Where(u => courierIds.Contains(u.EmployeeNumber))
            .ToListAsync();
        var driverDict = driverUsers
            .Where(u => !string.IsNullOrWhiteSpace(u.EmployeeNumber))
            .GroupBy(u => u.EmployeeNumber, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var podAttachments = await _db.TaskAttachments
            .AsNoTracking()
            .Where(a => taskIds.Contains(a.TaskId) && a.Description != null && a.Description.Contains("Proof of Delivery"))
            .ToListAsync();
        var podDict = podAttachments
            .GroupBy(a => a.TaskId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(a => a.CreatedAt).First());

        var list = details.Select(d =>
        {
            string? courierFullName = null;
            bool? courierIsActive = null;

            if (!string.IsNullOrWhiteSpace(d.CourierEmployeeId) && driverDict.TryGetValue(d.CourierEmployeeId, out var u))
            {
                courierFullName = $"{u.FirstName} {u.LastName}".Trim();
                courierIsActive = u.IsActive && !u.IsDeactivated;
            }
            else if (!string.IsNullOrWhiteSpace(d.CourierFullName))
            {
                courierFullName = d.CourierFullName.Trim();
                courierIsActive = null;
            }
            else if (string.IsNullOrWhiteSpace(d.CourierEmployeeId))
            {
                courierFullName = "Unassigned";
                courierIsActive = null;
            }
            else
            {
                courierFullName = d.CourierEmployeeId;
                courierIsActive = null;
            }

            string? podUrl = null;
            DateTime? podUploadedAt = null;
            if (podDict.TryGetValue(d.TaskId, out var pod))
            {
                podUrl = $"/api/dms-integration/tasks/{d.TaskId}/pod/download?inline=true";
                podUploadedAt = pod.CreatedAt;
            }

            var taskDeadline = d.Task?.RevisedDeadline ?? d.Task?.Deadline;

            return new DmsDeliveryItemDTO
            {
                TaskId = d.TaskId,
                TaskTitle = d.Task?.Title ?? "Delivery Task",
                TaskNumber = d.Task?.TaskNumber,
                TaskReferenceNumber = d.Task?.TaskNumber,
                RecipientName = d.RecipientName,
                RecipientContact = d.RecipientContact,
                DeliveryAddress = d.DeliveryAddress,
                Area = d.Area,
                PackageDescription = d.PackageDescription,
                SenderAddress = d.SenderAddress,
                SpecialInstructions = d.SpecialInstructions,
                CourierEmployeeId = d.CourierEmployeeId,
                CourierFullName = courierFullName,
                CourierIsActive = courierIsActive,
                PodUrl = podUrl,
                PodUploadedAt = podUploadedAt,
                DmsWaybillNo = d.DmsWaybillNo,
                DmsOrderId = d.DmsOrderId,
                DmsStatus = d.DmsStatus ?? "Pending",
                DmsRawStatus = d.DmsRawStatus ?? d.DmsStatus ?? "Pending",
                DmsLastSyncedAt = d.DmsLastSyncedAt,
                DmsFailureReason = d.DmsFailureReason,
                DmsLatitude = (double?)d.DmsLatitude,
                DmsLongitude = (double?)d.DmsLongitude,
                SyncStatus = d.SyncStatus ?? "Synced",
                CreatedAt = d.CreatedAt,
                UpdatedAt = d.UpdatedAt,
                ExpectedDelivery = taskDeadline,
                ExpectedDeliveryDate = taskDeadline.HasValue ? taskDeadline.Value.ToString("yyyy-MM-dd") : null,
                TaskType = !string.IsNullOrWhiteSpace(d.TaskType) ? d.TaskType : "Standard Delivery",
                PackageType = !string.IsNullOrWhiteSpace(d.PackageType) ? d.PackageType : "Parcel",
                Weight = !string.IsNullOrWhiteSpace(d.Weight) ? d.Weight : "—",
                ItemCount = d.ItemCount.HasValue && d.ItemCount.Value > 0 ? d.ItemCount.Value : 1,
            };
        }).ToList();

        var existingWaybills = new HashSet<string>(
            list.Where(x => !string.IsNullOrWhiteSpace(x.DmsWaybillNo)).Select(x => x.DmsWaybillNo!),
            StringComparer.OrdinalIgnoreCase);
        var existingDmsOrderIds = new HashSet<int>(
            list.Where(x => x.DmsOrderId.HasValue).Select(x => x.DmsOrderId!.Value));
        var existingTaskIds = new HashSet<Guid>(
            list.Where(x => x.TaskId != Guid.Empty).Select(x => x.TaskId));

        // 1. Augment with active pre-delivery orders from DMS so all shipments appear in Delivery Summary
        try
        {
            var pendingRes = await GetPendingOrdersAsync();
            if (pendingRes.IsSuccess && pendingRes.Data != null && pendingRes.Data.Count > 0)
            {
                var pendingOrders = pendingRes.Data;
                var pendingWaybills = pendingOrders
                    .Select(o => o.WaybillNo)
                    .Where(w => !string.IsNullOrWhiteSpace(w))
                    .Distinct()
                    .ToList();

                var candidateTasks = await _db.Tasks
                    .AsNoTracking()
                    .Where(t => t.Title.StartsWith("[Pre-Delivery]") || (t.Description != null && t.Description.Contains("Pre-delivery")))
                    .ToListAsync();

                var matchingTasks = candidateTasks
                    .Where(t => pendingWaybills.Any(w =>
                        (!string.IsNullOrEmpty(t.Title) && t.Title.Contains(w, StringComparison.OrdinalIgnoreCase)) ||
                        (!string.IsNullOrEmpty(t.Description) && t.Description.Contains(w, StringComparison.OrdinalIgnoreCase))))
                    .ToList();

                // Batch resolve drivers from pending orders if unmapped in driverDict
                var pendingDriverIds = pendingOrders
                    .Select(o => o.DriverEmployeeId)
                    .Where(id => !string.IsNullOrWhiteSpace(id) && !driverDict.ContainsKey(id))
                    .Distinct()
                    .ToList();

                if (pendingDriverIds.Count > 0)
                {
                    var extraDrivers = await _db.Users
                        .AsNoTracking()
                        .Where(u => pendingDriverIds.Contains(u.EmployeeNumber))
                        .ToListAsync();
                    foreach (var ed in extraDrivers)
                    {
                        if (!string.IsNullOrWhiteSpace(ed.EmployeeNumber) && !driverDict.ContainsKey(ed.EmployeeNumber))
                        {
                            driverDict[ed.EmployeeNumber] = ed;
                        }
                    }
                }

                foreach (var order in pendingOrders)
                {
                    if (existingDmsOrderIds.Contains(order.OrderId)) continue;
                    if (!string.IsNullOrWhiteSpace(order.WaybillNo) && existingWaybills.Contains(order.WaybillNo)) continue;

                    var matchedTask = matchingTasks.FirstOrDefault(t =>
                        !string.IsNullOrWhiteSpace(order.WaybillNo) &&
                        (t.Title.Contains(order.WaybillNo) || t.Description.Contains(order.WaybillNo)));

                    string? courierName = !string.IsNullOrWhiteSpace(order.CourierFullName)
                        ? order.CourierFullName.Trim()
                        : (!string.IsNullOrWhiteSpace(order.DriverName) ? order.DriverName.Trim() : null);

                    bool? courierActive = order.DriverIsActive;

                    if (string.IsNullOrWhiteSpace(courierName) && !string.IsNullOrWhiteSpace(order.DriverEmployeeId))
                    {
                        if (driverDict.TryGetValue(order.DriverEmployeeId, out var u))
                        {
                            courierName = $"{u.FirstName} {u.LastName}".Trim();
                            courierActive = u.IsActive && !u.IsDeactivated;
                        }
                    }

                    DateTime createdAt = order.OrderDate != default ? order.OrderDate : DateTime.UtcNow;
                    DateTime? expDel = order.ExpectedDelivery != default ? order.ExpectedDelivery : null;

                    var item = new DmsDeliveryItemDTO
                    {
                        TaskId = matchedTask?.Id ?? Guid.Empty,
                        TaskTitle = matchedTask?.Title ?? $"[Pre-Delivery] Delivery to {order.RecipientName} - Waybill {order.WaybillNo}",
                        TaskNumber = matchedTask?.TaskNumber,
                        TaskReferenceNumber = matchedTask?.TaskNumber,
                        RecipientName = order.RecipientName,
                        RecipientContact = order.RecipientContact,
                        DeliveryAddress = order.RecipientAddress,
                        Area = order.Area,
                        PackageDescription = order.PackageDescription,
                        SenderAddress = order.SenderAddress,
                        SpecialInstructions = order.SpecialInstructions,
                        CourierEmployeeId = order.DriverEmployeeId,
                        CourierFullName = courierName,
                        CourierIsActive = courierActive,
                        DmsWaybillNo = order.WaybillNo,
                        DmsOrderId = order.OrderId,
                        DmsStatus = string.IsNullOrWhiteSpace(order.Status) ? "Pending" : order.Status,
                        DmsRawStatus = order.Status ?? "Pending",
                        SyncStatus = "Synced",
                        CreatedAt = createdAt,
                        ExpectedDelivery = matchedTask?.RevisedDeadline ?? matchedTask?.Deadline ?? expDel,
                        ExpectedDeliveryDate = order.ExpectedDeliveryDate ?? (expDel.HasValue ? expDel.Value.ToString("yyyy-MM-dd") : null),
                        TaskType = !string.IsNullOrWhiteSpace(order.TaskType) ? order.TaskType : "Standard Delivery",
                        PackageType = !string.IsNullOrWhiteSpace(order.PackageType) ? order.PackageType : "Parcel",
                        Weight = !string.IsNullOrWhiteSpace(order.Weight) ? order.Weight : "—",
                        ItemCount = order.ItemCount > 0 ? order.ItemCount : 1,
                    };

                    list.Add(item);
                    if (!string.IsNullOrWhiteSpace(order.WaybillNo)) existingWaybills.Add(order.WaybillNo);
                    existingDmsOrderIds.Add(order.OrderId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to augment deliveries with pending DMS orders in GetAllDeliveriesAsync");
        }

        // 2. Augment with any existing operational pre-delivery tasks in STARS that lack TaskDeliveryDetail rows
        try
        {
            var deliveryTasks = await _db.Tasks
                .AsNoTracking()
                .Where(t => !existingTaskIds.Contains(t.Id) &&
                            (t.Title.StartsWith("[Pre-Delivery]") || (t.Description != null && t.Description.Contains("Pre-delivery operational validation"))))
                .ToListAsync();

            foreach (var task in deliveryTasks)
            {
                string? waybill = null;
                var wbMatch = System.Text.RegularExpressions.Regex.Match(task.Title, @"Waybill\s+([A-Za-z0-9\-_]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (wbMatch.Success) waybill = wbMatch.Groups[1].Value.Trim();

                if (!string.IsNullOrEmpty(waybill) && existingWaybills.Contains(waybill)) continue;

                string recipient = "Operations Dispatch";
                var recMatch = System.Text.RegularExpressions.Regex.Match(task.Title, @"Delivery to\s+([^\-]+)\s+-", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (recMatch.Success) recipient = recMatch.Groups[1].Value.Trim();

                var item = new DmsDeliveryItemDTO
                {
                    TaskId = task.Id,
                    TaskTitle = task.Title,
                    TaskNumber = task.TaskNumber,
                    TaskReferenceNumber = task.TaskNumber,
                    RecipientName = recipient,
                    RecipientContact = "—",
                    DeliveryAddress = "Metro Manila",
                    PackageDescription = task.Title,
                    DmsWaybillNo = waybill,
                    DmsStatus = task.Status == Backend.Models.Enums.TaskStatus.Completed ? "Delivered" : "In Transit",
                    DmsRawStatus = task.Status == Backend.Models.Enums.TaskStatus.Completed ? "Delivered" : "In Transit",
                    SyncStatus = "Synced",
                    CreatedAt = task.CreatedAt,
                    ExpectedDelivery = task.RevisedDeadline ?? task.Deadline,
                    ExpectedDeliveryDate = (task.RevisedDeadline ?? task.Deadline).ToString("yyyy-MM-dd"),
                    TaskType = "Standard Delivery",
                    PackageType = "Parcel",
                    Weight = "—",
                    ItemCount = 1,
                };

                list.Add(item);
                if (!string.IsNullOrEmpty(waybill)) existingWaybills.Add(waybill);
                existingTaskIds.Add(task.Id);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to augment deliveries with operational tasks in GetAllDeliveriesAsync");
        }

        list = list
            .OrderByDescending(d => d.CreatedAt)
            .ThenByDescending(d => d.DmsOrderId ?? 0)
            .ToList();

        return ApiResponseDTO<List<DmsDeliveryItemDTO>>.Success(list);
    }

    public async Task<ApiResponseDTO<List<DmsPendingOrderDTO>>> GetPendingOrdersAsync()
    {
        if (!IsConfigured)
        {
            return ApiResponseDTO<List<DmsPendingOrderDTO>>.Success(new List<DmsPendingOrderDTO>());
        }

        try
        {
            var client = _http.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(
                HttpMethod.Get, $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/pending-orders");
            request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                return ApiResponseDTO<List<DmsPendingOrderDTO>>.Success(new List<DmsPendingOrderDTO>());
            }

            var orders = await response.Content.ReadFromJsonAsync<List<DmsPendingOrderDTO>>() ?? new List<DmsPendingOrderDTO>();

            // Exclude orders that already have an operational task created in STARS
            var linkedDmsOrderIds = await _db.TaskDeliveryDetails
                .Where(d => d.DmsOrderId.HasValue)
                .Select(d => d.DmsOrderId!.Value)
                .ToListAsync();

            var pending = orders
                .Where(o => !linkedDmsOrderIds.Contains(o.OrderId))
                .Where(o => !IsMockOrder(o))
                .OrderByDescending(o => o.OrderDate)
                .ThenByDescending(o => o.OrderId)
                .ToList();

            // Normalize driver identification and date-only deadlines
            var driverIds = pending
                .Select(o => o.DriverEmployeeId ?? o.DriverId)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            Dictionary<string, User> driverDict = new(StringComparer.OrdinalIgnoreCase);
            if (driverIds.Count > 0)
            {
                var driverUsers = await _db.Users
                    .AsNoTracking()
                    .Where(u => driverIds.Contains(u.EmployeeNumber))
                    .ToListAsync();
                driverDict = driverUsers.ToDictionary(u => u.EmployeeNumber, StringComparer.OrdinalIgnoreCase);
            }

            foreach (var order in pending)
            {
                // Normalize date-only deadline to UTC midnight
                if (order.ExpectedDelivery != default)
                {
                    order.ExpectedDelivery = DateTime.SpecifyKind(order.ExpectedDelivery.Date, DateTimeKind.Utc);
                    order.ExpectedDeliveryDate = order.ExpectedDelivery.ToString("yyyy-MM-dd");
                }
                if (order.OrderDate != default)
                {
                    order.OrderDate = DateTime.SpecifyKind(order.OrderDate.Date, DateTimeKind.Utc);
                }

                // Driver mapping using employee ID as primary key
                var driverEmpId = (!string.IsNullOrWhiteSpace(order.DriverEmployeeId) ? order.DriverEmployeeId : order.DriverId)?.Trim();
                if (!string.IsNullOrWhiteSpace(driverEmpId))
                {
                    order.DriverEmployeeId = driverEmpId;
                    order.DriverId = driverEmpId;

                    if (driverDict.TryGetValue(driverEmpId, out var u))
                    {
                        order.DriverName = $"{u.FirstName} {u.LastName}".Trim();
                        order.DriverIsActive = u.IsActive && !u.IsDeactivated;
                    }
                    else if (!string.IsNullOrWhiteSpace(order.DriverName) && !string.Equals(order.DriverName.Trim(), driverEmpId, StringComparison.OrdinalIgnoreCase))
                    {
                        // Preserve DMS driverName/CourierFullName if provided in payload and not just an echo of driverEmpId
                        order.DriverName = order.DriverName.Trim();
                        order.DriverIsActive = null;
                    }
                    else
                    {
                        // Fallback to employee ID alone when user name is not found in STARS
                        order.DriverName = driverEmpId;
                        order.DriverIsActive = null;
                    }
                }
                else
                {
                    if (!string.IsNullOrWhiteSpace(order.DriverName) && !order.DriverName.Trim().Equals("Unassigned", StringComparison.OrdinalIgnoreCase))
                    {
                        order.DriverEmployeeId = null;
                        order.DriverId = null;
                        order.DriverName = order.DriverName.Trim();
                        order.DriverIsActive = null;
                    }
                    else
                    {
                        order.DriverEmployeeId = null;
                        order.DriverId = null;
                        order.DriverName = "Unassigned";
                        order.DriverIsActive = null;
                    }
                }
            }

            return ApiResponseDTO<List<DmsPendingOrderDTO>>.Success(pending);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to retrieve pending orders from DMS");
            return ApiResponseDTO<List<DmsPendingOrderDTO>>.Success(new List<DmsPendingOrderDTO>());
        }
    }

    private static bool IsMockOrder(DmsPendingOrderDTO o)
    {
        if (o == null) return false;
        var pattern = @"\b(mock|sample|dummy|test\s*order|test\s*recipient|dummy\s*data)\b";
        var regex = new System.Text.RegularExpressions.Regex(pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return regex.IsMatch(o.RecipientName ?? "") ||
               regex.IsMatch(o.ClientName ?? "") ||
               regex.IsMatch(o.WaybillNo ?? "") ||
               regex.IsMatch(o.PackageDescription ?? "") ||
               regex.IsMatch(o.SpecialInstructions ?? "");
    }

    private static TaskDeliveryDetailResponseDTO MapToDTO(
        TaskDeliveryDetail d,
        User? driverUser = null,
        TaskAttachment? podAttachment = null)
    {
        string? courierFullName = null;
        bool? courierIsActive = null;

        if (driverUser != null)
        {
            courierFullName = $"{driverUser.FirstName} {driverUser.LastName}".Trim();
            courierIsActive = driverUser.IsActive && !driverUser.IsDeactivated;
        }
        else if (!string.IsNullOrWhiteSpace(d.CourierFullName))
        {
            courierFullName = d.CourierFullName.Trim();
            courierIsActive = null;
        }
        else if (string.IsNullOrWhiteSpace(d.CourierEmployeeId))
        {
            courierFullName = "Unassigned";
            courierIsActive = null;
        }
        else
        {
            courierFullName = d.CourierEmployeeId;
            courierIsActive = null;
        }

        var taskDeadline = d.Task?.RevisedDeadline ?? d.Task?.Deadline;

        var dto = new TaskDeliveryDetailResponseDTO
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
            CourierFullName = courierFullName,
            CourierIsActive = courierIsActive,
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
            UpdatedAt = d.UpdatedAt,
            ExpectedDelivery = taskDeadline,
            ExpectedDeliveryDate = taskDeadline.HasValue ? taskDeadline.Value.ToString("yyyy-MM-dd") : null,
            TaskType = !string.IsNullOrWhiteSpace(d.TaskType) ? d.TaskType : "Standard Delivery",
            PackageType = !string.IsNullOrWhiteSpace(d.PackageType) ? d.PackageType : "Parcel",
            Weight = !string.IsNullOrWhiteSpace(d.Weight) ? d.Weight : "—",
            ItemCount = d.ItemCount.HasValue && d.ItemCount.Value > 0 ? d.ItemCount.Value : 1
        };

        if (podAttachment != null)
        {
            dto.PodUrl = $"/api/dms-integration/tasks/{d.TaskId}/pod/download?inline=true";
            dto.PodFileName = podAttachment.FileName;
            dto.PodUploadedAt = podAttachment.CreatedAt;
            if (podAttachment.UploadedBy != null)
            {
                dto.PodUploadedBy = $"{podAttachment.UploadedBy.FirstName} {podAttachment.UploadedBy.LastName}".Trim();
            }
            else if (driverUser != null)
            {
                dto.PodUploadedBy = $"{driverUser.FirstName} {driverUser.LastName}".Trim();
            }
            else
            {
                dto.PodUploadedBy = "Field Courier";
            }
        }

        return dto;
    }

    private static string Truncate(string s) => s.Length <= 300 ? s : s[..300];

    public async Task<ApiResponseDTO<bool>> ProvisionEmployeeAsync(
        string employeeId,
        string name,
        string? role,
        string? systemAccess,
        string? temporaryPassword,
        List<string>? areas,
        string? status = "Active")
    {
        if (!IsConfigured)
        {
            _logger.LogWarning("DMS integration is not configured, skipping employee dispatch for {EmployeeId}", employeeId);
            return ApiResponseDTO<bool>.Failure("DMS integration is not configured");
        }

        var effectiveRole = string.IsNullOrWhiteSpace(role) ? "Encoder" : role;
        string canonicalAccess = effectiveRole.ToLowerInvariant() switch
        {
            "admin" => "All Systems",
            "driver" => "Delivery Tracker",
            "client" => "Client Portal",
            _ => "Operations"
        };

        var payload = new
        {
            employeeId,
            name,
            role = effectiveRole,
            systemAccess = !string.IsNullOrWhiteSpace(systemAccess) && systemAccess != "Both" && systemAccess != "Mobile" && systemAccess != "Web"
                ? systemAccess
                : canonicalAccess,
            status = string.IsNullOrWhiteSpace(status) ? "Active" : status,
            temporaryPassword,
            areas = areas ?? new List<string>()
        };

        try
        {
            var client = _http.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(
                HttpMethod.Post, $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/provision-employee")
            {
                Content = JsonContent.Create(payload)
            };
            request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var response = await client.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("DMS employee provision failed for {EmployeeId}: {Status} {Body}", employeeId, (int)response.StatusCode, Truncate(responseBody));
                return ApiResponseDTO<bool>.Failure($"DMS provision failed: {(int)response.StatusCode}");
            }

            _logger.LogInformation("Successfully provisioned employee {EmployeeId} to DMS", employeeId);
            return ApiResponseDTO<bool>.Success(true, "Employee provisioned to DMS successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception while provisioning employee {EmployeeId} to DMS", employeeId);
            return ApiResponseDTO<bool>.Failure($"DMS provision error: {ex.Message}");
        }
    }

    public async Task<ApiResponseDTO<bool>> CheckEmployeeExistsInDmsAsync(string employeeId)
    {
        if (!IsConfigured)
        {
            return ApiResponseDTO<bool>.Success(false, "DMS integration is not configured");
        }

        try
        {
            var client = _http.CreateClient(HttpClientName);
            client.Timeout = TimeSpan.FromSeconds(10);

            var endpoint = $"{_settings.BaseUrl.TrimEnd('/')}/api/integration/stars/check-employee-exists?employeeId={Uri.EscapeDataString(employeeId.Trim())}";
            using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
            request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("DMS check-employee-exists returned {Status}", (int)response.StatusCode);
                return ApiResponseDTO<bool>.Success(false, "DMS check skipped");
            }

            var json = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            if (json.TryGetProperty("exists", out var existsProp) && existsProp.GetBoolean())
            {
                return ApiResponseDTO<bool>.Success(true, "Employee ID already exists in DMS.");
            }

            return ApiResponseDTO<bool>.Success(false, "Available");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to query DMS for employee existence check");
            return ApiResponseDTO<bool>.Success(false, $"DMS check skipped: {ex.Message}");
        }
    }

    public async Task<ApiResponseDTO<TaskPodResponseDTO>> GetTaskPodAsync(Guid taskId, Guid requestUserId, UserRole requestUserRole)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task == null)
            return ApiResponseDTO<TaskPodResponseDTO>.Failure("Task not found");

        // Enforce task RBAC matching TaskService.GetByIdAsync
        if (requestUserRole == UserRole.Dispatcher ||
            requestUserRole == UserRole.Encoder ||
            requestUserRole == UserRole.Courier ||
            requestUserRole == UserRole.Accountant)
        {
            if (task.IsConfidential)
                return ApiResponseDTO<TaskPodResponseDTO>.Failure("Access denied: task is confidential");

            var isAssigned = task.Assignments.Any(a => a.AssignedUserId == requestUserId);
            if (!isAssigned)
                return ApiResponseDTO<TaskPodResponseDTO>.Failure("Access denied: task is not assigned to you");
        }

        var detail = await _db.TaskDeliveryDetails
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.TaskId == taskId);

        var attachment = await GetOrFetchPodAttachmentAsync(taskId, detail?.DmsWaybillNo);

        if (attachment == null)
        {
            return ApiResponseDTO<TaskPodResponseDTO>.Success(new TaskPodResponseDTO
            {
                TaskId = taskId,
                WaybillNo = detail?.DmsWaybillNo,
                PodUrl = null,
                DownloadUrl = null
            }, "No Proof of Delivery found for this task");
        }

        User? uploader = null;
        if (attachment.UploadedById != Guid.Empty)
        {
            uploader = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == attachment.UploadedById);
        }

        string uploadedByName;
        if (uploader != null)
        {
            uploadedByName = $"{uploader.FirstName} {uploader.LastName}".Trim();
        }
        else if (!string.IsNullOrWhiteSpace(detail?.CourierEmployeeId))
        {
            var courier = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.EmployeeNumber == detail.CourierEmployeeId);
            uploadedByName = courier != null
                ? $"{courier.FirstName} {courier.LastName}".Trim()
                : (!string.IsNullOrWhiteSpace(detail?.CourierFullName) ? detail.CourierFullName.Trim() : "Field Courier");
        }
        else if (!string.IsNullOrWhiteSpace(detail?.CourierFullName))
        {
            uploadedByName = detail.CourierFullName.Trim();
        }
        else
        {
            uploadedByName = "Field Courier";
        }

        var ext = !string.IsNullOrWhiteSpace(attachment.FileType) ? attachment.FileType : Path.GetExtension(attachment.FileName);

        var dto = new TaskPodResponseDTO
        {
            TaskId = taskId,
            WaybillNo = detail?.DmsWaybillNo,
            PodUrl = $"/api/dms-integration/tasks/{taskId}/pod/download?inline=true",
            DownloadUrl = $"/api/dms-integration/tasks/{taskId}/pod/download",
            FileName = attachment.FileName,
            FileType = ext,
            FileSize = attachment.FileSize,
            UploadedAt = attachment.CreatedAt,
            UploadedByName = uploadedByName
        };

        return ApiResponseDTO<TaskPodResponseDTO>.Success(dto);
    }

    public async Task<(byte[]? FileBytes, string ContentType, string FileName)?> DownloadTaskPodAsync(
        Guid taskId, Guid requestUserId, UserRole requestUserRole)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task == null) return null;

        // Enforce task RBAC matching TaskService.GetByIdAsync
        if (requestUserRole == UserRole.Dispatcher ||
            requestUserRole == UserRole.Encoder ||
            requestUserRole == UserRole.Courier ||
            requestUserRole == UserRole.Accountant)
        {
            if (task.IsConfidential) return null;

            var isAssigned = task.Assignments.Any(a => a.AssignedUserId == requestUserId);
            if (!isAssigned) return null;
        }

        var detail = await _db.TaskDeliveryDetails
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.TaskId == taskId);

        var attachment = await GetOrFetchPodAttachmentAsync(taskId, detail?.DmsWaybillNo);
        if (attachment == null) return null;

        var filePath = attachment.FilePath;
        var fileName = attachment.FileName;
        var contentType = GetContentType(fileName);

        // 1. Data URI / base64
        if (filePath.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            var commaIdx = filePath.IndexOf(',');
            if (commaIdx >= 0)
            {
                var header = filePath[..commaIdx];
                var base64Data = filePath[(commaIdx + 1)..];
                var mimeMatch = System.Text.RegularExpressions.Regex.Match(header, @"data:([^;]+);base64");
                if (mimeMatch.Success) contentType = mimeMatch.Groups[1].Value;

                var bytes = Convert.FromBase64String(base64Data);
                return (bytes, contentType, fileName);
            }
        }

        // 2. Local file path
        if (File.Exists(filePath))
        {
            var bytes = await File.ReadAllBytesAsync(filePath);
            return (bytes, contentType, fileName);
        }

        // 3. Remote URL or relative DMS path
        string remoteUrl = filePath;
        if (!filePath.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !filePath.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            if (IsConfigured)
            {
                remoteUrl = $"{_settings.BaseUrl.TrimEnd('/')}/{filePath.TrimStart('/')}";
            }
            else
            {
                return null;
            }
        }

        try
        {
            var client = _http.CreateClient(HttpClientName);
            client.Timeout = TimeSpan.FromSeconds(15);
            using var request = new HttpRequestMessage(HttpMethod.Get, remoteUrl);
            if (IsConfigured && remoteUrl.StartsWith(_settings.BaseUrl, StringComparison.OrdinalIgnoreCase))
            {
                request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);
            }

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to download POD from remote URL {Url}: {Status}", remoteUrl, response.StatusCode);
                return null;
            }

            var bytes = await response.Content.ReadAsByteArrayAsync();
            var mediaType = response.Content.Headers.ContentType?.MediaType;
            if (!string.IsNullOrWhiteSpace(mediaType) && mediaType != "application/octet-stream")
            {
                contentType = mediaType;
            }

            return (bytes, contentType, fileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception while downloading POD file from {Url}", remoteUrl);
            return null;
        }
    }

    private async Task<TaskAttachment?> GetOrFetchPodAttachmentAsync(Guid taskId, string? waybillNo = null)
    {
        var attachment = await _db.TaskAttachments
            .Include(a => a.UploadedBy)
            .Where(a => a.TaskId == taskId && a.Description != null && a.Description.Contains("Proof of Delivery"))
            .OrderByDescending(a => a.CreatedAt)
            .FirstOrDefaultAsync();

        if (attachment != null) return attachment;

        if (!IsConfigured) return null;

        if (string.IsNullOrWhiteSpace(waybillNo))
        {
            var detail = await _db.TaskDeliveryDetails.AsNoTracking().FirstOrDefaultAsync(d => d.TaskId == taskId);
            waybillNo = detail?.DmsWaybillNo;
        }

        if (string.IsNullOrWhiteSpace(waybillNo)) return null;

        try
        {
            var client = _http.CreateClient(HttpClientName);
            client.Timeout = TimeSpan.FromSeconds(10);
            using var request = new HttpRequestMessage(
                HttpMethod.Get, $"{_settings.BaseUrl.TrimEnd('/')}/api/delivery-orders/track?waybill={Uri.EscapeDataString(waybillNo)}");
            request.Headers.Add(ApiKeyHeaderName, _settings.OutboundApiKey);

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode) return null;

            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            var root = doc.RootElement;

            string? podImage = null;
            if (root.TryGetProperty("podImage", out var podProp) && podProp.ValueKind == JsonValueKind.String)
                podImage = podProp.GetString();
            else if (root.TryGetProperty("podUrl", out var podUrlProp) && podUrlProp.ValueKind == JsonValueKind.String)
                podImage = podUrlProp.GetString();
            else if (root.TryGetProperty("potImage", out var potProp) && potProp.ValueKind == JsonValueKind.String)
                podImage = potProp.GetString();

            if (string.IsNullOrWhiteSpace(podImage)) return null;

            var task = await _db.Tasks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == taskId);
            var detail = await _db.TaskDeliveryDetails.AsNoTracking().FirstOrDefaultAsync(d => d.TaskId == taskId);
            Guid uploaderId = task?.CreatedById ?? Guid.Empty;

            if (detail != null && !string.IsNullOrWhiteSpace(detail.CourierEmployeeId))
            {
                var driver = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.EmployeeNumber == detail.CourierEmployeeId);
                if (driver != null) uploaderId = driver.Id;
            }

            var fileName = ExtractFileName(podImage, $"POD_{waybillNo}.jpg");
            var ext = Path.GetExtension(fileName);
            if (string.IsNullOrWhiteSpace(ext)) ext = ".jpg";

            var newAttachment = new TaskAttachment
            {
                Id = Guid.NewGuid(),
                TaskId = taskId,
                FileName = fileName,
                FilePath = podImage,
                FileSize = 0,
                FileType = ext,
                Description = "Proof of Delivery (POD) from DMS",
                UploadedById = uploaderId,
                CreatedAt = DateTime.UtcNow
            };

            _db.TaskAttachments.Add(newAttachment);
            await _db.SaveChangesAsync();

            return newAttachment;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch POD on-demand from DMS for task {TaskId} / waybill {WaybillNo}", taskId, waybillNo);
            return null;
        }
    }

    private static string ExtractFileName(string pathOrUrl, string defaultName)
    {
        if (string.IsNullOrWhiteSpace(pathOrUrl)) return defaultName;
        try
        {
            if (pathOrUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                return defaultName;

            if (Uri.TryCreate(pathOrUrl, UriKind.Absolute, out var uri))
            {
                var name = Path.GetFileName(uri.LocalPath);
                if (!string.IsNullOrWhiteSpace(name)) return name;
            }
            else
            {
                var name = Path.GetFileName(pathOrUrl);
                if (!string.IsNullOrWhiteSpace(name)) return name;
            }
        }
        catch
        {
            // ignore
        }
        return defaultName;
    }

    private static string GetContentType(string fileName)
    {
        var ext = Path.GetExtension(fileName)?.ToLowerInvariant();
        return ext switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".pdf" => "application/pdf",
            ".svg" => "image/svg+xml",
            _ => "application/octet-stream"
        };
    }
}
