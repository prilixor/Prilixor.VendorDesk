using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Prilixor.VendorDesk.Application.Rentals;

namespace Prilixor.VendorDesk.Infrastructure.Storage;

internal sealed class RentalPhotoStore : IRentalPhotoStore, IDisposable
{
    private readonly IAmazonS3? client;
    private readonly S3StorageOptions options;
    private readonly string? bucket;
    private readonly string contentRoot;

    public RentalPhotoStore(S3StorageOptions options, string contentRoot, bool useS3)
    {
        this.options = options;
        this.contentRoot = contentRoot;
        if (!useS3) return;
        if (string.IsNullOrWhiteSpace(options.BucketName))
            throw new InvalidOperationException("S3 bucket is required.");
        bucket = options.BucketName;
        client = CreateClient(options);
    }

    public bool IsConfigured => true;

    public bool UsesS3 => client is not null;

    public async Task<string?> SaveAsync(Guid vendorId, Guid lineId, string? dataUrl, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dataUrl)) return null;
        if (!RentalPhotoRef.TryDecode(dataUrl, out var photo) || photo is null)
            throw new RentalPhotoException("Use a JPG, PNG or WebP photo under 5 MB.");
        return client is null
            ? await SaveLocalAsync(vendorId, lineId, photo, cancellationToken)
            : await SaveRemoteAsync(vendorId, lineId, photo, cancellationToken);
    }

    public async Task DeleteAsync(IEnumerable<string?> stored, CancellationToken cancellationToken)
    {
        foreach (var value in stored)
        {
            if (RentalPhotoRef.IsLocalPath(value))
            {
                DeleteLocal(value);
                continue;
            }
            if (client is null || bucket is null || !RentalPhotoRef.IsObjectKey(value)) continue;
            try
            {
                await client.DeleteObjectAsync(bucket, FullKey(value!.Trim()), cancellationToken);
            }
            catch (AmazonClientException)
            {
                throw new RentalPhotoException("The rental photos could not be removed. Try the return again.", storageUnavailable: true);
            }
        }
    }

    public string? Display(string? stored)
    {
        if (string.IsNullOrWhiteSpace(stored)) return null;
        if (stored.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return stored;
        if (stored.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || stored.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return stored;
        var local = RentalPhotoRef.BrowserPath(stored);
        if (local is not null) return local;
        if (client is null || bucket is null || !RentalPhotoRef.IsObjectKey(stored)) return null;
        try
        {
            var minutes = Math.Clamp(options.PresignedUrlExpiryMinutes, 1, 10080);
            return client.GetPreSignedURL(new GetPreSignedUrlRequest
            {
                BucketName = bucket,
                Key = FullKey(stored.Trim()),
                Verb = HttpVerb.GET,
                Expires = DateTime.UtcNow.AddMinutes(minutes)
            });
        }
        catch (AmazonClientException)
        {
            return null;
        }
    }

    public void Dispose() => client?.Dispose();

    private async Task<string> SaveLocalAsync(Guid vendorId, Guid lineId, DecodedRentalPhoto photo, CancellationToken cancellationToken)
    {
        var relative = RentalPhotoRef.LocalPath(vendorId, lineId, photo.Extension);
        var full = ResolveLocal(relative) ?? throw new RentalPhotoException("The photo could not be saved. Try again.", storageUnavailable: true);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            await File.WriteAllBytesAsync(full, photo.Bytes, cancellationToken);
            return relative;
        }
        catch (IOException)
        {
            throw new RentalPhotoException("The photo could not be saved. Try again.", storageUnavailable: true);
        }
    }

    private async Task<string> SaveRemoteAsync(Guid vendorId, Guid lineId, DecodedRentalPhoto photo, CancellationToken cancellationToken)
    {
        var relative = RentalPhotoRef.ObjectKey(vendorId, lineId, photo.Extension);
        try
        {
            await using var stream = new MemoryStream(photo.Bytes);
            await client!.PutObjectAsync(new PutObjectRequest
            {
                BucketName = bucket,
                Key = FullKey(relative),
                InputStream = stream,
                ContentType = photo.ContentType,
                ServerSideEncryptionMethod = ServerSideEncryptionMethod.AES256
            }, cancellationToken);
            return relative;
        }
        catch (AmazonClientException)
        {
            throw new RentalPhotoException("The photo could not be saved. Try again.", storageUnavailable: true);
        }
    }

    private void DeleteLocal(string? stored)
    {
        var full = ResolveLocal(stored);
        if (full is null || !File.Exists(full)) return;
        try
        {
            File.Delete(full);
        }
        catch (IOException)
        {
            throw new RentalPhotoException("The rental photos could not be removed. Try the return again.", storageUnavailable: true);
        }
    }

    private string? ResolveLocal(string? stored)
    {
        if (!RentalPhotoRef.IsLocalPath(stored)) return null;
        var relative = stored!.Trim().TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        var root = Path.GetFullPath(Path.Combine(contentRoot, "wwwroot"));
        var full = Path.GetFullPath(Path.Combine(root, relative));
        var prefix = root.EndsWith(Path.DirectorySeparatorChar) ? root : root + Path.DirectorySeparatorChar;
        return full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? full : null;
    }

    private string FullKey(string relative)
    {
        var key = relative.Trim().TrimStart('/');
        if (string.IsNullOrWhiteSpace(options.KeyPrefix)) return key;
        return $"{options.KeyPrefix.Trim().Trim('/')}/{key}";
    }

    private static IAmazonS3 CreateClient(S3StorageOptions options)
    {
        var config = new AmazonS3Config
        {
            RegionEndpoint = RegionEndpoint.GetBySystemName(string.IsNullOrWhiteSpace(options.Region) ? "eu-north-1" : options.Region),
            Timeout = TimeSpan.FromSeconds(20),
            MaxErrorRetry = 1
        };
        if (!string.IsNullOrWhiteSpace(options.AccessKeyId) && !string.IsNullOrWhiteSpace(options.SecretAccessKey))
        {
            if (!string.IsNullOrWhiteSpace(options.SessionToken))
                return new AmazonS3Client(options.AccessKeyId, options.SecretAccessKey, options.SessionToken, config);
            return new AmazonS3Client(options.AccessKeyId, options.SecretAccessKey, config);
        }
        return new AmazonS3Client(config);
    }
}
