namespace Prilixor.VendorDesk.Application.Rentals;

public static class RentalMath
{
    public static readonly int[] Durations = [7, 15, 30];

    public static bool ValidDuration(int days) => days > 0 && days <= 3650;

    public static bool ValidCharges(string discountType, decimal discountValue, decimal taxPercent, decimal additionalFees)
        => discountType is "percent" or "flat"
           && discountValue >= 0 && taxPercent >= 0 && taxPercent <= 100 && additionalFees >= 0
           && (discountType != "percent" || discountValue <= 100);

    public static decimal LineCharge(int quantity, int days, decimal pricePerDay) => quantity * days * pricePerDay;

    public static decimal LineDeposit(int quantity, decimal depositPerUnit) => quantity * depositPerUnit;

    public static RentalTotalsDto Totals(IReadOnlyList<RentalLineInput> lines, string discountType, decimal discountValue, decimal taxPercent, decimal additionalFees)
    {
        var subtotal = lines.Sum(line => LineCharge(line.Quantity, line.Days, line.PricePerDay));
        var rawDiscount = discountType == "percent" ? subtotal * discountValue / 100m : discountValue;
        var discount = decimal.Min(subtotal, decimal.Round(rawDiscount, 0, MidpointRounding.AwayFromZero));
        var taxable = subtotal - discount;
        var tax = decimal.Round((taxable + additionalFees) * taxPercent / 100m, 0, MidpointRounding.AwayFromZero);
        var deposit = lines.Sum(line => LineDeposit(line.Quantity, line.DepositPerUnit));
        var label = discountType == "percent" ? $"Discount ({Trim(discountValue)}%)" : "Discount (flat)";
        return new RentalTotalsDto(subtotal, discount, taxable, tax, deposit, additionalFees, label, taxPercent, taxable + additionalFees + tax + deposit);
    }

    public static string Status(DateOnly today, IEnumerable<DateOnly> endDates, bool returned = false)
    {
        if (returned) return "Returned";
        var dates = endDates.ToList();
        if (dates.Count == 0) return "Active";
        return dates.Min() <= today.AddDays(2) ? "Due soon" : "Active";
    }

    public static DateOnly EndDate(DateOnly start, int days) => start.AddDays(days);

    public static DateOnly IndiaToday()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("India Standard Time");
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone));
    }

    private static string Trim(decimal value) => value.ToString("0.##");
}

public sealed record RentalLineInput(int Quantity, int Days, decimal PricePerDay, decimal DepositPerUnit);

public sealed record RentalTotalsDto(
    decimal Subtotal,
    decimal Discount,
    decimal Taxable,
    decimal Tax,
    decimal Deposit,
    decimal AdditionalFees,
    string DiscountLabel,
    decimal TaxPercent,
    decimal Total);
