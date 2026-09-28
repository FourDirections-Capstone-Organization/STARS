using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.TaskManagement;

public interface IReportService
{
    Task<ApiResponseDTO<KpiTrackingDTO>> GetKpiTrackingAsync(
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId,
        KpiFilterDTO? filters = null);

    Task<ApiResponseDTO<PerformanceReportDTO>> GeneratePerformanceReportAsync(
        PerformanceReportFilterDTO filters,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId);

    Task<ApiResponseDTO<byte[]>> ExportReportAsync(
        PerformanceReportDTO reportData,
        ExportFormat format);

    Task<ApiResponseDTO<EmployeePerformanceSummaryDTO>> GetEmployeePerformanceSummaryAsync(
        Guid employeeId,
        EmployeePerformanceFilterDTO? filters,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId);

    Task<ApiResponseDTO<DepartmentKpiDTO>> GetDepartmentKpiAsync(
        Guid departmentId,
        DateTime? from = null,
        DateTime? to = null);

    Task<ApiResponseDTO<ReportFilterOptionsDTO>> GetReportFilterOptionsAsync(
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId);

    Task<ApiResponseDTO<TaskCompletionReportDTO>> GetTaskCompletionReportAsync(
        DateTime? dateRangeStart,
        DateTime? dateRangeEnd,
        Guid? employeeId,
        string? taskPriorityLevel,
        string? taskStatus,
        string? taskCategory,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId);

    Task<ApiResponseDTO<byte[]>> ExportTaskCompletionReportAsync(
        TaskCompletionReportDTO reportData,
        ExportFormat format);

    Task<ApiResponseDTO<OperationalSummaryReportDTO>> GetOperationalSummaryAsync(
        DateTime? dateRangeStart,
        DateTime? dateRangeEnd,
        Guid? departmentId,
        Guid? employeeId,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId);

    Task<ApiResponseDTO<byte[]>> ExportOperationalSummaryAsync(
        OperationalSummaryReportDTO reportData,
        string reportFormat);

    Task<ApiResponseDTO<FinancialReportDTO>> GetFinancialReportAsync(
        DateTime? dateRangeStart,
        DateTime? dateRangeEnd,
        Guid? departmentId,
        Guid? employeeId,
        string? fiscalPeriod,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId);

    Task<ApiResponseDTO<byte[]>> ExportFinancialReportAsync(
        FinancialReportDTO reportData,
        ExportFormat format);
}
