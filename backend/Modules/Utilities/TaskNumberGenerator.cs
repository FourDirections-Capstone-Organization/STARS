using System.Security.Cryptography;
using System.Text;

namespace Backend.Modules.Utilities;

/// <summary>
/// Cryptographically secure random key generator that produces 8-character
/// unique alphanumeric task identifiers (e.g. "K7N9P4X2") replacing raw GUIDs.
/// </summary>
public static class TaskNumberGenerator
{
    // 32-character unambiguous uppercase alphanumeric set (excludes ambiguous 0/O, 1/I)
    private static readonly char[] Characters = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ".ToCharArray();

    public static string Generate(int length = 8)
    {
        var bytes = RandomNumberGenerator.GetBytes(length);
        var sb = new StringBuilder(length);
        for (int i = 0; i < length; i++)
        {
            sb.Append(Characters[bytes[i] % Characters.Length]);
        }
        return sb.ToString();
    }
}
