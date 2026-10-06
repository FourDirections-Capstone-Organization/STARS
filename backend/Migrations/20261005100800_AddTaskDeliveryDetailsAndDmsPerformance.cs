using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskDeliveryDetailsAndDmsPerformance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DmsDeliveryPerformances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WaybillNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    StarsTaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    DriverId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SlaTargetAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsOnTime = table.Column<bool>(type: "boolean", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DmsDeliveryPerformances", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TaskDeliveryDetails",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RecipientContact = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    DeliveryAddress = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Area = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PackageDescription = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CourierEmployeeId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DmsWaybillNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DmsOrderId = table.Column<int>(type: "integer", nullable: true),
                    DmsStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DmsRawStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DmsLastSyncedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DmsFailureReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DmsLatitude = table.Column<double>(type: "double precision", nullable: true),
                    DmsLongitude = table.Column<double>(type: "double precision", nullable: true),
                    SyncStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SyncError = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskDeliveryDetails", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskDeliveryDetails_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DmsDeliveryPerformances_CompletedAt",
                table: "DmsDeliveryPerformances",
                column: "CompletedAt");

            migrationBuilder.CreateIndex(
                name: "IX_DmsDeliveryPerformances_DriverId",
                table: "DmsDeliveryPerformances",
                column: "DriverId");

            migrationBuilder.CreateIndex(
                name: "IX_DmsDeliveryPerformances_WaybillNo",
                table: "DmsDeliveryPerformances",
                column: "WaybillNo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TaskDeliveryDetails_DmsWaybillNo",
                table: "TaskDeliveryDetails",
                column: "DmsWaybillNo");

            migrationBuilder.CreateIndex(
                name: "IX_TaskDeliveryDetails_TaskId",
                table: "TaskDeliveryDetails",
                column: "TaskId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DmsDeliveryPerformances");

            migrationBuilder.DropTable(
                name: "TaskDeliveryDetails");
        }
    }
}
