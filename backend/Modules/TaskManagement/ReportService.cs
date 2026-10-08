using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.TaskManagement;

public class ReportService : IReportService
{
    private readonly AppDbContext _db;
    private readonly IAuditLogService _auditLogService;

    public ReportService(AppDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }

    public async Task<ApiResponseDTO<KpiTrackingDTO>> GetKpiTrackingAsync(
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId,
        KpiFilterDTO? filters = null)
    {
        var dateStart = filters?.DateRangeStart is DateTime ds ? DateTime.SpecifyKind(ds, DateTimeKind.Utc) : DateTime.UtcNow.AddMonths(-1);
        var dateEnd = filters?.DateRangeEnd is DateTime de ? DateTime.SpecifyKind(de, DateTimeKind.Utc).Date.AddDays(1).AddTicks(-1) : DateTime.UtcNow;

        var query = _db.Tasks
            .Include(t => t.Assignments)
                .ThenInclude(a => a.AssignedUser)
                    .ThenInclude(u => u!.Department)
            .Include(t => t.CreatedBy)
                .ThenInclude(u => u!.Department)
            .Where(t => t.Status == Models.Enums.TaskStatus.Completed)
            .Where(t => ((t.UpdatedAt ?? t.CreatedAt) >= dateStart && (t.UpdatedAt ?? t.CreatedAt) <= dateEnd) ||
                        (t.CreatedAt >= dateStart && t.CreatedAt <= dateEnd));

        if (requestUserRole == UserRole.Coordinator && requestUserDepartmentId.HasValue)
        {
            query = query.Where(t =>
                t.AssignedDepartmentId == requestUserDepartmentId.Value ||
                t.Assignments.Any(a => a.AssignedUser != null && a.AssignedUser.DepartmentId == requestUserDepartmentId.Value) ||
                t.CreatedById == requestUserId);
        }

        if (filters?.EmployeeId.HasValue == true && filters.EmployeeId.Value != Guid.Empty)
        {
            query = query.Where(t =>
                t.Assignments.Any(a => a.AssignedUserId == filters.EmployeeId.Value) ||
                (t.Assignments.Count == 0 && t.CreatedById == filters.EmployeeId.Value));
        }

        var completedTasks = await query.ToListAsync();

        if (completedTasks.Count == 0)
        {
            var emptyResult = new KpiTrackingDTO
            {
                PeriodStart = dateStart,
                PeriodEnd = dateEnd,
                TotalCompletedTasks = 0,
                TotalOnTimeTasks = 0,
                TotalLateTasks = 0,
                OverallOnTimeRate = 0,
                OverallLateRate = 0,
                EmployeeKpis = new List<EmployeeKpiDTO>()
            };
            return ApiResponseDTO<KpiTrackingDTO>.Success(emptyResult);
        }

        var employeeKpis = completedTasks
            .SelectMany(t => t.Assignments.Any()
                ? t.Assignments.Select(a => new
                {
                    UserId = a.AssignedUserId,
                    User = a.AssignedUser,
                    IsOnTime = (t.UpdatedAt ?? t.CreatedAt) <= (t.RevisedDeadline ?? t.Deadline)
                })
                : new[]
                {
                    new
                    {
                        UserId = t.CreatedById,
                        User = t.CreatedBy,
                        IsOnTime = (t.UpdatedAt ?? t.CreatedAt) <= (t.RevisedDeadline ?? t.Deadline)
                    }
                })
            .Where(x => x.User != null)
            .GroupBy(x => x.UserId)
            .Select(g =>
            {
                var first = g.First();
                var total = g.Count();
                var onTime = g.Count(x => x.IsOnTime);
                var late = total - onTime;

                return new EmployeeKpiDTO
                {
                    EmployeeId = g.Key,
                    EmployeeName = first.User is not null
                        ? $"{first.User.FirstName} {first.User.LastName}".Trim()
                        : "Unknown",
                    EmployeeNumber = first.User?.EmployeeNumber ?? "",
                    Department = first.User?.Department?.Name ?? "",
                    TotalCompleted = total,
                    OnTimeCount = onTime,
                    LateCount = late,
                    OnTimeRate = total > 0 ? Math.Round((double)onTime / total * 100, 1) : 0,
                    LateRate = total > 0 ? Math.Round((double)late / total * 100, 1) : 0
                };
            })
            .OrderByDescending(k => k.OnTimeRate)
            .ToList();

        var totalCompleted = employeeKpis.Sum(k => k.TotalCompleted);
        var totalOnTime = employeeKpis.Sum(k => k.OnTimeCount);
        var totalLate = employeeKpis.Sum(k => k.LateCount);

        var result = new KpiTrackingDTO
        {
            PeriodStart = dateStart,
            PeriodEnd = dateEnd,
            TotalCompletedTasks = totalCompleted,
            TotalOnTimeTasks = totalOnTime,
            TotalLateTasks = totalLate,
            OverallOnTimeRate = totalCompleted > 0 ? Math.Round((double)totalOnTime / totalCompleted * 100, 1) : 0,
            OverallLateRate = totalCompleted > 0 ? Math.Round((double)totalLate / totalCompleted * 100, 1) : 0,
            EmployeeKpis = employeeKpis
        };

        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Read,
            "KpiReport",
            null,
            null,
            $"KPI report accessed. Period: {dateStart:yyyy-MM-dd} to {dateEnd:yyyy-MM-dd}, Employees: {employeeKpis.Count}",
            "Reports");

        return ApiResponseDTO<KpiTrackingDTO>.Success(result);
    }

    public async Task<ApiResponseDTO<PerformanceReportDTO>> GeneratePerformanceReportAsync(
        PerformanceReportFilterDTO filters,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId)
    {
        var (dateStart, dateEnd) = CalculateDateRange(filters.Period, filters.DateRangeStart, filters.DateRangeEnd);

        var query = _db.Tasks
            .Include(t => t.Assignments)
                .ThenInclude(a => a.AssignedUser)
                    .ThenInclude(u => u!.Department)
            .Include(t => t.AssignedDepartment)
            .Where(t => (t.CreatedAt >= dateStart && t.CreatedAt <= dateEnd) || (t.UpdatedAt >= dateStart && t.UpdatedAt <= dateEnd));

        if (requestUserRole == UserRole.Coordinator && requestUserDepartmentId.HasValue)
            query = query.Where(t => t.AssignedDepartmentId == requestUserDepartmentId.Value);

        if (filters.DepartmentId.HasValue)
            query = query.Where(t => t.AssignedDepartmentId == filters.DepartmentId.Value);

        if (filters.EmployeeId.HasValue)
            query = query.Where(t => t.Assignments.Any(a => a.AssignedUserId == filters.EmployeeId.Value));

        var tasks = await query.ToListAsync();

        if (tasks.Count == 0)
            return ApiResponseDTO<PerformanceReportDTO>.Failure("No records found for the selected period.");

        var nowUtc = DateTime.UtcNow;

        var employeeBreakdown = tasks
            .SelectMany(t => t.Assignments.Select(a => new
            {
                a.AssignedUserId,
                a.AssignedUser,
                Task = t
            }))
            .Where(x => x.AssignedUser != null)
            .GroupBy(x => x.AssignedUserId)
            .Select(g =>
            {
                var first = g.First();
                var userTasks = g.Select(x => x.Task).DistinctBy(t => t.Id).ToList();
                var totalAssigned = userTasks.Count;
                var completedTasks = userTasks.Where(t => t.Status == Models.Enums.TaskStatus.Completed).ToList();
                var totalCompleted = completedTasks.Count;
                var onTime = completedTasks.Count(t => (t.UpdatedAt ?? t.CreatedAt) <= (t.RevisedDeadline ?? t.Deadline));
                var late = totalCompleted - onTime;

                var slaBreached = userTasks.Count(t =>
                    (t.Status == Models.Enums.TaskStatus.Completed && (t.UpdatedAt ?? t.CreatedAt) > (t.RevisedDeadline ?? t.Deadline)) ||
                    (t.Status != Models.Enums.TaskStatus.Completed && t.Status != Models.Enums.TaskStatus.Cancelled && (t.RevisedDeadline ?? t.Deadline) < nowUtc));

                var reworkCount = userTasks.Count(t =>
                    !string.IsNullOrEmpty(t.PushBackComment) || t.IsApproved == false || t.RevisedDeadline != null);

                var completionRate = totalAssigned > 0 ? Math.Round((double)totalCompleted / totalAssigned * 100, 1) : 0;
                var onTimeRate = totalCompleted > 0 ? Math.Round((double)onTime / totalCompleted * 100, 1) : 0;
                var lateRate = totalAssigned > 0 ? Math.Round((double)late / totalAssigned * 100, 1) : 0;
                var slaBreachRate = totalAssigned > 0 ? Math.Round((double)slaBreached / totalAssigned * 100, 1) : 0;
                var reworkRate = totalAssigned > 0 ? Math.Round((double)reworkCount / totalAssigned * 100, 1) : 0;

                return new EmployeePerformanceDTO
                {
                    EmployeeId = g.Key,
                    EmployeeName = first.AssignedUser is not null
                        ? $"{first.AssignedUser.FirstName} {first.AssignedUser.LastName}".Trim()
                        : "Unknown",
                    EmployeeNumber = first.AssignedUser?.EmployeeNumber ?? "",
                    Department = first.AssignedUser?.Department?.Name ?? "",
                    Role = first.AssignedUser?.Role.ToString() ?? "",
                    TotalAssigned = totalAssigned,
                    TotalCompleted = totalCompleted,
                    CompletionRate = completionRate,
                    OnTimeCount = onTime,
                    LateCount = late,
                    OnTimeRate = onTimeRate,
                    LateRate = lateRate,
                    SlaBreachCount = slaBreached,
                    SlaBreachRate = slaBreachRate,
                    ReworkCount = reworkCount,
                    ReworkRate = reworkRate
                };
            })
            .OrderByDescending(e => e.CompletionRate)
            .ThenByDescending(e => e.OnTimeRate)
            .ToList();

        var totalAssignedAll = employeeBreakdown.Sum(e => e.TotalAssigned);
        var totalCompletedAll = employeeBreakdown.Sum(e => e.TotalCompleted);
        var totalOnTimeAll = employeeBreakdown.Sum(e => e.OnTimeCount);
        var totalLateAll = employeeBreakdown.Sum(e => e.LateCount);
        var totalSlaBreachedAll = employeeBreakdown.Sum(e => e.SlaBreachCount);
        var totalReworkAll = employeeBreakdown.Sum(e => e.ReworkCount);

        string? deptName = null;
        if (filters.DepartmentId.HasValue)
        {
            deptName = await _db.Departments
                .Where(d => d.Id == filters.DepartmentId.Value)
                .Select(d => d.Name)
                .FirstOrDefaultAsync();
        }

        string? empName = null;
        if (filters.EmployeeId.HasValue)
        {
            empName = await _db.Users
                .Where(u => u.Id == filters.EmployeeId.Value)
                .Select(u => $"{u.FirstName} {u.LastName}")
                .FirstOrDefaultAsync();
        }

        var report = new PerformanceReportDTO
        {
            Period = filters.Period,
            DateRangeStart = dateStart,
            DateRangeEnd = dateEnd,
            DepartmentName = deptName,
            EmployeeName = empName,
            TotalAssignedTasks = totalAssignedAll,
            TotalCompletedTasks = totalCompletedAll,
            OverallCompletionRate = totalAssignedAll > 0 ? Math.Round((double)totalCompletedAll / totalAssignedAll * 100, 1) : 0,
            OverallOnTimeRate = totalCompletedAll > 0 ? Math.Round((double)totalOnTimeAll / totalCompletedAll * 100, 1) : 0,
            OverallLateRate = totalCompletedAll > 0 ? Math.Round((double)totalLateAll / totalCompletedAll * 100, 1) : 0,
            OverallSlaBreachRate = totalAssignedAll > 0 ? Math.Round((double)totalSlaBreachedAll / totalAssignedAll * 100, 1) : 0,
            OverallReworkRate = totalAssignedAll > 0 ? Math.Round((double)totalReworkAll / totalAssignedAll * 100, 1) : 0,
            EmployeeBreakdown = employeeBreakdown
        };

        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Read,
            "PerformanceReport",
            null,
            null,
            $"Performance report previewed. Period: {filters.Period}, {dateStart:yyyy-MM-dd} to {dateEnd:yyyy-MM-dd}, Employees: {employeeBreakdown.Count}",
            "Reports");

        return ApiResponseDTO<PerformanceReportDTO>.Success(report);
    }

    public async Task<ApiResponseDTO<byte[]>> ExportReportAsync(
        PerformanceReportDTO reportData,
        ExportFormat format)
    {
        byte[] fileBytes;
        string contentType;
        string fileName;

        switch (format)
        {
            case ExportFormat.Excel:
                fileBytes = GenerateExcelReport(reportData);
                contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                fileName = $"Performance_Report_{reportData.DateRangeStart:yyyyMMdd}_{reportData.DateRangeEnd:yyyyMMdd}.xlsx";
                break;

            case ExportFormat.Pdf:
                fileBytes = GeneratePdfReport(reportData);
                contentType = "application/pdf";
                fileName = $"Performance_Report_{reportData.DateRangeStart:yyyyMMdd}_{reportData.DateRangeEnd:yyyyMMdd}.pdf";
                break;

            case ExportFormat.Csv:
                fileBytes = GeneratePerformanceReportCsv(reportData);
                contentType = "text/csv; charset=utf-8";
                fileName = $"Performance_Report_{reportData.DateRangeStart:yyyyMMdd}_{reportData.DateRangeEnd:yyyyMMdd}.csv";
                break;

            default:
                return ApiResponseDTO<byte[]>.Failure("Unsupported export format.");
        }

        await _auditLogService.LogAsync(
            null,
            AuditActionType.Export,
            "PerformanceReport",
            null,
            null,
            $"Performance report exported as {format}. Period: {reportData.DateRangeStart:yyyy-MM-dd} to {reportData.DateRangeEnd:yyyy-MM-dd}",
            "Reports");

        return ApiResponseDTO<byte[]>.Success(fileBytes, $"Report generated successfully|{fileName}|{contentType}");
    }

    public async Task<ApiResponseDTO<EmployeePerformanceSummaryDTO>> GetEmployeePerformanceSummaryAsync(
        Guid employeeId,
        EmployeePerformanceFilterDTO? filters,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId)
    {
        var employee = await _db.Users
            .Include(u => u.Department)
            .FirstOrDefaultAsync(u => u.Id == employeeId);

        if (employee is null)
            return ApiResponseDTO<EmployeePerformanceSummaryDTO>.Failure("Employee not found.");

        var dateStart = filters?.DateRangeStart is DateTime ds3 ? DateTime.SpecifyKind(ds3, DateTimeKind.Utc) : DateTime.UtcNow.AddMonths(-1);
        var dateEnd = filters?.DateRangeEnd is DateTime de3 ? DateTime.SpecifyKind(de3, DateTimeKind.Utc).Date.AddDays(1).AddTicks(-1) : DateTime.UtcNow;

        var completedTasks = await _db.Tasks
            .Include(t => t.Assignments)
            .Where(t => t.Status == Models.Enums.TaskStatus.Completed)
            .Where(t => t.Assignments.Any(a => a.AssignedUserId == employeeId))
            .Where(t => t.UpdatedAt >= dateStart && t.UpdatedAt <= dateEnd)
            .ToListAsync();

        if (requestUserRole == UserRole.Coordinator && requestUserDepartmentId.HasValue)
            completedTasks = completedTasks
                .Where(t => t.AssignedDepartmentId == requestUserDepartmentId.Value)
                .ToList();

        var onTimeCount = completedTasks
            .Count(t => t.UpdatedAt <= (t.RevisedDeadline ?? t.Deadline));
        var lateCount = completedTasks.Count - onTimeCount;
        var totalCompleted = completedTasks.Count;

        var recommendations = await _db.Recommendations
            .Include(r => r.Coordinator)
            .Where(r => r.AssigneeId == employeeId)
            .Where(r => r.CreatedAt >= dateStart && r.CreatedAt <= dateEnd)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        var summary = new EmployeePerformanceSummaryDTO
        {
            EmployeeId = employee.Id,
            EmployeeName = $"{employee.FirstName} {employee.LastName}".Trim(),
            EmployeeNumber = employee.EmployeeNumber,
            Department = employee.Department?.Name ?? "",
            Role = employee.Role.ToString(),
            PeriodStart = dateStart,
            PeriodEnd = dateEnd,
            TotalCompletedTasks = totalCompleted,
            OnTimeCount = onTimeCount,
            LateCount = lateCount,
            SlaComplianceRate = totalCompleted > 0
                ? Math.Round((double)onTimeCount / totalCompleted * 100, 1)
                : 0,
            Recommendations = recommendations.Select(r => new RecommendationSummaryDTO
            {
                RecommendationId = r.Id,
                Category = r.Category.ToString(),
                Notes = r.Notes,
                CoordinatorName = r.Coordinator is not null
                    ? $"{r.Coordinator.FirstName} {r.Coordinator.LastName}".Trim()
                    : "Unknown",
                CreatedAt = r.CreatedAt
            }).ToList()
        };

        return ApiResponseDTO<EmployeePerformanceSummaryDTO>.Success(summary);
    }

    private (DateTime Start, DateTime End) CalculateDateRange(
        ReportPeriod period, DateTime? explicitStart, DateTime? explicitEnd)
    {
        if (explicitStart.HasValue && explicitEnd.HasValue)
            return (DateTime.SpecifyKind(explicitStart.Value, DateTimeKind.Utc),
                    DateTime.SpecifyKind(explicitEnd.Value, DateTimeKind.Utc).Date.AddDays(1).AddTicks(-1));

        var now = DateTime.UtcNow;

        switch (period)
        {
            case ReportPeriod.Weekly:
                var daysSinceMonday = ((int)now.DayOfWeek + 6) % 7;
                var weekStart = now.Date.AddDays(-daysSinceMonday);
                var weekEnd = weekStart.AddDays(6).AddHours(23).AddMinutes(59).AddSeconds(59);
                return (weekStart, weekEnd);

            case ReportPeriod.Monthly:
                var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                var monthEnd = new DateTime(now.Year, now.Month, DateTime.DaysInMonth(now.Year, now.Month), 23, 59, 59, DateTimeKind.Utc);
                return (monthStart, monthEnd);

            case ReportPeriod.Quarterly:
                var currentQuarter = (now.Month - 1) / 3 + 1;
                var qStartMonth = (currentQuarter - 1) * 3 + 1;
                var qEndMonth = qStartMonth + 2;
                var qStart = new DateTime(now.Year, qStartMonth, 1, 0, 0, 0, DateTimeKind.Utc);
                var qEnd = new DateTime(now.Year, qEndMonth, DateTime.DaysInMonth(now.Year, qEndMonth), 23, 59, 59, DateTimeKind.Utc);
                return (qStart, qEnd);

            case ReportPeriod.Annual:
                var yearStart = new DateTime(now.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                var yearEnd = new DateTime(now.Year, 12, 31, 23, 59, 59, DateTimeKind.Utc);
                return (yearStart, yearEnd);

            default:
                return (now.AddMonths(-1), now);
        }
    }

    private byte[] GenerateExcelReport(PerformanceReportDTO report)
    {
        using var workbook = new XLWorkbook();
        var worksheet = workbook.Worksheets.Add("Performance Report");
        worksheet.ShowGridLines = true;

        worksheet.Cell(1, 1).Value = "STARS Performance Report";
        worksheet.Cell(1, 1).Style.Font.Bold = true;
        worksheet.Cell(1, 1).Style.Font.FontSize = 16;
        worksheet.Cell(1, 1).Style.Font.FontColor = XLColor.FromHtml("#00A99D");
        worksheet.Range(1, 1, 1, 14).Merge();

        worksheet.Cell(2, 1).Value = $"Period ({report.Period}): {report.DateRangeStart:MMM dd, yyyy} - {report.DateRangeEnd:MMM dd, yyyy}";
        worksheet.Cell(2, 1).Style.Font.FontSize = 10;
        worksheet.Cell(2, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");
        worksheet.Range(2, 1, 2, 14).Merge();

        worksheet.Cell(4, 1).Value = "Performance Summary (The 5 KPIs)";
        worksheet.Cell(4, 1).Style.Font.Bold = true;
        worksheet.Cell(4, 1).Style.Font.FontSize = 11;
        worksheet.Cell(4, 1).Style.Font.FontColor = XLColor.FromHtml("#1E293B");

        worksheet.Cell(5, 1).Value = "Total Assigned Tasks:";
        worksheet.Cell(5, 1).Style.Font.Bold = true;
        worksheet.Cell(5, 2).Value = report.TotalAssignedTasks;
        worksheet.Cell(5, 4).Value = "Total Completed Tasks:";
        worksheet.Cell(5, 4).Style.Font.Bold = true;
        worksheet.Cell(5, 5).Value = report.TotalCompletedTasks;
        worksheet.Cell(6, 1).Value = "1. Completion Rate:";
        worksheet.Cell(6, 1).Style.Font.Bold = true;
        worksheet.Cell(6, 2).Value = $"{report.OverallCompletionRate}%";
        worksheet.Cell(6, 4).Value = "2. On-Time Rate:";
        worksheet.Cell(6, 4).Style.Font.Bold = true;
        worksheet.Cell(6, 5).Value = $"{report.OverallOnTimeRate}%";
        worksheet.Cell(7, 1).Value = "3. SLA Breach Rate:";
        worksheet.Cell(7, 1).Style.Font.Bold = true;
        worksheet.Cell(7, 2).Value = $"{report.OverallSlaBreachRate}%";
        worksheet.Cell(7, 4).Value = "4. Rework Rate:";
        worksheet.Cell(7, 4).Style.Font.Bold = true;
        worksheet.Cell(7, 5).Value = $"{report.OverallReworkRate}%";

        var headerRow = 9;
        worksheet.Row(headerRow).Height = 26;
        var headers = new[]
        {
            "Employee Name", "Employee #", "Department", "Role",
            "Assigned", "Completed", "Completion Rate", "On-Time", "Late",
            "On-Time Rate", "SLA Breaches", "SLA Breach Rate", "Reworks", "Rework Rate"
        };
        for (int i = 0; i < headers.Length; i++)
        {
            var cell = worksheet.Cell(headerRow, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#00A99D");
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            cell.Style.Alignment.Horizontal = i < 4 ? XLAlignmentHorizontalValues.Left : XLAlignmentHorizontalValues.Center;
            cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            cell.Style.Border.OutsideBorderColor = XLColor.FromHtml("#007A71");
        }

        var dataRow = headerRow + 1;
        int rowIndex = 0;
        foreach (var emp in report.EmployeeBreakdown)
        {
            var rowColor = (rowIndex % 2 == 1) ? XLColor.FromHtml("#F8FAFC") : XLColor.White;
            worksheet.Row(dataRow).Height = 20;

            worksheet.Cell(dataRow, 1).Value = emp.EmployeeName;
            worksheet.Cell(dataRow, 2).Value = emp.EmployeeNumber;
            worksheet.Cell(dataRow, 3).Value = emp.Department;
            worksheet.Cell(dataRow, 4).Value = emp.Role;
            worksheet.Cell(dataRow, 5).Value = emp.TotalAssigned;
            worksheet.Cell(dataRow, 6).Value = emp.TotalCompleted;
            worksheet.Cell(dataRow, 7).Value = $"{emp.CompletionRate}%";
            worksheet.Cell(dataRow, 8).Value = emp.OnTimeCount;
            worksheet.Cell(dataRow, 9).Value = emp.LateCount;
            worksheet.Cell(dataRow, 10).Value = $"{emp.OnTimeRate}%";
            worksheet.Cell(dataRow, 11).Value = emp.SlaBreachCount;
            worksheet.Cell(dataRow, 12).Value = $"{emp.SlaBreachRate}%";
            worksheet.Cell(dataRow, 13).Value = emp.ReworkCount;
            worksheet.Cell(dataRow, 14).Value = $"{emp.ReworkRate}%";

            for (int col = 1; col <= 14; col++)
            {
                var c = worksheet.Cell(dataRow, col);
                c.Style.Fill.BackgroundColor = rowColor;
                c.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                c.Style.Border.OutsideBorderColor = XLColor.FromHtml("#E2E8F0");
                c.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                if (col >= 5) c.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            }

            dataRow++;
            rowIndex++;
        }

        worksheet.Columns().AdjustToContents(10, 45);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private byte[] GeneratePdfReport(PerformanceReportDTO report)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(25);
                page.DefaultTextStyle(x => x.FontSize(9));

                page.Header().Column(column =>
                {
                    column.Item().Text("STARS Performance Report")
                        .FontSize(18).Bold();
                    column.Item().Text($"Period: {report.DateRangeStart:MMM dd, yyyy} - {report.DateRangeEnd:MMM dd, yyyy}")
                        .FontSize(11).FontColor(Colors.Grey.Darken2);
                    column.Item().PaddingTop(4).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                });

                page.Content().PaddingVertical(10).Column(column =>
                {
                    column.Item().PaddingBottom(8).Text("Summary (The 5 KPIs)").FontSize(13).Bold();

                    column.Item().Row(row =>
                    {
                        row.RelativeItem().Text($"Assigned: {report.TotalAssignedTasks}").Bold();
                        row.RelativeItem().Text($"Completed: {report.TotalCompletedTasks}").Bold();
                        row.RelativeItem().Text($"Completion Rate: {report.OverallCompletionRate}%");
                        row.RelativeItem().Text($"On-Time Rate: {report.OverallOnTimeRate}%");
                        row.RelativeItem().Text($"SLA Breach Rate: {report.OverallSlaBreachRate}%");
                        row.RelativeItem().Text($"Rework Rate: {report.OverallReworkRate}%");
                    });

                    column.Item().PaddingTop(12).Text("Employee Breakdown").FontSize(13).Bold();

                    column.Item().PaddingTop(4).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3); // Employee
                            columns.RelativeColumn(2); // Dept
                            columns.RelativeColumn(2); // Role
                            columns.RelativeColumn(1); // Assigned
                            columns.RelativeColumn(1); // Done
                            columns.RelativeColumn(1.2f); // Comp %
                            columns.RelativeColumn(1); // On-Time
                            columns.RelativeColumn(1.2f); // On-Time %
                            columns.RelativeColumn(1.2f); // SLA Breach %
                            columns.RelativeColumn(1.2f); // Rework %
                        });

                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Employee").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Department").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Role").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Assigned").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Done").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Comp %").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("On-Time").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("On-Time %").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("SLA Breach %").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Rework %").Bold();
                        });

                        foreach (var emp in report.EmployeeBreakdown)
                        {
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.EmployeeName);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.Department);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.Role);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.TotalAssigned.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.TotalCompleted.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"{emp.CompletionRate}%");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.OnTimeCount.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"{emp.OnTimeRate}%");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"{emp.SlaBreachRate}%");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"{emp.ReworkRate}%");
                        }
                    });
                });

                page.Footer().AlignCenter().Text(x =>
                {
                    x.Span("Generated: ");
                    x.Span(DateTime.UtcNow.ToString("MMM dd, yyyy HH:mm UTC"));
                    x.Span(" | Page ");
                    x.CurrentPageNumber();
                    x.Span(" of ");
                    x.TotalPages();
                });
            });
        });

        using var stream = new MemoryStream();
        document.GeneratePdf(stream);
        return stream.ToArray();
    }

    private byte[] GeneratePerformanceReportCsv(PerformanceReportDTO report)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("STARS Performance Report");
        sb.AppendLine($"Period,{report.DateRangeStart:yyyy-MM-dd},{report.DateRangeEnd:yyyy-MM-dd}");
        sb.AppendLine($"Total Assigned Tasks,{report.TotalAssignedTasks}");
        sb.AppendLine($"Total Completed Tasks,{report.TotalCompletedTasks}");
        sb.AppendLine($"Completion Rate,{report.OverallCompletionRate}%");
        sb.AppendLine($"On-Time Rate,{report.OverallOnTimeRate}%");
        sb.AppendLine($"SLA Breach Rate,{report.OverallSlaBreachRate}%");
        sb.AppendLine($"Rework / Push-Back Rate,{report.OverallReworkRate}%");
        sb.AppendLine();
        sb.AppendLine("Employee Name,Employee #,Department,Role,Total Assigned,Completed,Completion Rate,On-Time,Late,On-Time Rate,SLA Breaches,SLA Breach Rate,Reworks,Rework Rate");

        foreach (var emp in report.EmployeeBreakdown)
        {
            sb.AppendLine($"\"{EscapeCsv(emp.EmployeeName)}\",\"{EscapeCsv(emp.EmployeeNumber)}\",\"{EscapeCsv(emp.Department)}\",\"{EscapeCsv(emp.Role)}\",{emp.TotalAssigned},{emp.TotalCompleted},{emp.CompletionRate}%,{emp.OnTimeCount},{emp.LateCount},{emp.OnTimeRate}%,{emp.SlaBreachCount},{emp.SlaBreachRate}%,{emp.ReworkCount},{emp.ReworkRate}%");
        }

        return System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static string EscapeCsv(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Replace("\"", "\"\"");
    }

    public async Task<ApiResponseDTO<DepartmentKpiDTO>> GetDepartmentKpiAsync(
        Guid departmentId, DateTime? from = null, DateTime? to = null)
    {
        var dept = await _db.Departments.FindAsync(departmentId);
        if (dept == null)
            return ApiResponseDTO<DepartmentKpiDTO>.Failure("Department not found");

        var dateStart = from ?? DateTime.UtcNow.AddMonths(-1);
        var dateEnd = to.HasValue ? DateTime.SpecifyKind(to.Value, DateTimeKind.Utc).Date.AddDays(1).AddTicks(-1) : DateTime.UtcNow;
        var now = DateTime.UtcNow;

        var employees = await _db.Users
            .Where(u => u.DepartmentId == departmentId && u.IsActive && !u.IsDeactivated)
            .ToListAsync();

        var allDeptTasks = await _db.Tasks
            .Include(t => t.Assignments)
            .Where(t => t.AssignedDepartmentId == departmentId)
            .ToListAsync();

        var completedTasks = allDeptTasks
            .Where(t => t.Status == Models.Enums.TaskStatus.Completed)
            .ToList();

        var completedInRange = completedTasks
            .Where(t => t.UpdatedAt >= dateStart && t.UpdatedAt <= dateEnd)
            .ToList();

        var onTimeTasks = completedInRange.Count(t => t.IsApproved == true);
        var lateTasks = completedInRange.Count(t => t.IsApproved == false);
        var overdueTasks = allDeptTasks.Count(t =>
            (t.RevisedDeadline ?? t.Deadline) < now
            && t.Status != Models.Enums.TaskStatus.Completed
            && t.Status != Models.Enums.TaskStatus.Cancelled);
        var activeTasks = allDeptTasks.Count(t =>
            t.Status != Models.Enums.TaskStatus.Completed
            && t.Status != Models.Enums.TaskStatus.Cancelled);

        var totalTasks = allDeptTasks.Count;
        var completedEver = completedTasks.Count;
        var totalInRange = completedInRange.Count;

        var avgCompletionTime = completedTasks.Count > 0
            ? Math.Round(completedTasks
                .Where(t => t.UpdatedAt.HasValue && t.CreatedAt != default)
                .Average(t => (t.UpdatedAt!.Value - t.CreatedAt).TotalHours), 2)
            : 0;

        var employeeSummaries = new List<EmployeeKpiSummaryDTO>();
        foreach (var emp in employees)
        {
            var empCompletedTasks = completedTasks
                .Where(t => t.Assignments.Any(a => a.AssignedUserId == emp.Id))
                .ToList();

            var empCompletedInRange = empCompletedTasks
                .Where(t => t.UpdatedAt >= dateStart && t.UpdatedAt <= dateEnd)
                .ToList();

            var empOnTime = empCompletedInRange.Count(t => t.IsApproved == true);
            var empLate = empCompletedInRange.Count(t => t.IsApproved == false);
            var empActive = activeTasks > 0 ? allDeptTasks
                .Where(t => t.Assignments.Any(a => a.AssignedUserId == emp.Id))
                .Count(t => t.Status != Models.Enums.TaskStatus.Completed && t.Status != Models.Enums.TaskStatus.Cancelled) : 0;

            employeeSummaries.Add(new EmployeeKpiSummaryDTO
            {
                EmployeeId = emp.Id,
                EmployeeNumber = emp.EmployeeNumber,
                FullName = $"{emp.FirstName} {emp.LastName}".Trim(),
                CompletedTasks = empCompletedInRange.Count,
                OnTimeTasks = empOnTime,
                LateTasks = empLate,
                ActiveTasks = empActive,
                OnTimeRate = empCompletedInRange.Count > 0
                    ? Math.Round((double)empOnTime / empCompletedInRange.Count * 100, 2)
                    : 0
            });
        }

        var result = new DepartmentKpiDTO
        {
            DepartmentId = dept.Id,
            DepartmentName = dept.Name,
            TotalEmployees = employees.Count,
            TotalTasks = totalTasks,
            CompletedTasks = totalInRange,
            OnTimeTasks = onTimeTasks,
            LateTasks = lateTasks,
            OverdueTasks = overdueTasks,
            ActiveTasks = activeTasks,
            OnTimeRate = totalInRange > 0 ? Math.Round((double)onTimeTasks / totalInRange * 100, 2) : 0,
            CompletionRate = totalTasks > 0 ? Math.Round((double)completedEver / totalTasks * 100, 2) : 0,
            AvgCompletionTimeHours = avgCompletionTime,
            EmployeeSummaries = employeeSummaries
        };

        return ApiResponseDTO<DepartmentKpiDTO>.Success(result);
    }

    public async Task<ApiResponseDTO<ReportFilterOptionsDTO>> GetReportFilterOptionsAsync(
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId)
    {
        var departments = await _db.Departments
            .Where(d => d.IsActive)
            .Where(d => requestUserRole != UserRole.Coordinator || requestUserDepartmentId == null || d.Id == requestUserDepartmentId.Value)
            .OrderBy(d => d.Name)
            .Select(d => new ReportFilterOptionDTO { Id = d.Id, Name = d.Name })
            .ToListAsync();

        var employees = await _db.Users
            .Where(u => u.IsActive && !u.IsDeactivated)
            .Where(u => requestUserRole != UserRole.Coordinator || requestUserDepartmentId == null || u.DepartmentId == requestUserDepartmentId.Value)
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Select(u => new ReportFilterOptionDTO
            {
                Id = u.Id,
                Name = $"{u.FirstName} {u.LastName}".Trim()
            })
            .ToListAsync();

        return ApiResponseDTO<ReportFilterOptionsDTO>.Success(new ReportFilterOptionsDTO
        {
            Departments = departments,
            Employees = employees
        });
    }

    public async Task<ApiResponseDTO<TaskCompletionReportDTO>> GetTaskCompletionReportAsync(
        DateTime? dateRangeStart,
        DateTime? dateRangeEnd,
        Guid? employeeId,
        string? taskPriorityLevel,
        string? taskStatus,
        string? taskCategory,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId)
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
            .Include(t => t.AssignedDepartment)
            .Where(t => t.CreatedAt >= dateStart && t.CreatedAt <= dateEnd);

        if (requestUserRole == UserRole.Coordinator && requestUserDepartmentId.HasValue)
            query = query.Where(t => t.AssignedDepartmentId == requestUserDepartmentId.Value);

        if (employeeId.HasValue)
            query = query.Where(t => t.Assignments.Any(a => a.AssignedUserId == employeeId.Value));

        if (!string.IsNullOrWhiteSpace(taskPriorityLevel))
        {
            var priority = ParsePriorityLevel(taskPriorityLevel);
            if (priority.HasValue)
                query = query.Where(t => t.PriorityLevel == priority.Value);
        }

        if (!string.IsNullOrWhiteSpace(taskStatus))
        {
            if (string.Equals(taskStatus.Trim(), "overdue", StringComparison.OrdinalIgnoreCase))
            {
                var nowUtc = DateTime.UtcNow;
                query = query.Where(t =>
                    (t.RevisedDeadline ?? t.Deadline) < nowUtc
                    && t.Status != Models.Enums.TaskStatus.Completed
                    && t.Status != Models.Enums.TaskStatus.Cancelled);
            }
            else
            {
                var status = ParseTaskStatus(taskStatus);
                if (status.HasValue)
                    query = query.Where(t => t.Status == status.Value);
            }
        }

        if (!string.IsNullOrWhiteSpace(taskCategory))
        {
            var classification = ParseTaskClassification(taskCategory);
            if (classification.HasValue)
                query = query.Where(t => t.Classification == classification.Value);
        }

        var tasks = await query.ToListAsync();

        if (tasks.Count == 0)
            return ApiResponseDTO<TaskCompletionReportDTO>.Failure("No tasks found for the selected criteria.");

        var now = DateTime.UtcNow;
        var totalAssigned = tasks.Count;
        var totalCompleted = tasks.Count(t => t.Status == Models.Enums.TaskStatus.Completed);
        var totalInProgress = tasks.Count(t => t.Status == Models.Enums.TaskStatus.InProgress);
        var totalPendingReview = tasks.Count(t => t.Status == Models.Enums.TaskStatus.DonePendingReview);
        var totalOverdue = tasks.Count(t =>
            (t.RevisedDeadline ?? t.Deadline) < now
            && t.Status != Models.Enums.TaskStatus.Completed
            && t.Status != Models.Enums.TaskStatus.Cancelled);

        var completedTasks = tasks.Where(t => t.Status == Models.Enums.TaskStatus.Completed).ToList();
        var onTimeCompleted = completedTasks.Count(t => (t.UpdatedAt ?? t.CreatedAt) <= (t.RevisedDeadline ?? t.Deadline));
        var overallOnTimeRate = totalCompleted > 0 ? Math.Round((double)onTimeCompleted / totalCompleted * 100, 1) : 0;
        var avgHours = completedTasks.Count > 0
            ? Math.Round(completedTasks.Average(t => ((t.UpdatedAt ?? t.CreatedAt) - t.CreatedAt).TotalHours), 1)
            : 0;

        var employeeSummary = tasks
            .SelectMany(t => t.Assignments.Select(a => new
            {
                a.AssignedUser,
                Task = t,
                IsCompleted = t.Status == Models.Enums.TaskStatus.Completed
            }))
            .Where(x => x.AssignedUser != null)
            .GroupBy(x => x.AssignedUser!.Id)
            .Select(g =>
            {
                var total = g.Count();
                var completed = g.Count(x => x.IsCompleted);
                var completedAvg = completed > 0
                    ? Math.Round(g.Where(x => x.IsCompleted)
                        .Average(x => ((x.Task.UpdatedAt ?? x.Task.CreatedAt) - x.Task.CreatedAt).TotalHours), 1)
                    : 0;
                return new TaskCompletionEmployeeSummaryDTO
                {
                    EmployeeName = $"{g.First().AssignedUser!.FirstName} {g.First().AssignedUser!.LastName}".Trim(),
                    TotalAssigned = total,
                    TotalCompleted = completed,
                    CompletionRate = total > 0 ? Math.Round((double)completed / total * 100, 1) : 0,
                    AverageCompletionTimeHours = completedAvg
                };
            })
            .OrderByDescending(e => e.CompletionRate)
            .ToList();

        var granularTasks = tasks
            .OrderByDescending(t => t.CreatedAt)
            .Select(t =>
            {
                var assignee = t.Assignments.FirstOrDefault()?.AssignedUser;
                var assigneeName = assignee != null ? $"{assignee.FirstName} {assignee.LastName}".Trim() : "Unassigned";
                var isCompleted = t.Status == Models.Enums.TaskStatus.Completed;
                var deadline = t.RevisedDeadline ?? t.Deadline;
                var isOnTime = isCompleted
                    ? (t.UpdatedAt.HasValue && t.UpdatedAt.Value <= deadline)
                    : (now <= deadline);
                var durationHours = isCompleted && t.UpdatedAt.HasValue
                    ? Math.Round((t.UpdatedAt.Value - t.CreatedAt).TotalHours, 1)
                    : Math.Round((now - t.CreatedAt).TotalHours, 1);
                var overdueHours = 0.0;
                if (isCompleted && t.UpdatedAt.HasValue && t.UpdatedAt.Value > deadline)
                {
                    overdueHours = Math.Round((t.UpdatedAt.Value - deadline).TotalHours, 1);
                }
                else if (!isCompleted && t.Status != Models.Enums.TaskStatus.Cancelled && now > deadline)
                {
                    overdueHours = Math.Round((now - deadline).TotalHours, 1);
                }

                return new TaskCompletionItemDTO
                {
                    TaskId = t.Id,
                    TaskReferenceNumber = $"TSK-{t.Id.ToString()[..8].ToUpper()}",
                    Title = t.Title,
                    AssignedEmployee = assigneeName,
                    Department = t.AssignedDepartment?.Name ?? (assignee?.Department?.Name ?? "Unassigned"),
                    Priority = t.PriorityLevel.ToString(),
                    Classification = t.Classification.ToString(),
                    CreatedAt = t.CreatedAt,
                    Deadline = t.Deadline,
                    RevisedDeadline = t.RevisedDeadline,
                    CompletedAt = isCompleted ? t.UpdatedAt : null,
                    DurationHours = durationHours,
                    IsOnTime = isOnTime,
                    OverdueHours = overdueHours,
                    Status = t.Status.ToString()
                };
            })
            .ToList();

        var report = new TaskCompletionReportDTO
        {
            TotalTasksAssigned = totalAssigned,
            TotalTasksCompleted = totalCompleted,
            TotalTasksInProgress = totalInProgress,
            TotalTasksPendingReview = totalPendingReview,
            TotalOverdueTasks = totalOverdue,
            TaskCompletionRate = totalAssigned > 0 ? Math.Round((double)totalCompleted / totalAssigned * 100, 1) : 0,
            OverallOnTimeRate = overallOnTimeRate,
            AverageTaskCompletionTimeHours = avgHours,
            EmployeePerformanceSummary = employeeSummary,
            Tasks = granularTasks
        };

        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Read,
            "TaskCompletionReport",
            null,
            null,
            $"Task completion report accessed. Period: {dateStart:yyyy-MM-dd} to {dateEnd:yyyy-MM-dd}, Tasks: {totalAssigned}",
            "Reports");

        return ApiResponseDTO<TaskCompletionReportDTO>.Success(report);
    }

    public async Task<ApiResponseDTO<byte[]>> ExportTaskCompletionReportAsync(
        TaskCompletionReportDTO reportData,
        ExportFormat format)
    {
        byte[] fileBytes;
        string contentType;
        string fileName;

        switch (format)
        {
            case ExportFormat.Excel:
                fileBytes = GenerateTaskCompletionExcel(reportData);
                contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                fileName = $"TaskCompletionReport_{DateTime.UtcNow:yyyyMMdd}.xlsx";
                break;

            case ExportFormat.Pdf:
                fileBytes = GenerateTaskCompletionPdf(reportData);
                contentType = "application/pdf";
                fileName = $"TaskCompletionReport_{DateTime.UtcNow:yyyyMMdd}.pdf";
                break;

            case ExportFormat.Csv:
                fileBytes = GenerateTaskCompletionCsv(reportData);
                contentType = "text/csv; charset=utf-8";
                fileName = $"TaskCompletionReport_{DateTime.UtcNow:yyyyMMdd}.csv";
                break;

            default:
                return ApiResponseDTO<byte[]>.Failure("Unsupported export format.");
        }

        await _auditLogService.LogAsync(
            null,
            AuditActionType.Export,
            "TaskCompletionReport",
            null,
            null,
            $"Task completion report exported as {format}. Tasks: {reportData.TotalTasksAssigned}",
            "Reports");

        return ApiResponseDTO<byte[]>.Success(fileBytes, $"Task completion report exported successfully|{fileName}|{contentType}");
    }

    public async Task<ApiResponseDTO<OperationalSummaryReportDTO>> GetOperationalSummaryAsync(
        DateTime? dateRangeStart,
        DateTime? dateRangeEnd,
        Guid? departmentId,
        Guid? employeeId,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId)
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
            .Include(t => t.AssignedDepartment)
            .Where(t => t.CreatedAt >= dateStart && t.CreatedAt <= dateEnd);

        if (requestUserRole == UserRole.Coordinator && requestUserDepartmentId.HasValue)
            query = query.Where(t => t.AssignedDepartmentId == requestUserDepartmentId.Value);

        if (departmentId.HasValue)
            query = query.Where(t => t.AssignedDepartmentId == departmentId.Value);

        if (employeeId.HasValue)
            query = query.Where(t => t.Assignments.Any(a => a.AssignedUserId == employeeId.Value));

        var tasks = await query.ToListAsync();

        if (tasks.Count == 0)
            return ApiResponseDTO<OperationalSummaryReportDTO>.Failure("No tasks found for the selected criteria.");

        var now = DateTime.UtcNow;
        var completedCount = tasks.Count(t => t.Status == Models.Enums.TaskStatus.Completed);
        var pendingCount = tasks.Count(t =>
            t.Status != Models.Enums.TaskStatus.Completed
            && t.Status != Models.Enums.TaskStatus.Cancelled);
        var overdueCount = tasks.Count(t =>
            (t.RevisedDeadline ?? t.Deadline) < now
            && t.Status != Models.Enums.TaskStatus.Completed
            && t.Status != Models.Enums.TaskStatus.Cancelled);

        var onTimeCompleted = tasks.Count(t => t.Status == Models.Enums.TaskStatus.Completed && (t.UpdatedAt ?? t.CreatedAt) <= (t.RevisedDeadline ?? t.Deadline));
        var overallOnTimeRate = completedCount > 0 ? Math.Round((double)onTimeCompleted / completedCount * 100, 1) : 0;
        var slaBreachedTotal = tasks.Count(t =>
            (t.Status == Models.Enums.TaskStatus.Completed && (t.UpdatedAt ?? t.CreatedAt) > (t.RevisedDeadline ?? t.Deadline)) ||
            (t.Status != Models.Enums.TaskStatus.Completed && t.Status != Models.Enums.TaskStatus.Cancelled && (t.RevisedDeadline ?? t.Deadline) < now));
        var overallSlaBreachRate = tasks.Count > 0 ? Math.Round((double)slaBreachedTotal / tasks.Count * 100, 1) : 0;

        // Fetch all active departments to compute department operational & workload balance summaries
        var allDepts = await _db.Departments
            .Include(d => d.Users)
            .Where(d => d.IsActive)
            .ToListAsync();

        var deptSummaries = allDepts.Select(dept =>
        {
            var deptTasks = tasks.Where(t => t.AssignedDepartmentId == dept.Id).ToList();
            var totalDept = deptTasks.Count;
            var completedDept = deptTasks.Count(t => t.Status == Models.Enums.TaskStatus.Completed);
            var activeDept = deptTasks.Count(t => t.Status != Models.Enums.TaskStatus.Completed && t.Status != Models.Enums.TaskStatus.Cancelled);
            var slaBreached = deptTasks.Count(t =>
                (t.Status == Models.Enums.TaskStatus.Completed && (t.UpdatedAt ?? t.CreatedAt) > (t.RevisedDeadline ?? t.Deadline)) ||
                (t.Status != Models.Enums.TaskStatus.Completed && t.Status != Models.Enums.TaskStatus.Cancelled && (t.RevisedDeadline ?? t.Deadline) < now));
            var atRisk = deptTasks.Count(t =>
                t.Status != Models.Enums.TaskStatus.Completed && t.Status != Models.Enums.TaskStatus.Cancelled &&
                (t.RevisedDeadline ?? t.Deadline) >= now && (t.RevisedDeadline ?? t.Deadline) <= now.AddHours(24));
            var onTime = completedDept > 0 ? Math.Round((double)deptTasks.Count(t => t.Status == Models.Enums.TaskStatus.Completed && (t.UpdatedAt ?? t.CreatedAt) <= (t.RevisedDeadline ?? t.Deadline)) / completedDept * 100, 1) : 0;
            var breachRate = totalDept > 0 ? Math.Round((double)slaBreached / totalDept * 100, 1) : 0;
            var memberCount = dept.Users.Count(m => m.IsActive && !m.IsDeactivated);
            var tasksPerMember = Math.Round((double)activeDept / (memberCount > 0 ? memberCount : 1), 1);
            var workloadStatus = tasksPerMember > 5.0 ? "Overloaded" : (tasksPerMember >= 3.5 ? "Moderate" : "Balanced");

            return new DepartmentOperationalSummaryDTO
            {
                DepartmentId = dept.Id,
                DepartmentName = dept.Name,
                TotalTasks = totalDept,
                CompletedTasks = completedDept,
                ActiveTasks = activeDept,
                SlaBreachedTasks = slaBreached,
                AtRiskTasks = atRisk,
                OnTimeRate = onTime,
                SlaBreachRate = breachRate,
                TasksPerMember = tasksPerMember,
                WorkloadBalanceStatus = workloadStatus
            };
        }).OrderByDescending(d => d.TotalTasks).ToList();

        var employeeSummary = tasks
            .SelectMany(t => t.Assignments.Select(a => new
            {
                a.AssignedUser,
                Task = t,
                IsCompleted = t.Status == Models.Enums.TaskStatus.Completed,
                IsOverdue = (t.RevisedDeadline ?? t.Deadline) < now
                    && t.Status != Models.Enums.TaskStatus.Completed
                    && t.Status != Models.Enums.TaskStatus.Cancelled
            }))
            .Where(x => x.AssignedUser != null)
            .GroupBy(x => x.AssignedUser!.Id)
            .Select(g =>
            {
                var total = g.Count();
                var completed = g.Count(x => x.IsCompleted);
                var overdue = g.Count(x => x.IsOverdue);
                return new OperationalEmployeePerformanceDTO
                {
                    EmployeeName = $"{g.First().AssignedUser!.FirstName} {g.First().AssignedUser!.LastName}".Trim(),
                    Assigned = total,
                    Completed = completed,
                    Overdue = overdue,
                    CompletionRate = total > 0 ? Math.Round((double)completed / total * 100, 1) : 0
                };
            })
            .OrderByDescending(e => e.CompletionRate)
            .ToList();

        var workloadByCategory = tasks
            .GroupBy(t => t.Classification.ToString())
            .Select(g => new ReportWorkloadItemDTO
            {
                CategoryName = g.Key,
                TaskCount = g.Count(),
                Percentage = tasks.Count > 0 ? Math.Round((double)g.Count() / tasks.Count * 100, 1) : 0
            })
            .OrderByDescending(w => w.TaskCount)
            .ToList();

        var workloadByDepartment = tasks
            .GroupBy(t => t.AssignedDepartment?.Name ?? "Unassigned")
            .Select(g => new ReportWorkloadItemDTO
            {
                CategoryName = g.Key,
                TaskCount = g.Count(),
                Percentage = tasks.Count > 0 ? Math.Round((double)g.Count() / tasks.Count * 100, 1) : 0
            })
            .OrderByDescending(w => w.TaskCount)
            .ToList();

        var workloadByPriority = tasks
            .GroupBy(t => t.PriorityLevel.ToString())
            .Select(g => new ReportWorkloadItemDTO
            {
                CategoryName = g.Key,
                TaskCount = g.Count(),
                Percentage = tasks.Count > 0 ? Math.Round((double)g.Count() / tasks.Count * 100, 1) : 0
            })
            .OrderByDescending(w => w.TaskCount)
            .ToList();

        var report = new OperationalSummaryReportDTO
        {
            TotalTasks = tasks.Count,
            CompletedTasks = completedCount,
            PendingTasks = pendingCount,
            OverdueTasks = overdueCount,
            TaskCompletionRate = tasks.Count > 0 ? Math.Round((double)completedCount / tasks.Count * 100, 1) : 0,
            OverallOnTimeRate = overallOnTimeRate,
            OverallSlaBreachRate = overallSlaBreachRate,
            DepartmentSummaries = deptSummaries,
            EmployeePerformanceSummary = employeeSummary,
            WorkloadByCategory = workloadByCategory,
            WorkloadByDepartment = workloadByDepartment,
            WorkloadByPriority = workloadByPriority
        };

        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Read,
            "OperationalSummaryReport",
            null,
            null,
            $"Operational summary report accessed. Period: {dateStart:yyyy-MM-dd} to {dateEnd:yyyy-MM-dd}, Tasks: {tasks.Count}",
            "Reports");

        return ApiResponseDTO<OperationalSummaryReportDTO>.Success(report);
    }

    public async Task<ApiResponseDTO<byte[]>> ExportOperationalSummaryAsync(
        OperationalSummaryReportDTO reportData,
        string reportFormat)
    {
        byte[] fileBytes;
        string contentType;
        string fileName;

        switch (reportFormat.ToUpperInvariant())
        {
            case "EXCEL":
                fileBytes = GenerateOperationalSummaryExcel(reportData);
                contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                fileName = $"OperationalSummaryReport_{DateTime.UtcNow:yyyyMMdd}.xlsx";
                break;

            case "PDF":
                fileBytes = GenerateOperationalSummaryPdf(reportData);
                contentType = "application/pdf";
                fileName = $"OperationalSummaryReport_{DateTime.UtcNow:yyyyMMdd}.pdf";
                break;

            case "CSV":
                fileBytes = GenerateOperationalSummaryCsv(reportData);
                contentType = "text/csv; charset=utf-8";
                fileName = $"OperationalSummaryReport_{DateTime.UtcNow:yyyyMMdd}.csv";
                break;

            default:
                return ApiResponseDTO<byte[]>.Failure("Unsupported export format.");
        }

        await _auditLogService.LogAsync(
            null,
            AuditActionType.Export,
            "OperationalSummaryReport",
            null,
            null,
            $"Operational summary report exported as {reportFormat.ToUpperInvariant()}.",
            "Reports");

        return ApiResponseDTO<byte[]>.Success(fileBytes, $"Operational summary exported successfully|{fileName}|{contentType}");
    }

    public async Task<ApiResponseDTO<FinancialReportDTO>> GetFinancialReportAsync(
        DateTime? dateRangeStart,
        DateTime? dateRangeEnd,
        Guid? departmentId,
        Guid? employeeId,
        string? fiscalPeriod,
        Guid requestUserId,
        UserRole requestUserRole,
        Guid? requestUserDepartmentId)
    {
        var dateStart = dateRangeStart.HasValue
            ? DateTime.SpecifyKind(dateRangeStart.Value, DateTimeKind.Utc)
            : DateTime.UtcNow.AddMonths(-1);
        var dateEnd = dateRangeEnd.HasValue
            ? DateTime.SpecifyKind(dateRangeEnd.Value, DateTimeKind.Utc).Date.AddDays(1).AddTicks(-1)
            : DateTime.UtcNow;

        if (requestUserRole == UserRole.Coordinator && requestUserDepartmentId.HasValue)
        {
            departmentId = requestUserDepartmentId.Value;
        }

        string? filterDeptName = null;
        if (departmentId.HasValue)
        {
            filterDeptName = await _db.Departments
                .Where(d => d.Id == departmentId.Value)
                .Select(d => d.Name)
                .FirstOrDefaultAsync();
        }

        var invoices = GenerateMockFinancialInvoices(dateStart, dateEnd, filterDeptName, fiscalPeriod);

        var totalBilled = invoices.Sum(i => i.AmountBilled);
        var totalCollected = invoices.Sum(i => i.AmountPaid);
        var totalOutstanding = invoices.Sum(i => i.OutstandingBalance);
        var collectionRate = totalBilled > 0 ? Math.Round((double)(totalCollected / totalBilled) * 100, 1) : 0;
        var overdueCount = invoices.Count(i => i.PaymentStatus == "Overdue");

        var report = new FinancialReportDTO
        {
            TotalBilled = totalBilled,
            TotalCollected = totalCollected,
            TotalOutstanding = totalOutstanding,
            CollectionRate = collectionRate,
            TotalInvoices = invoices.Count,
            OverdueInvoicesCount = overdueCount,
            FiscalPeriod = string.IsNullOrWhiteSpace(fiscalPeriod) ? $"FY{dateStart.Year}" : fiscalPeriod,
            DateRangeStart = dateStart,
            DateRangeEnd = dateEnd,
            Invoices = invoices
        };

        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Read,
            "FinancialReport",
            null,
            null,
            $"Financial FOMS report accessed. Period: {dateStart:yyyy-MM-dd} to {dateEnd:yyyy-MM-dd}, Invoices: {invoices.Count}",
            "Reports");

        return ApiResponseDTO<FinancialReportDTO>.Success(report);
    }

    public async Task<ApiResponseDTO<byte[]>> ExportFinancialReportAsync(
        FinancialReportDTO reportData,
        ExportFormat format)
    {
        byte[] fileBytes;
        string contentType;
        string fileName;

        switch (format)
        {
            case ExportFormat.Excel:
                fileBytes = GenerateFinancialExcel(reportData);
                contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                fileName = $"FinancialReport_FOMS_{reportData.DateRangeStart:yyyyMMdd}_{reportData.DateRangeEnd:yyyyMMdd}.xlsx";
                break;

            case ExportFormat.Pdf:
                fileBytes = GenerateFinancialPdf(reportData);
                contentType = "application/pdf";
                fileName = $"FinancialReport_FOMS_{reportData.DateRangeStart:yyyyMMdd}_{reportData.DateRangeEnd:yyyyMMdd}.pdf";
                break;

            case ExportFormat.Csv:
                fileBytes = GenerateFinancialCsv(reportData);
                contentType = "text/csv; charset=utf-8";
                fileName = $"FinancialReport_FOMS_{reportData.DateRangeStart:yyyyMMdd}_{reportData.DateRangeEnd:yyyyMMdd}.csv";
                break;

            default:
                return ApiResponseDTO<byte[]>.Failure("Unsupported export format.");
        }

        await _auditLogService.LogAsync(
            null,
            AuditActionType.Export,
            "FinancialReport",
            null,
            null,
            $"Financial report exported as {format}. Invoices: {reportData.TotalInvoices}",
            "Reports");

        return ApiResponseDTO<byte[]>.Success(fileBytes, $"Financial report exported successfully|{fileName}|{contentType}");
    }

    private static PriorityLevel? ParsePriorityLevel(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = value.Trim();
        if (Enum.TryParse<PriorityLevel>(normalized, true, out var parsed)) return parsed;
        return normalized.ToLowerInvariant() switch
        {
            "urgent" => PriorityLevel.Urgent,
            "high" => PriorityLevel.High,
            "medium" => PriorityLevel.Medium,
            "low" => PriorityLevel.Low,
            _ => null
        };
    }

    private static Models.Enums.TaskStatus? ParseTaskStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = value.Trim();
        if (Enum.TryParse<Models.Enums.TaskStatus>(normalized, true, out var parsed)) return parsed;
        return normalized.ToLowerInvariant() switch
        {
            "pending" => Models.Enums.TaskStatus.NotStarted,
            "in progress" => Models.Enums.TaskStatus.InProgress,
            "pending admin review" => Models.Enums.TaskStatus.DonePendingReview,
            "done" => Models.Enums.TaskStatus.Completed,
            "overdue" => null,
            _ => null
        };
    }

    private static TaskClassification? ParseTaskClassification(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = value.Trim();
        if (Enum.TryParse<TaskClassification>(normalized, true, out var parsed)) return parsed;
        return normalized.ToLowerInvariant() switch
        {
            "routine daily task" => TaskClassification.RoutineDailyTask,
            "routine" => TaskClassification.RoutineDailyTask,
            "special task" => TaskClassification.SpecialTask,
            "special" => TaskClassification.SpecialTask,
            _ => null
        };
    }

    // --- Task Completion Report Generators ---

    private byte[] GenerateTaskCompletionExcel(TaskCompletionReportDTO report)
    {
        using var workbook = new XLWorkbook();
        var worksheet = workbook.Worksheets.Add("Task Completion");
        worksheet.ShowGridLines = true;

        worksheet.Cell(1, 1).Value = "STARS Task Completion Report";
        worksheet.Cell(1, 1).Style.Font.Bold = true;
        worksheet.Cell(1, 1).Style.Font.FontSize = 16;
        worksheet.Cell(1, 1).Style.Font.FontColor = XLColor.FromHtml("#00A99D");
        worksheet.Range(1, 1, 1, 13).Merge();

        worksheet.Cell(2, 1).Value = $"Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm UTC}";
        worksheet.Cell(2, 1).Style.Font.FontSize = 10;
        worksheet.Cell(2, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");
        worksheet.Range(2, 1, 2, 13).Merge();

        worksheet.Cell(4, 1).Value = "KPI Summary";
        worksheet.Cell(4, 1).Style.Font.Bold = true;
        worksheet.Cell(4, 1).Style.Font.FontSize = 11;
        worksheet.Cell(4, 1).Style.Font.FontColor = XLColor.FromHtml("#1E293B");

        worksheet.Cell(5, 1).Value = "Total Tasks Assigned:";
        worksheet.Cell(5, 1).Style.Font.Bold = true;
        worksheet.Cell(5, 2).Value = report.TotalTasksAssigned;
        worksheet.Cell(5, 4).Value = "Total Tasks Completed:";
        worksheet.Cell(5, 4).Style.Font.Bold = true;
        worksheet.Cell(5, 5).Value = report.TotalTasksCompleted;

        worksheet.Cell(6, 1).Value = "Completion Rate:";
        worksheet.Cell(6, 1).Style.Font.Bold = true;
        worksheet.Cell(6, 2).Value = $"{report.TaskCompletionRate}%";
        worksheet.Cell(6, 4).Value = "On-Time Rate:";
        worksheet.Cell(6, 4).Style.Font.Bold = true;
        worksheet.Cell(6, 5).Value = $"{report.OverallOnTimeRate}%";

        worksheet.Cell(7, 1).Value = "Tasks In Progress:";
        worksheet.Cell(7, 1).Style.Font.Bold = true;
        worksheet.Cell(7, 2).Value = report.TotalTasksInProgress;
        worksheet.Cell(7, 4).Value = "Pending Review:";
        worksheet.Cell(7, 4).Style.Font.Bold = true;
        worksheet.Cell(7, 5).Value = report.TotalTasksPendingReview;

        worksheet.Cell(8, 1).Value = "Overdue Tasks:";
        worksheet.Cell(8, 1).Style.Font.Bold = true;
        worksheet.Cell(8, 2).Value = report.TotalOverdueTasks;
        worksheet.Cell(8, 4).Value = "Avg Duration (Hrs):";
        worksheet.Cell(8, 4).Style.Font.Bold = true;
        worksheet.Cell(8, 5).Value = report.AverageTaskCompletionTimeHours;

        var headerRow = 10;
        worksheet.Row(headerRow).Height = 26;
        var headers = new[]
        {
            "Reference", "Task Title", "Assigned Employee", "Department",
            "Priority", "Category", "Created At", "Deadline", "Completed At",
            "Duration (hrs)", "On-Time?", "Overdue (hrs)", "Status"
        };
        for (int i = 0; i < headers.Length; i++)
        {
            var cell = worksheet.Cell(headerRow, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#00A99D");
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            cell.Style.Alignment.Horizontal = (i <= 3) ? XLAlignmentHorizontalValues.Left : XLAlignmentHorizontalValues.Center;
            cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            cell.Style.Border.OutsideBorderColor = XLColor.FromHtml("#007A71");
        }

        var dataRow = headerRow + 1;
        int rowIndex = 0;
        foreach (var task in report.Tasks)
        {
            var rowColor = (rowIndex % 2 == 1) ? XLColor.FromHtml("#F8FAFC") : XLColor.White;
            worksheet.Row(dataRow).Height = 20;

            worksheet.Cell(dataRow, 1).Value = task.TaskReferenceNumber;
            worksheet.Cell(dataRow, 2).Value = task.Title;
            worksheet.Cell(dataRow, 3).Value = task.AssignedEmployee;
            worksheet.Cell(dataRow, 4).Value = task.Department;
            worksheet.Cell(dataRow, 5).Value = task.Priority;
            worksheet.Cell(dataRow, 6).Value = task.Classification;
            worksheet.Cell(dataRow, 7).Value = task.CreatedAt.ToString("yyyy-MM-dd HH:mm");
            worksheet.Cell(dataRow, 8).Value = (task.RevisedDeadline ?? task.Deadline).ToString("yyyy-MM-dd HH:mm");
            worksheet.Cell(dataRow, 9).Value = task.CompletedAt.HasValue ? task.CompletedAt.Value.ToString("yyyy-MM-dd HH:mm") : "-";
            worksheet.Cell(dataRow, 10).Value = task.DurationHours;
            worksheet.Cell(dataRow, 11).Value = task.IsOnTime ? "Yes" : "No";
            worksheet.Cell(dataRow, 12).Value = task.OverdueHours > 0 ? task.OverdueHours : 0;
            worksheet.Cell(dataRow, 13).Value = task.Status;

            for (int col = 1; col <= 13; col++)
            {
                var c = worksheet.Cell(dataRow, col);
                c.Style.Fill.BackgroundColor = rowColor;
                c.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                c.Style.Border.OutsideBorderColor = XLColor.FromHtml("#E2E8F0");
                c.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                if (col >= 5 && col != 13) c.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            }

            dataRow++;
            rowIndex++;
        }

        worksheet.Columns().AdjustToContents(10, 45);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private byte[] GenerateTaskCompletionPdf(TaskCompletionReportDTO report)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(25);
                page.DefaultTextStyle(x => x.FontSize(9));

                page.Header().Column(column =>
                {
                    column.Item().Text("STARS Task Completion Report")
                        .FontSize(18).Bold();
                    column.Item().PaddingTop(4).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                });

                page.Content().PaddingVertical(10).Column(column =>
                {
                    column.Item().PaddingBottom(8).Text("Summary (The 5 KPIs)").FontSize(13).Bold();

                    column.Item().Row(row =>
                    {
                        row.RelativeItem().Text($"Assigned: {report.TotalTasksAssigned}").Bold();
                        row.RelativeItem().Text($"Completed: {report.TotalTasksCompleted}").Bold();
                        row.RelativeItem().Text($"Comp. Rate: {report.TaskCompletionRate}%");
                        row.RelativeItem().Text($"On-Time Rate: {report.OverallOnTimeRate}%");
                        row.RelativeItem().Text($"Overdue: {report.TotalOverdueTasks}");
                        row.RelativeItem().Text($"Avg Duration: {report.AverageTaskCompletionTimeHours}h");
                    });

                    column.Item().PaddingTop(12).Text("Granular Task Records (Who, When, Was It Late)").FontSize(13).Bold();

                    column.Item().PaddingTop(4).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(1.4f); // Ref
                            columns.RelativeColumn(2.5f); // Title
                            columns.RelativeColumn(2f);   // Assignee
                            columns.RelativeColumn(1.8f); // Dept
                            columns.RelativeColumn(1f);   // Priority
                            columns.RelativeColumn(1.5f); // Created
                            columns.RelativeColumn(1.5f); // Deadline
                            columns.RelativeColumn(1f);   // Duration
                            columns.RelativeColumn(1f);   // On-Time
                            columns.RelativeColumn(1.2f); // Status
                        });

                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Ref #").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Title").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Assignee").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Dept").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Priority").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Created").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Deadline").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Duration").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("On-Time").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Status").Bold();
                        });

                        foreach (var t in report.Tasks.Take(100))
                        {
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(t.TaskReferenceNumber);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(t.Title);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(t.AssignedEmployee);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(t.Department);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(t.Priority);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(t.CreatedAt.ToString("MM/dd HH:mm"));
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text((t.RevisedDeadline ?? t.Deadline).ToString("MM/dd HH:mm"));
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"{t.DurationHours}h");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(t.IsOnTime ? "Yes" : "Late");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(t.Status);
                        }
                    });
                });

                page.Footer().AlignCenter().Text(x =>
                {
                    x.Span("Generated: ");
                    x.Span(DateTime.UtcNow.ToString("MMM dd, yyyy HH:mm UTC"));
                    x.Span(" | Page ");
                    x.CurrentPageNumber();
                    x.Span(" of ");
                    x.TotalPages();
                });
            });
        });

        using var stream = new MemoryStream();
        document.GeneratePdf(stream);
        return stream.ToArray();
    }

    private byte[] GenerateTaskCompletionCsv(TaskCompletionReportDTO report)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("STARS Task Completion Report");
        sb.AppendLine($"Total Tasks Assigned,{report.TotalTasksAssigned}");
        sb.AppendLine($"Total Tasks Completed,{report.TotalTasksCompleted}");
        sb.AppendLine($"Task Completion Rate,{report.TaskCompletionRate}%");
        sb.AppendLine($"Overall On-Time Rate,{report.OverallOnTimeRate}%");
        sb.AppendLine($"Total In Progress,{report.TotalTasksInProgress}");
        sb.AppendLine($"Total Pending Review,{report.TotalTasksPendingReview}");
        sb.AppendLine($"Total Overdue,{report.TotalOverdueTasks}");
        sb.AppendLine($"Average Completion Time (Hours),{report.AverageTaskCompletionTimeHours}");
        sb.AppendLine();
        sb.AppendLine("Reference,Task Title,Assigned Employee,Department,Priority,Classification,Created At,Deadline,Completed At,Duration (Hours),On-Time,Overdue (Hours),Status");

        foreach (var task in report.Tasks)
        {
            sb.AppendLine($"\"{EscapeCsv(task.TaskReferenceNumber)}\",\"{EscapeCsv(task.Title)}\",\"{EscapeCsv(task.AssignedEmployee)}\",\"{EscapeCsv(task.Department)}\",\"{EscapeCsv(task.Priority)}\",\"{EscapeCsv(task.Classification)}\",{task.CreatedAt:yyyy-MM-dd HH:mm},{(task.RevisedDeadline ?? task.Deadline):yyyy-MM-dd HH:mm},{(task.CompletedAt.HasValue ? task.CompletedAt.Value.ToString("yyyy-MM-dd HH:mm") : "-")},{task.DurationHours},{(task.IsOnTime ? "Yes" : "No")},{task.OverdueHours},\"{EscapeCsv(task.Status)}\"");
        }

        return System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    // --- Operational Summary Report Generators ---

    private byte[] GenerateOperationalSummaryExcel(OperationalSummaryReportDTO report)
    {
        using var workbook = new XLWorkbook();
        var worksheet = workbook.Worksheets.Add("Operational Summary");
        worksheet.ShowGridLines = true;

        worksheet.Cell(1, 1).Value = "STARS Operational Summary Report";
        worksheet.Cell(1, 1).Style.Font.Bold = true;
        worksheet.Cell(1, 1).Style.Font.FontSize = 16;
        worksheet.Cell(1, 1).Style.Font.FontColor = XLColor.FromHtml("#00A99D");
        worksheet.Range(1, 1, 1, 9).Merge();

        worksheet.Cell(2, 1).Value = $"Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm UTC}";
        worksheet.Cell(2, 1).Style.Font.FontSize = 10;
        worksheet.Cell(2, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");
        worksheet.Range(2, 1, 2, 9).Merge();

        worksheet.Cell(4, 1).Value = "KPI Summary";
        worksheet.Cell(4, 1).Style.Font.Bold = true;
        worksheet.Cell(4, 1).Style.Font.FontSize = 11;
        worksheet.Cell(4, 1).Style.Font.FontColor = XLColor.FromHtml("#1E293B");

        worksheet.Cell(5, 1).Value = "Total Tasks:";
        worksheet.Cell(5, 1).Style.Font.Bold = true;
        worksheet.Cell(5, 2).Value = report.TotalTasks;
        worksheet.Cell(5, 4).Value = "Completed Tasks:";
        worksheet.Cell(5, 4).Style.Font.Bold = true;
        worksheet.Cell(5, 5).Value = report.CompletedTasks;

        worksheet.Cell(6, 1).Value = "Pending Tasks:";
        worksheet.Cell(6, 1).Style.Font.Bold = true;
        worksheet.Cell(6, 2).Value = report.PendingTasks;
        worksheet.Cell(6, 4).Value = "Overdue Tasks:";
        worksheet.Cell(6, 4).Style.Font.Bold = true;
        worksheet.Cell(6, 5).Value = report.OverdueTasks;

        worksheet.Cell(7, 1).Value = "Completion Rate:";
        worksheet.Cell(7, 1).Style.Font.Bold = true;
        worksheet.Cell(7, 2).Value = $"{report.TaskCompletionRate}%";
        worksheet.Cell(7, 4).Value = "Overall On-Time Rate:";
        worksheet.Cell(7, 4).Style.Font.Bold = true;
        worksheet.Cell(7, 5).Value = $"{report.OverallOnTimeRate}%";

        worksheet.Cell(8, 1).Value = "Overall SLA Breach Rate:";
        worksheet.Cell(8, 1).Style.Font.Bold = true;
        worksheet.Cell(8, 2).Value = $"{report.OverallSlaBreachRate}%";

        // Department Summaries & Workload Balance
        var deptRow = 10;
        worksheet.Cell(deptRow, 1).Value = "Department Summaries & Workload Balance";
        worksheet.Cell(deptRow, 1).Style.Font.Bold = true;
        worksheet.Cell(deptRow, 1).Style.Font.FontSize = 12;
        worksheet.Cell(deptRow, 1).Style.Font.FontColor = XLColor.FromHtml("#1E293B");
        deptRow++;

        worksheet.Row(deptRow).Height = 26;
        var deptHeaders = new[] { "Department", "Total Tasks", "Active Tasks", "Completed", "SLA Breaches", "SLA Breach Rate", "On-Time Rate", "Tasks / Member", "Workload Status" };
        for (int i = 0; i < deptHeaders.Length; i++)
        {
            var cell = worksheet.Cell(deptRow, i + 1);
            cell.Value = deptHeaders[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#00A99D");
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            cell.Style.Alignment.Horizontal = (i == 0) ? XLAlignmentHorizontalValues.Left : XLAlignmentHorizontalValues.Center;
            cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            cell.Style.Border.OutsideBorderColor = XLColor.FromHtml("#007A71");
        }

        deptRow++;
        int deptIndex = 0;
        foreach (var d in report.DepartmentSummaries)
        {
            var rowColor = (deptIndex % 2 == 1) ? XLColor.FromHtml("#F8FAFC") : XLColor.White;
            worksheet.Row(deptRow).Height = 20;

            worksheet.Cell(deptRow, 1).Value = d.DepartmentName;
            worksheet.Cell(deptRow, 2).Value = d.TotalTasks;
            worksheet.Cell(deptRow, 3).Value = d.ActiveTasks;
            worksheet.Cell(deptRow, 4).Value = d.CompletedTasks;
            worksheet.Cell(deptRow, 5).Value = d.SlaBreachedTasks;
            worksheet.Cell(deptRow, 6).Value = $"{d.SlaBreachRate}%";
            worksheet.Cell(deptRow, 7).Value = $"{d.OnTimeRate}%";
            worksheet.Cell(deptRow, 8).Value = d.TasksPerMember;
            worksheet.Cell(deptRow, 9).Value = d.WorkloadBalanceStatus;

            for (int col = 1; col <= 9; col++)
            {
                var c = worksheet.Cell(deptRow, col);
                c.Style.Fill.BackgroundColor = rowColor;
                c.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                c.Style.Border.OutsideBorderColor = XLColor.FromHtml("#E2E8F0");
                c.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                if (col >= 2) c.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            }

            deptRow++;
            deptIndex++;
        }

        // Employee performance
        deptRow += 2;
        worksheet.Cell(deptRow, 1).Value = "Employee Performance Summary";
        worksheet.Cell(deptRow, 1).Style.Font.Bold = true;
        worksheet.Cell(deptRow, 1).Style.Font.FontSize = 12;
        worksheet.Cell(deptRow, 1).Style.Font.FontColor = XLColor.FromHtml("#1E293B");
        deptRow++;

        worksheet.Row(deptRow).Height = 26;
        var headers = new[] { "Employee", "Assigned", "Completed", "Overdue", "Completion Rate" };
        for (int i = 0; i < headers.Length; i++)
        {
            var cell = worksheet.Cell(deptRow, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#00A99D");
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            cell.Style.Alignment.Horizontal = (i == 0) ? XLAlignmentHorizontalValues.Left : XLAlignmentHorizontalValues.Center;
            cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            cell.Style.Border.OutsideBorderColor = XLColor.FromHtml("#007A71");
        }

        deptRow++;
        int empIndex = 0;
        foreach (var emp in report.EmployeePerformanceSummary)
        {
            var rowColor = (empIndex % 2 == 1) ? XLColor.FromHtml("#F8FAFC") : XLColor.White;
            worksheet.Row(deptRow).Height = 20;

            worksheet.Cell(deptRow, 1).Value = emp.EmployeeName;
            worksheet.Cell(deptRow, 2).Value = emp.Assigned;
            worksheet.Cell(deptRow, 3).Value = emp.Completed;
            worksheet.Cell(deptRow, 4).Value = emp.Overdue;
            worksheet.Cell(deptRow, 5).Value = $"{emp.CompletionRate}%";

            for (int col = 1; col <= 5; col++)
            {
                var c = worksheet.Cell(deptRow, col);
                c.Style.Fill.BackgroundColor = rowColor;
                c.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                c.Style.Border.OutsideBorderColor = XLColor.FromHtml("#E2E8F0");
                c.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                if (col >= 2) c.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            }

            deptRow++;
            empIndex++;
        }

        worksheet.Columns().AdjustToContents(10, 45);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private byte[] GenerateOperationalSummaryPdf(OperationalSummaryReportDTO report)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(25);
                page.DefaultTextStyle(x => x.FontSize(9));

                page.Header().Column(column =>
                {
                    column.Item().Text("STARS Operational Summary Report")
                        .FontSize(18).Bold();
                    column.Item().PaddingTop(4).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                });

                page.Content().PaddingVertical(10).Column(column =>
                {
                    column.Item().PaddingBottom(8).Text("Summary (The 5 KPIs)").FontSize(13).Bold();

                    column.Item().Row(row =>
                    {
                        row.RelativeItem().Text($"Total Tasks: {report.TotalTasks}").Bold();
                        row.RelativeItem().Text($"Completed: {report.CompletedTasks}").Bold();
                        row.RelativeItem().Text($"Pending: {report.PendingTasks}");
                        row.RelativeItem().Text($"Overdue: {report.OverdueTasks}");
                        row.RelativeItem().Text($"Completion Rate: {report.TaskCompletionRate}%");
                        row.RelativeItem().Text($"On-Time Rate: {report.OverallOnTimeRate}%");
                        row.RelativeItem().Text($"SLA Breach Rate: {report.OverallSlaBreachRate}%");
                    });

                    // Department SLA & Workload Balance
                    column.Item().PaddingTop(12).Text("Department Operational Overview & Workload Balance").FontSize(13).Bold();
                    column.Item().PaddingTop(4).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3); // Dept
                            columns.RelativeColumn(1.2f); // Total
                            columns.RelativeColumn(1.2f); // Active
                            columns.RelativeColumn(1.2f); // Done
                            columns.RelativeColumn(1.5f); // SLA Breaches
                            columns.RelativeColumn(1.5f); // SLA Breach %
                            columns.RelativeColumn(1.5f); // On-Time %
                            columns.RelativeColumn(1.5f); // Tasks/Member
                            columns.RelativeColumn(1.5f); // Status
                        });

                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Department").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Total").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Active").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Done").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("SLA Breach").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("SLA Breach %").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("On-Time %").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Tasks/Member").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Workload").Bold();
                        });

                        foreach (var d in report.DepartmentSummaries)
                        {
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(d.DepartmentName);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(d.TotalTasks.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(d.ActiveTasks.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(d.CompletedTasks.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(d.SlaBreachedTasks.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"{d.SlaBreachRate}%");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"{d.OnTimeRate}%");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(d.TasksPerMember.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(d.WorkloadBalanceStatus);
                        }
                    });

                    column.Item().PaddingTop(12).Text("Employee Performance").FontSize(13).Bold();
                    column.Item().PaddingTop(4).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(2);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Employee").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Assigned").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Completed").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Overdue").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Rate").Bold();
                        });

                        foreach (var emp in report.EmployeePerformanceSummary)
                        {
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.EmployeeName);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.Assigned.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.Completed.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(emp.Overdue.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"{emp.CompletionRate}%");
                        }
                    });
                });

                page.Footer().AlignCenter().Text(x =>
                {
                    x.Span("Generated: ");
                    x.Span(DateTime.UtcNow.ToString("MMM dd, yyyy HH:mm UTC"));
                    x.Span(" | Page ");
                    x.CurrentPageNumber();
                    x.Span(" of ");
                    x.TotalPages();
                });
            });
        });

        using var stream = new MemoryStream();
        document.GeneratePdf(stream);
        return stream.ToArray();
    }

    private byte[] GenerateOperationalSummaryCsv(OperationalSummaryReportDTO report)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("STARS Operational Summary Report");
        sb.AppendLine($"Total Tasks,{report.TotalTasks}");
        sb.AppendLine($"Completed Tasks,{report.CompletedTasks}");
        sb.AppendLine($"Pending Tasks,{report.PendingTasks}");
        sb.AppendLine($"Overdue Tasks,{report.OverdueTasks}");
        sb.AppendLine($"Task Completion Rate,{report.TaskCompletionRate}%");
        sb.AppendLine($"Overall On-Time Rate,{report.OverallOnTimeRate}%");
        sb.AppendLine($"Overall SLA Breach Rate,{report.OverallSlaBreachRate}%");
        sb.AppendLine();
        sb.AppendLine("Department Summaries & Workload Balance");
        sb.AppendLine("Department,Total Tasks,Active Tasks,Completed Tasks,SLA Breaches,SLA Breach Rate,On-Time Rate,Tasks Per Member,Workload Status");
        foreach (var d in report.DepartmentSummaries)
        {
            sb.AppendLine($"\"{EscapeCsv(d.DepartmentName)}\",{d.TotalTasks},{d.ActiveTasks},{d.CompletedTasks},{d.SlaBreachedTasks},{d.SlaBreachRate}%,{d.OnTimeRate}%,{d.TasksPerMember},\"{EscapeCsv(d.WorkloadBalanceStatus)}\"");
        }
        sb.AppendLine();
        sb.AppendLine("Employee Performance");
        sb.AppendLine("Employee Name,Assigned,Completed,Overdue,Completion Rate");
        foreach (var emp in report.EmployeePerformanceSummary)
        {
            sb.AppendLine($"\"{EscapeCsv(emp.EmployeeName)}\",{emp.Assigned},{emp.Completed},{emp.Overdue},{emp.CompletionRate}%");
        }

        return System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    // --- Financial Report (FOMS) Generators & Deterministic Mock Data ---

    private static readonly (string Client, string Dept, decimal BaseAmount)[] FomsClientTemplates = new[]
    {
        ("Shopee Express Hub", "Cross-Dock Operations", 45000m),
        ("Lazada Fulfillment PH", "Warehouse & Distribution", 72500m),
        ("SM Retail Distribution", "Fleet Logistics", 112000m),
        ("Nestle Supply Chain PH", "Cross-Dock Operations", 88000m),
        ("Unilever Distribution Hub", "Warehouse & Distribution", 64000m),
        ("San Miguel Pure Foods Logistics", "Fleet Logistics", 135000m),
        ("Jollibee Food Corp Dispatch", "Customer Dispatch & Support", 28500m),
        ("Robinsons Retail Central", "Cross-Dock Operations", 51200m),
        ("Zalora Hub Transport", "Fleet Logistics", 39800m),
        ("Universal Courier Partners", "Route Operations", 67400m),
        ("Luzon Cold Chain Solutions", "Warehouse & Distribution", 94000m),
        ("Bayanihan E-Commerce Express", "Customer Dispatch & Support", 31500m),
        ("Apex Cargo Forwarders", "Fleet Logistics", 125000m),
        ("Pacific Freight Systems", "Route Operations", 82300m),
        ("Highland Agribusiness Cargo", "Fleet Logistics", 48900m)
    };

    private static readonly string[] PaymentMethods = new[]
    {
        "Bank Transfer", "Corporate Check", "Electronic Funds Transfer (EFT)", "GCash Enterprise"
    };

    private static List<FinancialInvoiceItemDTO> GenerateMockFinancialInvoices(
        DateTime dateStart,
        DateTime dateEnd,
        string? filterDept,
        string? fiscalPeriod)
    {
        var invoices = new List<FinancialInvoiceItemDTO>();
        var totalDays = Math.Max(1, (int)(dateEnd - dateStart).TotalDays);
        var invoiceCount = Math.Clamp(totalDays / 2 + 8, 12, 35);
        var now = DateTime.UtcNow;

        for (int i = 0; i < invoiceCount; i++)
        {
            var templateIndex = (i + dateStart.DayOfYear) % FomsClientTemplates.Length;
            var template = FomsClientTemplates[templateIndex];
            var department = !string.IsNullOrWhiteSpace(filterDept) ? filterDept : template.Dept;

            var dayOffset = (i * totalDays) / invoiceCount;
            var billingDate = dateStart.AddDays(dayOffset).AddHours(9 + (i % 8));
            if (billingDate > dateEnd) billingDate = dateEnd.AddHours(-(i % 12));

            var dueDate = billingDate.AddDays(30);
            var seed = (dateStart.Year * 1000) + (dateStart.DayOfYear * 10) + i;
            var amountVariation = ((seed % 15) - 7) * 2500m;
            var amountBilled = Math.Max(15000m, template.BaseAmount + amountVariation);

            string status;
            decimal amountPaid;
            DateTime? paymentDate = null;

            if (dueDate < now)
            {
                if (seed % 10 < 7)
                {
                    status = "Paid";
                    amountPaid = amountBilled;
                    paymentDate = dueDate.AddDays(-((seed % 10) + 1));
                }
                else if (seed % 10 < 9)
                {
                    status = "Partially Paid";
                    amountPaid = Math.Round(amountBilled * 0.5m, 2);
                    paymentDate = dueDate.AddDays(-2);
                }
                else
                {
                    status = "Overdue";
                    amountPaid = 0m;
                }
            }
            else
            {
                if (seed % 4 == 0)
                {
                    status = "Paid";
                    amountPaid = amountBilled;
                    paymentDate = billingDate.AddDays(5);
                }
                else if (seed % 4 == 1)
                {
                    status = "Partially Paid";
                    amountPaid = Math.Round(amountBilled * 0.4m, 2);
                    paymentDate = billingDate.AddDays(10);
                }
                else
                {
                    status = "Pending";
                    amountPaid = 0m;
                }
            }

            var outstanding = amountBilled - amountPaid;
            var method = PaymentMethods[seed % PaymentMethods.Length];

            invoices.Add(new FinancialInvoiceItemDTO
            {
                InvoiceNumber = $"INV-{billingDate.Year}-{(seed % 9000 + 1000):D4}",
                FomsReference = $"FOMS-WB-{((seed * 37) % 90000 + 10000)}",
                ClientAccount = template.Client,
                Department = department,
                BillingDate = billingDate,
                DueDate = dueDate,
                PaymentDate = paymentDate,
                Currency = "PHP",
                AmountBilled = amountBilled,
                AmountPaid = amountPaid,
                OutstandingBalance = outstanding,
                PaymentStatus = status,
                PaymentMethod = method,
                FiscalPeriod = string.IsNullOrWhiteSpace(fiscalPeriod) ? $"FY{billingDate.Year}" : fiscalPeriod
            });
        }

        return invoices.OrderByDescending(i => i.BillingDate).ToList();
    }

    private byte[] GenerateFinancialExcel(FinancialReportDTO report)
    {
        using var workbook = new XLWorkbook();
        var worksheet = workbook.Worksheets.Add("Financial Ledger (FOMS)");
        worksheet.ShowGridLines = true;

        worksheet.Cell(1, 1).Value = "STARS / FOMS Financial Operations Report";
        worksheet.Cell(1, 1).Style.Font.Bold = true;
        worksheet.Cell(1, 1).Style.Font.FontSize = 16;
        worksheet.Cell(1, 1).Style.Font.FontColor = XLColor.FromHtml("#00A99D");
        worksheet.Range(1, 1, 1, 11).Merge();

        worksheet.Cell(2, 1).Value = $"Fiscal Period: {report.FiscalPeriod} | Date Range: {report.DateRangeStart:MMM dd, yyyy} - {report.DateRangeEnd:MMM dd, yyyy}";
        worksheet.Cell(2, 1).Style.Font.FontSize = 10;
        worksheet.Cell(2, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");
        worksheet.Range(2, 1, 2, 11).Merge();

        worksheet.Cell(4, 1).Value = "Financial KPI Summary";
        worksheet.Cell(4, 1).Style.Font.Bold = true;
        worksheet.Cell(4, 1).Style.Font.FontSize = 11;
        worksheet.Cell(4, 1).Style.Font.FontColor = XLColor.FromHtml("#1E293B");

        worksheet.Cell(5, 1).Value = "Total Billed:";
        worksheet.Cell(5, 1).Style.Font.Bold = true;
        worksheet.Cell(5, 2).Value = report.TotalBilled;
        worksheet.Cell(5, 2).Style.NumberFormat.Format = "₱#,##0.00";
        worksheet.Cell(5, 4).Value = "Total Collected:";
        worksheet.Cell(5, 4).Style.Font.Bold = true;
        worksheet.Cell(5, 5).Value = report.TotalCollected;
        worksheet.Cell(5, 5).Style.NumberFormat.Format = "₱#,##0.00";

        worksheet.Cell(6, 1).Value = "Outstanding Balance:";
        worksheet.Cell(6, 1).Style.Font.Bold = true;
        worksheet.Cell(6, 2).Value = report.TotalOutstanding;
        worksheet.Cell(6, 2).Style.NumberFormat.Format = "₱#,##0.00";
        worksheet.Cell(6, 4).Value = "Collection Rate:";
        worksheet.Cell(6, 4).Style.Font.Bold = true;
        worksheet.Cell(6, 5).Value = $"{report.CollectionRate}%";

        worksheet.Cell(7, 1).Value = "Total Invoices:";
        worksheet.Cell(7, 1).Style.Font.Bold = true;
        worksheet.Cell(7, 2).Value = report.TotalInvoices;
        worksheet.Cell(7, 4).Value = "Overdue Invoices:";
        worksheet.Cell(7, 4).Style.Font.Bold = true;
        worksheet.Cell(7, 5).Value = report.OverdueInvoicesCount;

        var headerRow = 9;
        worksheet.Row(headerRow).Height = 26;
        var headers = new[]
        {
            "Invoice #", "FOMS Ref", "Client Account", "Department",
            "Billing Date", "Due Date", "Payment Date",
            "Amount Billed (PHP)", "Amount Paid (PHP)", "Outstanding (PHP)", "Payment Status"
        };
        for (int i = 0; i < headers.Length; i++)
        {
            var cell = worksheet.Cell(headerRow, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#00A99D");
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            cell.Style.Alignment.Horizontal = (i < 4) ? XLAlignmentHorizontalValues.Left : ((i >= 7 && i <= 9) ? XLAlignmentHorizontalValues.Right : XLAlignmentHorizontalValues.Center);
            cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            cell.Style.Border.OutsideBorderColor = XLColor.FromHtml("#007A71");
        }

        var dataRow = headerRow + 1;
        int rowIndex = 0;
        foreach (var inv in report.Invoices)
        {
            var rowColor = (rowIndex % 2 == 1) ? XLColor.FromHtml("#F8FAFC") : XLColor.White;
            worksheet.Row(dataRow).Height = 20;

            worksheet.Cell(dataRow, 1).Value = inv.InvoiceNumber;
            worksheet.Cell(dataRow, 2).Value = inv.FomsReference;
            worksheet.Cell(dataRow, 3).Value = inv.ClientAccount;
            worksheet.Cell(dataRow, 4).Value = inv.Department;
            worksheet.Cell(dataRow, 5).Value = inv.BillingDate.ToString("yyyy-MM-dd");
            worksheet.Cell(dataRow, 6).Value = inv.DueDate.ToString("yyyy-MM-dd");
            worksheet.Cell(dataRow, 7).Value = inv.PaymentDate.HasValue ? inv.PaymentDate.Value.ToString("yyyy-MM-dd") : "-";
            worksheet.Cell(dataRow, 8).Value = inv.AmountBilled;
            worksheet.Cell(dataRow, 8).Style.NumberFormat.Format = "₱#,##0.00";
            worksheet.Cell(dataRow, 9).Value = inv.AmountPaid;
            worksheet.Cell(dataRow, 9).Style.NumberFormat.Format = "₱#,##0.00";
            worksheet.Cell(dataRow, 10).Value = inv.OutstandingBalance;
            worksheet.Cell(dataRow, 10).Style.NumberFormat.Format = "₱#,##0.00";
            worksheet.Cell(dataRow, 11).Value = inv.PaymentStatus;

            for (int col = 1; col <= 11; col++)
            {
                var c = worksheet.Cell(dataRow, col);
                c.Style.Fill.BackgroundColor = rowColor;
                c.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                c.Style.Border.OutsideBorderColor = XLColor.FromHtml("#E2E8F0");
                c.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                if (col >= 5 && col <= 7 || col == 11) c.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                else if (col >= 8 && col <= 10) c.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
            }

            dataRow++;
            rowIndex++;
        }

        worksheet.Columns().AdjustToContents(10, 45);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private byte[] GenerateFinancialPdf(FinancialReportDTO report)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(25);
                page.DefaultTextStyle(x => x.FontSize(9));

                page.Header().Column(column =>
                {
                    column.Item().Text("STARS / FOMS Financial Operations Report")
                        .FontSize(18).Bold();
                    column.Item().Text($"Fiscal Period: {report.FiscalPeriod} | {report.DateRangeStart:MMM dd, yyyy} - {report.DateRangeEnd:MMM dd, yyyy}")
                        .FontSize(11).FontColor(Colors.Grey.Darken2);
                    column.Item().PaddingTop(4).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                });

                page.Content().PaddingVertical(10).Column(column =>
                {
                    column.Item().PaddingBottom(8).Text("Financial KPI Summary").FontSize(13).Bold();

                    column.Item().Row(row =>
                    {
                        row.RelativeItem().Text($"Total Billed: ₱{report.TotalBilled:N2}").Bold();
                        row.RelativeItem().Text($"Collected: ₱{report.TotalCollected:N2}").Bold();
                        row.RelativeItem().Text($"Outstanding: ₱{report.TotalOutstanding:N2}");
                        row.RelativeItem().Text($"Collection Rate: {report.CollectionRate}%");
                        row.RelativeItem().Text($"Invoices: {report.TotalInvoices}");
                        row.RelativeItem().Text($"Overdue: {report.OverdueInvoicesCount}");
                    });

                    column.Item().PaddingTop(12).Text("Invoice Register & Collections").FontSize(13).Bold();

                    column.Item().PaddingTop(4).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(1.8f); // Inv #
                            columns.RelativeColumn(2.5f); // Client
                            columns.RelativeColumn(2f);   // Dept
                            columns.RelativeColumn(1.3f); // Billing Date
                            columns.RelativeColumn(1.3f); // Due Date
                            columns.RelativeColumn(1.8f); // Billed
                            columns.RelativeColumn(1.8f); // Paid
                            columns.RelativeColumn(1.8f); // Outstanding
                            columns.RelativeColumn(1.4f); // Status
                        });

                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Invoice #").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Client Account").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Department").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Billed").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Due").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Amount Billed").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Paid").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Outstanding").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Status").Bold();
                        });

                        foreach (var inv in report.Invoices.Take(60))
                        {
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(inv.InvoiceNumber);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(inv.ClientAccount);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(inv.Department);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(inv.BillingDate.ToString("MM/dd/yyyy"));
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(inv.DueDate.ToString("MM/dd/yyyy"));
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"₱{inv.AmountBilled:N0}");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"₱{inv.AmountPaid:N0}");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text($"₱{inv.OutstandingBalance:N0}");
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(inv.PaymentStatus);
                        }
                    });
                });

                page.Footer().AlignCenter().Text(x =>
                {
                    x.Span("Generated: ");
                    x.Span(DateTime.UtcNow.ToString("MMM dd, yyyy HH:mm UTC"));
                    x.Span(" | Page ");
                    x.CurrentPageNumber();
                    x.Span(" of ");
                    x.TotalPages();
                });
            });
        });

        using var stream = new MemoryStream();
        document.GeneratePdf(stream);
        return stream.ToArray();
    }

    private byte[] GenerateFinancialCsv(FinancialReportDTO report)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("STARS / FOMS Financial Operations Report");
        sb.AppendLine($"Fiscal Period,{report.FiscalPeriod}");
        sb.AppendLine($"Date Range,{report.DateRangeStart:yyyy-MM-dd},{report.DateRangeEnd:yyyy-MM-dd}");
        sb.AppendLine($"Total Billed,PHP {report.TotalBilled:N2}");
        sb.AppendLine($"Total Collected,PHP {report.TotalCollected:N2}");
        sb.AppendLine($"Outstanding Balance,PHP {report.TotalOutstanding:N2}");
        sb.AppendLine($"Collection Rate,{report.CollectionRate}%");
        sb.AppendLine($"Total Invoices,{report.TotalInvoices}");
        sb.AppendLine($"Overdue Invoices,{report.OverdueInvoicesCount}");
        sb.AppendLine();
        sb.AppendLine("Invoice Number,FOMS Reference,Client Account,Department,Billing Date,Due Date,Payment Date,Currency,Amount Billed,Amount Paid,Outstanding Balance,Payment Status,Payment Method,Fiscal Period");

        foreach (var inv in report.Invoices)
        {
            sb.AppendLine($"\"{EscapeCsv(inv.InvoiceNumber)}\",\"{EscapeCsv(inv.FomsReference)}\",\"{EscapeCsv(inv.ClientAccount)}\",\"{EscapeCsv(inv.Department)}\",{inv.BillingDate:yyyy-MM-dd},{inv.DueDate:yyyy-MM-dd},{(inv.PaymentDate.HasValue ? inv.PaymentDate.Value.ToString("yyyy-MM-dd") : "-")},{inv.Currency},{inv.AmountBilled},{inv.AmountPaid},{inv.OutstandingBalance},\"{EscapeCsv(inv.PaymentStatus)}\",\"{EscapeCsv(inv.PaymentMethod)}\",\"{EscapeCsv(inv.FiscalPeriod)}\"");
        }

        return System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }
}
