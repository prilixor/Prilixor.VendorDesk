namespace Prilixor.VendorDesk.Domain;

public sealed class Vendor
{
    public Guid Id { get; set; }
    public string BusinessName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string City { get; set; } = "";
    public string OwnerName { get; set; } = "";
    public string Address { get; set; } = "";
    public string Gstin { get; set; } = "";
    public decimal TaxPercent { get; set; } = 12;
    public decimal DiscountPercent { get; set; } = 5;
    public string? Logo { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class WalkInCustomer
{
    public Guid Id { get; set; }
    public Guid VendorId { get; set; }
    public string Name { get; set; } = "";
    public string Mobile { get; set; } = "";
    public string Email { get; set; } = "";
    public string Address { get; set; } = "";
    public string RefName { get; set; } = "";
    public string RefMobile { get; set; } = "";
    public string RefRelation { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class Rental
{
    public Guid Id { get; set; }
    public Guid VendorId { get; set; }
    public int Number { get; set; }
    public DateOnly CreatedOn { get; set; }
    public string CustomerName { get; set; } = "";
    public string CustomerMobile { get; set; } = "";
    public string CustomerEmail { get; set; } = "";
    public string CustomerAddress { get; set; } = "";
    public string RefName { get; set; } = "";
    public string RefMobile { get; set; } = "";
    public string RefRelation { get; set; } = "";
    public string DiscountType { get; set; } = "percent";
    public decimal DiscountValue { get; set; }
    public decimal TaxPercent { get; set; }
    public decimal AdditionalFees { get; set; }
    public string IssuerName { get; set; } = "";
    public string IssuerOwner { get; set; } = "";
    public string IssuerAddress { get; set; } = "";
    public string IssuerPhone { get; set; } = "";
    public string IssuerGstin { get; set; } = "";
    public DateOnly? ReturnedOn { get; set; }
    public List<RentalLine> Lines { get; set; } = [];
}

public sealed class RentalLine
{
    public Guid Id { get; set; }
    public Guid RentalId { get; set; }
    public Guid ProductId { get; set; }
    public string Name { get; set; } = "";
    public int Quantity { get; set; }
    public int Days { get; set; }
    public DateOnly StartDate { get; set; }
    public decimal PricePerDay { get; set; }
    public decimal DepositPerUnit { get; set; }
    public string? Photo { get; set; }
}

public sealed class EmailOtp
{
    public Guid Id { get; set; }
    public string Email { get; set; } = "";
    public string Purpose { get; set; } = "";
    public string CodeHash { get; set; } = "";
    public string? BusinessName { get; set; }
    public string? Phone { get; set; }
    public string? City { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class VendorSession
{
    public Guid Id { get; set; }
    public Guid VendorId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ProductCategory
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
}

public sealed class CatalogProduct
{
    public Guid Id { get; set; }
    public Guid CategoryId { get; set; }
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public ProductCategory Category { get; set; } = null!;
}

public sealed class VendorStock
{
    public Guid Id { get; set; }
    public Guid VendorId { get; set; }
    public Guid ProductId { get; set; }
    public decimal PricePerDay { get; set; }
    public int Quantity { get; set; }
    public decimal Deposit { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset UpdatedAt { get; set; }
}
