using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskFomsIntegrationModels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TaskNumber",
                table: "Tasks",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SenderAddress",
                table: "TaskDeliveryDetails",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SpecialInstructions",
                table: "TaskDeliveryDetails",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "FomsClientFinancialStatuses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientAccountId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClientName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    InvoiceNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CurrentStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TotalAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    AmountPaid = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    OutstandingBalance = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    NextDueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastPaymentDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastUpdatedFromFoms = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FomsClientFinancialStatuses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TaskFomsCollectionDetails",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClientAccountId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClientName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    AmountDue = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    DaysOverdue = table.Column<int>(type: "integer", nullable: false),
                    AgingStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClientContactPerson = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ClientContactNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ClientAddress = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    RoutedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskFomsCollectionDetails", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskFomsCollectionDetails_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TaskFomsInvoiceDetails",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClientName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ClientAddress = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ClientContactPerson = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ClientContactNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ClientEmail = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    InvoiceAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    BillingDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    InvoiceDocumentUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SignedReceivingCopyUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ActualReceivedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeliveryRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    EndorsementStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    FomsSyncStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    LastSyncedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastSyncError = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskFomsInvoiceDetails", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskFomsInvoiceDetails_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FomsClientFinancialStatuses_ClientAccountId",
                table: "FomsClientFinancialStatuses",
                column: "ClientAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_FomsClientFinancialStatuses_InvoiceNumber",
                table: "FomsClientFinancialStatuses",
                column: "InvoiceNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TaskFomsCollectionDetails_ClientAccountId",
                table: "TaskFomsCollectionDetails",
                column: "ClientAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskFomsCollectionDetails_InvoiceNumber",
                table: "TaskFomsCollectionDetails",
                column: "InvoiceNumber");

            migrationBuilder.CreateIndex(
                name: "IX_TaskFomsCollectionDetails_TaskId",
                table: "TaskFomsCollectionDetails",
                column: "TaskId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TaskFomsInvoiceDetails_InvoiceNumber",
                table: "TaskFomsInvoiceDetails",
                column: "InvoiceNumber");

            migrationBuilder.CreateIndex(
                name: "IX_TaskFomsInvoiceDetails_TaskId",
                table: "TaskFomsInvoiceDetails",
                column: "TaskId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FomsClientFinancialStatuses");

            migrationBuilder.DropTable(
                name: "TaskFomsCollectionDetails");

            migrationBuilder.DropTable(
                name: "TaskFomsInvoiceDetails");

            migrationBuilder.DropColumn(
                name: "TaskNumber",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "SenderAddress",
                table: "TaskDeliveryDetails");

            migrationBuilder.DropColumn(
                name: "SpecialInstructions",
                table: "TaskDeliveryDetails");
        }
    }
}
