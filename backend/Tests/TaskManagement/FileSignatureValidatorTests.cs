using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Task = System.Threading.Tasks.Task;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Modules.TaskManagement;
using Backend.Modules.Utilities;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Backend.Tests.TaskManagement;

public class FileSignatureValidatorTests
{
    private IFormFile CreateMockFile(string fileName, byte[] content)
    {
        var stream = new MemoryStream(content);
        return new FormFile(stream, 0, content.Length, "file", fileName);
    }

    [Fact]
    public void HasValidMagicBytes_ValidPdfHeader_ReturnsTrue()
    {
        var pdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\nSample PDF content");
        var file = CreateMockFile("sample.pdf", pdfBytes);

        Assert.True(FileSignatureValidator.HasValidMagicBytes(file));
    }

    [Fact]
    public void HasValidMagicBytes_FakePdfWithExeHeader_ReturnsFalse()
    {
        // SEC-10: Executable (MZ) renamed to .pdf must be rejected
        var exeBytes = new byte[] { 0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00 };
        var file = CreateMockFile("malicious.pdf", exeBytes);

        Assert.False(FileSignatureValidator.HasValidMagicBytes(file));
    }

    [Fact]
    public void HasValidMagicBytes_ValidPngHeader_ReturnsTrue()
    {
        var pngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00 };
        var file = CreateMockFile("image.png", pngBytes);

        Assert.True(FileSignatureValidator.HasValidMagicBytes(file));
    }

    [Fact]
    public void HasValidMagicBytes_FakePngWithTextContent_ReturnsFalse()
    {
        var textBytes = Encoding.UTF8.GetBytes("<script>alert('XSS')</script>");
        var file = CreateMockFile("payload.png", textBytes);

        Assert.False(FileSignatureValidator.HasValidMagicBytes(file));
    }

    [Fact]
    public void HasValidMagicBytes_ValidJpegHeader_ReturnsTrue()
    {
        var jpegBytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46 };
        var file = CreateMockFile("photo.jpg", jpegBytes);

        Assert.True(FileSignatureValidator.HasValidMagicBytes(file));
    }

    [Fact]
    public void HasValidMagicBytes_ValidDocxZipHeader_ReturnsTrue()
    {
        var zipBytes = new byte[] { 0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00 };
        var file = CreateMockFile("document.docx", zipBytes);

        Assert.True(FileSignatureValidator.HasValidMagicBytes(file));
    }

    [Fact]
    public async Task AttachmentService_UploadAsync_SpoofedExtension_RejectsUpload()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new AppDbContext(options);

        var task = new Backend.Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Test Task"
        };
        db.Tasks.Add(task);
        await db.SaveChangesAsync();

        var service = new AttachmentService(
            db,
            Options.Create(new FileStorageSettings()),
            new Mock<IAuditLogService>().Object,
            NullLogger<AttachmentService>.Instance);

        var fakeFile = CreateMockFile("exploit.pdf", Encoding.UTF8.GetBytes("PlainTextFileNotPdf"));

        var result = await service.UploadAsync(task.Id, fakeFile, "Malicious file", Guid.NewGuid());

        Assert.False(result.IsSuccess);
        Assert.Contains("signature mismatch", result.Message, StringComparison.OrdinalIgnoreCase);
    }
}
