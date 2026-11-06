using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Prilixor.VendorDesk.Domain;

namespace Prilixor.VendorDesk.Infrastructure.Persistence;

public sealed class VendorDeskDbContext(DbContextOptions<VendorDeskDbContext> options) : DbContext(options)
{
    public DbSet<Vendor> Vendors => Set<Vendor>();
    public DbSet<EmailOtp> EmailOtps => Set<EmailOtp>();
    public DbSet<VendorSession> VendorSessions => Set<VendorSession>();
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<CatalogProduct> CatalogProducts => Set<CatalogProduct>();
    public DbSet<VendorStock> VendorStocks => Set<VendorStock>();
    public DbSet<WalkInCustomer> Customers => Set<WalkInCustomer>();
    public DbSet<Rental> Rentals => Set<Rental>();
    public DbSet<RentalLine> RentalLines => Set<RentalLine>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Vendor>(entity =>
        {
            entity.ToTable("vendors");
            entity.HasIndex(vendor => vendor.Email).IsUnique();
            entity.Property(vendor => vendor.Email).HasMaxLength(320);
            entity.Property(vendor => vendor.OwnerName).HasMaxLength(120).HasDefaultValue("");
            entity.Property(vendor => vendor.Address).HasMaxLength(500).HasDefaultValue("");
            entity.Property(vendor => vendor.Gstin).HasMaxLength(15).HasDefaultValue("");
            entity.Property(vendor => vendor.TaxPercent).HasColumnType("numeric(5,2)").HasDefaultValue(12m);
            entity.Property(vendor => vendor.DiscountPercent).HasColumnType("numeric(5,2)").HasDefaultValue(5m);
            entity.Property(vendor => vendor.Logo).HasColumnType("text");
        });
        modelBuilder.Entity<EmailOtp>(entity =>
        {
            entity.ToTable("email_otps");
            entity.HasIndex(otp => new { otp.Email, otp.CreatedAt });
        });
        modelBuilder.Entity<VendorSession>(entity =>
        {
            entity.ToTable("vendor_sessions");
            entity.HasIndex(session => session.TokenHash).IsUnique();
            entity.HasOne<Vendor>().WithMany().HasForeignKey(session => session.VendorId);
        });
        modelBuilder.Entity<ProductCategory>(entity =>
        {
            entity.ToTable("product_categories");
            entity.HasIndex(category => category.Name).IsUnique();
        });
        modelBuilder.Entity<CatalogProduct>(entity =>
        {
            entity.ToTable("catalog_products");
            entity.HasIndex(product => new { product.CategoryId, product.Name }).IsUnique();
            entity.HasOne(product => product.Category).WithMany().HasForeignKey(product => product.CategoryId);
        });
        modelBuilder.Entity<VendorStock>(entity =>
        {
            entity.ToTable("vendor_stocks");
            entity.HasIndex(stock => new { stock.VendorId, stock.ProductId }).IsUnique();
            entity.Property(stock => stock.PricePerDay).HasColumnType("numeric(12,2)");
            entity.Property(stock => stock.Deposit).HasColumnType("numeric(12,2)");
            entity.HasOne<Vendor>().WithMany().HasForeignKey(stock => stock.VendorId);
            entity.HasOne<CatalogProduct>().WithMany().HasForeignKey(stock => stock.ProductId);
        });
        modelBuilder.Entity<WalkInCustomer>(entity =>
        {
            entity.ToTable("customers");
            entity.HasIndex(customer => customer.VendorId);
            entity.HasOne<Vendor>().WithMany().HasForeignKey(customer => customer.VendorId);
        });
        modelBuilder.Entity<Rental>(entity =>
        {
            entity.ToTable("rentals");
            entity.HasIndex(rental => new { rental.VendorId, rental.Number }).IsUnique();
            entity.Property(rental => rental.DiscountValue).HasColumnType("numeric(12,2)");
            entity.Property(rental => rental.TaxPercent).HasColumnType("numeric(5,2)");
            entity.Property(rental => rental.AdditionalFees).HasColumnType("numeric(12,2)");
            entity.HasOne<Vendor>().WithMany().HasForeignKey(rental => rental.VendorId);
            entity.HasMany(rental => rental.Lines).WithOne().HasForeignKey(line => line.RentalId);
        });
        modelBuilder.Entity<RentalLine>(entity =>
        {
            entity.ToTable("rental_lines");
            entity.Property(line => line.PricePerDay).HasColumnType("numeric(12,2)");
            entity.Property(line => line.DepositPerUnit).HasColumnType("numeric(12,2)");
            entity.Property(line => line.Photo).HasColumnType("text");
            entity.HasOne<CatalogProduct>().WithMany().HasForeignKey(line => line.ProductId);
        });

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                if (property.ClrType == typeof(DateTimeOffset) || property.ClrType == typeof(DateTimeOffset?))
                    property.SetColumnType("timestamp with time zone");
                if (property.IsPrimaryKey() && property.ClrType == typeof(Guid))
                    property.ValueGenerated = ValueGenerated.Never;
                property.SetColumnName(Snake(property.Name));
            }
        }
    }

    private static string Snake(string name)
    {
        var chars = new List<char>(name.Length + 4);
        for (var i = 0; i < name.Length; i++)
        {
            var character = name[i];
            if (char.IsUpper(character) && i > 0) chars.Add('_');
            chars.Add(char.ToLowerInvariant(character));
        }
        return new string(chars.ToArray());
    }
}
