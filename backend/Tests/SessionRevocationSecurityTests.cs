using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Task = System.Threading.Tasks.Task;
using Backend.Data;
using Backend.Middleware;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Modules.AuthenticationAndCredentials.Jwt;
using Backend.Modules.Email;
using Backend.Modules.TaskManagement;
using Backend.Modules.Utilities;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Backend.Tests;

public class SessionRevocationSecurityTests
{
    private (AppDbContext db, SessionTimeoutMiddleware middleware, SessionSettings settings) CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var db = new AppDbContext(options);
        var settings = new SessionSettings
        {
            InactivityTimeoutInMinutes = 15
        };

        RequestDelegate next = (ctx) => Task.CompletedTask;
        var middleware = new SessionTimeoutMiddleware(next, settings);

        return (db, middleware, settings);
    }

    [Fact]
    public async Task InvokeAsync_LoggedOutUserWithNullLastActivity_Returns401AndPreventsResuscitation()
    {
        // SEC-08: Verify that when a user has logged out (LastActivityAt is null),
        // any request with an old access token is rejected and does not revive the session.
        var (db, middleware, _) = CreateContext();

        var userId = Guid.NewGuid();
        var user = new User
        {
            Id = userId,
            EmployeeNumber = "EMP-001",
            Email = "user@speedex.com",
            Role = UserRole.Encoder,
            IsActive = true,
            LastActivityAt = null // Logged out!
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString())
        }, "TestAuth"));
        context.Request.Path = "/api/tasks";

        await middleware.InvokeAsync(context, db);

        Assert.Equal(401, context.Response.StatusCode);

        // Verify session was NOT revived
        var dbUser = await db.Users.FindAsync(userId);
        Assert.NotNull(dbUser);
        Assert.Null(dbUser.LastActivityAt);
    }

    [Fact]
    public async Task InvokeAsync_ActiveUser_PassesAndUpdatesActivityTimestamp()
    {
        var (db, middleware, _) = CreateContext();

        var userId = Guid.NewGuid();
        var initialActivity = DateTime.UtcNow.AddMinutes(-5);
        var user = new User
        {
            Id = userId,
            EmployeeNumber = "EMP-002",
            Email = "active@speedex.com",
            Role = UserRole.Courier,
            IsActive = true,
            LastActivityAt = initialActivity
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString())
        }, "TestAuth"));
        context.Request.Path = "/api/tasks";

        await middleware.InvokeAsync(context, db);

        Assert.Equal(200, context.Response.StatusCode);

        var dbUser = await db.Users.FindAsync(userId);
        Assert.NotNull(dbUser);
        Assert.True(dbUser.LastActivityAt.HasValue);
        Assert.True(dbUser.LastActivityAt.Value > initialActivity);
    }

    [Fact]
    public async Task InvokeAsync_InactiveExpiredSession_Returns401SessionTimeout()
    {
        var (db, middleware, _) = CreateContext();

        var userId = Guid.NewGuid();
        var user = new User
        {
            Id = userId,
            EmployeeNumber = "EMP-003",
            Email = "expired@speedex.com",
            Role = UserRole.Encoder,
            IsActive = true,
            LastActivityAt = DateTime.UtcNow.AddMinutes(-30) // Expired (>15 mins)
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString())
        }, "TestAuth"));
        context.Request.Path = "/api/tasks";

        await middleware.InvokeAsync(context, db);

        Assert.Equal(401, context.Response.StatusCode);

        var dbUser = await db.Users.FindAsync(userId);
        Assert.NotNull(dbUser);
        Assert.Null(dbUser.LastActivityAt);
    }

    private AuthService CreateAuthService(AppDbContext db)
    {
        var jwtSettings = Options.Create(new JwtSettings
        {
            SecretKey = "SuperSecretKeyForTestingPurposes1234567890!MinimumLength",
            Issuer = "STARS",
            Audience = "STARS",
            ExpirationInMinutes = 15,
            RefreshTokenExpirationInDays = 7,
            PasswordResetTokenExpirationInHours = 1
        });
        var mockEmail = new Mock<IEmailService>();
        var mockAudit = new Mock<IAuditLogService>();
        return new AuthService(
            db,
            jwtSettings,
            mockEmail.Object,
            mockAudit.Object,
            NullLogger<AuthService>.Instance);
    }

    [Fact]
    public async Task ChangePasswordAsync_RevokesActiveRefreshTokenAndLastActivity_SEC17()
    {
        var (db, _, _) = CreateContext();
        var authService = CreateAuthService(db);
        var passwordHasher = new PasswordHasher<User>();

        var userId = Guid.NewGuid();
        var user = new User
        {
            Id = userId,
            EmployeeNumber = "EMP-SEC-17A",
            Email = "change-pwd@speedex.com",
            FirstName = "Test",
            LastName = "User",
            Role = UserRole.Encoder,
            IsActive = true,
            IsEmailVerified = true,
            RefreshToken = "existing-active-refresh-token",
            RefreshTokenExpiry = DateTime.UtcNow.AddDays(7),
            LastActivityAt = DateTime.UtcNow
        };
        user.PasswordHash = passwordHasher.HashPassword(user, "OldPassword!2024abc");

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var result = await authService.ChangePasswordAsync(userId, new ChangePasswordDTO
        {
            CurrentPassword = "OldPassword!2024abc",
            NewPassword = "NewStrongPassword!2025xyz"
        });

        Assert.True(result.IsSuccess);

        var updatedUser = await db.Users.FindAsync(userId);
        Assert.NotNull(updatedUser);
        Assert.Null(updatedUser.RefreshToken);
        Assert.Null(updatedUser.RefreshTokenExpiry);
        Assert.Null(updatedUser.LastActivityAt);
        Assert.True(updatedUser.IsPasswordChanged);
    }

    [Fact]
    public async Task ResetPasswordAsync_RevokesActiveRefreshTokenAndLastActivity_SEC17()
    {
        var (db, _, _) = CreateContext();
        var authService = CreateAuthService(db);
        var rawToken = "valid-reset-token-12345";

        var userId = Guid.NewGuid();
        var user = new User
        {
            Id = userId,
            EmployeeNumber = "EMP-SEC-17B",
            Email = "reset-pwd@speedex.com",
            FirstName = "Reset",
            LastName = "User",
            Role = UserRole.Encoder,
            IsActive = true,
            IsEmailVerified = true,
            PasswordResetToken = TokenHasher.HashToken(rawToken),
            PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1),
            RefreshToken = "stale-session-refresh-token",
            RefreshTokenExpiry = DateTime.UtcNow.AddDays(7),
            LastActivityAt = DateTime.UtcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var result = await authService.ResetPasswordAsync(new ResetPasswordDTO
        {
            Token = rawToken,
            NewPassword = "NewResetPassword!2025xyz"
        });

        Assert.True(result.IsSuccess);

        var updatedUser = await db.Users.FindAsync(userId);
        Assert.NotNull(updatedUser);
        Assert.Null(updatedUser.RefreshToken);
        Assert.Null(updatedUser.RefreshTokenExpiry);
        Assert.Null(updatedUser.LastActivityAt);
        Assert.Null(updatedUser.PasswordResetToken);
        Assert.Null(updatedUser.PasswordResetTokenExpiry);
    }
}
