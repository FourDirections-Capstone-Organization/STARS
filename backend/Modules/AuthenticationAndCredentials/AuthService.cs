using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.AuthenticationAndCredentials.Jwt;
using Backend.Modules.Email;
using Backend.Modules.TaskManagement;
using Backend.Modules.Utilities;

namespace Backend.Modules.AuthenticationAndCredentials;

public class AuthService : IAuthService
{
    private readonly AppDbContext _db;
    private readonly JwtSettings _jwtSettings;
    private readonly IEmailService _emailService;
    private readonly ILogger<AuthService> _logger;
    private readonly IAuditLogService _auditLogService;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public AuthService(
        AppDbContext db,
        IOptions<JwtSettings> jwtSettings,
        IEmailService emailService,
        IAuditLogService auditLogService,
        ILogger<AuthService> logger)
    {
        _db = db;
        _jwtSettings = jwtSettings.Value;
        _emailService = emailService;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    public async Task<ApiResponseDTO<AuthResponseDTO>> LoginAsync(LoginDTO dto, string? ipAddress = null)
    {     
        var user = await FindUserByIdentifier(dto.Identifier);

        if (user is null)
            return ApiResponseDTO<AuthResponseDTO>.Failure("Invalid credentials");

        // Check if user is deactivated
        if (user.IsDeactivated)
            return ApiResponseDTO<AuthResponseDTO>.Failure("Account is deactivated. Please contact your administrator.");

        // Check if email is verified (pending accounts fail here first)
        if (!user.IsEmailVerified)
            return ApiResponseDTO<AuthResponseDTO>.Failure("Account is pending email verification. Please verify your email before logging in.");

        // Check if user is active
        if (!user.IsActive)
            return ApiResponseDTO<AuthResponseDTO>.Failure("Account is inactive. Please contact your administrator.");

        // Verify password using PBKDF2 (PasswordHasher)
        if (!await VerifyPasswordAndRehashIfNeeded(user, dto.Password))
            return ApiResponseDTO<AuthResponseDTO>.Failure("Invalid credentials");

        // Generate tokens
        var accessToken = GenerateJwtToken(user);
        var refreshToken = GenerateRefreshToken();

        // Adding Refresh Tokens
        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(_jwtSettings.RefreshTokenExpirationInDays);

        // Update last activity
        user.LastActivityAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var fullName = GetFullName(user);

        await _auditLogService.LogAsync(
            user.Id,
            AuditActionType.Login,
            "User",
            user.Id,
            ipAddress,
            $"User {fullName} logged in",
            "Authentication");

        var response = new AuthResponseDTO
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            UserId = user.Id,
            EmployeeNumber = user.EmployeeNumber,
            Email = user.Email,
            FullName = fullName,
            Role = user.Role,
            IsPasswordChanged = user.IsPasswordChanged,
            IsEmailVerified = user.IsEmailVerified,
            HasAcceptedTerms = user.HasAcceptedTerms,
            TermsVersionAccepted = user.TermsVersionAccepted,
            ExpiresAt = DateTime.UtcNow.AddMinutes(_jwtSettings.ExpirationInMinutes),
            RefreshTokenExpiresAt = user.RefreshTokenExpiry!.Value
        };

        _logger.LogInformation("User logged in: {EmployeeNumber}", user.EmployeeNumber);

        return ApiResponseDTO<AuthResponseDTO>.Success(response, "Login successful");
    }

    public async Task<ApiResponseDTO<bool>> ForgotPasswordAsync(ForgotPasswordDTO dto, string resetUrl)
    {
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email.ToLower() == dto.Email.ToLower());

        // Don't reveal if email exists (security)
        if (user is null)
            return ApiResponseDTO<bool>.Success(true, "If the email exists, a password reset link has been sent.");

        // Check if user is deactivated
        if (user.IsDeactivated)
            return ApiResponseDTO<bool>.Success(true, "If the email exists, a password reset link has been sent.");

        // Generate reset token
        var resetToken = GenerateSecureToken();
        user.PasswordResetToken = resetToken;
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(_jwtSettings.PasswordResetTokenExpirationInHours);

        await _db.SaveChangesAsync();

        // Send email
        var fullName = GetFullName(user);
        await _emailService.SendPasswordResetEmailAsync(user.Email, fullName, resetToken, resetUrl);

        _logger.LogInformation("Password reset requested for: {Email}", user.Email);

        await _auditLogService.LogAsync(
            user.Id,
            AuditActionType.Update,
            "User",
            user.Id,
            null,
            $"Password reset requested for {fullName} ({user.EmployeeNumber})",
            "Authentication");

        return ApiResponseDTO<bool>.Success(true, "If the email exists, a password reset link has been sent.");
    }

    public async Task<ApiResponseDTO<bool>> ResetPasswordAsync(ResetPasswordDTO dto)
    {
        // Find user by reset token
        var user = await _db.Users
            .FirstOrDefaultAsync(u =>
                u.PasswordResetToken == dto.Token &&
                u.PasswordResetTokenExpiry > DateTime.UtcNow);

        if (user is null)
            return ApiResponseDTO<bool>.Failure("Invalid or expired reset token");

        // Validate password meets OWASP requirements
        var (isValid, errors) = PasswordValidator.Validate(dto.NewPassword);
        if (!isValid)
            return ApiResponseDTO<bool>.Failure(string.Join(" ", errors));

        // Hash new password using PBKDF2 (PasswordHasher)
        user.PasswordHash = _passwordHasher.HashPassword(user, dto.NewPassword);
        user.PasswordResetToken = null;
        user.PasswordResetTokenExpiry = null;
        user.IsPasswordChanged = true;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var fullName = GetFullName(user);

        _logger.LogInformation("Password reset completed for: {Email}", user.Email);

        await _auditLogService.LogAsync(
            user.Id,
            AuditActionType.Update,
            "User",
            user.Id,
            null,
            $"Password reset completed for {fullName} ({user.EmployeeNumber})",
            "Authentication");

        return ApiResponseDTO<bool>.Success(true, "Password reset successfully");
    }

    public async Task<ApiResponseDTO<bool>> ChangePasswordAsync(Guid userId, ChangePasswordDTO dto)
    {
        var user = await _db.Users.FindAsync(userId);

        if (user is null)
            return ApiResponseDTO<bool>.Failure("User not found");

        // Verify current password using PBKDF2 (PasswordHasher)
        if (!await VerifyPasswordAndRehashIfNeeded(user, dto.CurrentPassword))
            return ApiResponseDTO<bool>.Failure("Current password is incorrect");

        // Validate new password meets OWASP requirements
        var (isValid, errors) = PasswordValidator.Validate(dto.NewPassword);
        if (!isValid)
            return ApiResponseDTO<bool>.Failure(string.Join(" ", errors));

        // Hash new password
        user.PasswordHash = _passwordHasher.HashPassword(user, dto.NewPassword);
        user.IsPasswordChanged = true;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var fullName = GetFullName(user);

        _logger.LogInformation("Password changed for user: {UserId}", userId);

        await _auditLogService.LogAsync(
            userId,
            AuditActionType.Update,
            "User",
            userId,
            null,
            $"Password changed for {fullName} ({user.EmployeeNumber})",
            "Authentication");

        return ApiResponseDTO<bool>.Success(true, "Password changed successfully");
    }

    public async Task<ApiResponseDTO<bool>> LogoutAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user is null)
            return ApiResponseDTO<bool>.Failure("User not found");

        // End the session and mark the user Offline (presence is derived from
        // LastActivityAt).
        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;
        user.LastActivityAt = null;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return ApiResponseDTO<bool>.Success(true, "Logged out successfully");
    }

    public async Task<ApiResponseDTO<AuthResponseDTO>> RefreshTokenAsync(string refreshToken)
    {
        var user = await _db.Users
            .Include(u => u.Department)
            .FirstOrDefaultAsync(u => u.RefreshToken == refreshToken);

        if (user is null)
            return ApiResponseDTO<AuthResponseDTO>.Failure("Invalid refresh token");

        if (user.RefreshTokenExpiry < DateTime.UtcNow)
            return ApiResponseDTO<AuthResponseDTO>.Failure("Refresh token has expired");

        if (user.IsDeactivated || !user.IsActive)
            return ApiResponseDTO<AuthResponseDTO>.Failure("Account is inactive");

        // Generate new tokens
        var accessToken = GenerateJwtToken(user);
        var newRefreshToken = GenerateRefreshToken();

        // Store new refresh token
        user.RefreshToken = newRefreshToken;
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(_jwtSettings.RefreshTokenExpirationInDays);
        user.LastActivityAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var fullName = GetFullName(user);

        var response = new AuthResponseDTO
        {
            AccessToken = accessToken,
            RefreshToken = newRefreshToken,
            UserId = user.Id,
            EmployeeNumber = user.EmployeeNumber,
            Email = user.Email,
            FullName = fullName,
            Role = user.Role,
            IsPasswordChanged = user.IsPasswordChanged,
            IsEmailVerified = user.IsEmailVerified,
            HasAcceptedTerms = user.HasAcceptedTerms,
            TermsVersionAccepted = user.TermsVersionAccepted,
            ExpiresAt = DateTime.UtcNow.AddMinutes(_jwtSettings.ExpirationInMinutes),
            RefreshTokenExpiresAt = user.RefreshTokenExpiry.Value
        };

        return ApiResponseDTO<AuthResponseDTO>.Success(response, "Token refreshed successfully");
    }

    public async Task<ApiResponseDTO<UserResponseDTO>> GetCurrentUserAsync(Guid userId)
    {
        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user is null)
            return ApiResponseDTO<UserResponseDTO>.Failure("User not found");

        var response = new UserResponseDTO
        {
            Id = user.Id,
            EmployeeNumber = user.EmployeeNumber,
            Username = user.Username,
            Email = user.Email,
            FirstName = user.FirstName,
            MiddleName = user.MiddleName,
            LastName = user.LastName,
            Suffix = user.Suffix,
            ContactNumber = user.ContactNumber,
            Role = user.Role,
            DepartmentId = user.DepartmentId,
            DepartmentName = user.Department?.Name,
            JobPositionId = user.JobPositionId,
            JobPositionName = user.JobPosition?.Name,
            IsActive = user.IsActive,
            IsDeactivated = user.IsDeactivated,
            IsEmailVerified = user.IsEmailVerified,
            IsPasswordChanged = user.IsPasswordChanged,
            CreatedAt = user.CreatedAt,
            FullName = GetFullName(user),
            // Online while the session is active (kept fresh by requests/heartbeat)
            PresenceStatus = user.LastActivityAt.HasValue
                && (DateTime.UtcNow - user.LastActivityAt.Value).TotalMinutes <= 15
                ? "Online"
                : "Offline"
        };

        return ApiResponseDTO<UserResponseDTO>.Success(response);
    }

    public async Task<ApiResponseDTO<bool>> VerifyPasswordAsync(VerifyPasswordDTO dto)
    {
        var normalizedEmployeeId = dto.EmployeeID.Trim().ToLower();
    
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.EmployeeNumber.ToLower() == normalizedEmployeeId);

        if (user is null)
            return ApiResponseDTO<bool>.Failure("User not found");

        // Verify password using PBKDF2 (PasswordHasher)
        if (!await VerifyPasswordAndRehashIfNeeded(user, dto.Password))
            return ApiResponseDTO<bool>.Failure("Incorrect password");

        return ApiResponseDTO<bool>.Success(true, "Password verified");
    }

    public async Task<ApiResponseDTO<bool>> AcceptTermsAsync(Guid userId, string termsVersion)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user is null)
            return ApiResponseDTO<bool>.Failure("User not found");

        user.HasAcceptedTerms = true;
        user.TermsVersionAccepted = termsVersion;
        user.TermsAcceptedAt = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var fullName = GetFullName(user);

        await _auditLogService.LogAsync(
            userId,
            AuditActionType.Update,
            "User",
            userId,
            null,
            $"User {fullName} ({user.EmployeeNumber}) accepted Terms & Conditions ({termsVersion})",
            "Authentication");

        return ApiResponseDTO<bool>.Success(true, "Terms accepted successfully");
    }

    private string GenerateJwtToken(User user)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.ASCII.GetBytes(_jwtSettings.SecretKey);

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim("EmployeeNumber", user.EmployeeNumber),
            new Claim("FullName", GetFullName(user))
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(_jwtSettings.ExpirationInMinutes),
            Issuer = _jwtSettings.Issuer,
            Audience = _jwtSettings.Audience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    private string GenerateRefreshToken()
    {
        return GenerateSecureToken();
    }

    private string GenerateTempPassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghjkmnpqrstuvwxyz";
        const string digits = "23456789";
        const string special = "!@#$%^&*";

        var random = new Random();
        var password = new char[16];

        password[0] = upper[random.Next(upper.Length)];
        password[1] = lower[random.Next(lower.Length)];
        password[2] = digits[random.Next(digits.Length)];
        password[3] = special[random.Next(special.Length)];

        const string allChars = upper + lower + digits + special;
        for (int i = 4; i < 16; i++)
            password[i] = allChars[random.Next(allChars.Length)];

        return new string(password.OrderBy(_ => random.Next()).ToArray());
    }

    private string GenerateSecureToken()
    {
        var tokenBytes = new byte[32];
        RandomNumberGenerator.Fill(tokenBytes);
        return Convert.ToBase64String(tokenBytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
    }

    private async Task<User?> FindUserByIdentifier(string identifier)
    {
        var normalizedIdentifier = identifier.Trim().ToLower();
        
        return await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u =>
                u.EmployeeNumber.ToLower() == normalizedIdentifier ||
                u.Email.ToLower() == normalizedIdentifier ||
                (u.Username != null && u.Username.ToLower() == normalizedIdentifier));
    }

    private string GetFullName(User user)
    {
        var parts = new[] { user.FirstName, user.MiddleName, user.LastName, user.Suffix }
            .Where(p => !string.IsNullOrWhiteSpace(p));
        return string.Join(" ", parts).Trim();
    }

    private async Task<bool> VerifyPasswordAndRehashIfNeeded(User user, string password)
    {
        var result = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, password);
        
        if (result == PasswordVerificationResult.Failed)
            return false;
        
        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = _passwordHasher.HashPassword(user, password);
            await _db.SaveChangesAsync();
        }
        
        return true;
    }
}
