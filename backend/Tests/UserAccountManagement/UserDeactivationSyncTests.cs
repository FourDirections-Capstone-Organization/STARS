using System;
using System.Collections.Generic;
using System.Linq;
using Task = System.Threading.Tasks.Task;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Modules.DmsIntegration;
using Backend.Modules.Email;
using Backend.Modules.FomsIntegration;
using Backend.Modules.TaskManagement;
using Backend.Modules.UserAccountManagement;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Backend.Tests.UserAccountManagement;

public class UserDeactivationSyncTests
{
    private (AppDbContext db, UserService userService, Mock<IDmsIntegrationService> mockDms, Mock<IFomsIntegrationService> mockFoms) CreateTestContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var db = new AppDbContext(options);

        var mockEmail = new Mock<IEmailService>();
        var mockEmailVerification = new Mock<IEmailVerificationService>();
        var mockAuditLog = new Mock<IAuditLogService>();
        var mockDms = new Mock<IDmsIntegrationService>();
        var mockFoms = new Mock<IFomsIntegrationService>();
        var config = new ConfigurationBuilder().Build();

        mockDms.Setup(d => d.IsConfigured).Returns(true);
        mockFoms.Setup(f => f.IsConfigured).Returns(true);

        mockDms.Setup(d => d.ProvisionEmployeeAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<List<string>>(), It.IsAny<string>()))
            .ReturnsAsync(ApiResponseDTO<bool>.Success(true));

        mockFoms.Setup(f => f.ProvisionUserAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<decimal?>(), It.IsAny<DateTime?>(), It.IsAny<string>()))
            .ReturnsAsync(ApiResponseDTO<bool>.Success(true));

        var userService = new UserService(
            db,
            mockEmail.Object,
            mockEmailVerification.Object,
            mockAuditLog.Object,
            mockDms.Object,
            mockFoms.Object,
            config,
            NullLogger<UserService>.Instance);

        return (db, userService, mockDms, mockFoms);
    }

    [Fact]
    public async Task DeactivateAsync_SyncsDeactivatedStatusToDmsAndInactiveToFoms()
    {
        var (db, userService, mockDms, mockFoms) = CreateTestContext();
        var targetUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "0011",
            Email = "gelo@speedex.com",
            FirstName = "Gelo",
            LastName = "Reverete",
            Role = UserRole.Encoder,
            AllowedSystems = "STARS",
            IsActive = true,
            IsDeactivated = false
        };
        db.Users.Add(targetUser);
        await db.SaveChangesAsync();

        var result = await userService.DeactivateAsync(targetUser.Id);

        Assert.True(result.IsSuccess);
        var updated = await db.Users.FindAsync(targetUser.Id);
        Assert.NotNull(updated);
        Assert.True(updated.IsDeactivated);
        Assert.False(updated.IsActive);

        mockDms.Verify(d => d.ProvisionEmployeeAsync(
            "0011",
            "Gelo Reverete",
            It.IsAny<string>(),
            null,
            null,
            null,
            "Deactivated"), Times.Once);

        mockFoms.Verify(f => f.ProvisionUserAsync(
            "0011",
            "0011",
            "Gelo Reverete",
            "gelo@speedex.com",
            null,
            It.IsAny<string>(),
            It.IsAny<string>(),
            null,
            null,
            "Inactive"), Times.Once);
    }

    [Fact]
    public async Task ActivateAsync_SyncsActiveStatusToDmsAndFoms_WhenUserHasAccess()
    {
        var (db, userService, mockDms, mockFoms) = CreateTestContext();
        var targetUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "0012",
            Email = "active@speedex.com",
            FirstName = "Active",
            LastName = "Courier",
            Role = UserRole.Courier,
            AllowedSystems = "STARS,DMS,FOMS",
            IsActive = false,
            IsDeactivated = true
        };
        db.Users.Add(targetUser);
        await db.SaveChangesAsync();

        var result = await userService.ActivateAsync(targetUser.Id);

        Assert.True(result.IsSuccess);
        var updated = await db.Users.FindAsync(targetUser.Id);
        Assert.NotNull(updated);
        Assert.False(updated.IsDeactivated);
        Assert.True(updated.IsActive);

        mockDms.Verify(d => d.ProvisionEmployeeAsync(
            "0012",
            "Active Courier",
            It.IsAny<string>(),
            null,
            null,
            It.IsAny<List<string>>(),
            "Active"), Times.Once);

        mockFoms.Verify(f => f.ProvisionUserAsync(
            "0012",
            "0012",
            "Active Courier",
            "active@speedex.com",
            null,
            It.IsAny<string>(),
            It.IsAny<string>(),
            null,
            null,
            "Active"), Times.Once);
    }

    [Fact]
    public async Task ActivateAsync_DoesNotSyncToDms_WhenUserLacksDmsAccess()
    {
        var (db, userService, mockDms, mockFoms) = CreateTestContext();
        var targetUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "0013",
            Email = "starsonly@speedex.com",
            FirstName = "Stars",
            LastName = "Only",
            Role = UserRole.Encoder,
            AllowedSystems = "STARS",
            IsActive = false,
            IsDeactivated = true
        };
        db.Users.Add(targetUser);
        await db.SaveChangesAsync();

        var result = await userService.ActivateAsync(targetUser.Id);

        Assert.True(result.IsSuccess);
        mockDms.Verify(d => d.ProvisionEmployeeAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<List<string>>(),
            It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task DeactivateAsync_RevokesActiveRefreshTokenAndLastActivity_SEC20()
    {
        var (db, userService, _, _) = CreateTestContext();
        var targetUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "0099",
            Email = "target@speedex.com",
            FirstName = "Target",
            LastName = "Employee",
            Role = UserRole.Encoder,
            AllowedSystems = "STARS",
            IsActive = true,
            IsDeactivated = false,
            RefreshToken = "active-refresh-token",
            RefreshTokenExpiry = DateTime.UtcNow.AddDays(7),
            LastActivityAt = DateTime.UtcNow
        };
        db.Users.Add(targetUser);
        await db.SaveChangesAsync();

        var result = await userService.DeactivateAsync(targetUser.Id);

        Assert.True(result.IsSuccess);
        var updated = await db.Users.FindAsync(targetUser.Id);
        Assert.NotNull(updated);
        Assert.True(updated.IsDeactivated);
        Assert.False(updated.IsActive);
        Assert.Null(updated.RefreshToken);
        Assert.Null(updated.RefreshTokenExpiry);
        Assert.Null(updated.LastActivityAt);
    }
}
