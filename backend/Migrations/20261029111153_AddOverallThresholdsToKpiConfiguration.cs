using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddOverallThresholdsToKpiConfiguration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "OverallAmberThreshold",
                table: "KpiConfigurations",
                type: "double precision",
                nullable: false,
                defaultValue: 70.0);

            migrationBuilder.AddColumn<double>(
                name: "OverallGreenThreshold",
                table: "KpiConfigurations",
                type: "double precision",
                nullable: false,
                defaultValue: 85.0);

            migrationBuilder.AddColumn<double>(
                name: "OverallRedThreshold",
                table: "KpiConfigurations",
                type: "double precision",
                nullable: false,
                defaultValue: 60.0);

            migrationBuilder.Sql(@"
                UPDATE ""KpiConfigurations""
                SET ""OverallGreenThreshold"" = 85.0,
                    ""OverallAmberThreshold"" = 70.0,
                    ""OverallRedThreshold"" = 60.0
                WHERE ""OverallGreenThreshold"" = 0.0;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OverallAmberThreshold",
                table: "KpiConfigurations");

            migrationBuilder.DropColumn(
                name: "OverallGreenThreshold",
                table: "KpiConfigurations");

            migrationBuilder.DropColumn(
                name: "OverallRedThreshold",
                table: "KpiConfigurations");
        }
    }
}
