using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Prilixor.VendorDesk.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Rentals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "address",
                table: "vendors",
                type: "character varying(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "discount_percent",
                table: "vendors",
                type: "numeric(5,2)",
                nullable: false,
                defaultValue: 5m);

            migrationBuilder.AddColumn<string>(
                name: "gstin",
                table: "vendors",
                type: "character varying(15)",
                maxLength: 15,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "owner_name",
                table: "vendors",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "tax_percent",
                table: "vendors",
                type: "numeric(5,2)",
                nullable: false,
                defaultValue: 12m);

            migrationBuilder.CreateTable(
                name: "customers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    vendor_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    mobile = table.Column<string>(type: "text", nullable: false),
                    email = table.Column<string>(type: "text", nullable: false),
                    address = table.Column<string>(type: "text", nullable: false),
                    ref_name = table.Column<string>(type: "text", nullable: false),
                    ref_mobile = table.Column<string>(type: "text", nullable: false),
                    ref_relation = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customers", x => x.id);
                    table.ForeignKey(
                        name: "FK_customers_vendors_vendor_id",
                        column: x => x.vendor_id,
                        principalTable: "vendors",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rentals",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    vendor_id = table.Column<Guid>(type: "uuid", nullable: false),
                    number = table.Column<int>(type: "integer", nullable: false),
                    created_on = table.Column<DateOnly>(type: "date", nullable: false),
                    customer_name = table.Column<string>(type: "text", nullable: false),
                    customer_mobile = table.Column<string>(type: "text", nullable: false),
                    customer_email = table.Column<string>(type: "text", nullable: false),
                    customer_address = table.Column<string>(type: "text", nullable: false),
                    ref_name = table.Column<string>(type: "text", nullable: false),
                    ref_mobile = table.Column<string>(type: "text", nullable: false),
                    ref_relation = table.Column<string>(type: "text", nullable: false),
                    discount_type = table.Column<string>(type: "text", nullable: false),
                    discount_value = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    tax_percent = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    additional_fees = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    issuer_name = table.Column<string>(type: "text", nullable: false),
                    issuer_owner = table.Column<string>(type: "text", nullable: false),
                    issuer_address = table.Column<string>(type: "text", nullable: false),
                    issuer_phone = table.Column<string>(type: "text", nullable: false),
                    issuer_gstin = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rentals", x => x.id);
                    table.ForeignKey(
                        name: "FK_rentals_vendors_vendor_id",
                        column: x => x.vendor_id,
                        principalTable: "vendors",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rental_lines",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    rental_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    quantity = table.Column<int>(type: "integer", nullable: false),
                    days = table.Column<int>(type: "integer", nullable: false),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    price_per_day = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    deposit_per_unit = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    photo = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rental_lines", x => x.id);
                    table.ForeignKey(
                        name: "FK_rental_lines_catalog_products_product_id",
                        column: x => x.product_id,
                        principalTable: "catalog_products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_rental_lines_rentals_rental_id",
                        column: x => x.rental_id,
                        principalTable: "rentals",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_customers_vendor_id",
                table: "customers",
                column: "vendor_id");

            migrationBuilder.CreateIndex(
                name: "IX_rental_lines_product_id",
                table: "rental_lines",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_rental_lines_rental_id",
                table: "rental_lines",
                column: "rental_id");

            migrationBuilder.CreateIndex(
                name: "IX_rentals_vendor_id_number",
                table: "rentals",
                columns: new[] { "vendor_id", "number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customers");

            migrationBuilder.DropTable(
                name: "rental_lines");

            migrationBuilder.DropTable(
                name: "rentals");

            migrationBuilder.DropColumn(
                name: "address",
                table: "vendors");

            migrationBuilder.DropColumn(
                name: "discount_percent",
                table: "vendors");

            migrationBuilder.DropColumn(
                name: "gstin",
                table: "vendors");

            migrationBuilder.DropColumn(
                name: "owner_name",
                table: "vendors");

            migrationBuilder.DropColumn(
                name: "tax_percent",
                table: "vendors");
        }
    }
}
