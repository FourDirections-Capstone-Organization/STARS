using System;
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
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Backend.Tests.AuthenticationAndCredentials;

public class OnboardingDmsScopingTests
{
    private (AppDbContext db, AuthService authService, Mock<IDmsIntegrationService> mockDms, Mock<IFomsIntegrationService> mockFoms) CreateTestContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var db = new AppDbContext(options);

        var mockEmail = new Mock<IEmailService>();
        var mockAudit = new Mock<IAuditLogService>();
        var mockDms = new Mock<IDmsIntegrationService>();
        var mockFoms = new Mock<IFomsIntegrationService>();

        mockDms.Setup(d => d.IsConfigured).Returns(true);
        mockFoms.Setup(f => f.IsConfigured).Returns(true);

        mockDms.Setup(d => d.ProvisionEmployeeAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<System.Collections.Generic.List<string>>(), It.IsAny<string>()))
            .ReturnsAsync(ApiResponseDTO<bool>.Success(true));

        mockFoms.Setup(f => f.SyncPasswordAsync(It.IsAny<string>(), It.IsAny<string>()))
            .ReturnsAsync(ApiResponseDTO<bool>.Success(true));

        var jwtOptions = Options.Create(new JwtSettings
        {
            SecretKey = "SuperSecretKeyForTestingPurposes12345!",
            Issuer = "STARS",
            Audience = "STARS"
        });

        var authService = new AuthService(
            db,
            jwtOptions,
            mockEmail.Object,
            mockAudit.Object,
            NullLogger<AuthService>.Instance,
            mockDms.Object,
            mockFoms.Object);

        return (db, authService, mockDms, mockFoms);
    }

    [Fact]
    public async Task CompleteOnboarding_StarsOnlyUser_DoesNotCascadeToDmsOrFoms()
    {
        var (db, authService, mockDms, mockFoms) = CreateTestContext();
        var hasher = new PasswordHasher<User>();
        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "0011",
            Email = "gelo@speedex.com",
            FirstName = "Gelo",
            LastName = "Reverete",
            Role = UserRole.Encoder,
            AllowedSystems = "STARS",
            IsActive = true,
            IsPasswordChanged = false
        };
        user.PasswordHash = hasher.HashPassword(user, "TempPass12345!");
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var dto = new CompleteOnboardingDTO
        {
            EmployeeNumber = "0011",
            CurrentPassword = "TempPass12345!",
            NewPassword = "NewPermanentPassword123#!"
        };

        var result = await authService.CompleteOnboardingAsync(dto);

        Assert.True(result.IsSuccess);
        mockDms.Verify(d => d.ProvisionEmployeeAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<System.Collections.Generic.List<string>>(), It.IsAny<string>()),
            Times.Never);
        mockFoms.Verify(f => f.SyncPasswordAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task CompleteOnboarding_DmsUser_CascadesPasswordToDms()
    {
        var (db, authService, mockDms, mockFoms) = CreateTestContext();
        var hasher = new PasswordHasher<User>();
        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "0012",
            Email = "courier@speedex.com",
            FirstName = "Courier",
            LastName = "User",
            Role = UserRole.Courier,
            AllowedSystems = "STARS,DMS",
            IsActive = true,
            IsPasswordChanged = false
        };
        user.PasswordHash = hasher.HashPassword(user, "TempPass12345!");
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var dto = new CompleteOnboardingDTO
        {
            EmployeeNumber = "0012",
            CurrentPassword = "TempPass12345!",
            NewPassword = "NewPermanentPassword123#!"
        };

        var result = await authService.CompleteOnboardingAsync(dto);

        Assert.True(result.IsSuccess);
        mockDms.Verify(d => d.ProvisionEmployeeAsync(
            "0012",
            "Courier User",
            null,
            null,
            "NewPermanentPassword123#!",
            null,
            It.IsAny<string>()),
            Times.Once);
        mockFoms.Verify(f => f.SyncPasswordAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }
}
