using System;
using System.Collections.Generic;
using System.Linq;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.Email;
using Backend.Modules.TaskManagement;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Modules.DmsIntegration;
using Backend.Modules.FomsIntegration;
using Backend.Modules.UserAccountManagement;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Backend.Tests.UserAccountManagement;

public class UserUpdateMultiSystemTests
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
    public async System.Threading.Tasks.Task UpdateAsync_EmptyTargetSystems_ReturnsFailure()
    {
        var (db, userService, _, _) = CreateTestContext();
        var managerId = Guid.NewGuid();
        var manager = new User
        {
            Id = managerId,
            EmployeeNumber = "0001",
            Email = "manager@test.com",
            FirstName = "Manager",
            LastName = "User",
            Role = UserRole.Manager,
            AllowedSystems = "STARS,DMS,FOMS"
        };
        var targetUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "0002",
            Email = "emp@test.com",
            FirstName = "John",
            LastName = "Doe",
            Role = UserRole.Encoder,
            AllowedSystems = "STARS,DMS"
        };
        db.Users.AddRange(manager, targetUser);
        await db.SaveChangesAsync();

        var dto = new UpdateUserDTO
        {
            FirstName = "John",
            LastName = "Doe",
            TargetSystems = new List<string>() // Empty systems!
        };

        var result = await userService.UpdateAsync(targetUser.Id, dto, managerId);

        Assert.False(result.IsSuccess);
        Assert.Contains("At least one target operational system must be selected", result.Message);
    }

    [Fact]
    public async System.Threading.Tasks.Task UpdateAsync_ValidTargetSystems_UpdatesAndDispatchesCorrectly()
    {
        var (db, userService, mockDms, mockFoms) = CreateTestContext();
        var managerId = Guid.NewGuid();
        var manager = new User
        {
            Id = managerId,
            EmployeeNumber = "0001",
            Email = "manager@test.com",
            FirstName = "Manager",
            LastName = "User",
            Role = UserRole.Manager,
            AllowedSystems = "STARS,DMS,FOMS"
        };
        var targetUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "0002",
            Email = "emp@test.com",
            FirstName = "John",
            LastName = "Doe",
            Role = UserRole.Encoder,
            AllowedSystems = "STARS,DMS",
            DmsRole = "Encoder"
        };
        db.Users.AddRange(manager, targetUser);
        await db.SaveChangesAsync();

        // Remove DMS, grant FOMS, replace FOMS role
        var dto = new UpdateUserDTO
        {
            FirstName = "John",
            LastName = "Doe Updated",
            TargetSystems = new List<string> { "STARS", "FOMS" },
            FomsRole = "Head Accountant"
        };

        var result = await userService.UpdateAsync(targetUser.Id, dto, managerId);

        Assert.True(result.IsSuccess);
        Assert.Equal("STARS,FOMS", result.Data!.AllowedSystems);
        Assert.Equal("Head Accountant", result.Data.FomsRole);

        // Verify DMS was updated to Inactive status (safe floating record, NOT deleted!)
        mockDms.Verify(d => d.ProvisionEmployeeAsync(
            targetUser.EmployeeNumber,
            It.IsAny<string>(),
            It.IsAny<string>(),
            null,
            null,
            It.IsAny<List<string>>(),
            "Inactive"), Times.Once);

        // Verify FOMS was provisioned as Active
        mockFoms.Verify(f => f.ProvisionUserAsync(
            targetUser.EmployeeNumber,
            targetUser.EmployeeNumber,
            It.IsAny<string>(),
            targetUser.Email,
            null,
            "Head Accountant",
            It.IsAny<string>(),
            null,
            It.IsAny<DateTime?>(),
            "Active"), Times.Once);
    }
}
