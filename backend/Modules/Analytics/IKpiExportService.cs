using Backend.Models.DTOs;

namespace Backend.Modules.Analytics;

public interface IKpiExportService
{
    byte[] ExportEmployeeScorecardPdf(EmployeeKpiEvaluationResultDTO scorecard);
    byte[] ExportEmployeeScorecardExcel(EmployeeKpiEvaluationResultDTO scorecard);
    byte[] ExportHierarchyScopePdf(KpiHierarchyScopeResultDTO scopeResult);
    byte[] ExportHierarchyScopeExcel(KpiHierarchyScopeResultDTO scopeResult);
}
