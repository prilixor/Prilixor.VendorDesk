using Prilixor.VendorDesk.Application.Rentals;

namespace Prilixor.VendorDesk.Tests;

public class RentalMathTests
{
    [Fact]
    public void Totals_discount_gst_then_add_the_deposit()
    {
        var totals = RentalMath.Totals([new RentalLineInput(1, 30, 150, 3000)], "percent", 5, 12, 0);
        Assert.Equal(4500, totals.Subtotal);
        Assert.Equal(225, totals.Discount);
        Assert.Equal(513, totals.Tax);
        Assert.Equal(3000, totals.Deposit);
        Assert.Equal(7788, totals.Total);
    }

    [Fact]
    public void Due_soon_when_the_return_is_within_two_days()
    {
        var today = new DateOnly(2026, 11, 5);
        Assert.Equal("Due soon", RentalMath.Status(today, [new DateOnly(2026, 11, 6)]));
        Assert.Equal("Active", RentalMath.Status(today, [new DateOnly(2026, 12, 3)]));
        Assert.Equal("Returned", RentalMath.Status(today, [new DateOnly(2026, 12, 3)], returned: true));
    }
}
