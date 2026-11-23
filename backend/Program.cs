using Microsoft.AspNetCore.ResponseCompression;
using System.IO.Compression;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Scalar.AspNetCore;
using Backend.Data;
using Backend.Modules.OrganizationalStructure;
using Backend.Modules.Email;
using Backend.Modules.UserAccountManagement;
using Backend.Modules.AuthenticationAndCredentials.Jwt;
using Backend.Modules.Utilities;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Middleware;
using Backend.Modules.RoleBasedAccessControl;
using Backend.Modules.TaskManagement;
using Backend.Modules.Notifications;
using Backend.Modules.Analytics;
using Backend.Models;
using Backend.Models.Enums;

using System.Text.Json.Serialization;
using Backend.Modules.DmsIntegration;
using Backend.Modules.FomsIntegration;
using Backend.Modules.TaskManagement.Groq;
using Backend.Modules.PerformanceEvaluation;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.SetIsOriginAllowed(origin => CorsPolicyHelper.IsOriginAllowed(origin, builder.Environment.IsDevelopment()))
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials();
    });
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, cancellationToken) =>
    {
        document.Components ??= new Microsoft.OpenApi.Models.OpenApiComponents();
        document.Components.SecuritySchemes = new Dictionary<string, Microsoft.OpenApi.Models.OpenApiSecurityScheme>
        {
            ["Bearer"] = new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                Description = "Enter your JWT token"
            }
        };
        
        document.SecurityRequirements = new List<Microsoft.OpenApi.Models.OpenApiSecurityRequirement>
        {
            new()
            {
                [new Microsoft.OpenApi.Models.OpenApiSecurityScheme { Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } }] = Array.Empty<string>()
            }
        };
        
        return System.Threading.Tasks.Task.CompletedTask;
    });
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings:DefaultConnection")
    ?? Environment.GetEnvironmentVariable("POSTGRESQLCONNSTR_DefaultConnection")
    ?? Environment.GetEnvironmentVariable("CUSTOMCONNSTR_DefaultConnection")
    ?? Environment.GetEnvironmentVariable("DATABASE_URL");

if (string.IsNullOrWhiteSpace(connectionString))
{
    Console.WriteLine("[CRITICAL ERROR] No PostgreSQL ConnectionString found in Configuration or Environment Variables.");
    throw new InvalidOperationException("CRITICAL: PostgreSQL connection string is missing. Please set 'ConnectionStrings__DefaultConnection' in Azure App Service Application Settings.");
}

try
{
    var csb = new Npgsql.NpgsqlConnectionStringBuilder(connectionString);
    if (!connectionString.Contains("MaxPoolSize", StringComparison.OrdinalIgnoreCase))
        csb.MaxPoolSize = 150;
    if (!connectionString.Contains("MinPoolSize", StringComparison.OrdinalIgnoreCase))
        csb.MinPoolSize = 10;
    if (!connectionString.Contains("ConnectionLifetime", StringComparison.OrdinalIgnoreCase))
        csb.ConnectionLifetime = 300;
    if (!connectionString.Contains("Timeout", StringComparison.OrdinalIgnoreCase))
        csb.Timeout = 15;
    if (!connectionString.Contains("CommandTimeout", StringComparison.OrdinalIgnoreCase))
        csb.CommandTimeout = 30;
    connectionString = csb.ConnectionString;
    Console.WriteLine($"[STARTUP] PostgreSQL Connection Configured -> Host: '{csb.Host}', Port: {csb.Port}, Database: '{csb.Database}', User: '{csb.Username}', SSL: {csb.SslMode}");
}
catch
{
    Console.WriteLine("[STARTUP] PostgreSQL Connection Configured (Raw string provided)");
}

builder.Services.AddDbContextPool<AppDbContext>(options =>
    options.UseNpgsql(connectionString), poolSize: 128);

// Configure settings
builder.Services.Configure<SmtpSettings>(builder.Configuration.GetSection("SmtpSettings"));
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("JwtSettings"));
builder.Services.Configure<SessionSettings>(builder.Configuration.GetSection("SessionSettings"));
builder.Services.Configure<FileStorageSettings>(builder.Configuration.GetSection("FileStorageSettings"));

var jwtSettings = builder.Configuration.GetSection("JwtSettings").Get<JwtSettings>();
if (jwtSettings == null || string.IsNullOrWhiteSpace(jwtSettings.SecretKey) || jwtSettings.SecretKey.Length < 32)
{
    throw new InvalidOperationException("CRITICAL: JwtSettings:SecretKey is missing or shorter than 32 characters.");
}

// Configure JWT Authentication
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidAudience = jwtSettings.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.SecretKey)),
        ClockSkew = TimeSpan.Zero // No tolerance for expiration
    };
});

// Configure Authorization Policies

builder.Services.AddAuthorization(options =>
{
    AuthorizationPolicies.ConfigurePolicies(options);   
});

// Register services
builder.Services.AddScoped<IDepartmentService, DepartmentService>();
builder.Services.AddScoped<IJobPositionService, JobPositionService>();
builder.Services.AddScoped<ITransferService, TransferService>();
builder.Services.AddScoped<IHierarchyService, HierarchyService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IRoleService, RoleService>();
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddScoped<ITeamService, TeamService>();
builder.Services.AddScoped<IAttachmentService, AttachmentService>();
builder.Services.AddScoped<ITaskWorkflowService, TaskWorkflowService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<INotificationSettingsService, NotificationSettingsService>();
builder.Services.AddScoped<IAnnouncementService, AnnouncementService>();
builder.Services.AddScoped<ITaskTemplateService, TaskTemplateService>();
builder.Services.AddScoped<IRoundRobinAssignmentService, RoundRobinAssignmentService>();
builder.Services.AddScoped<IRecommendationService, RecommendationService>();
builder.Services.AddScoped<ITaskCommentService, TaskCommentService>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddScoped<IFomsExportService, FomsExportService>();
builder.Services.AddScoped<IDuplicateDetectionService, DuplicateDetectionService>();
builder.Services.AddScoped<IEmailVerificationService, EmailVerificationService>();
builder.Services.AddScoped<IAuditLogService, AuditLogService>();
builder.Services.AddScoped<ISuitabilityService, SuitabilityService>();
builder.Services.AddScoped<ISlaRiskPredictionService, SlaRiskPredictionService>();
builder.Services.AddScoped<IKpiCalculationEngine, KpiCalculationEngine>();
builder.Services.AddScoped<IKpiExportService, KpiExportService>();
builder.Services.AddScoped<IPerformanceReviewScoringService, PerformanceReviewScoringService>();
builder.Services.AddScoped<IReviewWorkflowService, ReviewWorkflowService>();
builder.Services.AddScoped<IEvaluationTemplateService, EvaluationTemplateService>();
builder.Services.AddScoped<IAiRecommendationGenerationService, AiRecommendationGenerationService>();
builder.Services.AddScoped<IPerformanceReviewCsvExportService, PerformanceReviewCsvExportService>();
builder.Services.AddSingleton<ISafeFormulaParser, SafeFormulaParser>();
builder.Services.AddSingleton<IKpiVariableRegistry, KpiVariableRegistry>();
builder.Services.AddSingleton<IExpertSystemConfigStore, JsonExpertSystemConfigStore>();
builder.Services.Configure<ExpertSystemConfig>(builder.Configuration.GetSection("ExpertSystemConfig"));
builder.Services.Configure<BiomarkerThresholds>(builder.Configuration.GetSection("BiomarkerThresholds"));
builder.Services.Configure<DmsIntegrationSettings>(builder.Configuration.GetSection(DmsIntegrationSettings.SectionName));
builder.Services.AddHttpClient(DmsIntegrationService.HttpClientName, c =>
{
    c.Timeout = TimeSpan.FromSeconds(25);
});
builder.Services.AddScoped<IDmsIntegrationService, DmsIntegrationService>();
builder.Services.AddSingleton<IDmsWebhookQueue, DmsWebhookQueue>();
builder.Services.AddHostedService<DmsWebhookProcessorService>();

builder.Services.Configure<FomsIntegrationSettings>(builder.Configuration.GetSection(FomsIntegrationSettings.SectionName));
builder.Services.AddHttpClient(FomsIntegrationService.HttpClientName, c =>
{
    c.Timeout = TimeSpan.FromSeconds(25);
});
builder.Services.AddScoped<IFomsIntegrationService, FomsIntegrationService>();

builder.Services.AddMemoryCache();

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
    {
        "application/json",
        "text/plain",
        "application/problem+json"
    });
});

builder.Services.Configure<BrotliCompressionProviderOptions>(options =>
{
    options.Level = CompressionLevel.Fastest;
});

builder.Services.Configure<GzipCompressionProviderOptions>(options =>
{
    options.Level = CompressionLevel.Fastest;
});


builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsJsonAsync(
            ApiResponseDTO<object>.Failure("Too many authentication requests. Please try again in a few moments."),
            cancellationToken: token);
    };

    options.AddPolicy("AuthRateLimit", httpContext =>
    {
        var clientIp = httpContext.Connection.RemoteIpAddress?.ToString()
            ?? httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault()
            ?? "anonymous";

        return RateLimitPartition.GetSlidingWindowLimiter(clientIp, _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 30,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 6,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 10
        });
    });
});

builder.Services.Configure<GroqSettings>(builder.Configuration.GetSection(GroqSettings.SectionName));
builder.Services.PostConfigure<GroqSettings>(settings =>
{
    if (string.IsNullOrWhiteSpace(settings.ApiKey))
    {
        var resolved = settings.GetEffectiveApiKey();
        if (!string.IsNullOrWhiteSpace(resolved))
        {
            settings.ApiKey = resolved;
        }
    }
});
builder.Services.AddHttpClient(GroqSuitabilityService.HttpClientName, c =>
{
    c.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddScoped<IGroqSuitabilityService, GroqSuitabilityService>();


// Hosted Services
builder.Services.AddHostedService<OverdueCheckService>();
builder.Services.AddHostedService<RecurringTaskGenerator>();
builder.Services.AddSingleton<BiomarkerScanService>();
builder.Services.AddHostedService<BiomarkerScanService>(sp => sp.GetRequiredService<BiomarkerScanService>());


QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

var app = builder.Build();

// Auto-create database and tables on startup (Safe / Non-crashing)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    try
    {
        Console.WriteLine("[STARTUP] Testing database connection and applying migrations...");
        
        // 1. Safe idempotent schema upgrade for STARS-FOMS models and KPI configurations
        try
        {
            await DatabaseStartupDdl.ApplyStartupDdlAsync(db);
            Console.WriteLine("[STARTUP] FOMS Integration, KPI tables, thresholds, Performance Evaluation tables, and multi-system user columns verified/created.");
        }
        catch (Exception ddlEx)
        {
            Console.WriteLine($"[STARTUP DDL WARNING] Idempotent DDL warning: {ddlEx.Message}");
        }

        // 2. Standard EF Core migrations
        try
        {
            await db.Database.MigrateAsync();
            Console.WriteLine("[STARTUP] Database migrations applied successfully.");
        }
        catch (Exception migEx)
        {
            Console.WriteLine($"[STARTUP MIGRATION WARNING] Standard migrate exception: {migEx.Message}");
        }

        // Seed default departments, positions, and notification settings if needed
        var departmentService = scope.ServiceProvider.GetRequiredService<IDepartmentService>();
        await departmentService.SeedDefaultDepartmentsAsync();
        await departmentService.SeedDefaultPositionsAsync();

        var notificationSettingsService = scope.ServiceProvider.GetRequiredService<INotificationSettingsService>();
        await notificationSettingsService.SeedDefaultSettingsAsync();

        // Seed default KPI configuration if needed
        await KpiDefaultSeeder.SeedDefaultKpiConfigurationAsync(db);
        
        Console.WriteLine("[STARTUP] Canonical department, position, and notification settings verified.");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[STARTUP ERROR] Initial database connection / migration failed: {ex.Message}");
        Console.WriteLine("[STARTUP WARNING] The application will continue running so diagnostic endpoints are accessible.");
    }
}

// Health check and root diagnostic endpoints
app.MapGet("/", () => Results.Json(new
{
    service = "STARS Backend API",
    status = "running",
    environment = app.Environment.EnvironmentName,
    timestamp = DateTime.UtcNow
}));

// Fast Liveness Probe for Azure App Service Health Check (Zero DB impact)
app.MapGet("/api/health/live", () => Results.Json(new
{
    status = "healthy",
    service = "STARS Backend API",
    timestamp = DateTime.UtcNow
}));

// Readiness Probe with 10-second memory cache to shield DB pool during traffic surges
app.MapGet("/api/health", async (AppDbContext db, Microsoft.Extensions.Caching.Memory.IMemoryCache cache) =>
{
    const string cacheKey = "SystemHealthProbeStatus";
    if (cache.TryGetValue(cacheKey, out object? cachedResult) && cachedResult != null)
    {
        return (IResult)cachedResult;
    }

    try
    {
        var canConnect = await db.Database.CanConnectAsync();
        var fomsReady = false;
        if (canConnect)
        {
            try
            {
                var count = await db.FomsClientFinancialStatuses.CountAsync();
                fomsReady = true;
            }
            catch { /* not yet ready */ }
        }

        var result = Results.Json(new
        {
            status = canConnect ? "healthy" : "database_unreachable",
            database = canConnect ? "connected" : "cannot_connect",
            fomsIntegrationReady = fomsReady,
            timestamp = DateTime.UtcNow
        });

        cache.Set(cacheKey, result, TimeSpan.FromSeconds(10));
        return result;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[HEALTH ERROR] {ex.Message}");
        return Results.Json(new
        {
            status = "unhealthy",
            database = "unavailable",
            message = "Service temporarily unavailable",
            timestamp = DateTime.UtcNow
        }, statusCode: 500);
    }
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseSecurityHeaders();
app.UseResponseCompression();

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("GlobalExceptionHandler");
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        if (feature?.Error != null)
        {
            logger.LogError(feature.Error, "Unhandled exception on {Path}", context.Request.Path);
        }
        await context.Response.WriteAsJsonAsync(ApiResponseDTO<object>.Failure("An unexpected server error occurred. Please try again later."));
    });
});

app.UseCors("AllowFrontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuditLogAccessLogging();
app.UseAuthorization();
var sessionSettings = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<SessionSettings>>().Value;
app.UseSessionTimeout(sessionSettings);
app.MapControllers();

app.Run();