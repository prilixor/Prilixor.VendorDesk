using Prilixor.VendorDesk.Application.Rentals;

namespace Prilixor.VendorDesk.Tests;

public class ReportMathTests
{
    private static readonly DateOnly Today = new(2026, 11, 16);
    private static readonly DateOnly From = new(2026, 11, 1);
    private static readonly DateOnly To = new(2026, 11, 30);

    [Fact]
    public void Due_list_orders_late_returns_and_skips_returned_rentals()
    {
        var report = ReportMath.Build(Today, From, To, "GST",
        [
            Open("Later", 4, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 16), 30),
            Open("Soon", 3, new DateOnly(2026, 11, 14), new DateOnly(2026, 11, 14), 4),
            Open("Today", 2, new DateOnly(2026, 11, 9), new DateOnly(2026, 11, 9), 7),
            Open("Overdue", 1, new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 1), 7),
            Returned("Back", 5, new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 1), 7),
            Split()
        ], []);

        Assert.Equal(["Overdue", "Split", "Today", "Soon", "Later"], report.Due.Select(row => row.CustomerName).ToArray());
        Assert.Equal(8, report.Due[0].DaysLate);
        Assert.Equal("Overdue", report.Due[0].Status);
        Assert.Equal(new DateOnly(2026, 11, 15), report.Due[1].ReturnOn);
        Assert.Equal(1, report.Due[1].DaysLate);
        Assert.Equal("Due today", report.Due[2].Status);
        Assert.Equal("Due soon", report.Due[3].Status);
        Assert.Equal("Active", report.Due[4].Status);
        Assert.Equal(2, report.Summary.Overdue);
        Assert.Equal(1, report.Summary.DueToday);
        Assert.Equal(5, report.Summary.Open);
        Assert.DoesNotContain(report.Due, row => row.CustomerName == "Back");
    }

    [Fact]
    public void Revenue_and_gst_follow_the_period_and_deposits_stay_separate()
    {
        var inPeriod = new ReportRental(Guid.NewGuid(), 20, new DateOnly(2026, 11, 15), "Meera", "9876543210", true, "percent", 10, 12, 50,
            [new ReportLine(Guid.NewGuid(), "Walker", 1, 10, new DateOnly(2026, 11, 15), 100, 500)]);
        var openOutside = Open("Ravi", 21, new DateOnly(2026, 10, 31), new DateOnly(2026, 11, 16), 30, deposit: 200);
        var afterPeriod = Returned("Nila", 22, new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 1), 7);

        var report = ReportMath.Build(Today, From, To, "27ABCDE1234F1Z5", [inPeriod, openOutside, afterPeriod], []);

        var revenue = Assert.Single(report.Revenue);
        Assert.Equal(1000, revenue.Subtotal);
        Assert.Equal(100, revenue.Discount);
        Assert.Equal(900, revenue.Taxable);
        Assert.Equal(50, revenue.AdditionalFees);
        Assert.Equal(114, revenue.Tax);
        Assert.Equal(1064, revenue.Billed);
        Assert.Equal(1064, report.Summary.Billed);
        Assert.Equal(114, report.Summary.Tax);

        var gst = Assert.Single(report.Gst);
        Assert.Equal("INV-2026-20", gst.InvoiceNo);
        Assert.Equal(950, gst.Taxable);
        Assert.Equal(12, gst.TaxPercent);
        Assert.Equal(114, gst.Tax);

        var deposit = Assert.Single(report.Deposits);
        Assert.Equal("Ravi", deposit.CustomerName);
        Assert.Equal(200, deposit.Deposit);
        Assert.Equal(200, report.Summary.DepositsHeld);
        Assert.Equal("27ABCDE1234F1Z5", report.Gstin);
    }

    [Fact]
    public void Stock_counts_units_in_the_shop_units_out_and_period_rentals()
    {
        var walker = Guid.NewGuid();
        var idle = Guid.NewGuid();
        var paused = Guid.NewGuid();
        var open = new ReportRental(Guid.NewGuid(), 1, new DateOnly(2026, 11, 2), "Asha", "9876543210", false, "percent", 0, 12, 0,
            [new ReportLine(walker, "Walker", 2, 7, new DateOnly(2026, 11, 2), 100, 0)]);
        var returned = new ReportRental(Guid.NewGuid(), 2, new DateOnly(2026, 11, 3), "Bela", "9876543210", true, "percent", 0, 12, 0,
            [new ReportLine(walker, "Walker", 3, 7, new DateOnly(2026, 11, 3), 100, 0), new ReportLine(paused, "Paused bed", 1, 7, new DateOnly(2026, 11, 3), 80, 0)]);

        var report = ReportMath.Build(Today, From, To, "", [open, returned],
        [
            new ReportStockItem(walker, "Walker", "Mobility", 4, true),
            new ReportStockItem(idle, "Idle chair", "Mobility", 1, true),
            new ReportStockItem(paused, "Paused bed", "Beds", 6, false)
        ]);

        Assert.Equal(2, report.Summary.UnitsOut);
        Assert.Equal(["Walker", "Paused bed", "Idle chair"], report.Stock.Select(row => row.ProductName).ToArray());
        var walkerRow = report.Stock[0];
        Assert.Equal(4, walkerRow.InShop);
        Assert.Equal(2, walkerRow.OutNow);
        Assert.Equal(5, walkerRow.RentedQty);
        Assert.Equal(2, walkerRow.Times);
        Assert.Equal(0, report.Stock[1].OutNow);
        Assert.Equal(1, report.Stock[1].Times);
        Assert.Equal(1, report.Stock[2].InShop);
        Assert.Equal(0, report.Stock[2].Times);
    }

    [Fact]
    public void Report_period_must_be_one_year_or_less()
    {
        var validator = new GetShopReportQueryValidator();
        Assert.True(validator.Validate(new GetShopReportQuery(Guid.NewGuid(), null, null)).IsValid);
        Assert.True(validator.Validate(new GetShopReportQuery(Guid.NewGuid(), new DateOnly(2026, 1, 1), new DateOnly(2027, 1, 1))).IsValid);
        Assert.False(validator.Validate(new GetShopReportQuery(Guid.NewGuid(), new DateOnly(2026, 2, 1), new DateOnly(2026, 1, 1))).IsValid);
        Assert.False(validator.Validate(new GetShopReportQuery(Guid.NewGuid(), new DateOnly(2026, 1, 1), null)).IsValid);
        Assert.False(validator.Validate(new GetShopReportQuery(Guid.NewGuid(), new DateOnly(2026, 1, 1), new DateOnly(2027, 1, 2))).IsValid);
    }

    private static ReportRental Open(string name, int number, DateOnly created, DateOnly start, int days, decimal deposit = 0)
        => new(Guid.NewGuid(), number, created, name, "9876543210", false, "percent", 0, 12, 0, [new ReportLine(Guid.NewGuid(), "Item", 1, days, start, 100, deposit)]);

    private static ReportRental Returned(string name, int number, DateOnly created, DateOnly start, int days)
        => new(Guid.NewGuid(), number, created, name, "9876543210", true, "percent", 0, 12, 0, [new ReportLine(Guid.NewGuid(), "Item", 1, days, start, 100, 300)]);

    private static ReportRental Split()
        => new(Guid.NewGuid(), 6, new DateOnly(2026, 11, 10), "Split", "9876543210", false, "percent", 0, 12, 0,
        [
            new ReportLine(Guid.NewGuid(), "Early", 1, 5, new DateOnly(2026, 11, 10), 100, 0),
            new ReportLine(Guid.NewGuid(), "Late", 1, 30, new DateOnly(2026, 11, 16), 100, 0)
        ]);
}
