using Prilixor.VendorDesk.Domain;

namespace Prilixor.VendorDesk.Application.Auth;

public interface IDeskStore
{
    Task<Vendor?> FindVendorByEmail(string email, CancellationToken cancellationToken);
    Task<IReadOnlyList<Vendor>> FindVendorsByPhone(string phone, CancellationToken cancellationToken);
    Task<EmailOtp?> LatestOtp(string email, CancellationToken cancellationToken);
    Task<EmailOtp?> LatestOtpByPhone(string phone, CancellationToken cancellationToken);
    void AddOtp(EmailOtp otp);
    void RemoveOtp(EmailOtp otp);
    void AddVendor(Vendor vendor);
    void AddSession(VendorSession session);
    Task<VendorSession?> FindSession(string tokenHash, CancellationToken cancellationToken);
    Task<Vendor?> FindVendor(Guid id, CancellationToken cancellationToken);
    Task Save(CancellationToken cancellationToken);
}

public interface IOtpSms
{
    Task Send(string mobile, string code, CancellationToken cancellationToken);
}

public interface IDevOtpBox
{
    void Remember(string email, string code);
    string? Peek(string email);
}

public interface ITokenHasher
{
    string Hash(string value);
    string NewToken();
    string NewCode();
}
