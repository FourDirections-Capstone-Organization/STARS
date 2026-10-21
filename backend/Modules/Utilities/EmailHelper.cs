using System.Text.RegularExpressions;

namespace Backend.Modules.Utilities;

public static class EmailHelper
{
    private static readonly Dictionary<string, string> DomainCorrections = new(StringComparer.OrdinalIgnoreCase)
    {
        // Gmail variants & typos
        { "gmaill.com", "gmail.com" },
        { "gmai.com", "gmail.com" },
        { "gamil.com", "gmail.com" },
        { "gmial.com", "gmail.com" },
        { "gmal.com", "gmail.com" },
        { "gmaik.com", "gmail.com" },
        { "gemail.com", "gmail.com" },
        { "gmeil.com", "gmail.com" },
        { "gmaul.com", "gmail.com" },
        { "gmaio.com", "gmail.com" },
        { "gmaol.com", "gmail.com" },
        { "gmali.com", "gmail.com" },
        { "gmail.con", "gmail.com" },
        { "gmail.co", "gmail.com" },
        { "gmail.cm", "gmail.com" },
        { "gmail.comm", "gmail.com" },
        { "gmaill.con", "gmail.com" },
        { "gmaill.co", "gmail.com" },
        { "gmaill.comm", "gmail.com" },
        { "gmai.con", "gmail.com" },
        { "gamil.con", "gmail.com" },
        { "gmial.con", "gmail.com" },
        { "googlemail.con", "googlemail.com" },

        // Yahoo variants & typos
        { "yaho.com", "yahoo.com" },
        { "yahooo.com", "yahoo.com" },
        { "yaho.co", "yahoo.com" },
        { "yahoo.con", "yahoo.com" },
        { "yahu.com", "yahoo.com" },
        { "yaho.comm", "yahoo.com" },
        { "yahoo.comm", "yahoo.com" },
        { "yaho.com.ph", "yahoo.com.ph" },
        { "yahooo.com.ph", "yahoo.com.ph" },
        { "yahoo.con.ph", "yahoo.com.ph" },

        // Outlook variants & typos
        { "outlok.com", "outlook.com" },
        { "outloo.com", "outlook.com" },
        { "outlook.con", "outlook.com" },
        { "outlock.com", "outlook.com" },
        { "outlook.co", "outlook.com" },
        { "outlook.comm", "outlook.com" },
        { "outllok.com", "outlook.com" },
        { "outluk.com", "outlook.com" },

        // Hotmail variants & typos
        { "hotmial.com", "hotmail.com" },
        { "hotmaill.com", "hotmail.com" },
        { "hotmai.com", "hotmail.com" },
        { "hotmali.com", "hotmail.com" },
        { "hotmail.con", "hotmail.com" },
        { "hotmaill.con", "hotmail.com" },
        { "hotmail.comm", "hotmail.com" },
        { "hotmil.com", "hotmail.com" },

        // iCloud variants & typos
        { "iclou.com", "icloud.com" },
        { "icloudd.com", "icloud.com" },
        { "icloud.con", "icloud.com" },
        { "iclould.com", "icloud.com" },
        { "icloud.comm", "icloud.com" },
        { "icluod.com", "icloud.com" }
    };

    /// <summary>
    /// Auto-corrects standard email domain typos before validation and database persistence.
    /// Example: "user@gmaill.com" -> "user@gmail.com", "user@test.con" -> "user@test.com"
    /// </summary>
    public static string AutoCorrectEmail(string? rawEmail)
    {
        if (string.IsNullOrWhiteSpace(rawEmail))
            return string.Empty;

        var email = rawEmail.Trim();
        var atIndex = email.LastIndexOf('@');
        if (atIndex <= 0 || atIndex >= email.Length - 1)
            return email;

        var localPart = email.Substring(0, atIndex);
        var domain = email.Substring(atIndex + 1).Trim().ToLowerInvariant();

        // 1. Exact typo dictionary match
        if (DomainCorrections.TryGetValue(domain, out var correctedDomain))
        {
            return $"{localPart}@{correctedDomain}";
        }

        // 2. Generic TLD typos: e.g. .con -> .com, .comm -> .com, .coom -> .com
        if (domain.EndsWith(".con", StringComparison.OrdinalIgnoreCase))
        {
            var baseDomain = domain.Substring(0, domain.Length - 4);
            return $"{localPart}@{baseDomain}.com";
        }
        if (domain.EndsWith(".comm", StringComparison.OrdinalIgnoreCase))
        {
            var baseDomain = domain.Substring(0, domain.Length - 5);
            return $"{localPart}@{baseDomain}.com";
        }
        if (domain.EndsWith(".coom", StringComparison.OrdinalIgnoreCase))
        {
            var baseDomain = domain.Substring(0, domain.Length - 5);
            return $"{localPart}@{baseDomain}.com";
        }

        return $"{localPart}@{domain}";
    }
}
