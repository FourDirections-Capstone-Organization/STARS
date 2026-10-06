using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.DmsIntegration;

public interface IDmsIntegrationService
{
    bool IsConfigured { get; }

    /// <summary>
    /// Attach or update delivery recipient details for a task before or after completion.
    /// </summary>
    Task<ApiResponseDTO<TaskDeliveryDetailResponseDTO>> UpsertDeliveryDetailAsync(
        Guid taskId, UpsertTaskDeliveryDetailDTO dto, Guid userId);

    /// <summary>
    /// Retrieve delivery recipient details and sync state for a task.
    /// </summary>
    Task<ApiResponseDTO<TaskDeliveryDetailResponseDTO>> GetDeliveryDetailAsync(Guid taskId);

    /// <summary>
    /// Integration 1: Transmits the completed task's delivery details to DMS to create a delivery order.
    /// Triggered automatically when a Coordinator/Manager reviews and approves a task as Completed.
    /// Safe to retry.
    /// </summary>
    Task<ApiResponseDTO<TaskDeliveryDetailResponseDTO>> CreateDeliveryOrderForTaskAsync(
        Guid taskId, Guid? reviewerId = null);

    /// <summary>
    /// Integration 2: Handles incoming delivery status webhook from DMS.
    /// Updates the delivery tracking fields and notifies the task coordinator/manager.
    /// </summary>
    Task<ApiResponseDTO<bool>> ProcessStatusUpdateAsync(DmsStatusWebhookDTO dto);

    /// <summary>
    /// Integration 3: Handles incoming daily/weekly batch of delivery completion records from DMS.
    /// Incorporates the delivery SLA data into STARS performance analytics.
    /// </summary>
    Task<ApiResponseDTO<int>> ProcessPerformanceBatchAsync(DmsPerformanceBatchDTO batch);

    /// <summary>
    /// Returns aggregated on-time vs late metrics from DMS deliveries, optionally filtered by driver.
    /// </summary>
    Task<ApiResponseDTO<DmsPerformanceSummaryDTO>> GetPerformanceSummaryAsync(string? driverId = null);
}
