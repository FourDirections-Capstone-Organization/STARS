using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddPerformanceEvaluation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EvaluationTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    TargetRole = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    IsAiEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluationTemplates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EvaluationTemplates_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_EvaluationTemplates_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "EvaluationSections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Weight = table.Column<double>(type: "double precision", nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    IsKpiSection = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluationSections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EvaluationSections_EvaluationTemplates_TemplateId",
                        column: x => x.TemplateId,
                        principalTable: "EvaluationTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PerformanceReviews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Scope = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    PeriodStart = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PeriodEnd = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    TeamId = table.Column<Guid>(type: "uuid", nullable: true),
                    EmployeeId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewerId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    FinalizedById = table.Column<Guid>(type: "uuid", nullable: true),
                    FinalizedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FrozenScoresJson = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PerformanceReviews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PerformanceReviews_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PerformanceReviews_EvaluationTemplates_TemplateId",
                        column: x => x.TemplateId,
                        principalTable: "EvaluationTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PerformanceReviews_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PerformanceReviews_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PerformanceReviews_Users_EmployeeId",
                        column: x => x.EmployeeId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PerformanceReviews_Users_FinalizedById",
                        column: x => x.FinalizedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PerformanceReviews_Users_ReviewerId",
                        column: x => x.ReviewerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "RatingBands",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    MinScore = table.Column<double>(type: "double precision", nullable: false),
                    MaxScore = table.Column<double>(type: "double precision", nullable: false),
                    Color = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RatingBands", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RatingBands_EvaluationTemplates_TemplateId",
                        column: x => x.TemplateId,
                        principalTable: "EvaluationTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EvaluationCriteria",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Weight = table.Column<double>(type: "double precision", nullable: false),
                    CriterionType = table.Column<int>(type: "integer", nullable: false),
                    MetricCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluationCriteria", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EvaluationCriteria_EvaluationSections_SectionId",
                        column: x => x.SectionId,
                        principalTable: "EvaluationSections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AiRecommendations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewId = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Summary = table.Column<string>(type: "text", nullable: true),
                    StrengthsJson = table.Column<string>(type: "text", nullable: true),
                    ImprovementAreasJson = table.Column<string>(type: "text", nullable: true),
                    ActionItemsJson = table.Column<string>(type: "text", nullable: true),
                    TrainingTopicsJson = table.Column<string>(type: "text", nullable: true),
                    RawResponseJson = table.Column<string>(type: "text", nullable: true),
                    ManualNotes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ReviewedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiRecommendations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiRecommendations_PerformanceReviews_ReviewId",
                        column: x => x.ReviewId,
                        principalTable: "PerformanceReviews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AiRecommendations_Users_EmployeeId",
                        column: x => x.EmployeeId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AiRecommendations_Users_ReviewedById",
                        column: x => x.ReviewedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "DevelopmentPlanItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewId = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    SuccessMeasure = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Timeframe = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    TargetCompletionDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsCompleted = table.Column<bool>(type: "boolean", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedById = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ManagerNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    EmployeeNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DevelopmentPlanItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DevelopmentPlanItems_PerformanceReviews_ReviewId",
                        column: x => x.ReviewId,
                        principalTable: "PerformanceReviews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DevelopmentPlanItems_Users_CompletedById",
                        column: x => x.CompletedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_DevelopmentPlanItems_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_DevelopmentPlanItems_Users_EmployeeId",
                        column: x => x.EmployeeId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CriterionRatings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewId = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uuid", nullable: false),
                    CriterionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SelfScore = table.Column<double>(type: "double precision", nullable: true),
                    ManagerScore = table.Column<double>(type: "double precision", nullable: true),
                    SelfComment = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ManagerComment = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CriterionRatings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CriterionRatings_EvaluationCriteria_CriterionId",
                        column: x => x.CriterionId,
                        principalTable: "EvaluationCriteria",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CriterionRatings_PerformanceReviews_ReviewId",
                        column: x => x.ReviewId,
                        principalTable: "PerformanceReviews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CriterionRatings_Users_EmployeeId",
                        column: x => x.EmployeeId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiRecommendations_EmployeeId",
                table: "AiRecommendations",
                column: "EmployeeId");

            migrationBuilder.CreateIndex(
                name: "IX_AiRecommendations_ReviewedById",
                table: "AiRecommendations",
                column: "ReviewedById");

            migrationBuilder.CreateIndex(
                name: "IX_AiRecommendations_ReviewId_EmployeeId",
                table: "AiRecommendations",
                columns: new[] { "ReviewId", "EmployeeId" });

            migrationBuilder.CreateIndex(
                name: "IX_AiRecommendations_Status",
                table: "AiRecommendations",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_CriterionRatings_CriterionId",
                table: "CriterionRatings",
                column: "CriterionId");

            migrationBuilder.CreateIndex(
                name: "IX_CriterionRatings_EmployeeId",
                table: "CriterionRatings",
                column: "EmployeeId");

            migrationBuilder.CreateIndex(
                name: "IX_CriterionRatings_ReviewId_EmployeeId_CriterionId",
                table: "CriterionRatings",
                columns: new[] { "ReviewId", "EmployeeId", "CriterionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentPlanItems_CompletedById",
                table: "DevelopmentPlanItems",
                column: "CompletedById");

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentPlanItems_CreatedById",
                table: "DevelopmentPlanItems",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentPlanItems_EmployeeId",
                table: "DevelopmentPlanItems",
                column: "EmployeeId");

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentPlanItems_IsCompleted",
                table: "DevelopmentPlanItems",
                column: "IsCompleted");

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentPlanItems_ReviewId",
                table: "DevelopmentPlanItems",
                column: "ReviewId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationCriteria_MetricCode",
                table: "EvaluationCriteria",
                column: "MetricCode");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationCriteria_SectionId",
                table: "EvaluationCriteria",
                column: "SectionId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationSections_TemplateId",
                table: "EvaluationSections",
                column: "TemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationTemplates_CreatedById",
                table: "EvaluationTemplates",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationTemplates_DepartmentId",
                table: "EvaluationTemplates",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationTemplates_IsActive",
                table: "EvaluationTemplates",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationTemplates_TargetRole",
                table: "EvaluationTemplates",
                column: "TargetRole");

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceReviews_CreatedById",
                table: "PerformanceReviews",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceReviews_DepartmentId",
                table: "PerformanceReviews",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceReviews_EmployeeId",
                table: "PerformanceReviews",
                column: "EmployeeId");

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceReviews_FinalizedById",
                table: "PerformanceReviews",
                column: "FinalizedById");

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceReviews_PeriodStart_PeriodEnd",
                table: "PerformanceReviews",
                columns: new[] { "PeriodStart", "PeriodEnd" });

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceReviews_ReviewerId",
                table: "PerformanceReviews",
                column: "ReviewerId");

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceReviews_Status",
                table: "PerformanceReviews",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceReviews_TeamId",
                table: "PerformanceReviews",
                column: "TeamId");

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceReviews_TemplateId",
                table: "PerformanceReviews",
                column: "TemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_RatingBands_TemplateId",
                table: "RatingBands",
                column: "TemplateId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiRecommendations");

            migrationBuilder.DropTable(
                name: "CriterionRatings");

            migrationBuilder.DropTable(
                name: "DevelopmentPlanItems");

            migrationBuilder.DropTable(
                name: "RatingBands");

            migrationBuilder.DropTable(
                name: "EvaluationCriteria");

            migrationBuilder.DropTable(
                name: "PerformanceReviews");

            migrationBuilder.DropTable(
                name: "EvaluationSections");

            migrationBuilder.DropTable(
                name: "EvaluationTemplates");
        }
    }
}
