using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddDeliveryLogisticsAndCourierFullName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TaskDeliveryDetails' AND column_name='CourierFullName') THEN
                        ALTER TABLE ""TaskDeliveryDetails"" ADD COLUMN ""CourierFullName"" character varying(200);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TaskDeliveryDetails' AND column_name='ItemCount') THEN
                        ALTER TABLE ""TaskDeliveryDetails"" ADD COLUMN ""ItemCount"" integer;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TaskDeliveryDetails' AND column_name='PackageType') THEN
                        ALTER TABLE ""TaskDeliveryDetails"" ADD COLUMN ""PackageType"" character varying(100);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TaskDeliveryDetails' AND column_name='TaskType') THEN
                        ALTER TABLE ""TaskDeliveryDetails"" ADD COLUMN ""TaskType"" character varying(100);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TaskDeliveryDetails' AND column_name='Weight') THEN
                        ALTER TABLE ""TaskDeliveryDetails"" ADD COLUMN ""Weight"" character varying(50);
                    END IF;
                END $$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CourierFullName",
                table: "TaskDeliveryDetails");

            migrationBuilder.DropColumn(
                name: "ItemCount",
                table: "TaskDeliveryDetails");

            migrationBuilder.DropColumn(
                name: "PackageType",
                table: "TaskDeliveryDetails");

            migrationBuilder.DropColumn(
                name: "TaskType",
                table: "TaskDeliveryDetails");

            migrationBuilder.DropColumn(
                name: "Weight",
                table: "TaskDeliveryDetails");
        }
    }
}
