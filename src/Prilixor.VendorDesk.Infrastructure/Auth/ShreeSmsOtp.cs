using Prilixor.VendorDesk.Application.Auth;

namespace Prilixor.VendorDesk.Infrastructure.Auth;

/// <summary>
/// DLT-approved ShreeSMS login text. Only the code may change.
/// </summary>
public static class ShreeSmsLoginTemplate
{
    public const string Body = "Your BlinksMed login OTP is {#var#}. Do not share this code with anyone. Valid for 10 minutes. - BlinksMed";

    public static string WithCode(string code) => Body.Replace("{#var#}", code, StringComparison.Ordinal);
}

public sealed class ShreeSmsOtp(string apiKey, string senderId, string entityId, string templateId, int smsType, string baseUrl) : IOtpSms
{
    private static readonly HttpClient Client = new() { Timeout = TimeSpan.FromSeconds(20) };

    public async Task Send(string mobile, string code, CancellationToken cancellationToken)
    {
        var pairs = new Dictionary<string, string>
        {
            ["APIkey"] = apiKey,
            ["SenderID"] = senderId,
            ["SMSType"] = smsType.ToString(),
            ["Mobile"] = mobile,
            ["MsgText"] = ShreeSmsLoginTemplate.WithCode(code),
            ["EntityID"] = entityId,
            ["TemplateID"] = templateId
        };
        var query = string.Join("&", pairs.Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value)}"));
        var url = baseUrl.Contains('?') ? $"{baseUrl}&{query}" : $"{baseUrl}?{query}";
        using var response = await Client.PostAsync(url, new FormUrlEncodedContent([]), cancellationToken);
        var raw = (await response.Content.ReadAsStringAsync(cancellationToken)).Trim();
        if (!raw.StartsWith("ok|", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The text message was not accepted.");
    }
}
