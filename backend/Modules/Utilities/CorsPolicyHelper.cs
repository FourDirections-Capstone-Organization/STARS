using System;
using System.Collections.Generic;

namespace Backend.Modules.Utilities;

/// <summary>
/// Enforces an explicit canonical whitelist of approved origins for CORS with credentials.
/// Replaces insecure .vercel.app suffix matching to resolve CWE-942 / OWASP ZAP Alert 90022 (SEC-03).
/// </summary>
public static class CorsPolicyHelper
{
    private static readonly HashSet<string> AllowedHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "stars-two-chi.vercel.app",
        "speedex-system.vercel.app",
        "delivery-system-capstone-beige.vercel.app",
        "fomsfrontend.vercel.app"
    };

    public static bool IsOriginAllowed(string? origin, bool isDevelopment = true)
    {
        if (string.IsNullOrWhiteSpace(origin))
            return false;

        try
        {
            var uri = new Uri(origin);
            if (isDevelopment && (uri.Host == "localhost" || uri.Host == "127.0.0.1"))
                return true;

            return AllowedHosts.Contains(uri.Host);
        }
        catch
        {
            return false;
        }
    }
}
