using System;
using System.Security.Cryptography;
using System.Text;

namespace Backend.Modules.Utilities;

/// <summary>
/// Cryptographic hashing for sensitive tokens at rest (refresh tokens, password reset tokens, verification tokens).
/// Resolves CWE-312 / CWE-916 (SEC-06) so cleartext tokens are never stored in the database.
/// </summary>
public static class TokenHasher
{
    public static string HashToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return string.Empty;

        var bytes = Encoding.UTF8.GetBytes(token.Trim());
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash);
    }
}
