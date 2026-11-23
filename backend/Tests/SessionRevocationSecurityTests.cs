using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Task = System.Threading.Tasks.Task;
using Backend.Data;
using Backend.Middleware;
using Backend.Models;
using Backend.Models.Enums;
using Backend.Modules.AuthenticationAndCredentials.Jwt;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
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
}
