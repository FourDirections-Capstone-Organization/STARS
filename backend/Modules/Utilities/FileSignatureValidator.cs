using System;
using System.IO;
using Microsoft.AspNetCore.Http;

namespace Backend.Modules.Utilities;

/// <summary>
/// Validates stream header magic bytes against declared file extensions.
/// Mitigates Unrestricted File Upload / MIME confusion (CWE-434 / OWASP ZAP Alert 40026 / SEC-10).
/// </summary>
public static class FileSignatureValidator
{
    // PDF: %PDF (25 50 44 46)
    private static readonly byte[] PdfMagic = { 0x25, 0x50, 0x44, 0x46 };

    // PNG: 89 50 4E 47
    private static readonly byte[] PngMagic = { 0x89, 0x50, 0x4E, 0x47 };

    // JPEG: FF D8 FF
    private static readonly byte[] JpegMagic = { 0xFF, 0xD8, 0xFF };

    // ZIP / Office Open XML (.docx, .xlsx): PK\x03\x04 (50 4B 03 04)
    private static readonly byte[] ZipMagic = { 0x50, 0x4B, 0x03, 0x04 };

    public static bool HasValidMagicBytes(IFormFile? file)
    {
        if (file == null || file.Length == 0)
            return false;

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();

        try
        {
            using var stream = file.OpenReadStream();
            var header = new byte[8];
            var bytesRead = stream.Read(header, 0, header.Length);
            if (bytesRead < 3)
                return false;

            return ext switch
            {
                ".pdf" => bytesRead >= 4 && Matches(header, PdfMagic),
                ".png" => bytesRead >= 4 && Matches(header, PngMagic),
                ".jpg" or ".jpeg" => bytesRead >= 3 && Matches(header, JpegMagic),
                ".docx" or ".xlsx" => bytesRead >= 4 && Matches(header, ZipMagic),
                _ => false
            };
        }
        catch
        {
            return false;
        }
    }

    private static bool Matches(byte[] header, byte[] signature)
    {
        for (int i = 0; i < signature.Length; i++)
        {
            if (header[i] != signature[i])
                return false;
        }
        return true;
    }
}
