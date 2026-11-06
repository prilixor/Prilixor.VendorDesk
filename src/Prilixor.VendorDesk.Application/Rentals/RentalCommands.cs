using FluentValidation;
using Prilixor.VendorDesk.Application.Abstractions;
using Prilixor.VendorDesk.Application.Auth;

namespace Prilixor.VendorDesk.Application.Rentals;

public sealed record CustomerInput(string Name, string Mobile, string? Email, string Address, string RefName, string RefMobile, string RefRelation);

public sealed record RentalItemInput(Guid ProductId, int Quantity, int Days, DateOnly StartDate, decimal PricePerDay, decimal DepositPerUnit, string? Photo);

public sealed record RentalChargesInput(string DiscountType, decimal DiscountValue, decimal TaxPercent, decimal AdditionalFees);

public sealed record CustomerDto(Guid Id, string Name, string Mobile, string Email, string Address, string RefName, string RefMobile, string RefRelation);

public sealed record RentalLineDto(Guid ProductId, string Name, int Quantity, int Days, DateOnly StartDate, DateOnly EndDate, decimal PricePerDay, decimal DepositPerUnit, decimal Amount, string? Photo);

public sealed record InvoiceBusinessDto(string Name, string Owner, string Address, string Phone, string Gstin);

public sealed record RentalListItemDto(Guid Id, string Number, string CustomerName, IReadOnlyList<string> ItemNames, DateOnly ReturnOn, string Status, int Units, decimal Taxable);

public sealed record RentalDetailDto(
    Guid Id,
    string Number,
    string InvoiceNo,
    DateOnly CreatedOn,
    string Status,
    CustomerDto Customer,
    IReadOnlyList<RentalLineDto> Items,
    RentalChargesInput Charges,
    RentalTotalsDto Totals,
    InvoiceBusinessDto Business);

public sealed record SaveProfileCommand(Guid VendorId, string BusinessName, string OwnerName, string Address, string Phone, string Gstin, decimal TaxPercent, decimal DiscountPercent, string? Logo) : ICommand<VendorProfile>;

public sealed class SaveProfileCommandValidator : AbstractValidator<SaveProfileCommand>
{
    public SaveProfileCommandValidator()
    {
        RuleFor(command => command.BusinessName).NotEmpty().MaximumLength(160);
        RuleFor(command => command.OwnerName).NotEmpty().MaximumLength(120);
        RuleFor(command => command.Address).NotEmpty().MaximumLength(500);
        RuleFor(command => command.Phone).NotEmpty().MinimumLength(7).MaximumLength(25);
        RuleFor(command => command.Gstin).MaximumLength(15);
        RuleFor(command => command.TaxPercent).InclusiveBetween(0, 100);
        RuleFor(command => command.DiscountPercent).InclusiveBetween(0, 100);
        RuleFor(command => command.Logo).Must(logo => string.IsNullOrEmpty(logo) || (logo.Length <= 300_000 && (logo.StartsWith("data:image/jpeg", StringComparison.OrdinalIgnoreCase) || logo.StartsWith("data:image/png", StringComparison.OrdinalIgnoreCase) || logo.StartsWith("data:image/webp", StringComparison.OrdinalIgnoreCase)))).WithMessage("Use a JPG, PNG or WebP logo.");
    }
}

public sealed record GetCustomersQuery(Guid VendorId) : IQuery<IReadOnlyList<CustomerDto>>;
public sealed record GetRentalsQuery(Guid VendorId) : IQuery<IReadOnlyList<RentalListItemDto>>;
public sealed record GetRentalQuery(Guid VendorId, Guid RentalId) : IQuery<RentalDetailDto>;

public sealed record CreateRentalCommand(Guid VendorId, Guid? CustomerId, CustomerInput? Customer, IReadOnlyList<RentalItemInput> Items, RentalChargesInput Charges) : ICommand<RentalDetailDto>;

public sealed class CreateRentalCommandValidator : AbstractValidator<CreateRentalCommand>
{
    public CreateRentalCommandValidator()
    {
        RuleFor(command => command.Items).NotEmpty().Must(items => items is not null && items.Select(item => item.ProductId).Distinct().Count() == items.Count);
        RuleForEach(command => command.Items).ChildRules(item =>
        {
            item.RuleFor(line => line.ProductId).NotEmpty();
            item.RuleFor(line => line.Quantity).GreaterThan(0).LessThanOrEqualTo(10_000);
            item.RuleFor(line => line.Days).Must(RentalMath.ValidDuration);
            item.RuleFor(line => line.PricePerDay).GreaterThan(0).LessThan(100_000_000);
            item.RuleFor(line => line.DepositPerUnit).GreaterThanOrEqualTo(0).LessThan(100_000_000);
            item.RuleFor(line => line.Photo).Must(photo => string.IsNullOrEmpty(photo) || (photo.Length <= 7_000_000 && photo.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))).WithMessage("Use a JPG, PNG or WebP photo under 5 MB.");
        });
        RuleFor(command => command.Charges).Must(charges => charges is not null && RentalMath.ValidCharges(charges.DiscountType, charges.DiscountValue, charges.TaxPercent, charges.AdditionalFees));
        RuleFor(command => command).Must(command => command.CustomerId is not null || command.Customer is not null);
        When(command => command.Customer is not null, () =>
        {
            RuleFor(command => command.Customer!.Name).NotEmpty().MaximumLength(160);
            RuleFor(command => command.Customer!.Mobile).Matches(@"^[6-9]\d{9}$").WithMessage("Enter a valid 10-digit mobile.");
            RuleFor(command => command.Customer!.Email).MaximumLength(320).Must(email => string.IsNullOrWhiteSpace(email) || email.Contains('@')).WithMessage("Enter a valid email.");
            RuleFor(command => command.Customer!.Address).NotEmpty().MaximumLength(500);
            RuleFor(command => command.Customer!.RefName).NotEmpty().MaximumLength(160);
            RuleFor(command => command.Customer!.RefMobile).Matches(@"^[6-9]\d{9}$").WithMessage("Enter a valid 10-digit mobile.");
            RuleFor(command => command.Customer!.RefRelation).NotEmpty().MaximumLength(80);
        });
    }
}

public interface IShopDesk
{
    Task<VendorProfile?> SaveProfile(SaveProfileCommand command, CancellationToken cancellationToken);
    Task<IReadOnlyList<CustomerDto>> Customers(Guid vendorId, CancellationToken cancellationToken);
    Task<IReadOnlyList<RentalListItemDto>> Rentals(Guid vendorId, CancellationToken cancellationToken);
    Task<RentalDetailDto?> Rental(Guid vendorId, Guid rentalId, CancellationToken cancellationToken);
    Task<Result<RentalDetailDto>> Create(CreateRentalCommand command, CancellationToken cancellationToken);
    Task<Result<RentalDetailDto>> Return(Guid vendorId, Guid rentalId, CancellationToken cancellationToken);
}

public sealed record ReturnRentalCommand(Guid VendorId, Guid RentalId) : ICommand<RentalDetailDto>;

internal sealed class ReturnRentalCommandHandler(IShopDesk desk) : ICommandHandler<ReturnRentalCommand, RentalDetailDto>
{
    public Task<Result<RentalDetailDto>> Handle(ReturnRentalCommand request, CancellationToken cancellationToken)
        => desk.Return(request.VendorId, request.RentalId, cancellationToken);
}

internal sealed class SaveProfileCommandHandler(IShopDesk desk) : ICommandHandler<SaveProfileCommand, VendorProfile>
{
    public async Task<Result<VendorProfile>> Handle(SaveProfileCommand request, CancellationToken cancellationToken)
    {
        var saved = await desk.SaveProfile(request, cancellationToken);
        return saved is null
            ? Result.Failure<VendorProfile>(new Error("auth.unknown", "Sign in required.", ErrorCategory.Unauthorized))
            : Result.Success(saved);
    }
}

internal sealed class GetCustomersQueryHandler(IShopDesk desk) : IQueryHandler<GetCustomersQuery, IReadOnlyList<CustomerDto>>
{
    public async Task<Result<IReadOnlyList<CustomerDto>>> Handle(GetCustomersQuery request, CancellationToken cancellationToken)
        => Result.Success(await desk.Customers(request.VendorId, cancellationToken));
}

internal sealed class GetRentalsQueryHandler(IShopDesk desk) : IQueryHandler<GetRentalsQuery, IReadOnlyList<RentalListItemDto>>
{
    public async Task<Result<IReadOnlyList<RentalListItemDto>>> Handle(GetRentalsQuery request, CancellationToken cancellationToken)
        => Result.Success(await desk.Rentals(request.VendorId, cancellationToken));
}

internal sealed class GetRentalQueryHandler(IShopDesk desk) : IQueryHandler<GetRentalQuery, RentalDetailDto>
{
    public async Task<Result<RentalDetailDto>> Handle(GetRentalQuery request, CancellationToken cancellationToken)
    {
        var rental = await desk.Rental(request.VendorId, request.RentalId, cancellationToken);
        return rental is null
            ? Result.Failure<RentalDetailDto>(new Error("rental.missing", "Rental not found.", ErrorCategory.NotFound))
            : Result.Success(rental);
    }
}

internal sealed class CreateRentalCommandHandler(IShopDesk desk) : ICommandHandler<CreateRentalCommand, RentalDetailDto>
{
    public Task<Result<RentalDetailDto>> Handle(CreateRentalCommand request, CancellationToken cancellationToken)
        => desk.Create(request, cancellationToken);
}
