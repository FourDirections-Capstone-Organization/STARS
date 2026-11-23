using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace Backend.Middleware;

/// <summary>
/// Injects essential HTTP security headers to mitigate Clickjacking (X-Frame-Options),
/// MIME confusion attacks (X-Content-Type-Options), referrer leakage, and unauthorized framing (CSP).
/// Addresses OWASP ZAP Alerts 10020, 10021, 10035, and 10038 (SEC-02).
/// </summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        context.Response.Headers["Content-Security-Policy"] = 
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https://stars-two-chi.vercel.app https://speedex-system.vercel.app https://delivery-system-capstone-beige.vercel.app https://fomsfrontend.vercel.app https://fomsintegration-amfve2fdccbdgbgy.eastasia-01.azurewebsites.net https://dts-api-gab-byafd0h2aha6a9c9.japaneast-01.azurewebsites.net; frame-ancestors 'self';";

        await _next(context);
    }
}

public static class SecurityHeadersMiddlewareExtensions
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<SecurityHeadersMiddleware>();
    }
}
