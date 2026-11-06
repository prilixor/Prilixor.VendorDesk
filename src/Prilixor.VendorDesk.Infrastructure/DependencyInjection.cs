using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Prilixor.VendorDesk.Application.Auth;
using Prilixor.VendorDesk.Application.Inventory;
using Prilixor.VendorDesk.Application.Rentals;
using Prilixor.VendorDesk.Domain;
using Prilixor.VendorDesk.Infrastructure.Auth;
using Prilixor.VendorDesk.Infrastructure.Persistence;
using Prilixor.VendorDesk.Infrastructure.Speech;

namespace Prilixor.VendorDesk.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddVendorDeskInfrastructure(this IServiceCollection services, IConfiguration configuration, string contentRoot, bool development)
    {
        var connectionString = configuration.GetConnectionString("VendorDesk");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("Connection string VendorDesk is required.");
        var pepper = configuration["Auth:Pepper"];
        if (string.IsNullOrWhiteSpace(pepper))
            throw new InvalidOperationException("Auth pepper is required.");

        services.AddDbContext<VendorDeskDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<IDeskStore, DeskStore>();
        services.AddScoped<IInventoryReader, InventoryReader>();
        services.AddScoped<IShopDesk, ShopDesk>();
        services.AddSingleton<ITokenHasher>(_ => new TokenHasher(pepper));
        var apiKey = configuration["ShreeSms:ApiKey"];
        var senderId = configuration["ShreeSms:SenderId"];
        var entityId = configuration["ShreeSms:EntityId"];
        var templateId = configuration["ShreeSms:OtpTemplateId"];
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(senderId) || string.IsNullOrWhiteSpace(entityId) || string.IsNullOrWhiteSpace(templateId))
            throw new InvalidOperationException("ShreeSMS login template settings are required.");
        var smsType = int.TryParse(configuration["ShreeSms:OtpSmsType"], out var parsedType) ? parsedType : 4;
        var baseUrl = configuration["ShreeSms:BaseUrl"] ?? "https://web.shreesms.net/API/SendSMS.aspx";
        services.AddSingleton<IOtpSms>(_ => new ShreeSmsOtp(apiKey, senderId, entityId, templateId, smsType, baseUrl));
        if (development) services.AddSingleton<IDevOtpBox, DevOtpBox>();
        else services.AddSingleton<IDevOtpBox, SilentOtpBox>();
        var speechPath = configuration["Speech:CredentialsPath"];
        var speechFile = string.IsNullOrWhiteSpace(speechPath) ? "" : Path.IsPathRooted(speechPath) ? speechPath : Path.Combine(contentRoot, speechPath);
        services.AddSingleton<ISpeechTranscriber>(_ => new GoogleSpeechTranscriber(speechFile));
        return services;
    }

    public static async Task SeedCatalog(this VendorDeskDbContext db, CancellationToken cancellationToken)
    {
        if (await db.CatalogProducts.AnyAsync(cancellationToken)) return;
        var beds = new ProductCategory { Id = Guid.Parse("11111111-1111-1111-1111-111111111111"), Name = "Hospital Beds" };
        var oxygen = new ProductCategory { Id = Guid.Parse("22222222-2222-2222-2222-222222222222"), Name = "Oxygen" };
        var mobility = new ProductCategory { Id = Guid.Parse("33333333-3333-3333-3333-333333333333"), Name = "Mobility" };
        db.ProductCategories.AddRange(beds, oxygen, mobility);
        db.CatalogProducts.AddRange(
            new CatalogProduct { Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"), CategoryId = beds.Id, Name = "Semi Fowler Bed", IsActive = true },
            new CatalogProduct { Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"), CategoryId = beds.Id, Name = "ICU Bed", IsActive = true },
            new CatalogProduct { Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"), CategoryId = oxygen.Id, Name = "Oxygen Concentrator", IsActive = true },
            new CatalogProduct { Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4"), CategoryId = mobility.Id, Name = "Wheelchair", IsActive = true });
        await db.SaveChangesAsync(cancellationToken);
    }
}
