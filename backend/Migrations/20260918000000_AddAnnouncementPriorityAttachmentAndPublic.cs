using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddAnnouncementPriorityAttachmentAndPublic : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Priority",
                table: "Announcements",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Normal");

            migrationBuilder.AddColumn<bool>(
                name: "IsPublic",
                table: "Announcements",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentFileName",
                table: "Announcements",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentFilePath",
                table: "Announcements",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentContentType",
                table: "Announcements",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "AttachmentSizeBytes",
                table: "Announcements",
                type: "bigint",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Priority",
                table: "Announcements");

            migrationBuilder.DropColumn(
                name: "IsPublic",
                table: "Announcements");

            migrationBuilder.DropColumn(
                name: "AttachmentFileName",
                table: "Announcements");

            migrationBuilder.DropColumn(
                name: "AttachmentFilePath",
                table: "Announcements");

            migrationBuilder.DropColumn(
                name: "AttachmentContentType",
                table: "Announcements");

            migrationBuilder.DropColumn(
                name: "AttachmentSizeBytes",
                table: "Announcements");
        }
    }
}
