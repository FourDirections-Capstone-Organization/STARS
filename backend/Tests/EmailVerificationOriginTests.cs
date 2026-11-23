using System;
using System.Threading.Tasks;
using Task = System.Threading.Tasks.Task;
using System.Linq;
using Microsoft.AspNetCore.RateLimiting;
using Backend.Controllers;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Modules.AuthenticationAndCredentials;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Backend.Tests;

public class EmailVerificationOriginTests
{
    private EmailVerificationController CreateController(Mock<IEmailVerificationService> mockService, string? originHeader = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new System.Collections.Generic.KeyValuePair<string, string?>("AppSettings:FrontendUrl", "https://stars-two-chi.vercel.app")
            })
            .Build();

        var controller = new EmailVerificationController(
            mockService.Object,
            config,
            NullLogger<EmailVerificationController>.Instance);

        var httpContext = new DefaultHttpContext();
        if (!string.IsNullOrEmpty(originHeader))
        {
            httpContext.Request.Headers["Origin"] = originHeader;
        }

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = httpContext
        };

        return controller;
    }

    [Fact]
    public async Task ResendVerification_SpoofedOrigin_FallsBackToCanonicalUrl()
    {
        // SEC-04: Test that an unauthenticated attacker injecting a malicious Origin header
        // cannot poison verification links to point to an external attacker-controlled domain
        var mockService = new Mock<IEmailVerificationService>();
        string? passedVerificationUrl = null;

        mockService.Setup(s => s.ResendVerificationAsync(
            It.IsAny<Guid?>(),
            It.IsAny<string?>(),
            It.IsAny<string>(),
            It.IsAny<string?>()))
            .Callback<Guid?, string?, string, string?>((id, email, url, ident) =>
            {
                passedVerificationUrl = url;
            })
            .ReturnsAsync(ApiResponseDTO<bool>.Success(true));

        var controller = CreateController(mockService, "https://attacker-controlled-server.com");

        var dto = new ResendVerificationDTO
        {
            Identifier = "EMP-001",
            Email = "victim@speedex.com"
        };

        var result = await controller.ResendVerification(dto);

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(passedVerificationUrl);
        // Must point to canonical URL and NOT attacker domain
        Assert.StartsWith("https://stars-two-chi.vercel.app", passedVerificationUrl);
        Assert.DoesNotContain("attacker-controlled-server.com", passedVerificationUrl);
    }

    [Fact]
    public async Task ResendVerification_ApprovedOrigin_UsesApprovedOrigin()
    {
        var mockService = new Mock<IEmailVerificationService>();
        string? passedVerificationUrl = null;

        mockService.Setup(s => s.ResendVerificationAsync(
            It.IsAny<Guid?>(),
            It.IsAny<string?>(),
            It.IsAny<string>(),
            It.IsAny<string?>()))
            .Callback<Guid?, string?, string, string?>((id, email, url, ident) =>
            {
                passedVerificationUrl = url;
            })
            .ReturnsAsync(ApiResponseDTO<bool>.Success(true));

        var controller = CreateController(mockService, "https://speedex-system.vercel.app");

        var dto = new ResendVerificationDTO
        {
            Identifier = "EMP-001",
            Email = "victim@speedex.com"
        };

        var result = await controller.ResendVerification(dto);

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(passedVerificationUrl);
        Assert.StartsWith("https://speedex-system.vercel.app", passedVerificationUrl);
    }

    [Fact]
    public void EmailVerificationController_HasAuthRateLimitingAttribute_SEC19()
    {
        var rateLimitAttr = typeof(EmailVerificationController)
            .GetCustomAttributes(typeof(EnableRateLimitingAttribute), inherit: true)
            .FirstOrDefault() as EnableRateLimitingAttribute;

        Assert.NotNull(rateLimitAttr);
        Assert.Equal("AuthRateLimit", rateLimitAttr.PolicyName);
    }
}
