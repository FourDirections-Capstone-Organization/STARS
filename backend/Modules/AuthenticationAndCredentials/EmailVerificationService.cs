using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Email;
using Backend.Modules.TaskManagement;

namespace Backend.Modules.AuthenticationAndCredentials;

public class EmailVerificationService : IEmailVerificationService
{
    private readonly AppDbContext _db;
    private readonly IEmailService _emailService;
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<EmailVerificationService> _logger;

    public EmailVerificationService(
        AppDbContext db,
        IEmailService emailService,
        IAuditLogService auditLogService,
        ILogger<EmailVerificationService> logger)
    {
        _db = db;
        _emailService = emailService;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    public async Task<ApiResponseDTO<bool>> VerifyEmailAsync(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return ApiResponseDTO<bool>.Failure("Verification token is required.");

        var cleanToken = token.Trim().ToLowerInvariant();

        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.EmailVerificationToken != null && u.EmailVerificationToken.ToLower() == cleanToken);

        if (user is null)
        {
            await _auditLogService.LogAsync(
                null, AuditActionType.Update, "User", null, null,
                "Email verification FAILED: invalid or expired token provided",
                "Authentication");
            return ApiResponseDTO<bool>.Failure("Verification link has expired or is invalid.");
        }

        if (user.EmailVerificationTokenExpiry.HasValue
            && user.EmailVerificationTokenExpiry.Value < DateTime.UtcNow)
        {
            await _auditLogService.LogAsync(
                user.Id, AuditActionType.Update, "User", user.Id, null,
                $"Email verification EXPIRED for {user.Email}. Token expired at {user.EmailVerificationTokenExpiry.Value:yyyy-MM-dd HH:mm}",
                "Authentication");
            return ApiResponseDTO<bool>.Failure("Verification link has expired or is invalid.");
        }

        if (user.IsEmailVerified)
        {
            await _auditLogService.LogAsync(
                user.Id, AuditActionType.Update, "User", user.Id, null,
                $"Email verification ATTEMPTED but already verified for {user.Email}",
                "Authentication");
            return ApiResponseDTO<bool>.Success(true, "Account is already verified. You may log in.");
        }

        user.IsEmailVerified = true;
        user.EmailVerificationToken = null;
        user.EmailVerificationTokenExpiry = null;
        user.IsActive = true;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var fullName = $"{user.FirstName} {user.LastName}".Trim();

        await _auditLogService.LogAsync(
            user.Id, AuditActionType.Update, "User", user.Id, null,
            $"Email verification COMPLETED for {fullName} ({user.Email}). Account activated.",
            "Authentication");

        _logger.LogInformation("Email verified for user {UserId} ({Email})", user.Id, user.Email);

        return ApiResponseDTO<bool>.Success(true, "Account verified successfully. You may now log in.");
    }

    public async Task<ApiResponseDTO<bool>> ResendVerificationAsync(
        Guid? employeeId, string? email, string verificationUrl, string? identifier = null)
    {
        User? user = null;

        if (employeeId.HasValue && employeeId.Value != Guid.Empty)
        {
            user = await _db.Users.FindAsync(employeeId.Value);
        }

        var searchEmail = email?.Trim() ?? string.Empty;
        var searchIdentifier = identifier?.Trim() ?? string.Empty;

        if (user is null && !string.IsNullOrWhiteSpace(searchEmail))
        {
            var emailLower = searchEmail.ToLowerInvariant();
            user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == emailLower);
        }

        if (user is null && !string.IsNullOrWhiteSpace(searchIdentifier))
        {
            if (Guid.TryParse(searchIdentifier, out var parsedGuid))
            {
                user = await _db.Users.FindAsync(parsedGuid);
            }

            if (user is null)
            {
                var idLower = searchIdentifier.ToLowerInvariant();
                user = await _db.Users.FirstOrDefaultAsync(u =>
                    u.EmployeeNumber.ToLower() == idLower ||
                    (u.Username != null && u.Username.ToLower() == idLower) ||
                    u.Email.ToLower() == idLower);
            }
        }

        if (user is null)
            return ApiResponseDTO<bool>.Failure("Employee not found.");

        if (user.IsEmailVerified)
            return ApiResponseDTO<bool>.Failure("Account is already verified. You may log in.");

        if (user.IsDeactivated)
            return ApiResponseDTO<bool>.Failure("Account is deactivated. Please contact your administrator.");

        var token = GenerateToken();
        user.EmailVerificationToken = token;
        user.EmailVerificationTokenExpiry = DateTime.UtcNow.AddHours(24);
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var fullName = $"{user.FirstName} {user.LastName}".Trim();
        await _emailService.SendEmailVerificationAsync(user.Email, fullName, token, verificationUrl);

        await _auditLogService.LogAsync(
            user.Id, AuditActionType.Update, "User", user.Id, null,
            $"Verification email RESENT to {fullName} ({user.Email})",
            "Authentication");

        _logger.LogInformation("Verification email resent to user {UserId} ({Email})", user.Id, user.Email);

        return ApiResponseDTO<bool>.Success(true, "Verification email resent successfully. Please check your inbox.");
    }

    public async Task<ApiResponseDTO<EmailVerificationStatusDTO>> GetVerificationStatusAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);

        if (user is null)
            return ApiResponseDTO<EmailVerificationStatusDTO>.Failure("Employee not found.");

        var isTokenExpired = user.EmailVerificationTokenExpiry.HasValue
            && user.EmailVerificationTokenExpiry.Value < DateTime.UtcNow;

        var status = new EmailVerificationStatusDTO
        {
            UserId = user.Id,
            EmployeeName = $"{user.FirstName} {user.LastName}".Trim(),
            Email = user.Email,
            IsEmailVerified = user.IsEmailVerified,
            TokenExpiry = user.EmailVerificationTokenExpiry,
            IsTokenExpired = isTokenExpired,
            Status = user.IsEmailVerified
                ? "Verified"
                : isTokenExpired
                    ? "Token Expired"
                    : user.EmailVerificationToken != null
                        ? "Pending"
                        : "No Token"
        };

        return ApiResponseDTO<EmailVerificationStatusDTO>.Success(status);
    }

    public async System.Threading.Tasks.Task SendVerificationEmailForUserAsync(Guid userId, string verificationUrl)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user is null)
            return;

        var token = GenerateToken();
        user.EmailVerificationToken = token;
        user.EmailVerificationTokenExpiry = DateTime.UtcNow.AddHours(24);
        await _db.SaveChangesAsync();

        var fullName = $"{user.FirstName} {user.LastName}".Trim();
        await _emailService.SendEmailVerificationAsync(user.Email, fullName, token, verificationUrl);

        await _auditLogService.LogAsync(
            userId, AuditActionType.Update, "User", userId, null,
            $"Verification email SENT to {fullName} ({user.Email})",
            "Authentication");

        _logger.LogInformation("Verification email sent to new user {UserId} ({Email})", user.Id, user.Email);
    }

    private string GenerateToken()
    {
        var tokenBytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToHexString(tokenBytes).ToLowerInvariant();
    }
}
