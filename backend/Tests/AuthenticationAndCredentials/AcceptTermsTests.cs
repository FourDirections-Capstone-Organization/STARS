using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Backend.Data;
using Backend.Models;
using Backend.Models.Enums;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Modules.AuthenticationAndCredentials.Jwt;
using Backend.Modules.Email;
using Backend.Modules.TaskManagement;
using Task = System.Threading.Tasks.Task;

namespace Backend.Tests.AuthenticationAndCredentials;

public class AcceptTermsTests
{
    private AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    [Fact]
    public async Task AcceptTerms_UpdatesUserAndSavesAcceptance()
    {
        using var db = CreateDbContext();
        var user = new User
        {
            Id = Guid.NewGuid(),
            EmployeeNumber = "EMP-001",
            Email = "emp@example.com",
            PasswordHash = "hashed",
            FirstName = "Test",
            LastName = "User",
            HasAcceptedTerms = false,
            TermsVersionAccepted = null,
            IsActive = true
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var mockEmail = new Mock<IEmailService>();
        var mockAudit = new Mock<IAuditLogService>();
        var jwtOptions = Options.Create(new JwtSettings
        {
            SecretKey = "SuperSecretKeyForTestingPurposes12345!",
            Issuer = "STARS",
            Audience = "STARS"
        });

        var authService = new AuthService(
            db,
            jwtOptions,
            mockEmail.Object,
            mockAudit.Object,
            NullLogger<AuthService>.Instance);

        var result = await authService.AcceptTermsAsync(user.Id, "v1.0");

        Assert.True(result.IsSuccess);
        var updated = await db.Users.FindAsync(user.Id);
        Assert.NotNull(updated);
        Assert.True(updated.HasAcceptedTerms);
        Assert.Equal("v1.0", updated.TermsVersionAccepted);
        Assert.NotNull(updated.TermsAcceptedAt);
    }

    [Fact]
    public async Task AcceptTerms_UserNotFound_ReturnsFailure()
    {
        using var db = CreateDbContext();
        var mockEmail = new Mock<IEmailService>();
        var mockAudit = new Mock<IAuditLogService>();
        var jwtOptions = Options.Create(new JwtSettings
        {
            SecretKey = "SuperSecretKeyForTestingPurposes12345!",
            Issuer = "STARS",
            Audience = "STARS"
        });

        var authService = new AuthService(
            db,
            jwtOptions,
            mockEmail.Object,
            mockAudit.Object,
            NullLogger<AuthService>.Instance);

        var result = await authService.AcceptTermsAsync(Guid.NewGuid(), "v1.0");

        Assert.False(result.IsSuccess);
        Assert.Equal("User not found", result.Message);
    }
}
