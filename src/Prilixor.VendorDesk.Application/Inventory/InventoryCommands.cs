using FluentValidation;
using Prilixor.VendorDesk.Application.Abstractions;

namespace Prilixor.VendorDesk.Application.Inventory;

public sealed record CatalogProductDto(Guid Id, string Name, string CategoryName);

public sealed record InventoryRowDto(
    Guid ProductId,
    string ProductName,
    string CategoryName,
    decimal PricePerDay,
    int Quantity,
    decimal Deposit,
    bool IsActive,
    bool IsStocked);

public sealed record GetCatalogQuery : IQuery<IReadOnlyList<CatalogProductDto>>;
public sealed record GetInventoryQuery(Guid VendorId) : IQuery<IReadOnlyList<InventoryRowDto>>;

public sealed record SaveInventoryCommand(Guid VendorId, Guid ProductId, decimal PricePerDay, int Quantity, decimal Deposit, bool IsActive) : ICommand<InventoryRowDto>;

public sealed record CatalogImportRow(string Category, string Name);
public sealed record CatalogImportResult(int Added, int AlreadyStored);
public sealed record ImportCatalogCommand(IReadOnlyList<CatalogImportRow> Rows) : ICommand<CatalogImportResult>;

public sealed class SaveInventoryCommandValidator : AbstractValidator<SaveInventoryCommand>
{
    public SaveInventoryCommandValidator()
    {
        RuleFor(command => command.ProductId).NotEmpty();
        RuleFor(command => command.PricePerDay).GreaterThanOrEqualTo(0).LessThan(100_000_000);
        RuleFor(command => command.Quantity).GreaterThanOrEqualTo(0).LessThanOrEqualTo(10_000);
        RuleFor(command => command.Deposit).GreaterThanOrEqualTo(0).LessThan(100_000_000);
    }
}

public interface IInventoryReader
{
    Task<IReadOnlyList<CatalogProductDto>> Catalog(CancellationToken cancellationToken);
    Task<IReadOnlyList<InventoryRowDto>> Inventory(Guid vendorId, CancellationToken cancellationToken);
    Task<InventoryRowDto?> Save(Guid vendorId, Guid productId, decimal pricePerDay, int quantity, decimal deposit, bool isActive, CancellationToken cancellationToken);
    Task<CatalogImportResult> Import(IReadOnlyList<CatalogImportRow> rows, CancellationToken cancellationToken);
}

internal sealed class GetCatalogQueryHandler(IInventoryReader reader) : IQueryHandler<GetCatalogQuery, IReadOnlyList<CatalogProductDto>>
{
    public async Task<Result<IReadOnlyList<CatalogProductDto>>> Handle(GetCatalogQuery request, CancellationToken cancellationToken)
        => Result.Success(await reader.Catalog(cancellationToken));
}

internal sealed class GetInventoryQueryHandler(IInventoryReader reader) : IQueryHandler<GetInventoryQuery, IReadOnlyList<InventoryRowDto>>
{
    public async Task<Result<IReadOnlyList<InventoryRowDto>>> Handle(GetInventoryQuery request, CancellationToken cancellationToken)
        => Result.Success(await reader.Inventory(request.VendorId, cancellationToken));
}

internal sealed class SaveInventoryCommandHandler(IInventoryReader reader) : ICommandHandler<SaveInventoryCommand, InventoryRowDto>
{
    public async Task<Result<InventoryRowDto>> Handle(SaveInventoryCommand request, CancellationToken cancellationToken)
    {
        var saved = await reader.Save(request.VendorId, request.ProductId, request.PricePerDay, request.Quantity, request.Deposit, request.IsActive, cancellationToken);
        return saved is null
            ? Result.Failure<InventoryRowDto>(new Error("catalog.missing", "That product is not in the catalog.", ErrorCategory.NotFound))
            : Result.Success(saved);
    }
}

internal sealed class ImportCatalogCommandHandler(IInventoryReader reader) : ICommandHandler<ImportCatalogCommand, CatalogImportResult>
{
    public async Task<Result<CatalogImportResult>> Handle(ImportCatalogCommand request, CancellationToken cancellationToken)
        => Result.Success(await reader.Import(request.Rows, cancellationToken));
}
