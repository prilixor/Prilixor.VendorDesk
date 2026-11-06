using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Prilixor.VendorDesk.Application.Auth;

namespace Prilixor.VendorDesk.Infrastructure.Auth;

public sealed class TokenHasher(string pepper) : ITokenHasher
{
    public string Hash(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(pepper + ":" + value));
        return Convert.ToHexString(bytes);
    }

    public string NewToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public string NewCode() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("000000");
}

public sealed class DevOtpBox : IDevOtpBox
{
    private readonly ConcurrentDictionary<string, string> codes = new(StringComparer.OrdinalIgnoreCase);
    public void Remember(string email, string code) => codes[email] = code;
    public string? Peek(string email) => codes.TryGetValue(email, out var code) ? code : null;
}

public sealed class SilentOtpBox : IDevOtpBox
{
    public void Remember(string email, string code) { }
    public string? Peek(string email) => null;
}
