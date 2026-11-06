using Microsoft.EntityFrameworkCore;
using Prilixor.VendorDesk.Application.Abstractions;
using Prilixor.VendorDesk.Application.Auth;
using Prilixor.VendorDesk.Application.Rentals;
using Prilixor.VendorDesk.Domain;

namespace Prilixor.VendorDesk.Infrastructure.Persistence;

public sealed class ShopDesk(VendorDeskDbContext db, IRentalPhotoStore photos) : IShopDesk
{
    public async Task<VendorProfile?> SaveProfile(SaveProfileCommand command, CancellationToken cancellationToken)
    {
        var vendor = await db.Vendors.FirstOrDefaultAsync(item => item.Id == command.VendorId, cancellationToken);
        if (vendor is null) return null;
        vendor.BusinessName = command.BusinessName.Trim();
        vendor.OwnerName = command.OwnerName.Trim();
        vendor.Address = command.Address.Trim();
        vendor.Phone = command.Phone.Trim();
        vendor.Gstin = command.Gstin.Trim().ToUpperInvariant();
        vendor.TaxPercent = decimal.Round(command.TaxPercent, 2, MidpointRounding.AwayFromZero);
        vendor.DiscountPercent = decimal.Round(command.DiscountPercent, 2, MidpointRounding.AwayFromZero);
        vendor.Logo = string.IsNullOrWhiteSpace(command.Logo) ? null : command.Logo;
        await db.SaveChangesAsync(cancellationToken);
        return VendorProfiles.From(vendor);
    }

    public async Task<IReadOnlyList<CustomerDto>> Customers(Guid vendorId, CancellationToken cancellationToken)
        => await db.Customers.AsNoTracking()
            .Where(customer => customer.VendorId == vendorId)
            .OrderBy(customer => customer.Name)
            .Select(customer => new CustomerDto(customer.Id, customer.Name, customer.Mobile, customer.Email, customer.Address, customer.RefName, customer.RefMobile, customer.RefRelation))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<RentalListItemDto>> Rentals(Guid vendorId, CancellationToken cancellationToken)
    {
        var today = RentalMath.IndiaToday();
        var rows = await db.Rentals.AsNoTracking()
            .Where(rental => rental.VendorId == vendorId)
            .OrderByDescending(rental => rental.Number)
            .Select(rental => new
            {
                rental.Id,
                rental.Number,
                rental.CustomerName,
                rental.DiscountType,
                rental.DiscountValue,
                rental.TaxPercent,
                rental.AdditionalFees,
                rental.ReturnedOn,
                Lines = rental.Lines.Select(line => new { line.Name, line.Quantity, line.Days, line.StartDate, line.PricePerDay, line.DepositPerUnit })
            })
            .ToListAsync(cancellationToken);
        return rows.Select(row =>
        {
            var lines = row.Lines.Select(line => new RentalLineInput(line.Quantity, line.Days, line.PricePerDay, line.DepositPerUnit)).ToList();
            var totals = RentalMath.Totals(lines, row.DiscountType, row.DiscountValue, row.TaxPercent, row.AdditionalFees);
            var ends = row.Lines.Select(line => RentalMath.EndDate(line.StartDate, line.Days)).ToList();
            return new RentalListItemDto(row.Id, Label(row.Number), row.CustomerName, row.Lines.Select(line => line.Name).ToList(), ends.Max(), RentalMath.Status(today, ends, row.ReturnedOn is not null), row.Lines.Sum(line => line.Quantity), totals.Taxable);
        }).ToList();
    }

    public async Task<RentalDetailDto?> Rental(Guid vendorId, Guid rentalId, CancellationToken cancellationToken)
    {
        var rental = await db.Rentals.AsNoTracking().Include(item => item.Lines).FirstOrDefaultAsync(item => item.Id == rentalId && item.VendorId == vendorId, cancellationToken);
        return rental is null ? null : Map(rental);
    }

    public async Task<Result<RentalDetailDto>> Create(CreateRentalCommand command, CancellationToken cancellationToken)
    {
        var vendor = await db.Vendors.FirstOrDefaultAsync(item => item.Id == command.VendorId, cancellationToken);
        if (vendor is null) return Result.Failure<RentalDetailDto>(new Error("auth.unknown", "Sign in required.", ErrorCategory.Unauthorized));
        if (!VendorProfiles.From(vendor).ProfileComplete)
            return Result.Failure<RentalDetailDto>(new Error("profile.incomplete", "Save your business details before creating a rental.", ErrorCategory.Validation));

        WalkInCustomer? customer = null;
        if (command.CustomerId is Guid customerId)
        {
            customer = await db.Customers.FirstOrDefaultAsync(item => item.Id == customerId && item.VendorId == command.VendorId, cancellationToken);
            if (customer is null) return Result.Failure<RentalDetailDto>(new Error("customer.missing", "Select a customer to continue.", ErrorCategory.NotFound));
            if (command.Customer is not null) ApplyCustomer(customer, command.Customer);
        }

        var productIds = command.Items.Select(item => item.ProductId).ToList();
        var products = await db.CatalogProducts.Where(product => productIds.Contains(product.Id) && product.IsActive).ToListAsync(cancellationToken);
        if (products.Count != productIds.Count)
            return Result.Failure<RentalDetailDto>(new Error("catalog.missing", "That product is not in the catalog.", ErrorCategory.NotFound));

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var stocks = await db.VendorStocks.Where(stock => stock.VendorId == command.VendorId && productIds.Contains(stock.ProductId)).ToListAsync(cancellationToken);
        foreach (var item in command.Items)
        {
            var stock = stocks.FirstOrDefault(row => row.ProductId == item.ProductId && row.IsActive);
            var name = products.First(product => product.Id == item.ProductId).Name;
            if (stock is null || stock.Quantity < item.Quantity)
                return Result.Failure<RentalDetailDto>(new Error("stock.short", $"{name} does not have enough quantity.", ErrorCategory.Conflict));
            stock.Quantity -= item.Quantity;
            stock.UpdatedAt = DateTimeOffset.UtcNow;
        }

        if (customer is null)
        {
            var input = command.Customer!;
            customer = new WalkInCustomer
            {
                Id = Guid.NewGuid(),
                VendorId = command.VendorId,
                Name = input.Name.Trim(),
                Mobile = input.Mobile.Trim(),
                Email = input.Email?.Trim() ?? "",
                Address = input.Address.Trim(),
                RefName = input.RefName.Trim(),
                RefMobile = input.RefMobile.Trim(),
                RefRelation = input.RefRelation.Trim(),
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.Customers.Add(customer);
        }

        var number = await db.Rentals.Where(rental => rental.VendorId == command.VendorId).Select(rental => (int?)rental.Number).MaxAsync(cancellationToken) ?? 1000;
        var rental = new Rental
        {
            Id = Guid.NewGuid(),
            VendorId = command.VendorId,
            Number = number + 1,
            CreatedOn = RentalMath.IndiaToday(),
            CustomerName = customer.Name,
            CustomerMobile = customer.Mobile,
            CustomerEmail = customer.Email,
            CustomerAddress = customer.Address,
            RefName = customer.RefName,
            RefMobile = customer.RefMobile,
            RefRelation = customer.RefRelation,
            DiscountType = command.Charges.DiscountType,
            DiscountValue = decimal.Round(command.Charges.DiscountValue, 2, MidpointRounding.AwayFromZero),
            TaxPercent = decimal.Round(command.Charges.TaxPercent, 2, MidpointRounding.AwayFromZero),
            AdditionalFees = decimal.Round(command.Charges.AdditionalFees, 2, MidpointRounding.AwayFromZero),
            IssuerName = vendor.BusinessName,
            IssuerOwner = vendor.OwnerName,
            IssuerAddress = vendor.Address,
            IssuerPhone = vendor.Phone,
            IssuerGstin = vendor.Gstin
        };
        var uploaded = new List<string>();
        try
        {
            foreach (var item in command.Items)
            {
                var line = new RentalLine
                {
                    Id = Guid.NewGuid(),
                    RentalId = rental.Id,
                    ProductId = item.ProductId,
                    Name = products.First(product => product.Id == item.ProductId).Name,
                    Quantity = item.Quantity,
                    Days = item.Days,
                    StartDate = item.StartDate,
                    PricePerDay = decimal.Round(item.PricePerDay, 2, MidpointRounding.AwayFromZero),
                    DepositPerUnit = decimal.Round(item.DepositPerUnit, 2, MidpointRounding.AwayFromZero)
                };
                if (!string.IsNullOrWhiteSpace(item.Photo))
                {
                    var key = await photos.SaveAsync(command.VendorId, line.Id, item.Photo, cancellationToken);
                    line.Photo = key;
                    if (key is not null) uploaded.Add(key);
                }
                rental.Lines.Add(line);
            }
            db.Rentals.Add(rental);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (RentalPhotoException ex)
        {
            await photos.DeleteAsync(uploaded, CancellationToken.None);
            return Result.Failure<RentalDetailDto>(new Error("photo.save", ex.Message, ErrorCategory.Validation));
        }
        catch
        {
            await photos.DeleteAsync(uploaded, CancellationToken.None);
            throw;
        }
        return Result.Success(Map(rental, customer.Id));
    }

    public async Task<Result<RentalDetailDto>> Return(Guid vendorId, Guid rentalId, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var rental = await db.Rentals.Include(item => item.Lines).FirstOrDefaultAsync(item => item.Id == rentalId && item.VendorId == vendorId, cancellationToken);
        if (rental is null) return Result.Failure<RentalDetailDto>(new Error("rental.missing", "Rental not found.", ErrorCategory.NotFound));
        if (rental.ReturnedOn is not null) return Result.Failure<RentalDetailDto>(new Error("rental.returned", "This rental is already returned.", ErrorCategory.Conflict));
        foreach (var line in rental.Lines)
        {
            var stock = await db.VendorStocks.FirstOrDefaultAsync(item => item.VendorId == vendorId && item.ProductId == line.ProductId, cancellationToken);
            if (stock is null)
            {
                stock = new VendorStock { Id = Guid.NewGuid(), VendorId = vendorId, ProductId = line.ProductId, IsActive = true };
                db.VendorStocks.Add(stock);
            }
            stock.Quantity += line.Quantity;
            stock.UpdatedAt = DateTimeOffset.UtcNow;
        }
        try
        {
            await photos.DeleteAsync(rental.Lines.Select(line => line.Photo), cancellationToken);
        }
        catch (RentalPhotoException ex)
        {
            return Result.Failure<RentalDetailDto>(new Error("photo.remove", ex.Message, ErrorCategory.Conflict));
        }
        foreach (var line in rental.Lines) line.Photo = null;
        rental.ReturnedOn = RentalMath.IndiaToday();
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result.Success(Map(rental));
    }

    private static void ApplyCustomer(WalkInCustomer customer, CustomerInput input)
    {
        customer.Name = input.Name.Trim();
        customer.Mobile = input.Mobile.Trim();
        customer.Email = input.Email?.Trim() ?? "";
        customer.Address = input.Address.Trim();
        customer.RefName = input.RefName.Trim();
        customer.RefMobile = input.RefMobile.Trim();
        customer.RefRelation = input.RefRelation.Trim();
    }

    private RentalDetailDto Map(Rental rental, Guid customerId = default)
    {
        var today = RentalMath.IndiaToday();
        var lines = rental.Lines.Select(line => new RentalLineDto(
            line.ProductId,
            line.Name,
            line.Quantity,
            line.Days,
            line.StartDate,
            RentalMath.EndDate(line.StartDate, line.Days),
            line.PricePerDay,
            line.DepositPerUnit,
            RentalMath.LineCharge(line.Quantity, line.Days, line.PricePerDay),
            photos.Display(line.Photo))).ToList();
        var inputs = lines.Select(line => new RentalLineInput(line.Quantity, line.Days, line.PricePerDay, line.DepositPerUnit)).ToList();
        return new RentalDetailDto(
            rental.Id,
            Label(rental.Number),
            $"INV-{rental.CreatedOn.Year}-{rental.Number}",
            rental.CreatedOn,
            RentalMath.Status(today, lines.Select(line => line.EndDate), rental.ReturnedOn is not null),
            new CustomerDto(customerId, rental.CustomerName, rental.CustomerMobile, rental.CustomerEmail, rental.CustomerAddress, rental.RefName, rental.RefMobile, rental.RefRelation),
            lines,
            new RentalChargesInput(rental.DiscountType, rental.DiscountValue, rental.TaxPercent, rental.AdditionalFees),
            RentalMath.Totals(inputs, rental.DiscountType, rental.DiscountValue, rental.TaxPercent, rental.AdditionalFees),
            new InvoiceBusinessDto(rental.IssuerName, rental.IssuerOwner, rental.IssuerAddress, rental.IssuerPhone, rental.IssuerGstin));
    }

    private static string Label(int number) => $"RNT-{number}";
}
