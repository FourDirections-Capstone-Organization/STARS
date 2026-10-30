using System.Globalization;
using System.Text;
using Backend.Models.DTOs;

namespace Backend.Modules.PerformanceEvaluation;

/// <summary>
/// Service for exporting performance review evaluation results to RFC 4180 compliant CSV format.
/// Employs formula injection guards (=+-@) and excludes AI recommendation text.
/// Leverages IPerformanceReviewScoringService as the single server-side source of truth.
/// </summary>
public class PerformanceReviewCsvExportService : IPerformanceReviewCsvExportService
{
    private const string CsvLineBreak = "\r\n";
    private readonly IPerformanceReviewScoringService _scoringService;

    public PerformanceReviewCsvExportService(IPerformanceReviewScoringService scoringService)
    {
        _scoringService = scoringService ?? throw new ArgumentNullException(nameof(scoringService));
    }

    /// <inheritdoc />
    public async Task<byte[]> ExportReviewToCsvAsync(Guid reviewId, CancellationToken cancellationToken = default)
    {
        var result = await _scoringService.CalculateReviewScoreAsync(reviewId, cancellationToken);
        return ExportReviewToCsv(result);
    }

    /// <inheritdoc />
    public byte[] ExportReviewToCsv(ReviewResultDTO reviewResult)
    {
        var csvString = GenerateCsv(reviewResult);
        var utf8Bom = Encoding.UTF8.GetPreamble();
        var contentBytes = Encoding.UTF8.GetBytes(csvString);
        return utf8Bom.Concat(contentBytes).ToArray();
    }

    /// <inheritdoc />
    public string GenerateCsv(ReviewResultDTO reviewResult)
    {
        if (reviewResult == null)
            throw new ArgumentNullException(nameof(reviewResult));

        var sb = new StringBuilder();

        // Required columns (AI recommendation text strictly excluded)
        sb.Append("Employee,EmployeeNumber,Department,JobPosition,Section,Criterion,SelfScore,ManagerScore,Gap,IsOutlier,ManagerComment,WeightedFinalScore,RatingLabel")
          .Append(CsvLineBreak);

        if (reviewResult.Employees == null || reviewResult.Employees.Count == 0)
        {
            return sb.ToString();
        }

        foreach (var employee in reviewResult.Employees)
        {
            var empName = FormatCell(employee.EmployeeName);
            var empNum = FormatCell(employee.EmployeeNumber);
            var dept = FormatCell(employee.DepartmentName);
            var jobPos = FormatCell(employee.JobPositionTitle ?? employee.Role);
            var finalScore = employee.FinalScore.ToString(CultureInfo.InvariantCulture);
            var ratingLabel = FormatCell(employee.RatingLabel);

            if (employee.Sections == null || employee.Sections.Count == 0)
            {
                sb.Append($"{empName},{empNum},{dept},{jobPos},,,,,,,{finalScore},{ratingLabel}")
                  .Append(CsvLineBreak);
                continue;
            }

            foreach (var section in employee.Sections)
            {
                var sectionTitle = FormatCell(section.SectionTitle);

                if (section.Criteria == null || section.Criteria.Count == 0)
                {
                    sb.Append($"{empName},{empNum},{dept},{jobPos},{sectionTitle},,,,,,{finalScore},{ratingLabel}")
                      .Append(CsvLineBreak);
                    continue;
                }

                foreach (var criterion in section.Criteria)
                {
                    var critTitle = FormatCell(criterion.CriterionTitle);
                    var selfScore = criterion.SelfScore.HasValue ? criterion.SelfScore.Value.ToString(CultureInfo.InvariantCulture) : "";
                    var managerScore = criterion.ManagerScore.HasValue ? criterion.ManagerScore.Value.ToString(CultureInfo.InvariantCulture) : "";
                    var gap = criterion.Gap.HasValue ? FormatCell(criterion.Gap.Value.ToString(CultureInfo.InvariantCulture)) : "";
                    var isOutlier = criterion.IsOutlier ? "True" : "False";
                    var comment = FormatCell(criterion.ManagerComment);

                    sb.Append($"{empName},{empNum},{dept},{jobPos},{sectionTitle},{critTitle},{selfScore},{managerScore},{gap},{isOutlier},{comment},{finalScore},{ratingLabel}")
                      .Append(CsvLineBreak);
                }
            }
        }

        return sb.ToString();
    }

    /// <inheritdoc />
    public string SanitizeCellValue(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        // If already prefixed with single quote, do not double-prefix
        if (value.StartsWith('\''))
            return value;

        var trimmed = value.TrimStart();
        if (trimmed.StartsWith('=') || trimmed.StartsWith('+') || trimmed.StartsWith('-') || trimmed.StartsWith('@'))
        {
            return "'" + value;
        }

        return value;
    }

    /// <inheritdoc />
    public string EscapeCsvField(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        // RFC 4180: If field contains comma, quote, or newline characters, enclose in quotes and escape internal quotes
        if (value.Contains(',') || value.Contains('"') || value.Contains('\r') || value.Contains('\n'))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }

        return value;
    }

    private string FormatCell(string? value)
    {
        var sanitized = SanitizeCellValue(value);
        return EscapeCsvField(sanitized);
    }
}
