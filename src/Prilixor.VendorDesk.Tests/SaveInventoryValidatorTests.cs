using Prilixor.VendorDesk.Application.Inventory;

namespace Prilixor.VendorDesk.Tests;

public class SaveInventoryValidatorTests
{
    private readonly SaveInventoryCommandValidator validator = new();

    [Fact]
    public void Accepts_a_price_and_quantity()
    {
        var result = validator.Validate(new SaveInventoryCommand(Guid.NewGuid(), Guid.NewGuid(), 450, 3, 1000, true));
        Assert.True(result.IsValid);
    }

    [Fact]
    public void Rejects_a_negative_quantity()
    {
        var result = validator.Validate(new SaveInventoryCommand(Guid.NewGuid(), Guid.NewGuid(), 450, -1, 0, true));
        Assert.False(result.IsValid);
    }

    [Fact]
    public void Rejects_a_missing_product()
    {
        var result = validator.Validate(new SaveInventoryCommand(Guid.NewGuid(), Guid.Empty, 450, 1, 0, true));
        Assert.False(result.IsValid);
    }
}
