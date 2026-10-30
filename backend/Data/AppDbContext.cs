using Microsoft.EntityFrameworkCore;
using Backend.Models;

namespace Backend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Department> Departments => Set<Department>();
    public DbSet<JobPosition> JobPositions => Set<JobPosition>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Models.Task> Tasks => Set<Models.Task>();
    public DbSet<TaskAssignment> TaskAssignments => Set<TaskAssignment>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();
    public DbSet<TaskAttachment> TaskAttachments => Set<TaskAttachment>();
    public DbSet<TaskTemplate> TaskTemplates => Set<TaskTemplate>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationSettings> NotificationSettings => Set<NotificationSettings>();
    public DbSet<Announcement> Announcements => Set<Announcement>();
    public DbSet<AnnouncementAcknowledgment> AnnouncementAcknowledgments => Set<AnnouncementAcknowledgment>();
    public DbSet<AnnouncementComment> AnnouncementComments => Set<AnnouncementComment>();
    public DbSet<Recommendation> Recommendations => Set<Recommendation>();
    public DbSet<TaskComment> TaskComments => Set<TaskComment>();
    public DbSet<TaskCommentAttachment> TaskCommentAttachments => Set<TaskCommentAttachment>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<BiomarkerAlert> BiomarkerAlerts => Set<BiomarkerAlert>();
    public DbSet<TaskDeliveryDetail> TaskDeliveryDetails => Set<TaskDeliveryDetail>();
    public DbSet<DmsDeliveryPerformance> DmsDeliveryPerformances => Set<DmsDeliveryPerformance>();
    public DbSet<TaskFomsInvoiceDetail> TaskFomsInvoiceDetails => Set<TaskFomsInvoiceDetail>();
    public DbSet<FomsClientFinancialStatus> FomsClientFinancialStatuses => Set<FomsClientFinancialStatus>();
    public DbSet<TaskFomsCollectionDetail> TaskFomsCollectionDetails => Set<TaskFomsCollectionDetail>();
    public DbSet<KpiConfiguration> KpiConfigurations => Set<KpiConfiguration>();
    public DbSet<KpiItem> KpiItems => Set<KpiItem>();
    public DbSet<EvaluationTemplate> EvaluationTemplates => Set<EvaluationTemplate>();
    public DbSet<EvaluationSection> EvaluationSections => Set<EvaluationSection>();
    public DbSet<EvaluationCriterion> EvaluationCriteria => Set<EvaluationCriterion>();
    public DbSet<RatingBand> RatingBands => Set<RatingBand>();
    public DbSet<PerformanceReview> PerformanceReviews => Set<PerformanceReview>();
    public DbSet<CriterionRating> CriterionRatings => Set<CriterionRating>();
    public DbSet<AiRecommendation> AiRecommendations => Set<AiRecommendation>();
    public DbSet<DevelopmentPlanItem> DevelopmentPlanItems => Set<DevelopmentPlanItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Department Configuration
        modelBuilder.Entity<Department>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Description).HasMaxLength(500);

            // One-to-many - Department -> JobPositions
            entity.HasMany(d => d.JobPositions)
                .WithOne(jp => jp.Department)
                .HasForeignKey(jp => jp.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            // One-to-many - Department -> Users
            entity.HasMany(d => d.Users)
                .WithOne(u => u.Department)
                .HasForeignKey(u => u.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // JobPosition Configuration
        modelBuilder.Entity<JobPosition>(entity =>
        {
           entity.HasKey(e => e.Id);
           entity.Property(e => e.Name).IsRequired().HasMaxLength(100);

           // One-to-many - JobPosition -> User
           entity.HasMany(jp => jp.Users)
                .WithOne(u => u.JobPosition)
                .HasForeignKey(u => u.JobPositionId)
                .OnDelete(DeleteBehavior.Restrict); 
        });

        // User Configuration
        modelBuilder.Entity<User>(entity =>
        {
           entity.HasKey(e => e.Id);
           entity.Property(e => e.EmployeeNumber).IsRequired().HasMaxLength(20);
           entity.Property(e => e.Email).IsRequired().HasMaxLength(100);
           entity.Property(e => e.FirstName).IsRequired().HasMaxLength(50);
           entity.Property(e => e.LastName).IsRequired().HasMaxLength(50);
           entity.Property(e => e.EmploymentStatus).HasMaxLength(50);

           // Unique Constraints
           entity.HasIndex(e => e.EmployeeNumber).IsUnique();
           entity.HasIndex(e => e.Email).IsUnique();
           entity.HasIndex(e => e.Username).IsUnique().HasFilter("\"Username\" IS NOT NULL");
        });

        // Task Configuration
        modelBuilder.Entity<Models.Task>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Description).IsRequired().HasMaxLength(2000);

            entity.HasOne(t => t.CreatedBy)
                .WithMany()
                .HasForeignKey(t => t.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.AssignedDepartment)
                .WithMany()
                .HasForeignKey(t => t.AssignedDepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.Team)
                .WithMany()
                .HasForeignKey(t => t.TeamId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Team Configuration
        modelBuilder.Entity<Team>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.HasIndex(e => e.Name).IsUnique();

            entity.HasOne(t => t.Department)
                .WithMany()
                .HasForeignKey(t => t.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.CreatedBy)
                .WithMany()
                .HasForeignKey(t => t.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.TeamLeader)
                .WithMany()
                .HasForeignKey(t => t.TeamLeaderId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // TeamMember Configuration
        modelBuilder.Entity<TeamMember>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasOne(tm => tm.Team)
                .WithMany(t => t.Members)
                .HasForeignKey(tm => tm.TeamId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(tm => tm.User)
                .WithMany()
                .HasForeignKey(tm => tm.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            // An employee can only belong to ONE team at a time.
            entity.HasIndex(e => e.UserId).IsUnique();
        });

        // TaskAssignment Configuration
        modelBuilder.Entity<TaskAssignment>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasOne(ta => ta.Task)
                .WithMany(t => t.Assignments)
                .HasForeignKey(ta => ta.TaskId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ta => ta.AssignedUser)
                .WithMany()
                .HasForeignKey(ta => ta.AssignedUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TaskId, e.AssignedUserId }).IsUnique();
        });

        // TaskAttachment Configuration
        modelBuilder.Entity<TaskAttachment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FileName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.FilePath).IsRequired().HasMaxLength(500);
            entity.Property(e => e.FileType).HasMaxLength(20);
            entity.Property(e => e.Description).HasMaxLength(250);

            entity.HasOne(a => a.Task)
                .WithMany(t => t.Attachments)
                .HasForeignKey(a => a.TaskId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(a => a.UploadedBy)
                .WithMany()
                .HasForeignKey(a => a.UploadedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // TaskTemplate Configuration
        modelBuilder.Entity<TaskTemplate>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TemplateName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DefaultTitle).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DefaultDescription).IsRequired().HasMaxLength(2000);

            entity.HasOne(t => t.DefaultAssignee)
                .WithMany()
                .HasForeignKey(t => t.DefaultAssigneeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.DefaultDepartment)
                .WithMany()
                .HasForeignKey(t => t.DefaultDepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.CreatedBy)
                .WithMany()
                .HasForeignKey(t => t.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Notification Configuration
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Message).IsRequired().HasMaxLength(1000);

            entity.HasOne(n => n.Recipient)
                .WithMany()
                .HasForeignKey(n => n.RecipientId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(n => n.RelatedTask)
                .WithMany()
                .HasForeignKey(n => n.RelatedTaskId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => new { e.RecipientId, e.IsRead });
            entity.HasIndex(e => e.CreatedAt);
        });

        // NotificationSettings Configuration
        modelBuilder.Entity<NotificationSettings>(entity =>
        {
            entity.HasKey(e => e.Id);
        });

        // Recommendation Configuration
        modelBuilder.Entity<Recommendation>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Notes).IsRequired().HasMaxLength(1000);

            entity.HasOne(r => r.Task)
                .WithMany()
                .HasForeignKey(r => r.TaskId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(r => r.Assignee)
                .WithMany()
                .HasForeignKey(r => r.AssigneeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.Coordinator)
                .WithMany()
                .HasForeignKey(r => r.CoordinatorId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.AssigneeId);
            entity.HasIndex(e => e.CreatedAt);
        });

        // TaskComment Configuration
        modelBuilder.Entity<TaskComment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Content).IsRequired().HasMaxLength(1000);
            entity.Property(e => e.AttachmentFilePath).HasMaxLength(500);
            entity.Property(e => e.AttachmentFileName).HasMaxLength(255);

            entity.HasOne(c => c.Task)
                .WithMany()
                .HasForeignKey(c => c.TaskId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(c => c.Author)
                .WithMany()
                .HasForeignKey(c => c.AuthorId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TaskId, e.IsDeleted });
            entity.HasIndex(e => e.CreatedAt);
        });

        // TaskCommentAttachment Configuration
        modelBuilder.Entity<TaskCommentAttachment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FileName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.FilePath).IsRequired().HasMaxLength(500);
            entity.Property(e => e.FileType).HasMaxLength(50);

            entity.HasOne(a => a.Comment)
                .WithMany(c => c.Attachments)
                .HasForeignKey(a => a.CommentId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.CommentId);
        });

        // AuditLog Configuration
        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TargetEntity).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Description).IsRequired().HasMaxLength(500);
            entity.Property(e => e.Module).IsRequired().HasMaxLength(100);
            entity.Property(e => e.IpAddress).HasMaxLength(50);

            entity.HasOne(a => a.User)
                .WithMany()
                .HasForeignKey(a => a.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => e.Timestamp);
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.ActionType);
            entity.HasIndex(e => e.Module);
            entity.HasIndex(e => new { e.TargetEntity, e.TargetEntityId });
            entity.HasIndex(e => new { e.TargetEntity, e.TargetEntityId, e.ActionType, e.Timestamp });
        });

        // TaskDeliveryDetail Configuration
        modelBuilder.Entity<TaskDeliveryDetail>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.TaskId).IsUnique();
            entity.HasIndex(e => e.DmsWaybillNo);

            entity.HasOne(d => d.Task)
                .WithMany()
                .HasForeignKey(d => d.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // DmsDeliveryPerformance Configuration
        modelBuilder.Entity<DmsDeliveryPerformance>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.WaybillNo).IsUnique();
            entity.HasIndex(e => e.DriverId);
            entity.HasIndex(e => e.CompletedAt);
        });

        // TaskFomsInvoiceDetail Configuration
        modelBuilder.Entity<TaskFomsInvoiceDetail>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.TaskId).IsUnique();
            entity.HasIndex(e => e.InvoiceNumber);

            entity.HasOne(d => d.Task)
                .WithMany()
                .HasForeignKey(d => d.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // FomsClientFinancialStatus Configuration
        modelBuilder.Entity<FomsClientFinancialStatus>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.InvoiceNumber).IsUnique();
            entity.HasIndex(e => e.ClientAccountId);
        });

        // KpiConfiguration Configuration
        modelBuilder.Entity<KpiConfiguration>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.TargetRole).HasMaxLength(50);
            entity.Property(e => e.OverallGreenThreshold).HasDefaultValue(85.0);
            entity.Property(e => e.OverallAmberThreshold).HasDefaultValue(70.0);
            entity.Property(e => e.OverallRedThreshold).HasDefaultValue(60.0);

            entity.HasOne(c => c.Department)
                .WithMany()
                .HasForeignKey(c => c.DepartmentId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(c => c.CreatedBy)
                .WithMany()
                .HasForeignKey(c => c.CreatedById)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasMany(c => c.Items)
                .WithOne(i => i.KpiConfiguration)
                .HasForeignKey(i => i.KpiConfigurationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.IsActive, e.EffectiveStartDate, e.EffectiveEndDate });
            entity.HasIndex(e => e.DepartmentId);
            entity.HasIndex(e => e.TargetRole);
        });

        // KpiItem Configuration
        modelBuilder.Entity<KpiItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.MetricCode).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.Unit).HasMaxLength(20);
            entity.Property(e => e.CustomFormula).HasMaxLength(1000);

            entity.HasIndex(e => e.KpiConfigurationId);
            entity.HasIndex(e => e.MetricCode);
        });

        // TaskFomsCollectionDetail Configuration
        modelBuilder.Entity<TaskFomsCollectionDetail>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.TaskId).IsUnique();
            entity.HasIndex(e => e.InvoiceNumber);
            entity.HasIndex(e => e.ClientAccountId);

            entity.HasOne(d => d.Task)
                .WithMany()
                .HasForeignKey(d => d.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        // EvaluationTemplate Configuration
        modelBuilder.Entity<EvaluationTemplate>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.TargetRole).HasMaxLength(50);

            entity.HasOne(t => t.Department)
                .WithMany()
                .HasForeignKey(t => t.DepartmentId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(t => t.CreatedBy)
                .WithMany()
                .HasForeignKey(t => t.CreatedById)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasMany(t => t.Sections)
                .WithOne(s => s.Template)
                .HasForeignKey(s => s.TemplateId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(t => t.RatingBands)
                .WithOne(b => b.Template)
                .HasForeignKey(b => b.TemplateId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(t => t.Reviews)
                .WithOne(r => r.Template)
                .HasForeignKey(r => r.TemplateId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.DepartmentId);
            entity.HasIndex(e => e.IsActive);
            entity.HasIndex(e => e.TargetRole);
        });

        // EvaluationSection Configuration
        modelBuilder.Entity<EvaluationSection>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Description).HasMaxLength(500);

            entity.HasOne(s => s.Template)
                .WithMany(t => t.Sections)
                .HasForeignKey(s => s.TemplateId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(s => s.Criteria)
                .WithOne(c => c.Section)
                .HasForeignKey(c => c.SectionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.TemplateId);
        });

        // EvaluationCriterion Configuration
        modelBuilder.Entity<EvaluationCriterion>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.MetricCode).HasMaxLength(50);

            entity.HasOne(c => c.Section)
                .WithMany(s => s.Criteria)
                .HasForeignKey(c => c.SectionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(c => c.Ratings)
                .WithOne(r => r.Criterion)
                .HasForeignKey(r => r.CriterionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.SectionId);
            entity.HasIndex(e => e.MetricCode);
        });

        // RatingBand Configuration
        modelBuilder.Entity<RatingBand>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Label).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Color).HasMaxLength(30);
            entity.Property(e => e.Description).HasMaxLength(500);

            entity.HasOne(b => b.Template)
                .WithMany(t => t.RatingBands)
                .HasForeignKey(b => b.TemplateId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.TemplateId);
        });

        // PerformanceReview Configuration
        modelBuilder.Entity<PerformanceReview>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.FrozenScoresJson).HasColumnType("text");

            entity.HasOne(r => r.Template)
                .WithMany(t => t.Reviews)
                .HasForeignKey(r => r.TemplateId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.Department)
                .WithMany()
                .HasForeignKey(r => r.DepartmentId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(r => r.Team)
                .WithMany()
                .HasForeignKey(r => r.TeamId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(r => r.Employee)
                .WithMany()
                .HasForeignKey(r => r.EmployeeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(r => r.Reviewer)
                .WithMany()
                .HasForeignKey(r => r.ReviewerId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(r => r.CreatedBy)
                .WithMany()
                .HasForeignKey(r => r.CreatedById)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(r => r.FinalizedBy)
                .WithMany()
                .HasForeignKey(r => r.FinalizedById)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasMany(r => r.Ratings)
                .WithOne(cr => cr.Review)
                .HasForeignKey(cr => cr.ReviewId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(r => r.AiRecommendations)
                .WithOne(ai => ai.Review)
                .HasForeignKey(ai => ai.ReviewId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(r => r.DevelopmentPlanItems)
                .WithOne(dpi => dpi.Review)
                .HasForeignKey(dpi => dpi.ReviewId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.TemplateId);
            entity.HasIndex(e => e.EmployeeId);
            entity.HasIndex(e => e.DepartmentId);
            entity.HasIndex(e => new { e.PeriodStart, e.PeriodEnd });
        });

        // CriterionRating Configuration
        modelBuilder.Entity<CriterionRating>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.SelfComment).HasMaxLength(1000);
            entity.Property(e => e.ManagerComment).HasMaxLength(1000);

            entity.HasOne(cr => cr.Review)
                .WithMany(r => r.Ratings)
                .HasForeignKey(cr => cr.ReviewId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(cr => cr.Employee)
                .WithMany()
                .HasForeignKey(cr => cr.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(cr => cr.Criterion)
                .WithMany(c => c.Ratings)
                .HasForeignKey(cr => cr.CriterionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.ReviewId, e.EmployeeId, e.CriterionId }).IsUnique();
            entity.HasIndex(e => e.EmployeeId);
            entity.HasIndex(e => e.CriterionId);
        });

        // AiRecommendation Configuration
        modelBuilder.Entity<AiRecommendation>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Summary).HasColumnType("text");
            entity.Property(e => e.StrengthsJson).HasColumnType("text");
            entity.Property(e => e.ImprovementAreasJson).HasColumnType("text");
            entity.Property(e => e.ActionItemsJson).HasColumnType("text");
            entity.Property(e => e.TrainingTopicsJson).HasColumnType("text");
            entity.Property(e => e.RawResponseJson).HasColumnType("text");
            entity.Property(e => e.ManualNotes).HasMaxLength(2000);

            entity.HasOne(ai => ai.Review)
                .WithMany(r => r.AiRecommendations)
                .HasForeignKey(ai => ai.ReviewId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ai => ai.Employee)
                .WithMany()
                .HasForeignKey(ai => ai.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ai => ai.ReviewedBy)
                .WithMany()
                .HasForeignKey(ai => ai.ReviewedById)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => new { e.ReviewId, e.EmployeeId });
            entity.HasIndex(e => e.Status);
        });

        // DevelopmentPlanItem Configuration
        modelBuilder.Entity<DevelopmentPlanItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Description).IsRequired().HasMaxLength(500);
            entity.Property(e => e.SuccessMeasure).HasMaxLength(500);
            entity.Property(e => e.Timeframe).HasMaxLength(100);
            entity.Property(e => e.ManagerNotes).HasMaxLength(1000);
            entity.Property(e => e.EmployeeNotes).HasMaxLength(1000);

            entity.HasOne(dpi => dpi.Review)
                .WithMany(r => r.DevelopmentPlanItems)
                .HasForeignKey(dpi => dpi.ReviewId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(dpi => dpi.Employee)
                .WithMany()
                .HasForeignKey(dpi => dpi.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(dpi => dpi.CompletedBy)
                .WithMany()
                .HasForeignKey(dpi => dpi.CompletedById)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(dpi => dpi.CreatedBy)
                .WithMany()
                .HasForeignKey(dpi => dpi.CreatedById)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => e.ReviewId);
            entity.HasIndex(e => e.EmployeeId);
            entity.HasIndex(e => e.IsCompleted);
        });
    }
}
