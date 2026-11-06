using FastEndpoints;
using MediatR;
using Prilixor.VendorDesk.Application.Auth;
using Prilixor.VendorDesk.Application.Rentals;

namespace Prilixor.VendorDesk.Api.Endpoints;

public sealed class SaveProfileRequest
{
    public string BusinessName { get; set; } = "";
    public string OwnerName { get; set; } = "";
    public string Address { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Gstin { get; set; } = "";
    public decimal TaxPercent { get; set; }
    public decimal DiscountPercent { get; set; }
    public string? Logo { get; set; }
}

public sealed class SaveProfileEndpoint(IMediator mediator, VendorContext vendor) : Endpoint<SaveProfileRequest, VendorProfile>
{
    public override void Configure()
    {
        Put("/api/profile");
        AllowAnonymous();
    }

    public override async Task HandleAsync(SaveProfileRequest req, CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new SaveProfileCommand(vendor.VendorId.Value, req.BusinessName, req.OwnerName, req.Address, req.Phone, req.Gstin, req.TaxPercent, req.DiscountPercent, req.Logo), ct);
        if (result.IsFailure)
        {
            await ApiProblems.Write(HttpContext, result.Errors[0], ct);
            return;
        }
        await Send.OkAsync(result.Value, ct);
    }
}

public sealed class CustomersEndpoint(IMediator mediator, VendorContext vendor) : EndpointWithoutRequest<IReadOnlyList<CustomerDto>>
{
    public override void Configure()
    {
        Get("/api/customers");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new GetCustomersQuery(vendor.VendorId.Value), ct);
        await Send.OkAsync(result.Value, ct);
    }
}

public sealed class RentalsEndpoint(IMediator mediator, VendorContext vendor) : EndpointWithoutRequest<IReadOnlyList<RentalListItemDto>>
{
    public override void Configure()
    {
        Get("/api/rentals");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new GetRentalsQuery(vendor.VendorId.Value), ct);
        await Send.OkAsync(result.Value, ct);
    }
}

public sealed class RentalRoute
{
    public Guid Id { get; set; }
}

public sealed class RentalEndpoint(IMediator mediator, VendorContext vendor) : Endpoint<RentalRoute, RentalDetailDto>
{
    public override void Configure()
    {
        Get("/api/rentals/{id}");
        AllowAnonymous();
    }

    public override async Task HandleAsync(RentalRoute req, CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new GetRentalQuery(vendor.VendorId.Value, req.Id), ct);
        if (result.IsFailure)
        {
            await ApiProblems.Write(HttpContext, result.Errors[0], ct);
            return;
        }
        await Send.OkAsync(result.Value, ct);
    }
}

public sealed class ReturnRentalEndpoint(IMediator mediator, VendorContext vendor) : Endpoint<RentalRoute, RentalDetailDto>
{
    public override void Configure()
    {
        Post("/api/rentals/{id}/return");
        AllowAnonymous();
    }

    public override async Task HandleAsync(RentalRoute req, CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new ReturnRentalCommand(vendor.VendorId.Value, req.Id), ct);
        if (result.IsFailure)
        {
            await ApiProblems.Write(HttpContext, result.Errors[0], ct);
            return;
        }
        await Send.OkAsync(result.Value, ct);
    }
}

public sealed class CreateRentalRequest
{
    public Guid? CustomerId { get; set; }
    public CustomerInput? Customer { get; set; }
    public List<RentalItemInput> Items { get; set; } = [];
    public RentalChargesInput Charges { get; set; } = new("percent", 0, 0, 0);
}

public sealed class CreateRentalEndpoint(IMediator mediator, VendorContext vendor) : Endpoint<CreateRentalRequest, RentalDetailDto>
{
    public override void Configure()
    {
        Post("/api/rentals");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CreateRentalRequest req, CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new CreateRentalCommand(vendor.VendorId.Value, req.CustomerId, req.Customer, req.Items, req.Charges), ct);
        if (result.IsFailure)
        {
            await ApiProblems.Write(HttpContext, result.Errors[0], ct);
            return;
        }
        await Send.OkAsync(result.Value, ct);
    }
}
