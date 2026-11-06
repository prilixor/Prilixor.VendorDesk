using FastEndpoints;
using MediatR;
using Prilixor.VendorDesk.Application.Abstractions;
using Prilixor.VendorDesk.Application.Inventory;
using Prilixor.VendorDesk.Api;

namespace Prilixor.VendorDesk.Api.Endpoints;

public sealed class CatalogEndpoint(IMediator mediator, VendorContext vendor) : EndpointWithoutRequest<IReadOnlyList<CatalogProductDto>>
{
    public override void Configure()
    {
        Get("/api/catalog");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new GetCatalogQuery(), ct);
        await Send.OkAsync(result.Value, ct);
    }
}

public sealed class InventoryEndpoint(IMediator mediator, VendorContext vendor) : EndpointWithoutRequest<IReadOnlyList<InventoryRowDto>>
{
    public override void Configure()
    {
        Get("/api/inventory");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new GetInventoryQuery(vendor.VendorId.Value), ct);
        await Send.OkAsync(result.Value, ct);
    }
}

public sealed class SaveInventoryRequest
{
    public Guid ProductId { get; set; }
    public decimal PricePerDay { get; set; }
    public int Quantity { get; set; }
    public decimal Deposit { get; set; }
    public bool IsActive { get; set; }
}

public sealed class SaveInventoryEndpoint(IMediator mediator, VendorContext vendor) : Endpoint<SaveInventoryRequest, InventoryRowDto>
{
    public override void Configure()
    {
        Put("/api/inventory");
        AllowAnonymous();
    }

    public override async Task HandleAsync(SaveInventoryRequest req, CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new SaveInventoryCommand(vendor.VendorId.Value, req.ProductId, req.PricePerDay, req.Quantity, req.Deposit, req.IsActive), ct);
        if (result.IsFailure)
        {
            await ApiProblems.Write(HttpContext, result.Errors[0], ct);
            return;
        }
        await Send.OkAsync(result.Value, ct);
    }
}

public sealed class ImportCatalogForm
{
    public IFormFile File { get; set; } = default!;
}

public sealed class ImportCatalogEndpoint(IMediator mediator, VendorContext vendor) : Endpoint<ImportCatalogForm, CatalogImportResult>
{
    public override void Configure()
    {
        Post("/api/catalog/import");
        AllowAnonymous();
        AllowFileUploads();
        Description(b => b.Accepts<ImportCatalogForm>("multipart/form-data"));
        Summary(s =>
        {
            s.Summary = "Store categories and product names from an Excel file.";
            s.Description = "Choose an .xlsx file. The first row needs Category and Product name (or Equipment). A Variant / type column is stored with the product name.";
        });
    }

    public override async Task HandleAsync(ImportCatalogForm req, CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var file = req.File;
        if (file is null || file.Length == 0)
        {
            await ApiProblems.Write(HttpContext, 400, "Choose an Excel .xlsx file.", ct);
            return;
        }
        if (file.Length > 2 * 1024 * 1024 || !file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            await ApiProblems.Write(HttpContext, 400, "Use an Excel .xlsx file up to 2 MB.", ct);
            return;
        }
        await using var stream = file.OpenReadStream();
        var sheet = CatalogWorkbook.Read(stream);
        if (sheet.Error is not null)
        {
            await ApiProblems.Write(HttpContext, 400, sheet.Error, ct);
            return;
        }
        var result = await mediator.Send(new ImportCatalogCommand(sheet.Rows), ct);
        await Send.OkAsync(result.Value, ct);
    }
}

public sealed class DownloadCatalogRequest
{
    public bool WithData { get; set; }
}

public sealed class DownloadCatalogEndpoint(IMediator mediator, VendorContext vendor) : Endpoint<DownloadCatalogRequest>
{
    public override void Configure()
    {
        Get("/api/catalog/excel");
        AllowAnonymous();
        Summary(s =>
        {
            s.Summary = "Download the Excel file for a catalog upload.";
            s.Description = "withData=false returns the three column headings only. withData=true fills Category, Equipment, and Variant / type from the stored catalog.";
            s.Params["withData"] = "true includes the stored products. false returns an empty template.";
        });
    }

    public override async Task HandleAsync(DownloadCatalogRequest req, CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var products = Array.Empty<CatalogProductDto>();
        if (req.WithData)
        {
            var result = await mediator.Send(new GetCatalogQuery(), ct);
            products = result.Value.ToArray();
        }
        var bytes = CatalogWorkbook.Write(products);
        var fileName = req.WithData ? "catalog.xlsx" : "catalog-template.xlsx";
        await Send.ResultAsync(Results.File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName));
    }
}

public sealed class VendorContext
{
    public Guid? VendorId { get; set; }
}

internal static class ApiProblems
{
    public static Task Write(HttpContext http, Error error, CancellationToken cancellationToken)
    {
        var status = error.Category switch
        {
            ErrorCategory.NotFound => 404,
            ErrorCategory.Unauthorized => 401,
            ErrorCategory.Forbidden => 403,
            ErrorCategory.Conflict => 409,
            _ => 400
        };
        return Write(http, status, error.Description ?? "The request could not be completed.", cancellationToken);
    }

    public static Task Write(HttpContext http, int status, string message, CancellationToken cancellationToken)
    {
        http.Response.StatusCode = status;
        return http.Response.WriteAsJsonAsync(new { error = message }, cancellationToken);
    }
}
