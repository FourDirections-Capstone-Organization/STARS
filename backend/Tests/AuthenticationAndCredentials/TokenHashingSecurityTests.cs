using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Task = System.Threading.Tasks.Task;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Modules.AuthenticationAndCredentials.Jwt;
using Backend.Modules.DmsIntegration;
using Backend.Modules.Email;
using Backend.Modules.FomsIntegration;
using Backend.Modules.TaskManagement;
using Backend.Modules.Utilities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Backend.Tests.AuthenticationAndCredentials;

public class TokenHashingSecurityTests
{
    private (AppDbContext db, AuthService authService) CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var db = new AppDbContext(options);

        var jwtSettings = Options.Create(new JwtSettings
        {
            SecretKey = "SuperSecretKeyForTestingTokensMustBeLongEnough1234567890",
            ExpirationInMinutes = 60,
            RefreshTokenExpirationInDays = 7,
            PasswordResetTokenExpirationInHours = 1
        });

        var mockEmail = new Mock<IEmailService>();
        var mockAudit = new Mock<IAuditLogService>();
        var mockDms = new Mock<IDmsIntegrationService>();
        var mockFoms = new Mock<IFomsIntegrationService>();

        var authService = new AuthService(
            db,
            jwtSettings,
            mockEmail.Object,
            mockAudit.Object,
            NullLogger<AuthService>.Instance,
            mockDms.Object,
            mockFoms.Object);

        return (db, authService);
    }

    [Fact]
    public void TokenHasher_GeneratesConsistentSha256HexHash()
    {
        var raw = "test-token-value-12345";
        var hash = TokenHasher.HashToken(raw);

        // Expected SHA-256 hash
        var expectedBytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        var expectedHex = Convert.ToHexString(expectedBytes);

        Assert.Equal(expectedHex, hash);
        Assert.Equal(64, hash.Length); // 256 bits = 64 hex characters
    }

    [Fact]
    public async Task LoginAsync_StoresHashedRefreshTokenAtRest()
    {
        // SEC-06: Verify cleartext refresh tokens are never persisted in DB
        var (db, authService) = CreateContext();
        var hasher = new PasswordHasher<User>();

        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "user@speedex.com",
            PasswordHash = "",
            Role = UserRole.Encoder,
            IsActive = true,
            IsEmailVerified = true
        };
        user.PasswordHash = hasher.HashPassword(user, "SecurePass123!");

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var result = await authService.LoginAsync(new LoginDTO
        {
            Identifier = "EMP-001",
            Password = "SecurePass123!"
        });

        Assert.True(result.IsSuccess);
        var rawRefreshToken = result.Data!.RefreshToken;
        Assert.False(string.IsNullOrEmpty(rawRefreshToken));

        var dbUser = await db.Users.FindAsync(user.Id);
        Assert.NotNull(dbUser);
        // Database must NOT contain the raw token
        Assert.NotEqual(rawRefreshToken, dbUser.RefreshToken);
        // Database MUST contain the SHA-256 hash
        Assert.Equal(TokenHasher.HashToken(rawRefreshToken), dbUser.RefreshToken);
    }

    [Fact]
    public async Task RefreshTokenAsync_ValidToken_SuccessfullyRotatesHashedToken()
    {
        var (db, authService) = CreateContext();

        var rawRefreshToken = "initial-raw-refresh-token";
        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            Email = "emp@speedex.com",
            PasswordHash = "hash",
            RefreshToken = TokenHasher.HashToken(rawRefreshToken),
            RefreshTokenExpiry = DateTime.UtcNow.AddDays(7),
            Role = UserRole.Courier,
            IsActive = true,
            IsEmailVerified = true
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        // Refresh with the raw token
        var result = await authService.RefreshTokenAsync(rawRefreshToken);

        Assert.True(result.IsSuccess);
        var newRawToken = result.Data!.RefreshToken;
        Assert.NotEqual(rawRefreshToken, newRawToken);

        var dbUser = await db.Users.FindAsync(user.Id);
        Assert.NotNull(dbUser);
        // New token is also hashed at rest
        Assert.Equal(TokenHasher.HashToken(newRawToken), dbUser.RefreshToken);
    }

    [Fact]
    public async Task ResetPasswordAsync_HashedToken_SucceedsAndClearsToken()
    {
        var (db, authService) = CreateContext();
        var hasher = new PasswordHasher<User>();

        var rawResetToken = "secure-reset-token-xyz";
        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-003",
            Email = "reset@speedex.com",
            PasswordHash = hasher.HashPassword(null!, "OldPass123!"),
            PasswordResetToken = TokenHasher.HashToken(rawResetToken),
            PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1),
            Role = UserRole.Encoder,
            IsActive = true,
            IsEmailVerified = true
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var result = await authService.ResetPasswordAsync(new ResetPasswordDTO
        {
            Token = rawResetToken,
            NewPassword = "NewStrongPassword123!",
            ConfirmPassword = "NewStrongPassword123!"
        });

        Assert.True(result.IsSuccess);
        var dbUser = await db.Users.FindAsync(user.Id);
        Assert.NotNull(dbUser);
        Assert.Null(dbUser.PasswordResetToken);
        Assert.Null(dbUser.PasswordResetTokenExpiry);
    }
}
