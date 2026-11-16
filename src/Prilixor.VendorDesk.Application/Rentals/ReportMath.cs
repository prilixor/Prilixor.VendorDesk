namespace Prilixor.VendorDesk.Application.Rentals;

public sealed record ReportLine(Guid ProductId, string Name, int Quantity, int Days, DateOnly StartDate, decimal PricePerDay, decimal DepositPerUnit);

public sealed record ReportRental(
    Guid Id,
    int Number,
    DateOnly CreatedOn,
    string CustomerName,
    string CustomerMobile,
    bool Returned,
    string DiscountType,
    decimal DiscountValue,
    decimal TaxPercent,
    decimal AdditionalFees,
    IReadOnlyList<ReportLine> Lines);

public sealed record ReportStockItem(Guid ProductId, string ProductName, string CategoryName, int InShop, bool Offered);

public sealed record ReportSummaryDto(int Overdue, int DueToday, int Open, decimal Taxable, decimal Tax, decimal Billed, decimal DepositsHeld, int UnitsOut);

public sealed record DueReportRowDto(Guid Id, string Number, string CustomerName, string CustomerMobile, IReadOnlyList<string> ItemNames, int Units, DateOnly ReturnOn, int DaysLate, string Status);

public sealed record RevenueReportRowDto(Guid Id, string Number, DateOnly CreatedOn, string CustomerName, decimal Subtotal, decimal Discount, decimal Taxable, decimal Tax, decimal AdditionalFees, decimal Billed);

public sealed record GstReportRowDto(Guid Id, string Number, string InvoiceNo, DateOnly CreatedOn, string CustomerName, decimal Taxable, decimal TaxPercent, decimal Tax);

public sealed record DepositReportRowDto(Guid Id, string Number, string CustomerName, string CustomerMobile, IReadOnlyList<string> ItemNames, int Units, DateOnly ReturnOn, decimal Deposit);

public sealed record StockReportRowDto(Guid ProductId, string ProductName, string CategoryName, int InShop, int OutNow, int RentedQty, int Times);

public sealed record ShopReportDto(
    DateOnly From,
    DateOnly To,
    DateOnly AsOf,
    string Gstin,
    ReportSummaryDto Summary,
    IReadOnlyList<DueReportRowDto> Due,
    IReadOnlyList<RevenueReportRowDto> Revenue,
    IReadOnlyList<GstReportRowDto> Gst,
    IReadOnlyList<DepositReportRowDto> Deposits,
    IReadOnlyList<StockReportRowDto> Stock);

public static class ReportMath
{
    public static ShopReportDto Build(DateOnly today, DateOnly from, DateOnly to, string gstin, IReadOnlyList<ReportRental> rentals, IReadOnlyList<ReportStockItem> stock)
    {
        var due = new List<DueReportRowDto>();
        var revenue = new List<(int Number, RevenueReportRowDto Row)>();
        var gst = new List<(int Number, GstReportRowDto Row)>();
        var deposits = new List<DepositReportRowDto>();
        var outNow = new Dictionary<Guid, int>();
        var rentedQty = new Dictionary<Guid, int>();
        var times = new Dictionary<Guid, int>();
        var lineNames = new Dictionary<Guid, string>();

        foreach (var rental in rentals)
        {
            var inputs = rental.Lines.Select(line => new RentalLineInput(line.Quantity, line.Days, line.PricePerDay, line.DepositPerUnit)).ToList();
            var totals = RentalMath.Totals(inputs, rental.DiscountType, rental.DiscountValue, rental.TaxPercent, rental.AdditionalFees);
            var inPeriod = rental.CreatedOn >= from && rental.CreatedOn <= to;
            if (inPeriod)
            {
                var label = Label(rental.Number);
                revenue.Add((rental.Number, new RevenueReportRowDto(rental.Id, label, rental.CreatedOn, rental.CustomerName, totals.Subtotal, totals.Discount, totals.Taxable, totals.Tax, totals.AdditionalFees, Billed(totals))));
                gst.Add((rental.Number, new GstReportRowDto(rental.Id, label, $"INV-{rental.CreatedOn.Year}-{rental.Number}", rental.CreatedOn, rental.CustomerName, totals.Taxable + totals.AdditionalFees, rental.TaxPercent, totals.Tax)));
                foreach (var line in rental.Lines)
                {
                    rentedQty[line.ProductId] = rentedQty.GetValueOrDefault(line.ProductId) + line.Quantity;
                    times[line.ProductId] = times.GetValueOrDefault(line.ProductId) + 1;
                    lineNames[line.ProductId] = line.Name;
                }
            }

            if (rental.Returned || rental.Lines.Count == 0) continue;
            var returnOn = rental.Lines.Select(line => RentalMath.EndDate(line.StartDate, line.Days)).Min();
            var units = rental.Lines.Sum(line => line.Quantity);
            var itemNames = rental.Lines.Select(line => line.Name).ToList();
            due.Add(new DueReportRowDto(rental.Id, Label(rental.Number), rental.CustomerName, rental.CustomerMobile, itemNames, units, returnOn, DaysLate(today, returnOn), OpenStatus(today, returnOn)));
            if (totals.Deposit > 0)
                deposits.Add(new DepositReportRowDto(rental.Id, Label(rental.Number), rental.CustomerName, rental.CustomerMobile, itemNames, units, returnOn, totals.Deposit));
            foreach (var line in rental.Lines)
            {
                outNow[line.ProductId] = outNow.GetValueOrDefault(line.ProductId) + line.Quantity;
                lineNames[line.ProductId] = line.Name;
            }
        }

        due.Sort(CompareDue);
        revenue.Sort(CompareRecent);
        gst.Sort(CompareRecent);
        deposits.Sort((left, right) =>
        {
            var amount = right.Deposit.CompareTo(left.Deposit);
            return amount != 0 ? amount : string.Compare(left.Number, right.Number, StringComparison.Ordinal);
        });

        var seen = new HashSet<Guid>();
        var stockRows = new List<StockReportRowDto>();
        foreach (var item in stock)
        {
            seen.Add(item.ProductId);
            var row = StockRow(item.ProductId, item.ProductName, item.CategoryName, item.InShop, item.Offered, outNow, rentedQty, times);
            if (row is not null) stockRows.Add(row);
        }
        foreach (var productId in lineNames.Keys)
        {
            if (!seen.Add(productId)) continue;
            var row = StockRow(productId, lineNames[productId], "", 0, false, outNow, rentedQty, times);
            if (row is not null) stockRows.Add(row);
        }
        stockRows.Sort((left, right) =>
        {
            var outCompare = right.OutNow.CompareTo(left.OutNow);
            if (outCompare != 0) return outCompare;
            var timesCompare = right.Times.CompareTo(left.Times);
            return timesCompare != 0 ? timesCompare : string.Compare(left.ProductName, right.ProductName, StringComparison.OrdinalIgnoreCase);
        });

        var summary = new ReportSummaryDto(
            due.Count(row => row.Status == "Overdue"),
            due.Count(row => row.Status == "Due today"),
            due.Count,
            revenue.Sum(row => row.Row.Taxable),
            revenue.Sum(row => row.Row.Tax),
            revenue.Sum(row => row.Row.Billed),
            deposits.Sum(row => row.Deposit),
            due.Sum(row => row.Units));

        return new ShopReportDto(from, to, today, gstin, summary, due, revenue.Select(row => row.Row).ToList(), gst.Select(row => row.Row).ToList(), deposits, stockRows);
    }

    public static string OpenStatus(DateOnly today, DateOnly returnOn)
    {
        if (returnOn < today) return "Overdue";
        if (returnOn == today) return "Due today";
        return returnOn <= today.AddDays(2) ? "Due soon" : "Active";
    }

    public static int DaysLate(DateOnly today, DateOnly returnOn)
        => returnOn < today ? today.DayNumber - returnOn.DayNumber : 0;

    private static string Label(int number) => $"RNT-{number}";

    private static decimal Billed(RentalTotalsDto totals) => totals.Taxable + totals.AdditionalFees + totals.Tax;

    private static int CompareDue(DueReportRowDto left, DueReportRowDto right)
    {
        var rank = Rank(left.Status).CompareTo(Rank(right.Status));
        if (rank != 0) return rank;
        var late = right.DaysLate.CompareTo(left.DaysLate);
        return late != 0 ? late : left.ReturnOn.CompareTo(right.ReturnOn);
    }

    private static int CompareRecent<T>( (int Number, T Row) left, (int Number, T Row) right)
    {
        var created = CreatedOn(right.Row).CompareTo(CreatedOn(left.Row));
        return created != 0 ? created : right.Number.CompareTo(left.Number);
    }

    private static DateOnly CreatedOn<T>(T row) => row switch
    {
        RevenueReportRowDto revenue => revenue.CreatedOn,
        GstReportRowDto gst => gst.CreatedOn,
        _ => throw new InvalidOperationException()
    };

    private static int Rank(string status) => status switch
    {
        "Overdue" => 0,
        "Due today" => 1,
        "Due soon" => 2,
        _ => 3
    };

    private static StockReportRowDto? StockRow(
        Guid productId,
        string name,
        string category,
        int inShop,
        bool offered,
        Dictionary<Guid, int> outNow,
        Dictionary<Guid, int> rentedQty,
        Dictionary<Guid, int> times)
    {
        var outQty = outNow.GetValueOrDefault(productId);
        var qty = rentedQty.GetValueOrDefault(productId);
        var count = times.GetValueOrDefault(productId);
        if (!offered && outQty == 0 && count == 0) return null;
        return new StockReportRowDto(productId, name, category, inShop, outQty, qty, count);
    }
}
