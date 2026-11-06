using Microsoft.EntityFrameworkCore;
using Prilixor.VendorDesk.Application.Rentals;
using Prilixor.VendorDesk.Infrastructure.Persistence;

namespace Prilixor.VendorDesk.Infrastructure.Storage;

public static class RentalPhotoMigration
{
    public static async Task MoveActivePhotos(VendorDeskDbContext db, IRentalPhotoStore photos, CancellationToken cancellationToken)
    {
        var changed = await RemoveReturnedPhotos(db, photos, cancellationToken);
        if (!photos.IsConfigured)
        {
            if (changed) await db.SaveChangesAsync(cancellationToken);
            return;
        }
        var rentals = await db.Rentals.Include(rental => rental.Lines)
            .Where(rental => rental.ReturnedOn == null && rental.Lines.Any(line => line.Photo != null && line.Photo.StartsWith("data:image/")))
            .ToListAsync(cancellationToken);
        foreach (var rental in rentals)
        {
            foreach (var line in rental.Lines)
            {
                if (string.IsNullOrWhiteSpace(line.Photo) || !line.Photo.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) continue;
                try
                {
                    var key = await photos.SaveAsync(rental.VendorId, line.Id, line.Photo, cancellationToken);
                    if (string.IsNullOrWhiteSpace(key)) continue;
                    line.Photo = key;
                    changed = true;
                }
                catch (RentalPhotoException ex) when (ex.StorageUnavailable)
                {
                    if (changed) await db.SaveChangesAsync(cancellationToken);
                    return;
                }
                catch (RentalPhotoException)
                {
                }
            }
        }
        if (changed) await db.SaveChangesAsync(cancellationToken);
    }

    private static async Task<bool> RemoveReturnedPhotos(VendorDeskDbContext db, IRentalPhotoStore photos, CancellationToken cancellationToken)
    {
        var returned = await db.Rentals.Include(rental => rental.Lines)
            .Where(rental => rental.ReturnedOn != null && rental.Lines.Any(line => line.Photo != null && line.Photo != ""))
            .ToListAsync(cancellationToken);
        var changed = false;
        foreach (var rental in returned)
        {
            if (photos.IsConfigured)
            {
                try
                {
                    await photos.DeleteAsync(rental.Lines.Select(line => line.Photo), cancellationToken);
                }
                catch (RentalPhotoException ex) when (ex.StorageUnavailable)
                {
                    return changed;
                }
            }
            foreach (var line in rental.Lines)
            {
                if (string.IsNullOrWhiteSpace(line.Photo)) continue;
                if (RentalPhotoRef.IsObjectKey(line.Photo) && !photos.UsesS3) continue;
                line.Photo = null;
                changed = true;
            }
        }
        return changed;
    }
}
