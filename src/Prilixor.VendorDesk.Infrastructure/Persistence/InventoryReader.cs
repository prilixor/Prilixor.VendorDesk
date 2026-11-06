using Microsoft.EntityFrameworkCore;
using Prilixor.VendorDesk.Application.Inventory;
using Prilixor.VendorDesk.Domain;

namespace Prilixor.VendorDesk.Infrastructure.Persistence;

public sealed class InventoryReader(VendorDeskDbContext db) : IInventoryReader
{
    public async Task<IReadOnlyList<CatalogProductDto>> Catalog(CancellationToken cancellationToken)
        => await db.CatalogProducts.AsNoTracking()
            .Where(product => product.IsActive)
            .OrderBy(product => product.Category.Name).ThenBy(product => product.Name)
            .Select(product => new CatalogProductDto(product.Id, product.Name, product.Category.Name))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<InventoryRowDto>> Inventory(Guid vendorId, CancellationToken cancellationToken)
    {
        var products = await db.CatalogProducts.AsNoTracking().Include(product => product.Category).Where(product => product.IsActive).OrderBy(product => product.Category.Name).ThenBy(product => product.Name).ToListAsync(cancellationToken);
        var stock = await db.VendorStocks.AsNoTracking().Where(item => item.VendorId == vendorId).ToListAsync(cancellationToken);
        return products.Select(product =>
        {
            var row = stock.FirstOrDefault(item => item.ProductId == product.Id);
            return new InventoryRowDto(product.Id, product.Name, product.Category.Name, row?.PricePerDay ?? 0, row?.Quantity ?? 0, row?.Deposit ?? 0, row?.IsActive ?? false, row is not null);
        }).ToList();
    }

    public async Task<InventoryRowDto?> Save(Guid vendorId, Guid productId, decimal pricePerDay, int quantity, decimal deposit, bool isActive, CancellationToken cancellationToken)
    {
        var product = await db.CatalogProducts.Include(item => item.Category).FirstOrDefaultAsync(item => item.Id == productId && item.IsActive, cancellationToken);
        if (product is null) return null;
        var stock = await db.VendorStocks.FirstOrDefaultAsync(item => item.VendorId == vendorId && item.ProductId == productId, cancellationToken);
        if (stock is null)
        {
            stock = new VendorStock { Id = Guid.NewGuid(), VendorId = vendorId, ProductId = productId };
            db.VendorStocks.Add(stock);
        }
        stock.PricePerDay = decimal.Round(pricePerDay, 2, MidpointRounding.AwayFromZero);
        stock.Quantity = quantity;
        stock.Deposit = decimal.Round(deposit, 2, MidpointRounding.AwayFromZero);
        stock.IsActive = isActive;
        stock.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new InventoryRowDto(product.Id, product.Name, product.Category.Name, stock.PricePerDay, stock.Quantity, stock.Deposit, stock.IsActive, true);
    }

    public async Task<CatalogImportResult> Import(IReadOnlyList<CatalogImportRow> rows, CancellationToken cancellationToken)
    {
        var categories = await db.ProductCategories.ToListAsync(cancellationToken);
        var products = await db.CatalogProducts.ToListAsync(cancellationToken);
        var added = 0;
        var alreadyStored = 0;
        foreach (var row in rows)
        {
            var category = categories.FirstOrDefault(item => string.Equals(item.Name, row.Category, StringComparison.OrdinalIgnoreCase));
            if (category is null)
            {
                category = new ProductCategory { Id = Guid.NewGuid(), Name = row.Category };
                db.ProductCategories.Add(category);
                categories.Add(category);
            }
            if (products.Any(item => item.CategoryId == category.Id && string.Equals(item.Name, row.Name, StringComparison.OrdinalIgnoreCase)))
            {
                alreadyStored++;
                continue;
            }
            products.Add(new CatalogProduct { Id = Guid.NewGuid(), CategoryId = category.Id, Name = row.Name, IsActive = true });
            db.CatalogProducts.Add(products[^1]);
            added++;
        }
        await db.SaveChangesAsync(cancellationToken);
        return new CatalogImportResult(added, alreadyStored);
    }
}
