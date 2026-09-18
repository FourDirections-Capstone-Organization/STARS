using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Task = System.Threading.Tasks.Task;

namespace Backend.Modules.TaskManagement;

public class AuditLogService : IAuditLogService
{
    private readonly AppDbContext _db;
    private readonly ILogger<AuditLogService> _logger;

    public AuditLogService(AppDbContext db, ILogger<AuditLogService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task LogAsync(
        Guid? userId,
        AuditActionType actionType,
        string targetEntity,
        Guid? targetEntityId,
        string? ipAddress,
        string description,
        string module,
        string? oldValue = null,
        string? newValue = null)
    {
        try
        {
            var safeDesc = string.IsNullOrEmpty(description) ? string.Empty : (description.Length > 500 ? description[..497] + "..." : description);
            var safeEntity = string.IsNullOrEmpty(targetEntity) ? "Unknown" : (targetEntity.Length > 100 ? targetEntity[..100] : targetEntity);
            var safeModule = string.IsNullOrEmpty(module) ? "General" : (module.Length > 100 ? module[..100] : module);
            var safeIp = string.IsNullOrEmpty(ipAddress) ? null : (ipAddress.Length > 50 ? ipAddress[..50] : ipAddress);

            var entry = new AuditLog
            {
                UserId = userId,
                ActionType = actionType,
                TargetEntity = safeEntity,
                TargetEntityId = targetEntityId,
                IpAddress = safeIp,
                Description = safeDesc,
                Module = safeModule,
                OldValue = oldValue,
                NewValue = newValue,
                Timestamp = DateTime.UtcNow
            };

            _db.AuditLogs.Add(entry);
            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log entry. Action: {Action}, Entity: {Entity}, User: {User}",
                actionType, targetEntity, userId);

            throw new InvalidOperationException(
                "Audit log write failed — action blocked until logging succeeds.", ex);
        }
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<AuditLogResponseDTO>>> GetAllAsync(int pageNumber = 1, int pageSize = 10, AuditLogFilterDTO? filters = null)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.AuditLogs
            .Include(a => a.User)
            .AsQueryable();

        if (filters != null)
        {
            if (filters.DateRangeStart.HasValue)
                query = query.Where(a => a.Timestamp >= DateTime.SpecifyKind(filters.DateRangeStart.Value, DateTimeKind.Utc));

            if (filters.DateRangeEnd.HasValue)
                query = query.Where(a => a.Timestamp <= DateTime.SpecifyKind(filters.DateRangeEnd.Value, DateTimeKind.Utc).Date.AddDays(1));

            if (filters.UserId.HasValue)
                query = query.Where(a => a.UserId == filters.UserId.Value);

            if (filters.ActionType.HasValue)
                query = query.Where(a => a.ActionType == filters.ActionType.Value);

            if (!string.IsNullOrWhiteSpace(filters.Module))
                query = query.Where(a => a.Module == filters.Module);

            if (!string.IsNullOrWhiteSpace(filters.TargetEntity))
                query = query.Where(a => a.TargetEntity == filters.TargetEntity);
        }

        var totalCount = await query.CountAsync();

        var entries = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var response = entries.Select(MapToResponseDTO).ToList();

        var paginatedResult = new PaginatedResponseDTO<AuditLogResponseDTO>
        {
            Items = response,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize
        };

        return ApiResponseDTO<PaginatedResponseDTO<AuditLogResponseDTO>>.Success(paginatedResult);
    }

    public async Task<ApiResponseDTO<AuditLogResponseDTO>> GetByIdAsync(Guid id)
    {
        var entry = await _db.AuditLogs
            .Include(a => a.User)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (entry is null)
            return ApiResponseDTO<AuditLogResponseDTO>.Failure("Audit log entry not found.");

        return ApiResponseDTO<AuditLogResponseDTO>.Success(MapToResponseDTO(entry));
    }

    public async Task LogAccessAsync(Guid userId, string? ipAddress)
    {
        var user = await _db.Users.FindAsync(userId);
        var userName = user is not null
            ? $"{user.FirstName} {user.LastName}".Trim()
            : "Unknown";
        var role = user?.Role.ToString() ?? "Unknown";

        await LogAsync(
            userId,
            AuditActionType.Read,
            "AuditLog",
            null,
            ipAddress,
            $"{role} {userName} accessed audit log",
            "AuditLog");
    }

    public async Task LogAccessDeniedAsync(Guid? userId, string? ipAddress, string targetEntity)
    {
        string actorName;
        if (userId.HasValue)
        {
            var user = await _db.Users.FindAsync(userId.Value);
            actorName = user is not null
                ? $"{user.FirstName} {user.LastName}".Trim()
                : "Unknown";
        }
        else
        {
            actorName = "Anonymous";
        }

        await LogAsync(
            userId,
            AuditActionType.AccessDenied,
            targetEntity,
            null,
            ipAddress,
            $"Unauthorized access attempt to {targetEntity} by {actorName}",
            "AuditLog");
    }

    public async Task LogBlockedModificationAsync(
        Guid? userId,
        string? ipAddress,
        string attemptedAction,
        Guid? targetEntityId)
    {
        string actorName;
        if (userId.HasValue)
        {
            var user = await _db.Users.FindAsync(userId.Value);
            actorName = user is not null
                ? $"{user.FirstName} {user.LastName}".Trim()
                : "Unknown";
        }
        else
        {
            actorName = "Anonymous";
        }

        await LogAsync(
            userId,
            AuditActionType.BlockedAction,
            "AuditLog",
            targetEntityId,
            ipAddress,
            $"Blocked attempt by {actorName} to {attemptedAction} audit log entry",
            "AuditLog");
    }

    private AuditLogResponseDTO MapToResponseDTO(AuditLog entry)
    {
        return new AuditLogResponseDTO
        {
            Id = entry.Id,
            UserId = entry.UserId,
            ActorName = entry.User is not null
                ? $"{entry.User.FirstName} {entry.User.LastName}".Trim()
                : null,
            ActorRole = entry.User?.Role.ToString(),
            ActionType = entry.ActionType.ToString(),
            Timestamp = entry.Timestamp,
            TargetEntity = entry.TargetEntity,
            TargetEntityId = entry.TargetEntityId,
            IpAddress = entry.IpAddress,
            OldValue = entry.OldValue,
            NewValue = entry.NewValue,
            Description = entry.Description,
            Module = entry.Module
        };
    }
}
