using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentStatusFieldsToFomsClientFinancialStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AgingBucket",
                table: "FomsClientFinancialStatuses",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DueStatus",
                table: "FomsClientFinancialStatuses",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceStatus",
                table: "FomsClientFinancialStatuses",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentStatus",
                table: "FomsClientFinancialStatuses",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AgingBucket",
                table: "FomsClientFinancialStatuses");

            migrationBuilder.DropColumn(
                name: "DueStatus",
                table: "FomsClientFinancialStatuses");

            migrationBuilder.DropColumn(
                name: "InvoiceStatus",
                table: "FomsClientFinancialStatuses");

            migrationBuilder.DropColumn(
                name: "PaymentStatus",
                table: "FomsClientFinancialStatuses");
        }
    }
}
