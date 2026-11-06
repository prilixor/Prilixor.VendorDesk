namespace Prilixor.VendorDesk.Application.Rentals;

public sealed record DecodedRentalPhoto(byte[] Bytes, string ContentType, string Extension);

public static class RentalPhotoRef
{
    public const string Root = "vendordesk";
    public const int MaxBytes = 5_000_000;

    public static bool IsObjectKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var key = value.Trim();
        if (!key.StartsWith($"{Root}/", StringComparison.Ordinal)) return false;
        if (key.Contains("..", StringComparison.Ordinal) || key.Contains('\\') || key.Contains("://", StringComparison.Ordinal)) return false;
        return true;
    }

    public static string ObjectKey(Guid vendorId, Guid lineId, string extension)
        => $"{Root}/{vendorId:D}/rentals/{lineId:D}{extension}";

    public static string LocalPath(Guid vendorId, Guid lineId, string extension)
        => $"uploads/{Root}/{vendorId:D}/rentals/{lineId:D}{extension}";

    public static bool IsLocalPath(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var path = value.Trim().TrimStart('/');
        if (!path.StartsWith($"uploads/{Root}/", StringComparison.Ordinal)) return false;
        if (path.Contains("..", StringComparison.Ordinal) || path.Contains('\\') || path.Contains("://", StringComparison.Ordinal)) return false;
        return true;
    }

    public static string? BrowserPath(string? stored)
        => IsLocalPath(stored) ? "/" + stored!.Trim().TrimStart('/') : null;

    public static bool TryDecode(string? dataUrl, out DecodedRentalPhoto? photo)
    {
        photo = null;
        if (string.IsNullOrWhiteSpace(dataUrl)) return false;
        var comma = dataUrl.IndexOf(',');
        if (comma < 5 || !dataUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return false;
        var header = dataUrl[..comma];
        var mimeEnd = header.IndexOf(';');
        if (mimeEnd < 0 || !header.Contains(";base64", StringComparison.OrdinalIgnoreCase)) return false;
        var mime = header[5..mimeEnd].ToLowerInvariant();
        var extension = mime switch
        {
            "image/jpeg" or "image/jpg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => ""
        };
        if (extension.Length == 0) return false;
        try
        {
            var bytes = Convert.FromBase64String(dataUrl[(comma + 1)..]);
            if (bytes.Length == 0 || bytes.Length > MaxBytes) return false;
            photo = new DecodedRentalPhoto(bytes, mime == "image/jpg" ? "image/jpeg" : mime, extension);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public interface IRentalPhotoStore
{
    bool IsConfigured { get; }

    bool UsesS3 { get; }

    Task<string?> SaveAsync(Guid vendorId, Guid lineId, string? dataUrl, CancellationToken cancellationToken);

    Task DeleteAsync(IEnumerable<string?> stored, CancellationToken cancellationToken);

    string? Display(string? stored);
}

public sealed class RentalPhotoException(string message, bool storageUnavailable = false) : Exception(message)
{
    public bool StorageUnavailable { get; } = storageUnavailable;
}
