using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Prilixor.VendorDesk.Infrastructure.Persistence;

public sealed class VendorDeskDbContextFactory : IDesignTimeDbContextFactory<VendorDeskDbContext>
{
    public VendorDeskDbContext CreateDbContext(string[] args)
    {
        var apiPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "src", "Prilixor.VendorDesk.Api"));
        if (!File.Exists(Path.Combine(apiPath, "appsettings.json")))
            apiPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "Prilixor.VendorDesk.Api"));
        var configuration = new ConfigurationBuilder()
            .SetBasePath(apiPath)
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .Build();
        var options = new DbContextOptionsBuilder<VendorDeskDbContext>().UseNpgsql(configuration.GetConnectionString("VendorDesk")).Options;
        return new VendorDeskDbContext(options);
    }
}
