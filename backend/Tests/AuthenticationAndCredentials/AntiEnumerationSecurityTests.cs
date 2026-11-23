using System;
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
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Backend.Tests.AuthenticationAndCredentials;

public class AntiEnumerationSecurityTests
{
    private (AppDbContext db, AuthService authService, Mock<IEmailService> mockEmail) CreateContext()
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

        return (db, authService, mockEmail);
    }

    [Fact]
    public async Task ForgotPasswordAsync_NonExistentAccount_ReturnsGenericSuccessMessage()
    {
        // SEC-09: User Enumeration Prevention
        var (db, authService, mockEmail) = CreateContext();

        var dto = new ForgotPasswordDTO
        {
            EmployeeNumber = "NON-EXISTENT-999",
            Email = "nonexistent@speedex.com"
        };

        var result = await authService.ForgotPasswordAsync(dto, "https://stars.com/reset");

        Assert.True(result.IsSuccess);
        Assert.Contains("If an account matches", result.Message);

        // No email should be dispatched
        mockEmail.Verify(e => e.SendPasswordResetEmailAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task ForgotPasswordAsync_DeactivatedAccount_ReturnsSameGenericSuccessMessage()
    {
        var (db, authService, mockEmail) = CreateContext();

        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-DEACT",
            Email = "deactivated@speedex.com",
            IsDeactivated = true,
            IsEmailVerified = true,
            Role = UserRole.Encoder
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var dto = new ForgotPasswordDTO
        {
            EmployeeNumber = "EMP-DEACT",
            Email = "deactivated@speedex.com"
        };

        var result = await authService.ForgotPasswordAsync(dto, "https://stars.com/reset");

        Assert.True(result.IsSuccess);
        Assert.Contains("If an account matches", result.Message);
        mockEmail.Verify(e => e.SendPasswordResetEmailAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task ForgotPasswordAsync_ValidAccount_DispatchesEmailAndReturnsIdenticalGenericMessage()
    {
        var (db, authService, mockEmail) = CreateContext();

        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-VALID",
            Email = "valid@speedex.com",
            IsDeactivated = false,
            IsEmailVerified = true,
            Role = UserRole.Courier
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var dto = new ForgotPasswordDTO
        {
            EmployeeNumber = "EMP-VALID",
            Email = "valid@speedex.com"
        };

        var result = await authService.ForgotPasswordAsync(dto, "https://stars.com/reset");

        Assert.True(result.IsSuccess);
        Assert.Contains("If an account matches", result.Message);
        mockEmail.Verify(e => e.SendPasswordResetEmailAsync(
            "valid@speedex.com", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Once);
    }
}
