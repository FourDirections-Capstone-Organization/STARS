using System;
using System.Collections.Generic;
using System.Threading.Tasks;
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

public class UserSecurityTests
{
    private (AppDbContext db, UserService userService) CreateTestContext()
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

        var userService = new UserService(
            db,
            mockEmail.Object,
            mockEmailVerification.Object,
            mockAuditLog.Object,
            mockDms.Object,
            mockFoms.Object,
            config,
            NullLogger<UserService>.Instance);

        return (db, userService);
    }

    [Fact]
    public async System.Threading.Tasks.Task UpdateAsync_NonManagerSelfUpdate_CannotEscalateRoleOrDepartment()
    {
        // SEC-01: Verify regular user cannot self-escalate to Manager or reassign their department
        var (db, userService) = CreateTestContext();
        var originalDeptId = Guid.NewGuid();
        var maliciousDeptId = Guid.NewGuid();

        var employee = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "encoder@speedex.com",
            FirstName = "Alice",
            LastName = "Encoder",
            Role = UserRole.Encoder,
            DepartmentId = originalDeptId,
            AllowedSystems = "STARS"
        };
        db.Users.Add(employee);
        await db.SaveChangesAsync();

        var maliciousDto = new UpdateUserDTO
        {
            FirstName = "Alice Updated",
            Role = UserRole.Manager, // Attempt privilege escalation!
            DepartmentId = maliciousDeptId,
            AllowedSystems = "STARS,DMS,FOMS"
        };

        // Self-update by Alice
        var result = await userService.UpdateAsync(employee.Id, maliciousDto, employee.Id);

        Assert.True(result.IsSuccess);
        var updated = await db.Users.FindAsync(employee.Id);
        Assert.NotNull(updated);
        Assert.Equal("Alice Updated", updated.FirstName);
        // Assert role and department remained untouched
        Assert.Equal(UserRole.Encoder, updated.Role);
        Assert.Equal(originalDeptId, updated.DepartmentId);
        Assert.Equal("STARS", updated.AllowedSystems);
    }

    [Fact]
    public async System.Threading.Tasks.Task UpdateAsync_ManagerUpdatingUser_CanUpdateRoleAndDepartment()
    {
        // Manager can legitimately reassign roles and departments
        var (db, userService) = CreateTestContext();
        var targetDeptId = Guid.NewGuid();
        var newDeptId = Guid.NewGuid();

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "MGR-001",
            Email = "manager@speedex.com",
            FirstName = "Bob",
            LastName = "Manager",
            Role = UserRole.Manager
        };

        var employee = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-002",
            Email = "courier@speedex.com",
            FirstName = "Charlie",
            LastName = "Courier",
            Role = UserRole.Courier,
            DepartmentId = targetDeptId,
            AllowedSystems = "STARS"
        };

        db.Users.AddRange(manager, employee);
        await db.SaveChangesAsync();

        var managerDto = new UpdateUserDTO
        {
            Role = UserRole.Dispatcher,
            DepartmentId = newDeptId,
            TargetSystems = new List<string> { "STARS", "DMS" }
        };

        var result = await userService.UpdateAsync(employee.Id, managerDto, manager.Id);

        Assert.True(result.IsSuccess);
        var updated = await db.Users.FindAsync(employee.Id);
        Assert.NotNull(updated);
        Assert.Equal(UserRole.Dispatcher, updated.Role);
        Assert.Equal(newDeptId, updated.DepartmentId);
        Assert.Equal("STARS,DMS", updated.AllowedSystems);
    }

    [Fact]
    public async System.Threading.Tasks.Task UpdateAsync_NonManagerUpdatingOtherUser_FailsWithPermissionDenied()
    {
        var (db, userService) = CreateTestContext();

        var user1 = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-003",
            Email = "user1@speedex.com",
            FirstName = "User",
            LastName = "One",
            Role = UserRole.Encoder
        };

        var user2 = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-004",
            Email = "user2@speedex.com",
            FirstName = "User",
            LastName = "Two",
            Role = UserRole.Encoder
        };

        db.Users.AddRange(user1, user2);
        await db.SaveChangesAsync();

        var dto = new UpdateUserDTO
        {
            FirstName = "Hacked Name"
        };

        var result = await userService.UpdateAsync(user2.Id, dto, user1.Id);

        Assert.False(result.IsSuccess);
        Assert.Contains("permission", result.Message, StringComparison.OrdinalIgnoreCase);
    }
}
