using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Modules.AuthenticationAndCredentials.Jwt;

namespace Backend.Middleware;

public class SessionTimeoutMiddleware
{
    private readonly RequestDelegate _next;
    private readonly SessionSettings _sessionSettings;

    public SessionTimeoutMiddleware(RequestDelegate next, SessionSettings sessionSettings)
    {
        _next = next;
        _sessionSettings = sessionSettings;
    }

    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        // Skip for unauthenticated requests
        if (context.User.Identity is null || !context.User.Identity.IsAuthenticated)
        {
            await _next(context);
            return;
        }

        // Skip for certain endpoints (login, refresh, and as such)
        var path = context.Request.Path.Value?.ToLower() ?? "";
        if (path.StartsWith("/api/auth/login") ||
            path.StartsWith("/api/auth/refresh") ||
            path.StartsWith("/api/auth/forgot-password") ||
            path.StartsWith("/api/auth/reset-password"))
        {
            await _next(context);
            return;
        }

        // Get user ID from claims
        var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { message = "Invalid token" });
            return;
        }

        // Get the user from database
        var user = await db.Users.FindAsync(userId);
        if (user is null)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { message = "User not found" });
            return;
        }

        // Check if the user is deactivated
        if (user.IsDeactivated || !user.IsActive)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { message = "Account is deactivated" });
            return;
        }

        // Update last activity time (throttled to at most once per minute)
        if (!user.LastActivityAt.HasValue || (DateTime.UtcNow - user.LastActivityAt.Value).TotalMinutes >= 1)
        {
            user.LastActivityAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        
        await _next(context);
    }
}

public static class SessionTimeoutMiddlewareExtensions
{
    public static IApplicationBuilder UseSessionTimeout(
        this IApplicationBuilder builder,
        SessionSettings sessionSettings)
    {
        return builder.UseMiddleware<SessionTimeoutMiddleware>(sessionSettings);
    }
}
