using System.Text;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Speech.V1;
using Grpc.Core;

namespace Prilixor.VendorDesk.Infrastructure.Speech;

public sealed record SpeechTranscript(bool Ready, string Text, string? Error);

public interface ISpeechTranscriber
{
    Task<SpeechTranscript> TranscribeAsync(byte[] audio, string kind, CancellationToken cancellationToken);
}

public sealed class GoogleSpeechTranscriber(string credentialsPath) : ISpeechTranscriber
{
    private SpeechClient? client;

    public async Task<SpeechTranscript> TranscribeAsync(byte[] audio, string kind, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(credentialsPath) || !File.Exists(credentialsPath))
            return new SpeechTranscript(false, "", "Voice recognition is not set up on the server yet.");
        var clip = WavPcm.Extract(audio);
        if (clip.Pcm.Length < clip.SampleRate * 2 / 4)
            return new SpeechTranscript(true, "", null);
        SpeechClient speech;
        try
        {
            speech = Client();
        }
        catch (Exception)
        {
            return new SpeechTranscript(false, "", "Voice recognition is not set up on the server yet.");
        }
        try
        {
            var response = await speech.RecognizeAsync(Config(kind, clip.SampleRate), RecognitionAudio.FromBytes(clip.Pcm), cancellationToken);
            var text = string.Join(' ', response.Results.Select(result => Choose(result, kind)).Where(line => line.Length > 0)).Trim();
            return new SpeechTranscript(true, text, null);
        }
        catch (RpcException ex) when (ex.StatusCode is StatusCode.Unauthenticated or StatusCode.PermissionDenied)
        {
            return new SpeechTranscript(false, "", "Voice recognition is not set up on the server yet.");
        }
        catch (RpcException)
        {
            return new SpeechTranscript(true, "", "Voice recognition could not hear that. Tap the mic and speak again.");
        }
    }

    private SpeechClient Client()
    {
        if (client is not null) return client;
        client = new SpeechClientBuilder { GoogleCredential = GoogleCredential.FromFile(credentialsPath) }.Build();
        return client;
    }

    private static RecognitionConfig Config(string kind, int sampleRate)
    {
        var config = new RecognitionConfig
        {
            Encoding = RecognitionConfig.Types.AudioEncoding.Linear16,
            SampleRateHertz = sampleRate,
            LanguageCode = "en-IN",
            Model = "latest_short",
            MaxAlternatives = 3,
            EnableAutomaticPunctuation = kind == "text"
        };
        var phrases = kind switch
        {
            "phone" => new[] { "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "double", "triple" },
            "email" => new[] { "at", "dot", "gmail", "yahoo", "hotmail", "outlook", "rediffmail", "dot com", "dot co dot in" },
            _ => Array.Empty<string>()
        };
        if (phrases.Length > 0)
        {
            var context = new SpeechContext { Boost = 15 };
            context.Phrases.AddRange(phrases);
            config.SpeechContexts.Add(context);
        }
        return config;
    }

    private static string Choose(SpeechRecognitionResult result, string kind)
    {
        SpeechRecognitionAlternative? best = null;
        var bestScore = float.MinValue;
        foreach (var alternative in result.Alternatives)
        {
            var text = alternative.Transcript ?? "";
            var score = alternative.Confidence;
            if (kind == "email")
            {
                if (text.Contains('@') || text.Contains("gmail", StringComparison.OrdinalIgnoreCase)) score += 0.4f;
                if (text.Contains(" at ", StringComparison.OrdinalIgnoreCase) || text.Contains(" dot ", StringComparison.OrdinalIgnoreCase)) score += 0.3f;
            }
            if (kind == "phone") score += Math.Min(text.Count(char.IsDigit), 10) / 40f;
            if (score > bestScore)
            {
                bestScore = score;
                best = alternative;
            }
        }
        return (best?.Transcript ?? "").Trim();
    }
}

static class WavPcm
{
    public readonly record struct Clip(byte[] Pcm, int SampleRate);

    public static Clip Extract(byte[] audio)
    {
        if (audio.Length < 12 || Encoding.ASCII.GetString(audio, 0, 4) != "RIFF")
            return new Clip(audio, 16000);
        var sampleRate = 16000;
        var index = 12;
        while (index + 8 <= audio.Length)
        {
            var id = Encoding.ASCII.GetString(audio, index, 4);
            var size = BitConverter.ToInt32(audio, index + 4);
            if (size < 0 || index + 8 + size > audio.Length) break;
            if (id == "fmt " && size >= 16)
                sampleRate = BitConverter.ToInt32(audio, index + 12);
            if (id == "data")
                return new Clip(audio[(index + 8)..(index + 8 + size)], sampleRate is >= 8000 and <= 48000 ? sampleRate : 16000);
            index += 8 + size + (size % 2);
        }
        return new Clip(audio.Length > 44 ? audio[44..] : audio, sampleRate);
    }
}
