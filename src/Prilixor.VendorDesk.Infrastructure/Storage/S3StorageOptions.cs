using Microsoft.Extensions.Configuration;

namespace Prilixor.VendorDesk.Infrastructure.Storage;

public sealed class S3StorageOptions
{
    public const string SectionName = "S3Storage";

    public bool Enabled { get; init; }

    public string? BucketName { get; init; }

    public string Region { get; init; } = "eu-north-1";

    public string? KeyPrefix { get; init; }

    public int PresignedUrlExpiryMinutes { get; init; } = 120;

    public string? AccessKeyId { get; init; }

    public string? SecretAccessKey { get; init; }

    public string? SessionToken { get; init; }

    public static S3StorageOptions Read(IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);
        return new S3StorageOptions
        {
            Enabled = bool.TryParse(section["Enabled"], out var enabled) && enabled,
            BucketName = section["BucketName"],
            Region = string.IsNullOrWhiteSpace(section["Region"]) ? "eu-north-1" : section["Region"]!,
            KeyPrefix = section["KeyPrefix"],
            PresignedUrlExpiryMinutes = int.TryParse(section["PresignedUrlExpiryMinutes"], out var minutes) ? minutes : 120,
            AccessKeyId = section["AccessKeyId"],
            SecretAccessKey = section["SecretAccessKey"],
            SessionToken = section["SessionToken"]
        };
    }
}
