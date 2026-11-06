using Microsoft.EntityFrameworkCore;
using Prilixor.VendorDesk.Application.Auth;
using Prilixor.VendorDesk.Domain;

namespace Prilixor.VendorDesk.Infrastructure.Persistence;

public sealed class DeskStore(VendorDeskDbContext db) : IDeskStore
{
    public Task<Vendor?> FindVendorByEmail(string email, CancellationToken cancellationToken)
        => db.Vendors.FirstOrDefaultAsync(vendor => vendor.Email == email, cancellationToken);

    public async Task<IReadOnlyList<Vendor>> FindVendorsByPhone(string phone, CancellationToken cancellationToken)
    {
        var vendors = await db.Vendors.AsNoTracking().ToListAsync(cancellationToken);
        return vendors.Where(vendor => new string(vendor.Phone.Where(char.IsDigit).ToArray()) == phone).ToList();
    }

    public Task<EmailOtp?> LatestOtp(string email, CancellationToken cancellationToken)
        => db.EmailOtps.Where(otp => otp.Email == email).OrderByDescending(otp => otp.CreatedAt).FirstOrDefaultAsync(cancellationToken);

    public Task<EmailOtp?> LatestOtpByPhone(string phone, CancellationToken cancellationToken)
        => db.EmailOtps.Where(otp => otp.Phone == phone).OrderByDescending(otp => otp.CreatedAt).FirstOrDefaultAsync(cancellationToken);

    public void AddOtp(EmailOtp otp) => db.EmailOtps.Add(otp);
    public void RemoveOtp(EmailOtp otp) => db.EmailOtps.Remove(otp);
    public void AddVendor(Vendor vendor) => db.Vendors.Add(vendor);
    public void AddSession(VendorSession session) => db.VendorSessions.Add(session);

    public Task<VendorSession?> FindSession(string tokenHash, CancellationToken cancellationToken)
        => db.VendorSessions.FirstOrDefaultAsync(session => session.TokenHash == tokenHash && session.RevokedAt == null && session.ExpiresAt > DateTimeOffset.UtcNow, cancellationToken);

    public Task<Vendor?> FindVendor(Guid id, CancellationToken cancellationToken)
        => db.Vendors.FirstOrDefaultAsync(vendor => vendor.Id == id, cancellationToken);

    public Task Save(CancellationToken cancellationToken) => db.SaveChangesAsync(cancellationToken);
}
