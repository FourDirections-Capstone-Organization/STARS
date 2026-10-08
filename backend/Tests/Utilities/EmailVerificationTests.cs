namespace Backend.Tests;

public class EmailVerificationTests
{
    private (bool IsValid, string? Error) ValidateToken(
        string? storedToken, string inputToken,
        DateTime? tokenExpiry, DateTime now,
        bool isEmailVerified)
    {
        if (string.IsNullOrWhiteSpace(inputToken))
            return (false, "Verification token is required.");

        if (storedToken is null || storedToken != inputToken)
            return (false, "Verification link has expired or is invalid.");

        if (tokenExpiry.HasValue && tokenExpiry.Value < now)
            return (false, "Verification link has expired or is invalid.");

        if (isEmailVerified)
            return (true, "Account is already verified.");

        return (true, null);
    }

    [Fact]
    public void ValidToken_Succeeds()
    {
        var token = "abc123";
        var (isValid, error) = ValidateToken(token, token, DateTime.UtcNow.AddHours(24), DateTime.UtcNow, false);
        Assert.True(isValid);
        Assert.Null(error);
    }

    [Fact]
    public void ExpiredToken_Fails()
    {
        var token = "abc123";
        var (isValid, error) = ValidateToken(token, token, DateTime.UtcNow.AddHours(-1), DateTime.UtcNow, false);
        Assert.False(isValid);
        Assert.Contains("expired or is invalid", error);
    }

    [Fact]
    public void WrongToken_Fails()
    {
        var (isValid, error) = ValidateToken("abc123", "wrong-token", DateTime.UtcNow.AddHours(24), DateTime.UtcNow, false);
        Assert.False(isValid);
        Assert.Contains("expired or is invalid", error);
    }

    [Fact]
    public void AlreadyVerified_ReturnsSuccess()
    {
        var token = "abc123";
        var (isValid, error) = ValidateToken(token, token, DateTime.UtcNow.AddHours(24), DateTime.UtcNow, true);
        Assert.True(isValid);
        Assert.Contains("already verified", error);
    }

    [Fact]
    public void ValidToken_CaseInsensitiveAndTrimmed_Succeeds()
    {
        var storedToken = "abc123def";
        var inputToken = "  ABC123DEF  ";
        var cleanInput = inputToken.Trim().ToLowerInvariant();
        var (isValid, error) = ValidateToken(storedToken, cleanInput, DateTime.UtcNow.AddHours(24), DateTime.UtcNow, false);
        Assert.True(isValid);
        Assert.Null(error);
    }

    [Fact]
    public void EmptyToken_Fails()
    {
        var (isValid, error) = ValidateToken("abc123", "", DateTime.UtcNow.AddHours(24), DateTime.UtcNow, false);
        Assert.False(isValid);
        Assert.Contains("required", error);
    }
}
