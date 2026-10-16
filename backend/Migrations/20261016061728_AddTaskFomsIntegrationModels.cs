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
            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tasks' AND column_name='TaskNumber') THEN
                        ALTER TABLE ""Tasks"" ADD COLUMN ""TaskNumber"" character varying(32);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TaskDeliveryDetails' AND column_name='SenderAddress') THEN
                        ALTER TABLE ""TaskDeliveryDetails"" ADD COLUMN ""SenderAddress"" character varying(500);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TaskDeliveryDetails' AND column_name='SpecialInstructions') THEN
                        ALTER TABLE ""TaskDeliveryDetails"" ADD COLUMN ""SpecialInstructions"" character varying(1000);
                    END IF;
                END $$;

                CREATE TABLE IF NOT EXISTS ""FomsClientFinancialStatuses"" (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""ClientAccountId"" character varying(100) NOT NULL,
                    ""ClientName"" character varying(200) NOT NULL,
                    ""InvoiceNumber"" character varying(100) NOT NULL,
                    ""CurrentStatus"" character varying(50) NOT NULL,
                    ""TotalAmount"" numeric(18,2) NOT NULL,
                    ""AmountPaid"" numeric(18,2) NOT NULL,
                    ""OutstandingBalance"" numeric(18,2) NOT NULL,
                    ""NextDueDate"" timestamp with time zone NULL,
                    ""LastPaymentDate"" timestamp with time zone NULL,
                    ""LastUpdatedFromFoms"" timestamp with time zone NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_FomsClientFinancialStatuses_InvoiceNumber"" ON ""FomsClientFinancialStatuses"" (""InvoiceNumber"");
                CREATE INDEX IF NOT EXISTS ""IX_FomsClientFinancialStatuses_ClientAccountId"" ON ""FomsClientFinancialStatuses"" (""ClientAccountId"");

                CREATE TABLE IF NOT EXISTS ""TaskFomsInvoiceDetails"" (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TaskId"" uuid NOT NULL REFERENCES ""Tasks"" (""Id"") ON DELETE CASCADE,
                    ""InvoiceNumber"" character varying(100) NOT NULL,
                    ""ClientName"" character varying(200) NOT NULL,
                    ""ClientAddress"" character varying(500) NULL,
                    ""ClientContactPerson"" character varying(150) NULL,
                    ""ClientContactNumber"" character varying(50) NULL,
                    ""ClientEmail"" character varying(150) NULL,
                    ""InvoiceAmount"" numeric(18,2) NOT NULL,
                    ""BillingDate"" timestamp with time zone NULL,
                    ""DueDate"" timestamp with time zone NULL,
                    ""InvoiceDocumentUrl"" character varying(1000) NULL,
                    ""SignedReceivingCopyUrl"" character varying(1000) NULL,
                    ""ActualReceivedDate"" timestamp with time zone NULL,
                    ""DeliveryRemarks"" character varying(1000) NULL,
                    ""EndorsementStatus"" character varying(50) NOT NULL,
                    ""FomsSyncStatus"" character varying(50) NOT NULL,
                    ""LastSyncedAt"" timestamp with time zone NULL,
                    ""LastSyncError"" character varying(500) NULL,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TaskFomsInvoiceDetails_TaskId"" ON ""TaskFomsInvoiceDetails"" (""TaskId"");
                CREATE INDEX IF NOT EXISTS ""IX_TaskFomsInvoiceDetails_InvoiceNumber"" ON ""TaskFomsInvoiceDetails"" (""InvoiceNumber"");

                CREATE TABLE IF NOT EXISTS ""TaskFomsCollectionDetails"" (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TaskId"" uuid NOT NULL REFERENCES ""Tasks"" (""Id"") ON DELETE CASCADE,
                    ""InvoiceNumber"" character varying(100) NOT NULL,
                    ""ClientAccountId"" character varying(100) NOT NULL,
                    ""ClientName"" character varying(200) NOT NULL,
                    ""AmountDue"" numeric(18,2) NOT NULL,
                    ""DaysOverdue"" integer NOT NULL,
                    ""AgingStatus"" character varying(50) NOT NULL,
                    ""DueDate"" timestamp with time zone NULL,
                    ""ClientContactPerson"" character varying(150) NULL,
                    ""ClientContactNumber"" character varying(50) NULL,
                    ""ClientAddress"" character varying(500) NULL,
                    ""RoutedAt"" timestamp with time zone NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TaskFomsCollectionDetails_TaskId"" ON ""TaskFomsCollectionDetails"" (""TaskId"");
                CREATE INDEX IF NOT EXISTS ""IX_TaskFomsCollectionDetails_InvoiceNumber"" ON ""TaskFomsCollectionDetails"" (""InvoiceNumber"");
                CREATE INDEX IF NOT EXISTS ""IX_TaskFomsCollectionDetails_ClientAccountId"" ON ""TaskFomsCollectionDetails"" (""ClientAccountId"");
            ");
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
