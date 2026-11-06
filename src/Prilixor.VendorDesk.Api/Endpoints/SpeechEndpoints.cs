using FastEndpoints;
using Prilixor.VendorDesk.Infrastructure.Speech;

namespace Prilixor.VendorDesk.Api.Endpoints;

public sealed class TranscribeForm
{
    public IFormFile File { get; set; } = default!;
    public string Kind { get; set; } = "text";
}

public sealed class TranscribeResponse
{
    public string Text { get; set; } = "";
}

public sealed class TranscribeEndpoint(ISpeechTranscriber speech, VendorContext vendor) : Endpoint<TranscribeForm, TranscribeResponse>
{
    public override void Configure()
    {
        Post("/api/speech");
        AllowAnonymous();
        AllowFileUploads();
        Description(b => b.Accepts<TranscribeForm>("multipart/form-data"));
        Summary(s => s.Summary = "Turn a short recording into text with Google speech recognition.");
    }

    public override async Task HandleAsync(TranscribeForm req, CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var kind = req.Kind is "phone" or "email" or "text" ? req.Kind : "";
        if (kind.Length == 0)
        {
            await ApiProblems.Write(HttpContext, 400, "Choose a name, mobile, email, or address field.", ct);
            return;
        }
        if (req.File is null || req.File.Length == 0 || req.File.Length > 1_500_000)
        {
            await ApiProblems.Write(HttpContext, 400, "The recording was empty. Tap the mic and speak again.", ct);
            return;
        }
        await using var stream = req.File.OpenReadStream();
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, ct);
        var result = await speech.TranscribeAsync(buffer.ToArray(), kind, ct);
        if (!result.Ready)
        {
            await ApiProblems.Write(HttpContext, 503, result.Error ?? "Voice recognition is not set up on the server yet.", ct);
            return;
        }
        if (result.Error is not null)
        {
            await ApiProblems.Write(HttpContext, 502, result.Error, ct);
            return;
        }
        await Send.OkAsync(new TranscribeResponse { Text = result.Text }, ct);
    }
}
