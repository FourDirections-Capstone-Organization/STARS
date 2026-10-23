using Backend.Models;
using Backend.Models.DTOs;

namespace Backend.Modules.FomsIntegration;

public interface IFomsIntegrationService
{
    bool IsConfigured { get; }

    /// <summary>
    /// Integration 1 (FOMS → STARS): Receives a finalized invoice from FOMS and creates an endorsement task in STARS.
    /// Idempotent based on InvoiceNumber.
    /// </summary>
    Task<ApiResponseDTO<FomsEndorsementResponseDTO>> CreateEndorsementTaskAsync(FomsEndorsementRequestDTO dto);

    /// <summary>
    /// Integration 1 (STARS → FOMS): Sends completion callback with signed copy URL and received date to FOMS.
    /// Automatically triggered when task is marked Completed (or manually).
    /// </summary>
    Task<ApiResponseDTO<bool>> SendInvoiceEndorsementCompletionAsync(
        Guid taskId, Guid? reviewerId = null, SubmitSignedEndorsementDTO? explicitSubmission = null);

    /// <summary>
    /// Integration 2 (FOMS → STARS): Real-time payment / invoice workflow status update pushed from FOMS.
    /// </summary>
    Task<ApiResponseDTO<bool>> ProcessPaymentStatusWebhookAsync(FomsPaymentStatusDTO dto);

    /// <summary>
    /// Integration 3 (FOMS → STARS): Overdue accounts collection alert from FOMS aging logic.
    /// Creates a collection follow-up task and routes via Graph Routing / workload distribution.
    /// </summary>
    Task<ApiResponseDTO<FomsEndorsementResponseDTO>> ProcessOverdueAlertWebhookAsync(FomsOverdueAlertDTO dto);

    /// <summary>
    /// Aggregated client balances and invoice metrics for the STARS dashboard (FR-038).
    /// </summary>
    Task<ApiResponseDTO<FomsDashboardFinancialSummaryDTO>> GetDashboardFinancialSummaryAsync();

    /// <summary>
    /// Retrieves the FOMS endorsement details linked to a STARS task.
    /// </summary>
    Task<ApiResponseDTO<TaskFomsInvoiceDetail>> GetEndorsementDetailAsync(Guid taskId);

    /// <summary>
    /// Assignee submits actual received date and signed copy URL for an endorsement task.
    /// </summary>
    Task<ApiResponseDTO<TaskFomsInvoiceDetail>> SubmitSignedEndorsementAsync(
        Guid taskId, SubmitSignedEndorsementDTO dto, Guid userId);

    /// <summary>
    /// Multi-system Provisioning: Provisions a new staff/user from STARS into FOMS.
    /// </summary>
    Task<ApiResponseDTO<bool>> ProvisionUserAsync(
        string employeeId,
        string username,
        string? fullName,
        string? email,
        string? password,
        string? role,
        string? phone,
        decimal? salaryRate = null,
        DateTime? dateHired = null,
        string? status = "Active");

    /// <summary>
    /// Integration Check: Queries FOMS to check if an email or employee ID already exists in FOMS.
    /// </summary>
    Task<ApiResponseDTO<bool>> CheckUserExistsInFomsAsync(string? email, string? employeeId = null);

    /// <summary>
    /// Synchronizes a user's updated password to FOMS.
    /// </summary>
    Task<ApiResponseDTO<bool>> SyncPasswordAsync(string employeeId, string newPassword);
}

