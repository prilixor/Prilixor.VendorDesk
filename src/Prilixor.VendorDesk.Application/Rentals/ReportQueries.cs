using FluentValidation;
using Prilixor.VendorDesk.Application.Abstractions;

namespace Prilixor.VendorDesk.Application.Rentals;

public sealed record GetShopReportQuery(Guid VendorId, DateOnly? From, DateOnly? To) : IQuery<ShopReportDto>;

public sealed class GetShopReportQueryValidator : AbstractValidator<GetShopReportQuery>
{
    public GetShopReportQueryValidator()
    {
        RuleFor(query => query).Must(BeAYearOrLess).WithMessage("Choose a start date on or before the end date, within one year.");
    }

    private static bool BeAYearOrLess(GetShopReportQuery query)
    {
        if (query.From is null && query.To is null) return true;
        if (query.From is null || query.To is null) return false;
        return query.From <= query.To && query.To <= query.From.Value.AddYears(1);
    }
}

internal sealed class GetShopReportQueryHandler(IShopDesk desk) : IQueryHandler<GetShopReportQuery, ShopReportDto>
{
    public async Task<Result<ShopReportDto>> Handle(GetShopReportQuery request, CancellationToken cancellationToken)
    {
        var today = RentalMath.IndiaToday();
        var from = request.From ?? new DateOnly(today.Year, today.Month, 1);
        var to = request.To ?? new DateOnly(today.Year, today.Month, DateTime.DaysInMonth(today.Year, today.Month));
        return Result.Success(await desk.Report(request.VendorId, from, to, cancellationToken));
    }
}
