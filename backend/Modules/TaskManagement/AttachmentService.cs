using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Utilities;
using Microsoft.Extensions.Options;
using Task = System.Threading.Tasks.Task;

namespace Backend.Modules.TaskManagement;

public class FileStorageSettings
{
    public string UploadPath { get; set; } = "uploads/";
    public long MaxFileSizeBytes { get; set; } = 20971520; // 20MB
    public List<string> AllowedFileTypes { get; set; } = new() { ".pdf", ".docx", ".xlsx", ".jpg", ".png" };
}

public class AttachmentService : IAttachmentService
{
    private readonly AppDbContext _db;
    private readonly FileStorageSettings _fileSettings;
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<AttachmentService> _logger;

    public AttachmentService(
        AppDbContext db,
        IOptions<FileStorageSettings> fileSettings,
        IAuditLogService auditLogService,
        ILogger<AttachmentService> logger)
    {
        _db = db;
        _fileSettings = fileSettings.Value;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    public async Task<ApiResponseDTO<TaskAttachmentResponseDTO>> UploadAsync(
        Guid taskId, IFormFile file, string? description, Guid uploaderId, string? ipAddress = null)
    {
        var taskExists = await _db.Tasks.AnyAsync(t => t.Id == taskId);
        if (!taskExists)
            return ApiResponseDTO<TaskAttachmentResponseDTO>.Failure("Task not found");

        var validation = ValidateFile(file);
        if (!validation.IsValid)
            return ApiResponseDTO<TaskAttachmentResponseDTO>.Failure(validation.ErrorMessage!);

        var uploadDir = Path.Combine(Directory.GetCurrentDirectory(), _fileSettings.UploadPath, taskId.ToString());

        if (!Directory.Exists(uploadDir))
            Directory.CreateDirectory(uploadDir);

        var uniqueFileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
        var filePath = Path.Combine(uploadDir, uniqueFileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var attachment = new TaskAttachment
        {
            TaskId = taskId,
            FileName = file.FileName,
            FilePath = filePath,
            FileSize = file.Length,
            FileType = Path.GetExtension(file.FileName).ToLower(),
            Description = description?.Trim(),
            UploadedById = uploaderId,
            CreatedAt = DateTime.UtcNow
        };

        _db.TaskAttachments.Add(attachment);
        await _db.SaveChangesAsync();

        await _auditLogService.LogAsync(
            uploaderId,
            AuditActionType.Upload,
            "TaskAttachment",
            attachment.Id,
            ipAddress,
            $"File '{attachment.FileName}' uploaded to task {taskId}",
            "TaskManagement");

        await _db.Entry(attachment).Reference(a => a.UploadedBy).LoadAsync();

        var response = MapToResponseDTO(attachment);
        return ApiResponseDTO<TaskAttachmentResponseDTO>.Success(response, "Attachment uploaded successfully");
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<TaskAttachmentResponseDTO>>> GetByTaskIdAsync(Guid taskId, int pageNumber = 1, int pageSize = 10)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.TaskAttachments
            .Include(a => a.UploadedBy)
            .Where(a => a.TaskId == taskId);

        var totalCount = await query.CountAsync();

        var attachments = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var response = attachments.Select(MapToResponseDTO).ToList();

        var paginatedResult = new PaginatedResponseDTO<TaskAttachmentResponseDTO>
        {
            Items = response,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize
        };

        return ApiResponseDTO<PaginatedResponseDTO<TaskAttachmentResponseDTO>>.Success(paginatedResult);
    }

    public async Task<ApiResponseDTO<bool>> DeleteAsync(Guid id, Guid? userId = null, string? ipAddress = null)
    {
        var attachment = await _db.TaskAttachments.FindAsync(id);
        if (attachment is null)
            return ApiResponseDTO<bool>.Failure("Attachment not found");

        try
        {
            if (File.Exists(attachment.FilePath))
                File.Delete(attachment.FilePath);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete file at {FilePath}", attachment.FilePath);
        }

        var fileName = attachment.FileName;
        var taskId = attachment.TaskId;

        _db.TaskAttachments.Remove(attachment);
        await _db.SaveChangesAsync();

        if (userId.HasValue)
        {
            await _auditLogService.LogAsync(
                userId.Value,
                AuditActionType.Delete,
                "TaskAttachment",
                id,
                ipAddress,
                $"File '{fileName}' deleted from task {taskId}",
                "TaskManagement");
        }

        return ApiResponseDTO<bool>.Success(true, "Attachment deleted successfully");
    }

    public async Task<ApiResponseDTO<TaskAttachment>> GetByIdAsync(Guid id)
    {
        var attachment = await _db.TaskAttachments.FindAsync(id);
        if (attachment is null)
            return ApiResponseDTO<TaskAttachment>.Failure("Attachment not found");

        return ApiResponseDTO<TaskAttachment>.Success(attachment);
    }

    public async Task<ApiResponseDTO<bool>> CanUserAccessAttachmentAsync(Guid attachmentId, Guid userId, UserRole userRole)
    {
        var attachment = await _db.TaskAttachments
            .Include(a => a.Task)
                .ThenInclude(t => t!.Assignments)
            .FirstOrDefaultAsync(a => a.Id == attachmentId);

        if (attachment is null)
            return ApiResponseDTO<bool>.Failure("Attachment not found");

        // Managers have universal read access across all attachments
        if (userRole == UserRole.Manager)
            return ApiResponseDTO<bool>.Success(true);

        // Uploader has access
        if (attachment.UploadedById == userId)
            return ApiResponseDTO<bool>.Success(true);

        if (attachment.Task == null)
            return ApiResponseDTO<bool>.Failure("Associated task not found");

        // Creator of the task has access
        if (attachment.Task.CreatedById == userId)
            return ApiResponseDTO<bool>.Success(true);

        // Assigned users have access
        if (attachment.Task.Assignments != null && attachment.Task.Assignments.Any(a => a.AssignedUserId == userId))
            return ApiResponseDTO<bool>.Success(true);

        // Department members have access if task is assigned to their department
        var user = await _db.Users.FindAsync(userId);
        if (user != null && user.DepartmentId.HasValue && attachment.Task.AssignedDepartmentId.HasValue && user.DepartmentId == attachment.Task.AssignedDepartmentId)
        {
            return ApiResponseDTO<bool>.Success(true);
        }

        return ApiResponseDTO<bool>.Failure("Access denied to task attachment");
    }

    private (bool IsValid, string? ErrorMessage) ValidateFile(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return (false, "No file provided");

        var extension = Path.GetExtension(file.FileName).ToLower();

        if (!_fileSettings.AllowedFileTypes.Contains(extension))
            return (false, $"Unsupported file format. Allowed: {string.Join(", ", _fileSettings.AllowedFileTypes)}");

        if (file.Length > _fileSettings.MaxFileSizeBytes)
            return (false, $"File exceeds the maximum allowed size ({_fileSettings.MaxFileSizeBytes / 1024 / 1024}MB)");

        // SEC-10: Inspect magic byte signature to verify actual content matches extension
        if (!FileSignatureValidator.HasValidMagicBytes(file))
            return (false, "File signature mismatch or invalid file header. File content does not match the declared extension.");

        return (true, null);
    }

    private TaskAttachmentResponseDTO MapToResponseDTO(TaskAttachment attachment)
    {
        return new TaskAttachmentResponseDTO
        {
            Id = attachment.Id,
            TaskId = attachment.TaskId,
            FileName = attachment.FileName,
            FileSize = attachment.FileSize,
            FileType = attachment.FileType,
            Description = attachment.Description,
            UploadedById = attachment.UploadedById,
            UploadedByName = attachment.UploadedBy is not null
                ? $"{attachment.UploadedBy.FirstName} {attachment.UploadedBy.LastName}".Trim()
                : null,
            CreatedAt = attachment.CreatedAt
        };
    }
}
