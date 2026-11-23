using Backend.Modules.Utilities;
using Xunit;

namespace Backend.Tests;

public class CorsPolicyHelperTests
{
    [Theory]
    [InlineData("https://stars-two-chi.vercel.app", true)]
    [InlineData("https://speedex-system.vercel.app", true)]
    [InlineData("https://delivery-system-capstone-beige.vercel.app", true)]
    [InlineData("https://fomsfrontend.vercel.app", true)]
    [InlineData("http://localhost:5173", true)]
    [InlineData("http://localhost:3000", true)]
    [InlineData("http://127.0.0.1:5173", true)]
    [InlineData("https://evil-stars.vercel.app", false)] // SEC-03: Arbitrary Vercel origin rejected
    [InlineData("https://attacker-app.vercel.app", false)]
    [InlineData("https://attacker.com", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("not-a-valid-url", false)]
    public void IsOriginAllowed_EnforcesStrictWhitelist(string? origin, bool expected)
    {
        var result = CorsPolicyHelper.IsOriginAllowed(origin);
        Assert.Equal(expected, result);
    }
}
