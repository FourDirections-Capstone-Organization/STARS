using Microsoft.EntityFrameworkCore;
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

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.SetIsOriginAllowed(origin =>
        {
            if (string.IsNullOrEmpty(origin)) return false;
            try
            {
                var uri = new Uri(origin);
                return uri.Host == "localhost"
                    || uri.Host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase)
                    || uri.Host.Equals("stars-two-chi.vercel.app", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        })
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials();
    });
});

builder.Services.AddControllers();
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
    Console.WriteLine($"[STARTUP] PostgreSQL Connection Configured -> Host: '{csb.Host}', Port: {csb.Port}, Database: '{csb.Database}', User: '{csb.Username}', SSL: {csb.SslMode}");
}
catch
{
    Console.WriteLine("[STARTUP] PostgreSQL Connection Configured (Raw string provided)");
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// Configure settings
builder.Services.Configure<SmtpSettings>(builder.Configuration.GetSection("SmtpSettings"));
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("JwtSettings"));
builder.Services.Configure<SessionSettings>(builder.Configuration.GetSection("SessionSettings"));
builder.Services.Configure<FileStorageSettings>(builder.Configuration.GetSection("FileStorageSettings"));

var jwtSettings = builder.Configuration.GetSection("JwtSettings").Get<JwtSettings>()!;

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
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(jwtSettings.SecretKey)),
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
builder.Services.AddSingleton<IExpertSystemConfigStore, JsonExpertSystemConfigStore>();
builder.Services.Configure<Neo4jSettings>(builder.Configuration.GetSection("Neo4jSettings"));
builder.Services.Configure<ExpertSystemConfig>(builder.Configuration.GetSection("ExpertSystemConfig"));
builder.Services.Configure<BiomarkerThresholds>(builder.Configuration.GetSection("BiomarkerThresholds"));

// Analytics Services
builder.Services.AddScoped<IStreamAnalyticsService, StreamAnalyticsService>();
builder.Services.AddScoped<ChartDataService>();

// Hosted Services
builder.Services.AddHostedService<OverdueCheckService>();
builder.Services.AddHostedService<RecurringTaskGenerator>();
builder.Services.AddSingleton<BiomarkerScanService>();
builder.Services.AddHostedService<BiomarkerScanService>(sp => sp.GetRequiredService<BiomarkerScanService>());
builder.Services.AddHostedService<SlaRiskTrainingService>();
builder.Services.AddSingleton<IRetrainTrigger>(sp =>
    (SlaRiskTrainingService)sp.GetServices<IHostedService>()
        .First(s => s.GetType() == typeof(SlaRiskTrainingService)));


QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

var app = builder.Build();

// Auto-create database and tables on startup (Safe / Non-crashing)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    try
    {
        Console.WriteLine("[STARTUP] Testing database connection and applying migrations...");
        db.Database.Migrate();
        Console.WriteLine("[STARTUP] Database migrations applied successfully.");

        // Seed default departments and positions
        var departmentService = scope.ServiceProvider.GetRequiredService<IDepartmentService>();
        await departmentService.SeedDefaultDepartmentsAsync();
        await departmentService.SeedDefaultPositionsAsync();

        // Seed default manager
        var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
        await userService.SeedDefaultManagerAsync();

        // Seeds test accounts: 2x Coordinator, 2x Dispatcher, 2x Encoder, 2x Courier
        await userService.SeedTestAccountsAsync();

        // Seed default notification settings
        var notificationSettingsService = scope.ServiceProvider.GetRequiredService<INotificationSettingsService>();
        await notificationSettingsService.SeedDefaultSettingsAsync();

        // Seed demo tasks for presentation
        var taskService = scope.ServiceProvider.GetRequiredService<ITaskService>();
        await taskService.SeedDemoTasksAsync();

        // Reactivate any deactivated Manager accounts (safety net)
        var deactivatedManagers = await db.Users
            .Where(u => u.Role == UserRole.Manager && (u.IsDeactivated || !u.IsActive))
            .ToListAsync();
        foreach (var mgr in deactivatedManagers)
        {
            mgr.IsDeactivated = false;
            mgr.IsActive = true;
            mgr.UpdatedAt = DateTime.UtcNow;
        }
        if (deactivatedManagers.Count > 0)
            await db.SaveChangesAsync();
        
        Console.WriteLine("[STARTUP] All initial seeds completed successfully.");
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

app.MapGet("/api/health", async (AppDbContext db) =>
{
    try
    {
        var canConnect = await db.Database.CanConnectAsync();
        return Results.Json(new
        {
            status = canConnect ? "healthy" : "database_unreachable",
            database = canConnect ? "connected" : "cannot_connect",
            timestamp = DateTime.UtcNow
        });
    }
    catch (Exception ex)
    {
        return Results.Json(new
        {
            status = "unhealthy",
            database = "error",
            error = ex.Message,
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
    app.UseHttpsRedirection();
}

// Get session settings for middleware
var sessionSettings = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<SessionSettings>>().Value;

app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuditLogAccessLogging();
app.UseAuthorization();
app.UseSessionTimeout(sessionSettings);
app.MapControllers();

app.Run();