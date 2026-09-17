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
            .Where(t => t.Status == Models.Enums.TaskStatus.Completed)
            .Where(t => t.UpdatedAt >= dateStart && t.UpdatedAt <= dateEnd);

        if (requestUserRole == UserRole.Coordinator && requestUserDepartmentId.HasValue)
            query = query.Where(t => t.AssignedDepartmentId == requestUserDepartmentId.Value);

        if (filters?.EmployeeId.HasValue == true)
            query = query.Where(t => t.Assignments.Any(a => a.AssignedUserId == filters.EmployeeId.Value));

        var completedTasks = await query.ToListAsync();

        if (completedTasks.Count == 0)
            return ApiResponseDTO<KpiTrackingDTO>.Failure("No completed tasks found for the selected criteria.");

        var employeeKpis = completedTasks
            .SelectMany(t => t.Assignments.Select(a => new
            {
                a.AssignedUserId,
                a.AssignedUser,
                IsOnTime = t.UpdatedAt <= (t.RevisedDeadline ?? t.Deadline)
            }))
            .GroupBy(x => x.AssignedUserId)
            .Select(g =>
            {
                var first = g.First();
                var total = g.Count();
                var onTime = g.Count(x => x.IsOnTime);
                var late = total - onTime;

                return new EmployeeKpiDTO
                {
                    EmployeeId = g.Key,
                    EmployeeName = first.AssignedUser is not null
                        ? $"{first.AssignedUser.FirstName} {first.AssignedUser.LastName}".Trim()
                        : "Unknown",
                    EmployeeNumber = first.AssignedUser?.EmployeeNumber ?? "",
                    Department = first.AssignedUser?.Department?.Name ?? "",
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
            .Where(t => t.Status == Models.Enums.TaskStatus.Completed)
            .Where(t => t.UpdatedAt >= dateStart && t.UpdatedAt <= dateEnd);

        if (requestUserRole == UserRole.Coordinator && requestUserDepartmentId.HasValue)
            query = query.Where(t => t.AssignedDepartmentId == requestUserDepartmentId.Value);

        if (filters.DepartmentId.HasValue)
            query = query.Where(t => t.AssignedDepartmentId == filters.DepartmentId.Value);

        if (filters.EmployeeId.HasValue)
            query = query.Where(t => t.Assignments.Any(a => a.AssignedUserId == filters.EmployeeId.Value));

        var completedTasks = await query.ToListAsync();

        if (completedTasks.Count == 0)
            return ApiResponseDTO<PerformanceReportDTO>.Failure("No records found for the selected period.");

        var employeeBreakdown = completedTasks
            .SelectMany(t => t.Assignments.Select(a => new
            {
                a.AssignedUserId,
                a.AssignedUser,
                IsOnTime = t.UpdatedAt <= (t.RevisedDeadline ?? t.Deadline)
            }))
            .GroupBy(x => x.AssignedUserId)
            .Select(g =>
            {
                var first = g.First();
                var total = g.Count();
                var onTime = g.Count(x => x.IsOnTime);
                var late = total - onTime;

                return new EmployeePerformanceDTO
                {
                    EmployeeId = g.Key,
                    EmployeeName = first.AssignedUser is not null
                        ? $"{first.AssignedUser.FirstName} {first.AssignedUser.LastName}".Trim()
                        : "Unknown",
                    EmployeeNumber = first.AssignedUser?.EmployeeNumber ?? "",
                    Department = first.AssignedUser?.Department?.Name ?? "",
                    Role = first.AssignedUser?.Role.ToString() ?? "",
                    TotalCompleted = total,
                    OnTimeCount = onTime,
                    LateCount = late,
                    OnTimeRate = total > 0 ? Math.Round((double)onTime / total * 100, 1) : 0,
                    LateRate = total > 0 ? Math.Round((double)late / total * 100, 1) : 0
                };
            })
            .OrderByDescending(e => e.OnTimeRate)
            .ToList();

        var totalCompleted = employeeBreakdown.Sum(e => e.TotalCompleted);
        var totalOnTime = employeeBreakdown.Sum(e => e.OnTimeCount);
        var totalLate = employeeBreakdown.Sum(e => e.LateCount);

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
            TotalCompletedTasks = totalCompleted,
            OverallOnTimeRate = totalCompleted > 0 ? Math.Round((double)totalOnTime / totalCompleted * 100, 1) : 0,
            OverallLateRate = totalCompleted > 0 ? Math.Round((double)totalLate / totalCompleted * 100, 1) : 0,
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

            default:
                return (now.AddMonths(-1), now);
        }
    }

    private byte[] GenerateExcelReport(PerformanceReportDTO report)
    {
        using var workbook = new XLWorkbook();
        var worksheet = workbook.Worksheets.Add("Performance Report");

        worksheet.Cell(1, 1).Value = "STARS Performance Report";
        worksheet.Cell(1, 1).Style.Font.Bold = true;
        worksheet.Cell(1, 1).Style.Font.FontSize = 16;
        worksheet.Range(1, 1, 1, 8).Merge();

        worksheet.Cell(2, 1).Value = $"Period: {report.DateRangeStart:MMM dd, yyyy} - {report.DateRangeEnd:MMM dd, yyyy}";
        worksheet.Range(2, 1, 2, 8).Merge();

        worksheet.Cell(4, 1).Value = "Summary";
        worksheet.Cell(4, 1).Style.Font.Bold = true;
        worksheet.Cell(5, 1).Value = "Total Completed Tasks:";
        worksheet.Cell(5, 2).Value = report.TotalCompletedTasks;
        worksheet.Cell(6, 1).Value = "Overall On-Time Rate:";
        worksheet.Cell(6, 2).Value = $"{report.OverallOnTimeRate}%";
        worksheet.Cell(7, 1).Value = "Overall Late Rate:";
        worksheet.Cell(7, 2).Value = $"{report.OverallLateRate}%";

        var headerRow = 9;
        var headers = new[] { "Employee Name", "Employee #", "Department", "Role", "Completed", "On-Time", "Late", "On-Time Rate" };
        for (int i = 0; i < headers.Length; i++)
        {
            var cell = worksheet.Cell(headerRow, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.LightBlue;
        }

        var dataRow = headerRow + 1;
        foreach (var emp in report.EmployeeBreakdown)
        {
            worksheet.Cell(dataRow, 1).Value = emp.EmployeeName;
            worksheet.Cell(dataRow, 2).Value = emp.EmployeeNumber;
            worksheet.Cell(dataRow, 3).Value = emp.Department;
            worksheet.Cell(dataRow, 4).Value = emp.Role;
            worksheet.Cell(dataRow, 5).Value = emp.TotalCompleted;
            worksheet.Cell(dataRow, 6).Value = emp.OnTimeCount;
            worksheet.Cell(dataRow, 7).Value = emp.LateCount;
            worksheet.Cell(dataRow, 8).Value = $"{emp.OnTimeRate}%";
            dataRow++;
        }

        worksheet.Columns().AdjustToContents();

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
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(10));

                page.Header().Column(column =>
                {
                    column.Item().Text("STARS Performance Report")
                        .FontSize(20).Bold();
                    column.Item().Text($"Period: {report.DateRangeStart:MMM dd, yyyy} - {report.DateRangeEnd:MMM dd, yyyy}")
                        .FontSize(12);
                    column.Item().PaddingTop(5).LineHorizontal(1);
                });

                page.Content().PaddingVertical(10).Column(column =>
                {
                    column.Item().PaddingBottom(10).Text("Summary").FontSize(14).Bold();

                    column.Item().Row(row =>
                    {
                        row.RelativeItem().Text($"Total Completed: {report.TotalCompletedTasks}");
                        row.RelativeItem().Text($"On-Time Rate: {report.OverallOnTimeRate}%");
                        row.RelativeItem().Text($"Late Rate: {report.OverallLateRate}%");
                    });

                    column.Item().PaddingTop(15).Text("Employee Breakdown").FontSize(14).Bold();

                    column.Item().PaddingTop(5).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Employee").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Department").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Role").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Done").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("On-Time").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Late").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Rate").Bold();
                        });

                        foreach (var emp in report.EmployeeBreakdown)
                        {
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.EmployeeName);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.Department);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.Role);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.TotalCompleted.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.OnTimeCount.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.LateCount.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text($"{emp.OnTimeRate}%");
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

        var report = new TaskCompletionReportDTO
        {
            TotalTasksAssigned = totalAssigned,
            TotalTasksCompleted = totalCompleted,
            TotalTasksInProgress = totalInProgress,
            TotalTasksPendingReview = totalPendingReview,
            TotalOverdueTasks = totalOverdue,
            TaskCompletionRate = totalAssigned > 0 ? Math.Round((double)totalCompleted / totalAssigned * 100, 1) : 0,
            AverageTaskCompletionTimeHours = avgHours,
            EmployeePerformanceSummary = employeeSummary
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
            "overdue" => null, // Overdue is not a persisted status; handled as a date comparison
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

    private byte[] GenerateOperationalSummaryExcel(OperationalSummaryReportDTO report)
    {
        using var workbook = new XLWorkbook();
        var worksheet = workbook.Worksheets.Add("Operational Summary");

        worksheet.Cell(1, 1).Value = "STARS Operational Summary Report";
        worksheet.Cell(1, 1).Style.Font.Bold = true;
        worksheet.Cell(1, 1).Style.Font.FontSize = 16;
        worksheet.Range(1, 1, 1, 8).Merge();

        worksheet.Cell(3, 1).Value = "Total Tasks:";
        worksheet.Cell(3, 2).Value = report.TotalTasks;
        worksheet.Cell(4, 1).Value = "Completed Tasks:";
        worksheet.Cell(4, 2).Value = report.CompletedTasks;
        worksheet.Cell(5, 1).Value = "Pending Tasks:";
        worksheet.Cell(5, 2).Value = report.PendingTasks;
        worksheet.Cell(6, 1).Value = "Overdue Tasks:";
        worksheet.Cell(6, 2).Value = report.OverdueTasks;
        worksheet.Cell(7, 1).Value = "Completion Rate:";
        worksheet.Cell(7, 2).Value = $"{report.TaskCompletionRate}%";

        var headerRow = 9;
        var headers = new[] { "Employee", "Assigned", "Completed", "Overdue", "Completion Rate" };
        for (int i = 0; i < headers.Length; i++)
        {
            var cell = worksheet.Cell(headerRow, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.LightBlue;
        }

        var dataRow = headerRow + 1;
        foreach (var emp in report.EmployeePerformanceSummary)
        {
            worksheet.Cell(dataRow, 1).Value = emp.EmployeeName;
            worksheet.Cell(dataRow, 2).Value = emp.Assigned;
            worksheet.Cell(dataRow, 3).Value = emp.Completed;
            worksheet.Cell(dataRow, 4).Value = emp.Overdue;
            worksheet.Cell(dataRow, 5).Value = $"{emp.CompletionRate}%";
            dataRow++;
        }

        worksheet.Columns().AdjustToContents();

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
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(10));

                page.Header().Column(column =>
                {
                    column.Item().Text("STARS Operational Summary Report")
                        .FontSize(20).Bold();
                    column.Item().PaddingTop(5).LineHorizontal(1);
                });

                page.Content().PaddingVertical(10).Column(column =>
                {
                    column.Item().PaddingBottom(10).Text("Summary").FontSize(14).Bold();

                    column.Item().Row(row =>
                    {
                        row.RelativeItem().Text($"Total Tasks: {report.TotalTasks}");
                        row.RelativeItem().Text($"Completed: {report.CompletedTasks}");
                        row.RelativeItem().Text($"Pending: {report.PendingTasks}");
                        row.RelativeItem().Text($"Overdue: {report.OverdueTasks}");
                        row.RelativeItem().Text($"Rate: {report.TaskCompletionRate}%");
                    });

                    column.Item().PaddingTop(15).Text("Employee Performance").FontSize(14).Bold();

                    column.Item().PaddingTop(5).Table(table =>
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
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Employee").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Assigned").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Completed").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Overdue").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Rate").Bold();
                        });

                        foreach (var emp in report.EmployeePerformanceSummary)
                        {
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.EmployeeName);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.Assigned.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.Completed.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(emp.Overdue.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text($"{emp.CompletionRate}%");
                        }
                    });

                    column.Item().PaddingTop(15).Text("Workload by Category").FontSize(14).Bold();
                    column.Item().PaddingTop(5).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(2);
                        });
                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Category").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Tasks").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("%").Bold();
                        });
                        foreach (var w in report.WorkloadByCategory)
                        {
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(w.CategoryName);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(w.TaskCount.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text($"{w.Percentage}%");
                        }
                    });

                    column.Item().PaddingTop(15).Text("Workload by Department").FontSize(14).Bold();
                    column.Item().PaddingTop(5).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(2);
                        });
                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Department").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Tasks").Bold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("%").Bold();
                        });
                        foreach (var w in report.WorkloadByDepartment)
                        {
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(w.CategoryName);
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(w.TaskCount.ToString());
                            table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text($"{w.Percentage}%");
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
}
