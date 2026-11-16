using FastEndpoints;
using MediatR;
using Prilixor.VendorDesk.Application.Rentals;

namespace Prilixor.VendorDesk.Api.Endpoints;

public sealed class GetReportRequest
{
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
}

public sealed class GetReportEndpoint(IMediator mediator, VendorContext vendor) : Endpoint<GetReportRequest, ShopReportDto>
{
    public override void Configure()
    {
        Get("/api/reports");
        AllowAnonymous();
    }

    public override async Task HandleAsync(GetReportRequest req, CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new GetShopReportQuery(vendor.VendorId.Value, req.From, req.To), ct);
        if (result.IsFailure)
        {
            await ApiProblems.Write(HttpContext, result.Errors[0], ct);
            return;
        }
        await Send.OkAsync(result.Value, ct);
    }
}
