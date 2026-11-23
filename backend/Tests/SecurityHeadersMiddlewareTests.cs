using System.Threading.Tasks;
using Backend.Middleware;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Backend.Tests;

public class SecurityHeadersMiddlewareTests
{
    [Fact]
    public async Task InvokeAsync_InjectsExpectedSecurityHeaders()
    {
        // Arrange
        var context = new DefaultHttpContext();
        RequestDelegate next = (ctx) => Task.CompletedTask;
        var middleware = new SecurityHeadersMiddleware(next);

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        Assert.True(context.Response.Headers.ContainsKey("X-Frame-Options"));
        Assert.Equal("SAMEORIGIN", context.Response.Headers["X-Frame-Options"].ToString());

        Assert.True(context.Response.Headers.ContainsKey("X-Content-Type-Options"));
        Assert.Equal("nosniff", context.Response.Headers["X-Content-Type-Options"].ToString());

        Assert.True(context.Response.Headers.ContainsKey("Referrer-Policy"));
        Assert.Equal("strict-origin-when-cross-origin", context.Response.Headers["Referrer-Policy"].ToString());

        Assert.True(context.Response.Headers.ContainsKey("Permissions-Policy"));
        Assert.Contains("camera=()", context.Response.Headers["Permissions-Policy"].ToString());

        Assert.True(context.Response.Headers.ContainsKey("X-Permitted-Cross-Domain-Policies"));
        Assert.Equal("none", context.Response.Headers["X-Permitted-Cross-Domain-Policies"].ToString());

        Assert.True(context.Response.Headers.ContainsKey("Cross-Origin-Opener-Policy"));
        Assert.Equal("same-origin", context.Response.Headers["Cross-Origin-Opener-Policy"].ToString());

        Assert.True(context.Response.Headers.ContainsKey("Content-Security-Policy"));
        Assert.Contains("default-src 'self'", context.Response.Headers["Content-Security-Policy"].ToString());
    }
}
