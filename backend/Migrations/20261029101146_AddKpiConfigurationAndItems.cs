using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddKpiConfigurationAndItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='AllowedSystems') THEN
                        ALTER TABLE ""Users"" ADD COLUMN ""AllowedSystems"" character varying(100) NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='DmsAreas') THEN
                        ALTER TABLE ""Users"" ADD COLUMN ""DmsAreas"" character varying(250) NULL;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='DmsRole') THEN
                        ALTER TABLE ""Users"" ADD COLUMN ""DmsRole"" character varying(50) NULL;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='FomsRole') THEN
                        ALTER TABLE ""Users"" ADD COLUMN ""FomsRole"" character varying(50) NULL;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Teams' AND column_name='TeamLeaderId') THEN
                        ALTER TABLE ""Teams"" ADD COLUMN ""TeamLeaderId"" uuid NULL;
                    END IF;
                END $$;
            ");

            migrationBuilder.CreateTable(
                name: "KpiConfigurations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    TargetRole = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    EffectiveStartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EffectiveEndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KpiConfigurations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KpiConfigurations_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_KpiConfigurations_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "KpiItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    KpiConfigurationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    MetricCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Weight = table.Column<double>(type: "double precision", nullable: false),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    TargetValue = table.Column<double>(type: "double precision", nullable: false),
                    GreenThreshold = table.Column<double>(type: "double precision", nullable: false),
                    AmberThreshold = table.Column<double>(type: "double precision", nullable: false),
                    RedThreshold = table.Column<double>(type: "double precision", nullable: false),
                    IsLowerBetter = table.Column<bool>(type: "boolean", nullable: false),
                    IsCustomFormula = table.Column<bool>(type: "boolean", nullable: false),
                    CustomFormula = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KpiItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KpiItems_KpiConfigurations_KpiConfigurationId",
                        column: x => x.KpiConfigurationId,
                        principalTable: "KpiConfigurations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql(@"CREATE INDEX IF NOT EXISTS ""IX_Teams_TeamLeaderId"" ON ""Teams"" (""TeamLeaderId"");");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_TargetEntity_TargetEntityId_ActionType_Timestamp",
                table: "AuditLogs",
                columns: new[] { "TargetEntity", "TargetEntityId", "ActionType", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_KpiConfigurations_CreatedById",
                table: "KpiConfigurations",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_KpiConfigurations_DepartmentId",
                table: "KpiConfigurations",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_KpiConfigurations_IsActive_EffectiveStartDate_EffectiveEndDate",
                table: "KpiConfigurations",
                columns: new[] { "IsActive", "EffectiveStartDate", "EffectiveEndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_KpiConfigurations_TargetRole",
                table: "KpiConfigurations",
                column: "TargetRole");

            migrationBuilder.CreateIndex(
                name: "IX_KpiItems_KpiConfigurationId",
                table: "KpiItems",
                column: "KpiConfigurationId");

            migrationBuilder.CreateIndex(
                name: "IX_KpiItems_MetricCode",
                table: "KpiItems",
                column: "MetricCode");

            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='FK_Teams_Users_TeamLeaderId') THEN
                        ALTER TABLE ""Teams"" ADD CONSTRAINT ""FK_Teams_Users_TeamLeaderId"" FOREIGN KEY (""TeamLeaderId"") REFERENCES ""Users"" (""Id"") ON DELETE SET NULL;
                    END IF;
                END $$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "KpiItems");

            migrationBuilder.DropTable(
                name: "KpiConfigurations");

            migrationBuilder.DropIndex(
                name: "IX_AuditLogs_TargetEntity_TargetEntityId_ActionType_Timestamp",
                table: "AuditLogs");
        }
    }
}
