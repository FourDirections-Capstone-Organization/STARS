using System.Text;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Task = System.Threading.Tasks.Task;
using Microsoft.EntityFrameworkCore;

namespace Backend.Modules.TaskManagement;

public class FomsExportService : IFomsExportService
{
    private readonly AppDbContext _db;
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<FomsExportService> _logger;

    public FomsExportService(
        AppDbContext db,
        IAuditLogService auditLogService,
        ILogger<FomsExportService> logger)
    {
        _db = db;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    public async Task<ApiResponseDTO<byte[]>> ExportFomsCsvAsync(
        DateTime? dateRangeStart,
        DateTime? dateRangeEnd,
        Guid? employeeId,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId)
    {
        try
        {
            var dateStart = dateRangeStart.HasValue
                ? DateTime.SpecifyKind(dateRangeStart.Value, DateTimeKind.Utc)
                : DateTime.UtcNow.AddMonths(-1);
            var dateEnd = dateRangeEnd.HasValue
                ? DateTime.SpecifyKind(dateRangeEnd.Value, DateTimeKind.Utc).Date.AddDays(1).AddTicks(-1)
                : DateTime.UtcNow;

            var query = _db.Tasks
                .Include(t => t.Assignments)
                    .ThenInclude(a => a.AssignedUser)
                .Include(t => t.CreatedBy)
                .Include(t => t.AssignedDepartment)
                .Where(t => t.Status == Models.Enums.TaskStatus.Completed)
                .Where(t => t.UpdatedAt >= dateStart && t.UpdatedAt <= dateEnd);

            if (requestUserRole == UserRole.Coordinator && requestUserDepartmentId.HasValue)
                query = query.Where(t => t.AssignedDepartmentId == requestUserDepartmentId.Value);

            if (employeeId.HasValue)
                query = query.Where(t => t.Assignments.Any(a => a.AssignedUserId == employeeId.Value));

            var tasks = await query
                .OrderByDescending(t => t.UpdatedAt)
                .ToListAsync();

            if (tasks.Count == 0)
                return ApiResponseDTO<byte[]>.Failure("No completed tasks found for the selected criteria.");

            var sb = new StringBuilder();
            sb.AppendLine("TaskReferenceNumber,Title,Status,Priority,Classification,AssignedEmployee,Department,Deadline,RevisedDeadline,CreatedAt,CompletedAt,DurationHours,IsOnTime,OvertimeHours,IsSLALocked,ReviewRemarks,PushBackComment");

            foreach (var task in tasks)
            {
                var assigneeNames = task.Assignments
                    .Where(a => a.AssignedUser != null)
                    .Select(a => $"{a.AssignedUser!.FirstName} {a.AssignedUser.LastName}".Trim());
                var assigneeStr = string.Join("; ", assigneeNames);
                var deptName = task.AssignedDepartment?.Name ?? "";

                var completedAt = task.UpdatedAt ?? task.CreatedAt;
                var durationHours = Math.Round((completedAt - task.CreatedAt).TotalHours, 1);
                var deadline = task.RevisedDeadline ?? task.Deadline;
                var isOnTime = completedAt <= deadline;
                var overtimeHours = isOnTime ? 0 : Math.Round((completedAt - deadline).TotalHours, 1);

                var refNum = EscapeCsv(task.Title.Length > 50 ? task.Title[..50] : task.Title);
                var title = EscapeCsv(task.Title);
                var dept = EscapeCsv(deptName);

                sb.AppendLine($"{refNum},{title},Completed,{task.PriorityLevel},{task.Classification},{EscapeCsv(assigneeStr)},{dept},{task.Deadline:yyyy-MM-dd HH:mm},{(task.RevisedDeadline.HasValue ? task.RevisedDeadline.Value.ToString("yyyy-MM-dd HH:mm") : "")},{task.CreatedAt:yyyy-MM-dd HH:mm},{completedAt:yyyy-MM-dd HH:mm},{durationHours},{isOnTime},{overtimeHours},{task.IsSLALocked},{EscapeCsv(task.ReviewRemarks ?? "")},{EscapeCsv(task.PushBackComment ?? "")}");
            }

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());

            await _auditLogService.LogAsync(
                requestUserId,
                AuditActionType.Export,
                "FomsExport",
                null,
                null,
                $"FOMS export completed. Period: {dateStart:yyyy-MM-dd} to {dateEnd:yyyy-MM-dd}, Records: {tasks.Count}",
                "FOMS");

            return ApiResponseDTO<byte[]>.Success(bytes, $"FOMS export successful|foms_export_{dateStart:yyyyMMdd}_{dateEnd:yyyyMMdd}.csv|text/csv");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "FOMS export failed");

            await _auditLogService.LogAsync(
                requestUserId,
                AuditActionType.Export,
                "FomsExport",
                null,
                null,
                $"FOMS export FAILED: {ex.Message}",
                "FOMS");

            return ApiResponseDTO<byte[]>.Failure($"FOMS export failed: {ex.Message}");
        }
    }

    private static string EscapeCsv(string value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r'))
            return $"\"{value.Replace("\"", "\"\"")}\"";
        return value;
    }
}
