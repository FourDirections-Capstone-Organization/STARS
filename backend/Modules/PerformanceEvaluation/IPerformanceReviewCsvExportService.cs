using Backend.Models.DTOs;

namespace Backend.Modules.PerformanceEvaluation;

/// <summary>
/// Service for exporting performance review results to CSV format.
/// Enforces CSV formula injection protection (=+-@ prefix guard), RFC 4180 compliance,
/// and leverages IPerformanceReviewScoringService as the single server-side source of truth.
/// </summary>
public interface IPerformanceReviewCsvExportService
{
    /// <summary>
    /// Calculates review score (live or frozen) via scoring service and exports to UTF-8 CSV bytes with BOM.
    /// </summary>
    Task<byte[]> ExportReviewToCsvAsync(Guid reviewId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Generates UTF-8 CSV bytes with BOM from an existing ReviewResultDTO.
    /// </summary>
    byte[] ExportReviewToCsv(ReviewResultDTO reviewResult);

    /// <summary>
    /// Generates the raw CSV string representation from a ReviewResultDTO.
    /// </summary>
    string GenerateCsv(ReviewResultDTO reviewResult);

    /// <summary>
    /// Sanitizes a cell value against CSV formula injection by prefixing with a single quote (')
    /// if the cell begins with '=', '+', '-', or '@'.
    /// </summary>
    string SanitizeCellValue(string? value);

    /// <summary>
    /// Escapes a cell according to RFC 4180 rules (doubling quotes and wrapping with quotes
    /// if field contains commas, quotes, carriage returns, or line breaks).
    /// </summary>
    string EscapeCsvField(string? value);
}
