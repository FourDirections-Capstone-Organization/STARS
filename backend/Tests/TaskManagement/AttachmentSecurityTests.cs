using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Claims;
using System.Threading.Tasks;
using Task = System.Threading.Tasks.Task;
using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Modules.TaskManagement;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Backend.Tests.TaskManagement;

public class AttachmentSecurityTests
{
    private (AppDbContext db, AttachmentService attachmentService) CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var db = new AppDbContext(options);
        var mockAudit = new Mock<IAuditLogService>();
        var settings = Options.Create(new FileStorageSettings());

        var service = new AttachmentService(
            db,
            settings,
            mockAudit.Object,
            NullLogger<AttachmentService>.Instance);

        return (db, service);
    }

    [Fact]
    public async Task CanUserAccessAttachment_UnauthorizedCrossDepartmentUser_ReturnsAccessDenied()
    {
        // SEC-05: Broken Object-Level Authorization (BOLA/IDOR) Verification
        var (db, service) = CreateContext();

        var deptA = Guid.NewGuid();
        var deptB = Guid.NewGuid();

        var task = new Backend.Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Confidential Finance Report",
            CreatedById = Guid.NewGuid(),
            AssignedDepartmentId = deptA
        };

        var attachment = new TaskAttachment
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            FileName = "Q3_Financials.pdf",
            FilePath = "test/path.pdf",
            UploadedById = task.CreatedById
        };

        var unauthorizedUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-999",
            Email = "intruder@speedex.com",
            Role = UserRole.Encoder,
            DepartmentId = deptB // Belongs to Dept B, cannot access Dept A's attachments
        };

        db.Tasks.Add(task);
        db.TaskAttachments.Add(attachment);
        db.Users.Add(unauthorizedUser);
        await db.SaveChangesAsync();

        var result = await service.CanUserAccessAttachmentAsync(attachment.Id, unauthorizedUser.Id, unauthorizedUser.Role);

        Assert.False(result.IsSuccess);
        Assert.Contains("Access denied", result.Message);
    }

    [Fact]
    public async Task CanUserAccessAttachment_ManagerRole_GrantsAccess()
    {
        var (db, service) = CreateContext();

        var task = new Backend.Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Internal Task",
            CreatedById = Guid.NewGuid(),
            AssignedDepartmentId = Guid.NewGuid()
        };

        var attachment = new TaskAttachment
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            FileName = "Doc.pdf",
            FilePath = "test/doc.pdf",
            UploadedById = task.CreatedById
        };

        var managerId = Guid.NewGuid();

        db.Tasks.Add(task);
        db.TaskAttachments.Add(attachment);
        await db.SaveChangesAsync();

        var result = await service.CanUserAccessAttachmentAsync(attachment.Id, managerId, UserRole.Manager);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task CanUserAccessAttachment_AssignedUser_GrantsAccess()
    {
        var (db, service) = CreateContext();

        var assignedUserId = Guid.NewGuid();
        var task = new Backend.Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Delivery Task",
            CreatedById = Guid.NewGuid(),
            AssignedDepartmentId = Guid.NewGuid()
        };

        task.Assignments.Add(new TaskAssignment
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            AssignedUserId = assignedUserId
        });

        var attachment = new TaskAttachment
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            FileName = "DeliveryWaybill.pdf",
            FilePath = "test/wb.pdf",
            UploadedById = task.CreatedById
        };

        db.Tasks.Add(task);
        db.TaskAttachments.Add(attachment);
        await db.SaveChangesAsync();

        var result = await service.CanUserAccessAttachmentAsync(attachment.Id, assignedUserId, UserRole.Courier);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task Controller_GetById_UnauthorizedUser_ReturnsForbidden403()
    {
        var mockService = new Mock<IAttachmentService>();
        var attachmentId = Guid.NewGuid();
        var unauthorizedUserId = Guid.NewGuid();

        mockService.Setup(s => s.CanUserAccessAttachmentAsync(attachmentId, unauthorizedUserId, UserRole.Courier))
            .ReturnsAsync(ApiResponseDTO<bool>.Failure("Access denied to task attachment"));

        var controller = new AttachmentController(mockService.Object);
        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, unauthorizedUserId.ToString()),
            new Claim(ClaimTypes.Role, "Courier")
        }, "TestAuth"));

        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        var result = await controller.GetById(attachmentId);

        var objResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, objResult.StatusCode);
    }
}
