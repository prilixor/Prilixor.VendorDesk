using Prilixor.VendorDesk.Application.Rentals;

namespace Prilixor.VendorDesk.Tests;

public class RentalPhotoRefTests
{
    [Fact]
    public void Decodes_a_png_data_url()
    {
        const string url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        Assert.True(RentalPhotoRef.TryDecode(url, out var photo));
        Assert.Equal("image/png", photo!.ContentType);
        Assert.Equal(".png", photo.Extension);
        Assert.True(photo.Bytes.Length > 0);
    }

    [Fact]
    public void Rejects_other_file_types_and_paths_outside_the_rental_folder()
    {
        Assert.False(RentalPhotoRef.TryDecode("data:image/gif;base64,R0lGODlhAQABAAAAACw=", out _));
        Assert.False(RentalPhotoRef.IsObjectKey("data:image/png;base64,aaaa"));
        Assert.False(RentalPhotoRef.IsObjectKey("vendordesk/../secrets.txt"));
        var key = RentalPhotoRef.ObjectKey(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"), Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), ".jpg");
        Assert.True(RentalPhotoRef.IsObjectKey(key));
        Assert.StartsWith("vendordesk/", key);
        var local = RentalPhotoRef.LocalPath(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"), Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), ".jpg");
        Assert.Equal("/" + local, RentalPhotoRef.BrowserPath(local));
        Assert.False(RentalPhotoRef.IsLocalPath("uploads/vendordesk/../secret.jpg"));
    }
}
