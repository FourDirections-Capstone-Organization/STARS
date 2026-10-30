using System;
using System.IO;
using System.Linq;
using ClosedXML.Excel;
using Backend.Models.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Backend.Modules.Analytics;

public class KpiExportService : IKpiExportService
{
    static KpiExportService()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public byte[] ExportEmployeeScorecardPdf(EmployeeKpiEvaluationResultDTO scorecard)
    {
        if (scorecard == null)
            throw new ArgumentNullException(nameof(scorecard));

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(9).FontFamily("Arial", "Helvetica", "sans-serif"));

                // Header
                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(titleCol =>
                        {
                            titleCol.Item().Text("STARS Employee KPI Scorecard")
                                .FontSize(18).Bold().FontColor("#00A99D");
                            titleCol.Item().Text($"Period: {scorecard.PeriodStart:MMM dd, yyyy} — {scorecard.PeriodEnd:MMM dd, yyyy}")
                                .FontSize(10).FontColor(Colors.Grey.Darken2);
                            titleCol.Item().Text($"Evaluation Configuration: {scorecard.ConfigurationTitle ?? "Standard Default Configuration"}")
                                .FontSize(9).Italic().FontColor(Colors.Grey.Darken1);
                        });

                        row.ConstantItem(120).Border(1).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten4).Padding(6).Column(badgeCol =>
                        {
                            badgeCol.Item().AlignCenter().Text("Overall Score").FontSize(8).FontColor(Colors.Grey.Darken1);
                            badgeCol.Item().AlignCenter().Text($"{scorecard.OverallScore:F1}%").FontSize(16).Bold().FontColor(GetRatingColor(scorecard.OverallRating));
                            badgeCol.Item().AlignCenter().Text(scorecard.OverallRating.ToUpperInvariant()).FontSize(8).Bold().FontColor(GetRatingColor(scorecard.OverallRating));
                        });
                    });

                    col.Item().PaddingTop(6).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                });

                // Content
                page.Content().PaddingVertical(10).Column(col =>
                {
                    // Employee Info section
                    col.Item().PaddingBottom(8).Border(1).BorderColor(Colors.Grey.Lighten3).Background(Colors.Grey.Lighten5).Padding(8).Row(infoRow =>
                    {
                        infoRow.RelativeItem().Column(c =>
                        {
                            c.Item().Text(t => { t.Span("Employee Name: ").Bold(); t.Span(scorecard.EmployeeName); });
                            c.Item().Text(t => { t.Span("Employee #: ").Bold(); t.Span(string.IsNullOrWhiteSpace(scorecard.EmployeeNumber) ? "N/A" : scorecard.EmployeeNumber); });
                        });
                        infoRow.RelativeItem().Column(c =>
                        {
                            c.Item().Text(t => { t.Span("Department: ").Bold(); t.Span(scorecard.DepartmentName ?? "Unassigned"); });
                            c.Item().Text(t => { t.Span("Role / Position: ").Bold(); t.Span(scorecard.JobPositionTitle ?? scorecard.Role ?? "Operational Staff"); });
                        });
                    });

                    // Operational Summary Cards
                    col.Item().PaddingTop(6).Text("Operational Task Summary").FontSize(11).Bold().FontColor("#1E293B");
                    col.Item().PaddingTop(4).Border(1).BorderColor(Colors.Grey.Lighten3).Padding(6).Row(taskRow =>
                    {
                        taskRow.RelativeItem().Column(c =>
                        {
                            c.Item().Text($"Assigned: {scorecard.TotalAssignedTasks}").FontSize(8.5f);
                            c.Item().Text($"Completed: {scorecard.CompletedTasksCount}").FontSize(8.5f);
                        });
                        taskRow.RelativeItem().Column(c =>
                        {
                            c.Item().Text($"On-Time: {scorecard.OnTimeTasksCount}").FontSize(8.5f);
                            c.Item().Text($"In-Full: {scorecard.InFullTasksCount}").FontSize(8.5f);
                        });
                        taskRow.RelativeItem().Column(c =>
                        {
                            c.Item().Text($"OTIF Count: {scorecard.OtifTasksCount}").FontSize(8.5f);
                            c.Item().Text($"Accurate: {scorecard.AccurateTasksCount}").FontSize(8.5f);
                        });
                        taskRow.RelativeItem().Column(c =>
                        {
                            c.Item().Text($"Reworks: {scorecard.ReworkTasksCount}").FontSize(8.5f);
                            c.Item().Text($"Handling Hours: {scorecard.TotalHandlingHours:F1} hrs").FontSize(8.5f);
                        });
                    });

                    // Metrics Breakdown Table
                    col.Item().PaddingTop(12).Text("Weighted KPI Breakdown").FontSize(11).Bold().FontColor("#1E293B");
                    col.Item().PaddingTop(4).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(1.2f); // Code
                            columns.RelativeColumn(3f);   // Name
                            columns.RelativeColumn(1.2f); // Target
                            columns.RelativeColumn(1.2f); // Actual
                            columns.RelativeColumn(1f);   // Weight
                            columns.RelativeColumn(2.2f); // Thresholds
                            columns.RelativeColumn(1.2f); // Status
                            columns.RelativeColumn(1.4f); // Weighted
                        });

                        table.Header(header =>
                        {
                            header.Cell().Background("#00A99D").Padding(4).Text("Code").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Background("#00A99D").Padding(4).Text("Metric").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Background("#00A99D").Padding(4).Text("Target").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Background("#00A99D").Padding(4).Text("Actual").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Background("#00A99D").Padding(4).Text("Weight").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Background("#00A99D").Padding(4).Text("G / A / R").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Background("#00A99D").Padding(4).Text("Rating").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Background("#00A99D").Padding(4).Text("Points").Bold().FontColor(Colors.White).FontSize(8);
                        });

                        var rowIndex = 0;
                        foreach (var m in scorecard.Metrics)
                        {
                            var bg = rowIndex % 2 == 0 ? Colors.White : Colors.Grey.Lighten5;
                            rowIndex++;

                            table.Cell().Background(bg).Padding(4).Text(m.MetricCode).FontSize(8);
                            table.Cell().Background(bg).Padding(4).Text(m.Name).FontSize(8);
                            table.Cell().Background(bg).Padding(4).Text($"{m.TargetValue:F1}{m.Unit}").FontSize(8);
                            table.Cell().Background(bg).Padding(4).Text($"{m.ActualValue:F1}{m.Unit}").Bold().FontSize(8);
                            table.Cell().Background(bg).Padding(4).Text($"{m.Weight:F0}%").FontSize(8);
                            table.Cell().Background(bg).Padding(4).Text($"{m.GreenThreshold:F0} / {m.AmberThreshold:F0} / {m.RedThreshold:F0}").FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                            table.Cell().Background(bg).Padding(4).Text(m.Rating).Bold().FontColor(GetRatingColor(m.Rating)).FontSize(8);
                            table.Cell().Background(bg).Padding(4).Text($"{m.WeightedScore:F1}").Bold().FontSize(8);
                        }
                    });
                });

                // Footer
                page.Footer().Row(row =>
                {
                    row.RelativeItem().Text("STARS Configurable KPI & Performance System").FontSize(8).FontColor(Colors.Grey.Medium);
                    row.RelativeItem().AlignRight().Text($"Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm UTC}").FontSize(8).FontColor(Colors.Grey.Medium);
                });
            });
        });

        return document.GeneratePdf();
    }

    public byte[] ExportEmployeeScorecardExcel(EmployeeKpiEvaluationResultDTO scorecard)
    {
        if (scorecard == null)
            throw new ArgumentNullException(nameof(scorecard));

        using var workbook = new XLWorkbook();
        var worksheet = workbook.Worksheets.Add("KPI Scorecard");
        worksheet.ShowGridLines = true;

        // Title
        worksheet.Cell(1, 1).Value = "STARS Employee KPI Scorecard";
        worksheet.Cell(1, 1).Style.Font.Bold = true;
        worksheet.Cell(1, 1).Style.Font.FontSize = 16;
        worksheet.Cell(1, 1).Style.Font.FontColor = XLColor.FromHtml("#00A99D");
        worksheet.Range(1, 1, 1, 11).Merge();

        // Subtitle
        worksheet.Cell(2, 1).Value = $"Evaluation Period: {scorecard.PeriodStart:yyyy-MM-dd} to {scorecard.PeriodEnd:yyyy-MM-dd} | Configuration: {scorecard.ConfigurationTitle ?? "Standard Default Configuration"}";
        worksheet.Cell(2, 1).Style.Font.FontSize = 10;
        worksheet.Cell(2, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");
        worksheet.Range(2, 1, 2, 11).Merge();

        // Employee Info
        worksheet.Cell(4, 1).Value = "Employee Name:";
        worksheet.Cell(4, 1).Style.Font.Bold = true;
        worksheet.Cell(4, 2).Value = scorecard.EmployeeName;
        worksheet.Cell(4, 4).Value = "Employee #:";
        worksheet.Cell(4, 4).Style.Font.Bold = true;
        worksheet.Cell(4, 5).Value = string.IsNullOrWhiteSpace(scorecard.EmployeeNumber) ? "N/A" : scorecard.EmployeeNumber;

        worksheet.Cell(5, 1).Value = "Department:";
        worksheet.Cell(5, 1).Style.Font.Bold = true;
        worksheet.Cell(5, 2).Value = scorecard.DepartmentName ?? "Unassigned";
        worksheet.Cell(5, 4).Value = "Role / Position:";
        worksheet.Cell(5, 4).Style.Font.Bold = true;
        worksheet.Cell(5, 5).Value = scorecard.JobPositionTitle ?? scorecard.Role ?? "Operational Staff";

        worksheet.Cell(6, 1).Value = "Overall Score:";
        worksheet.Cell(6, 1).Style.Font.Bold = true;
        worksheet.Cell(6, 2).Value = $"{scorecard.OverallScore:F1}%";
        worksheet.Cell(6, 4).Value = "Overall Rating:";
        worksheet.Cell(6, 4).Style.Font.Bold = true;
        worksheet.Cell(6, 5).Value = scorecard.OverallRating;

        // Task Stats
        worksheet.Cell(8, 1).Value = "Total Assigned Tasks:";
        worksheet.Cell(8, 1).Style.Font.Bold = true;
        worksheet.Cell(8, 2).Value = scorecard.TotalAssignedTasks;
        worksheet.Cell(8, 4).Value = "Completed Tasks:";
        worksheet.Cell(8, 4).Style.Font.Bold = true;
        worksheet.Cell(8, 5).Value = scorecard.CompletedTasksCount;
        worksheet.Cell(8, 7).Value = "On-Time Tasks:";
        worksheet.Cell(8, 7).Style.Font.Bold = true;
        worksheet.Cell(8, 8).Value = scorecard.OnTimeTasksCount;

        worksheet.Cell(9, 1).Value = "In-Full Tasks:";
        worksheet.Cell(9, 1).Style.Font.Bold = true;
        worksheet.Cell(9, 2).Value = scorecard.InFullTasksCount;
        worksheet.Cell(9, 4).Value = "OTIF Tasks:";
        worksheet.Cell(9, 4).Style.Font.Bold = true;
        worksheet.Cell(9, 5).Value = scorecard.OtifTasksCount;
        worksheet.Cell(9, 7).Value = "Rework Tasks:";
        worksheet.Cell(9, 7).Style.Font.Bold = true;
        worksheet.Cell(9, 8).Value = scorecard.ReworkTasksCount;

        worksheet.Cell(10, 1).Value = "Accurate Tasks:";
        worksheet.Cell(10, 1).Style.Font.Bold = true;
        worksheet.Cell(10, 2).Value = scorecard.AccurateTasksCount;
        worksheet.Cell(10, 4).Value = "Handling Hours:";
        worksheet.Cell(10, 4).Style.Font.Bold = true;
        worksheet.Cell(10, 5).Value = $"{scorecard.TotalHandlingHours:F1} hrs";

        // Metrics Table Header
        var headerRow = 12;
        worksheet.Row(headerRow).Height = 24;
        var headers = new[]
        {
            "Metric Code", "Metric Name", "Actual Value", "Unit", "Target Value",
            "Weight (%)", "Green Threshold", "Amber Threshold", "Red Threshold",
            "Rating", "Weighted Points"
        };

        for (int i = 0; i < headers.Length; i++)
        {
            var cell = worksheet.Cell(headerRow, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#00A99D");
            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        }

        var currentRow = headerRow + 1;
        foreach (var m in scorecard.Metrics)
        {
            worksheet.Cell(currentRow, 1).Value = m.MetricCode;
            worksheet.Cell(currentRow, 2).Value = m.Name;
            worksheet.Cell(currentRow, 3).Value = m.ActualValue;
            worksheet.Cell(currentRow, 4).Value = m.Unit;
            worksheet.Cell(currentRow, 5).Value = m.TargetValue;
            worksheet.Cell(currentRow, 6).Value = m.Weight;
            worksheet.Cell(currentRow, 7).Value = m.GreenThreshold;
            worksheet.Cell(currentRow, 8).Value = m.AmberThreshold;
            worksheet.Cell(currentRow, 9).Value = m.RedThreshold;
            worksheet.Cell(currentRow, 10).Value = m.Rating;
            worksheet.Cell(currentRow, 11).Value = m.WeightedScore;

            if (currentRow % 2 == 0)
            {
                worksheet.Range(currentRow, 1, currentRow, headers.Length).Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");
            }

            currentRow++;
        }

        worksheet.Columns().AdjustToContents();

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    public byte[] ExportHierarchyScopePdf(KpiHierarchyScopeResultDTO scopeResult)
    {
        if (scopeResult == null)
            throw new ArgumentNullException(nameof(scopeResult));

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(25);
                page.DefaultTextStyle(x => x.FontSize(8.5f).FontFamily("Arial", "Helvetica", "sans-serif"));

                // Header
                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(titleCol =>
                        {
                            titleCol.Item().Text("STARS KPI Hierarchical Scope Evaluation")
                                .FontSize(16).Bold().FontColor("#00A99D");
                            titleCol.Item().Text($"Scope: {scopeResult.ScopeLevel} — {scopeResult.ScopeName} | Period: {scopeResult.PeriodStart:MMM dd, yyyy} — {scopeResult.PeriodEnd:MMM dd, yyyy}")
                                .FontSize(9.5f).FontColor(Colors.Grey.Darken2);
                            titleCol.Item().Text($"Role Filter: {scopeResult.RoleFilter ?? "All Roles"} | Configuration: {scopeResult.ConfigurationTitle ?? "Standard Default Configuration"}")
                                .FontSize(8.5f).Italic().FontColor(Colors.Grey.Darken1);
                        });

                        row.ConstantItem(140).Border(1).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten4).Padding(6).Column(badgeCol =>
                        {
                            badgeCol.Item().AlignCenter().Text("Overall Scope Score").FontSize(8).FontColor(Colors.Grey.Darken1);
                            badgeCol.Item().AlignCenter().Text($"{scopeResult.OverallScore:F1}%").FontSize(15).Bold().FontColor(GetRatingColor(scopeResult.OverallRating));
                            badgeCol.Item().AlignCenter().Text($"Rating: {scopeResult.OverallRating.ToUpperInvariant()} (Avg Emp: {scopeResult.AverageEmployeeScore:F1}%)")
                                .FontSize(7.5f).Bold().FontColor(GetRatingColor(scopeResult.OverallRating));
                        });
                    });

                    col.Item().PaddingTop(4).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                });

                // Content
                page.Content().PaddingVertical(8).Column(col =>
                {
                    // Aggregated summary strip
                    col.Item().Border(1).BorderColor(Colors.Grey.Lighten3).Background(Colors.Grey.Lighten5).Padding(6).Row(statRow =>
                    {
                        statRow.RelativeItem().Text($"Departments: {scopeResult.TotalDepartments}").FontSize(8);
                        statRow.RelativeItem().Text($"Teams: {scopeResult.TotalTeams}").FontSize(8);
                        statRow.RelativeItem().Text($"Employees: {scopeResult.TotalEmployees}").FontSize(8);
                        statRow.RelativeItem().Text($"Assigned: {scopeResult.TotalAssignedTasks}").FontSize(8);
                        statRow.RelativeItem().Text($"Completed: {scopeResult.CompletedTasksCount}").FontSize(8);
                        statRow.RelativeItem().Text($"OTIF Count: {scopeResult.OtifTasksCount}").FontSize(8);
                        statRow.RelativeItem().Text($"Accurate: {scopeResult.AccurateTasksCount}").FontSize(8);
                        statRow.RelativeItem().Text($"Reworks: {scopeResult.ReworkTasksCount}").FontSize(8);
                    });

                    // Employee Table
                    col.Item().PaddingTop(8).Text("Employee Scorecard Breakdown").FontSize(10.5f).Bold().FontColor("#1E293B");
                    col.Item().PaddingTop(4).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(2.5f); // Name
                            columns.RelativeColumn(1.2f); // #
                            columns.RelativeColumn(1.8f); // Dept
                            columns.RelativeColumn(1.5f); // Role
                            columns.RelativeColumn(1f);   // Assigned
                            columns.RelativeColumn(1f);   // Completed
                            columns.RelativeColumn(1f);   // OTIF
                            columns.RelativeColumn(1f);   // Accurate
                            columns.RelativeColumn(1f);   // Reworks
                            columns.RelativeColumn(1.2f); // Hours
                            columns.RelativeColumn(1.2f); // Score
                            columns.RelativeColumn(1f);   // Rating
                        });

                        table.Header(header =>
                        {
                            header.Cell().Background("#00A99D").Padding(3).Text("Employee").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Emp #").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Department").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Role").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Assigned").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Done").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("OTIF").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Accurate").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Rework").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Hours").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Score").Bold().FontColor(Colors.White).FontSize(7.5f);
                            header.Cell().Background("#00A99D").Padding(3).Text("Rating").Bold().FontColor(Colors.White).FontSize(7.5f);
                        });

                        var rowIndex = 0;
                        foreach (var emp in scopeResult.Employees)
                        {
                            var bg = rowIndex % 2 == 0 ? Colors.White : Colors.Grey.Lighten5;
                            rowIndex++;

                            table.Cell().Background(bg).Padding(3).Text(emp.EmployeeName).FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text(string.IsNullOrWhiteSpace(emp.EmployeeNumber) ? "-" : emp.EmployeeNumber).FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text(emp.DepartmentName ?? "-").FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text(emp.Role ?? "-").FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text(emp.TotalAssignedTasks.ToString()).FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text(emp.CompletedTasksCount.ToString()).FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text(emp.OtifTasksCount.ToString()).FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text(emp.AccurateTasksCount.ToString()).FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text(emp.ReworkTasksCount.ToString()).FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text($"{emp.TotalHandlingHours:F1}").FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text($"{emp.OverallScore:F1}%").Bold().FontSize(7.5f);
                            table.Cell().Background(bg).Padding(3).Text(emp.OverallRating).Bold().FontColor(GetRatingColor(emp.OverallRating)).FontSize(7.5f);
                        }
                    });
                });

                // Footer
                page.Footer().Row(row =>
                {
                    row.RelativeItem().Text("STARS Configurable KPI & Performance System").FontSize(7.5f).FontColor(Colors.Grey.Medium);
                    row.RelativeItem().AlignRight().Text($"Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm UTC}").FontSize(7.5f).FontColor(Colors.Grey.Medium);
                });
            });
        });

        return document.GeneratePdf();
    }

    public byte[] ExportHierarchyScopeExcel(KpiHierarchyScopeResultDTO scopeResult)
    {
        if (scopeResult == null)
            throw new ArgumentNullException(nameof(scopeResult));

        using var workbook = new XLWorkbook();
        var worksheet = workbook.Worksheets.Add("Scope Evaluation");
        worksheet.ShowGridLines = true;

        // Title
        worksheet.Cell(1, 1).Value = "STARS KPI Hierarchical Scope Evaluation Report";
        worksheet.Cell(1, 1).Style.Font.Bold = true;
        worksheet.Cell(1, 1).Style.Font.FontSize = 16;
        worksheet.Cell(1, 1).Style.Font.FontColor = XLColor.FromHtml("#00A99D");
        worksheet.Range(1, 1, 1, 14).Merge();

        // Subtitle
        worksheet.Cell(2, 1).Value = $"Scope: {scopeResult.ScopeLevel} ({scopeResult.ScopeName}) | Period: {scopeResult.PeriodStart:yyyy-MM-dd} to {scopeResult.PeriodEnd:yyyy-MM-dd} | Role: {scopeResult.RoleFilter ?? "All Roles"}";
        worksheet.Cell(2, 1).Style.Font.FontSize = 10;
        worksheet.Cell(2, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");
        worksheet.Range(2, 1, 2, 14).Merge();

        // Scope summary
        worksheet.Cell(4, 1).Value = "Scope Level:";
        worksheet.Cell(4, 1).Style.Font.Bold = true;
        worksheet.Cell(4, 2).Value = scopeResult.ScopeLevel;
        worksheet.Cell(4, 4).Value = "Scope Name:";
        worksheet.Cell(4, 4).Style.Font.Bold = true;
        worksheet.Cell(4, 5).Value = scopeResult.ScopeName;

        worksheet.Cell(5, 1).Value = "Overall Score:";
        worksheet.Cell(5, 1).Style.Font.Bold = true;
        worksheet.Cell(5, 2).Value = $"{scopeResult.OverallScore:F1}%";
        worksheet.Cell(5, 4).Value = "Overall Rating:";
        worksheet.Cell(5, 4).Style.Font.Bold = true;
        worksheet.Cell(5, 5).Value = scopeResult.OverallRating;
        worksheet.Cell(5, 7).Value = "Average Employee Score:";
        worksheet.Cell(5, 7).Style.Font.Bold = true;
        worksheet.Cell(5, 8).Value = $"{scopeResult.AverageEmployeeScore:F1}%";

        worksheet.Cell(6, 1).Value = "Total Employees:";
        worksheet.Cell(6, 1).Style.Font.Bold = true;
        worksheet.Cell(6, 2).Value = scopeResult.TotalEmployees;
        worksheet.Cell(6, 4).Value = "Total Assigned:";
        worksheet.Cell(6, 4).Style.Font.Bold = true;
        worksheet.Cell(6, 5).Value = scopeResult.TotalAssignedTasks;
        worksheet.Cell(6, 7).Value = "Total Completed:";
        worksheet.Cell(6, 7).Style.Font.Bold = true;
        worksheet.Cell(6, 8).Value = scopeResult.CompletedTasksCount;

        // Employee Table Header
        var headerRow = 8;
        worksheet.Row(headerRow).Height = 24;
        var headers = new[]
        {
            "Employee Name", "Employee #", "Department", "Role",
            "Assigned Tasks", "Completed Tasks", "On-Time Tasks", "In-Full Tasks",
            "OTIF Tasks", "Accurate Tasks", "Rework Tasks", "Handling Hours",
            "Overall Score (%)", "Overall Rating"
        };

        for (int i = 0; i < headers.Length; i++)
        {
            var cell = worksheet.Cell(headerRow, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#00A99D");
            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        }

        var currentRow = headerRow + 1;
        foreach (var emp in scopeResult.Employees)
        {
            worksheet.Cell(currentRow, 1).Value = emp.EmployeeName;
            worksheet.Cell(currentRow, 2).Value = string.IsNullOrWhiteSpace(emp.EmployeeNumber) ? "N/A" : emp.EmployeeNumber;
            worksheet.Cell(currentRow, 3).Value = emp.DepartmentName ?? "N/A";
            worksheet.Cell(currentRow, 4).Value = emp.Role ?? "N/A";
            worksheet.Cell(currentRow, 5).Value = emp.TotalAssignedTasks;
            worksheet.Cell(currentRow, 6).Value = emp.CompletedTasksCount;
            worksheet.Cell(currentRow, 7).Value = emp.OnTimeTasksCount;
            worksheet.Cell(currentRow, 8).Value = emp.InFullTasksCount;
            worksheet.Cell(currentRow, 9).Value = emp.OtifTasksCount;
            worksheet.Cell(currentRow, 10).Value = emp.AccurateTasksCount;
            worksheet.Cell(currentRow, 11).Value = emp.ReworkTasksCount;
            worksheet.Cell(currentRow, 12).Value = emp.TotalHandlingHours;
            worksheet.Cell(currentRow, 13).Value = emp.OverallScore;
            worksheet.Cell(currentRow, 14).Value = emp.OverallRating;

            if (currentRow % 2 == 0)
            {
                worksheet.Range(currentRow, 1, currentRow, headers.Length).Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");
            }

            currentRow++;
        }

        worksheet.Columns().AdjustToContents();

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string GetRatingColor(string rating)
    {
        return rating?.ToLowerInvariant() switch
        {
            "red" => "#DC2626",
            "amber" or "yellow" => "#D97706",
            _ => "#16A34A"
        };
    }
}
