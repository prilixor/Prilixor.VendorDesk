using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Prilixor.VendorDesk.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ReturnEquipment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "returned_on",
                table: "rentals",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "returned_on",
                table: "rentals");
        }
    }
}
