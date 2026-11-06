using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Prilixor.VendorDesk.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ShopLogo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "logo",
                table: "vendors",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "logo",
                table: "vendors");
        }
    }
}
