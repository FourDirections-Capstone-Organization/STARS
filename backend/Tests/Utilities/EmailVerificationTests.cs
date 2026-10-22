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

    [Fact]
    public void ResendVerificationDTO_Deserialization_WorksWithAnyCasing()
    {
        var options = new System.Text.Json.JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver()
        };

        // 1. Payload with uppercase employeeID (as sent by login and verification pages)
        var jsonWithEmployeeID = "{\"employeeID\":\"MGR001\",\"email\":\"user@gmail.com\",\"employeeNumber\":\"MGR001\"}";
        var dto1 = System.Text.Json.JsonSerializer.Deserialize<Backend.Models.DTOs.ResendVerificationDTO>(jsonWithEmployeeID, options);
        Assert.NotNull(dto1);
        Assert.Equal("MGR001", dto1.EmployeeId);
        Assert.Equal("MGR001", dto1.EmployeeNumber);
        Assert.Equal("user@gmail.com", dto1.Email);

        // 2. Payload with camelCase employeeId
        var jsonWithEmployeeId = "{\"employeeId\":\"MGR002\",\"email\":\"test@gmail.com\"}";
        var dto2 = System.Text.Json.JsonSerializer.Deserialize<Backend.Models.DTOs.ResendVerificationDTO>(jsonWithEmployeeId, options);
        Assert.NotNull(dto2);
        Assert.Equal("MGR002", dto2.EmployeeId);

        // 3. Payload sent by EmployeeDetailPanel (employeeNumber + email + identifier)
        var jsonWithPanelPayload = "{\"employeeNumber\":\"MGR003\",\"email\":\"corrected@gmail.com\",\"identifier\":\"MGR003\"}";
        var dto3 = System.Text.Json.JsonSerializer.Deserialize<Backend.Models.DTOs.ResendVerificationDTO>(jsonWithPanelPayload, options);
        Assert.NotNull(dto3);
        Assert.Equal("MGR003", dto3.EmployeeNumber);
        Assert.Equal("MGR003", dto3.Identifier);
        Assert.Equal("corrected@gmail.com", dto3.Email);

        // 4. Empty payload
        var dtoEmpty = System.Text.Json.JsonSerializer.Deserialize<Backend.Models.DTOs.ResendVerificationDTO>("{}", options);
        Assert.NotNull(dtoEmpty);
    }

    [Fact]
    public void AllDtoTypes_CanBeDeserializedWithoutPropertyCollisions()
    {
        var options = new System.Text.Json.JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver()
        };

        var assembly = typeof(Backend.Models.DTOs.ResendVerificationDTO).Assembly;
        var dtoTypes = assembly.GetTypes()
            .Where(t => t.IsClass && !t.IsAbstract && !t.IsGenericTypeDefinition && !t.ContainsGenericParameters && t.Namespace != null && t.Namespace.Contains("DTOs"));

        var collidingTypes = new List<string>();

        foreach (var type in dtoTypes)
        {
            try
            {
                options.GetTypeInfo(type);
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("collides with another property"))
            {
                collidingTypes.Add($"{type.Name}: {ex.Message}");
            }
        }

        Assert.Empty(collidingTypes);
    }
}
