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
using Backend.Modules.Notifications;
using Backend.Modules.TaskManagement;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Backend.Tests.TaskManagement;

public class TaskCommentSecurityTests
{
    private (AppDbContext db, TaskCommentService commentService) CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var db = new AppDbContext(options);
        var mockNotification = new Mock<INotificationService>();
        var settings = Options.Create(new FileStorageSettings
        {
            UploadPath = "uploads/",
            MaxFileSizeBytes = 10 * 1024 * 1024,
            AllowedFileTypes = new List<string> { ".pdf", ".png", ".jpg" }
        });

        var service = new TaskCommentService(
            db,
            settings,
            NullLogger<TaskCommentService>.Instance,
            mockNotification.Object);

        return (db, service);
    }

    [Fact]
    public async Task CanUserAccessTaskComments_CrossDepartmentUser_ReturnsAccessDenied()
    {
        // SEC-15: Broken Object-Level Authorization (BOLA/IDOR) verification on comments
        var (db, service) = CreateContext();

        var deptA = Guid.NewGuid();
        var deptB = Guid.NewGuid();

        var task = new Backend.Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Confidential Finance Audit",
            CreatedById = Guid.NewGuid(),
            AssignedDepartmentId = deptA
        };

        var attacker = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-ATTACK",
            Email = "attacker@speedex.com",
            Role = UserRole.Courier,
            DepartmentId = deptB
        };

        db.Tasks.Add(task);
        db.Users.Add(attacker);
        await db.SaveChangesAsync();

        var result = await service.CanUserAccessTaskCommentsAsync(task.Id, attacker.Id, attacker.Role);

        Assert.False(result.IsSuccess);
        Assert.Contains("Access denied", result.Message);
    }

    [Fact]
    public async Task CanUserAccessTaskComments_Manager_ReturnsAccessGranted()
    {
        // SEC-15: Managers have universal access
        var (db, service) = CreateContext();

        var deptA = Guid.NewGuid();
        var task = new Backend.Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Confidential Task",
            CreatedById = Guid.NewGuid(),
            AssignedDepartmentId = deptA
        };

        var manager = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "MGR-001",
            Email = "manager@speedex.com",
            Role = UserRole.Manager
        };

        db.Tasks.Add(task);
        db.Users.Add(manager);
        await db.SaveChangesAsync();

        var result = await service.CanUserAccessTaskCommentsAsync(task.Id, manager.Id, manager.Role);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task CanUserAccessTaskComments_AssignedUser_ReturnsAccessGranted()
    {
        var (db, service) = CreateContext();

        var assignedUser = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "worker@speedex.com",
            Role = UserRole.Courier
        };

        var task = new Backend.Models.Task
        {
            Id = Guid.NewGuid(),
            Title = "Field Operation Task",
            CreatedById = Guid.NewGuid(),
            Assignments = new List<TaskAssignment>
            {
                new TaskAssignment { Id = Guid.NewGuid(), AssignedUserId = assignedUser.Id }
            }
        };

        db.Users.Add(assignedUser);
        db.Tasks.Add(task);
        await db.SaveChangesAsync();

        var result = await service.CanUserAccessTaskCommentsAsync(task.Id, assignedUser.Id, assignedUser.Role);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task TaskCommentController_DownloadAttachment_CrossDepartmentUser_ReturnsForbidden()
    {
        var mockService = new Mock<ITaskCommentService>();
        var taskId = Guid.NewGuid();
        var commentId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        var attackerId = Guid.NewGuid();

        mockService.Setup(s => s.CanUserAccessTaskCommentsAsync(taskId, attackerId, UserRole.Courier))
            .ReturnsAsync(ApiResponseDTO<bool>.Failure("Access denied: You do not have permission to access comments or attachments for this task."));

        var controller = new TaskCommentController(mockService.Object);
        var user = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, attackerId.ToString()),
            new Claim(ClaimTypes.Role, "Courier")
        }, "mock"));

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = user }
        };

        var actionResult = await controller.DownloadAttachment(taskId, commentId, attachmentId);
        var objectResult = Assert.IsType<ObjectResult>(actionResult);

        Assert.Equal(403, objectResult.StatusCode);
    }
}
