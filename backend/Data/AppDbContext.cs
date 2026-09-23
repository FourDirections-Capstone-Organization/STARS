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
        });
    }
}
