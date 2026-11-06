using System.Net;
using FastEndpoints;
using FastEndpoints.Swagger;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Prilixor.VendorDesk.Api.Endpoints;
using Prilixor.VendorDesk.Application;
using Prilixor.VendorDesk.Application.Auth;
using Prilixor.VendorDesk.Infrastructure;
using Prilixor.VendorDesk.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddVendorDeskApplication();
builder.Services.AddVendorDeskInfrastructure(builder.Configuration, builder.Environment.ContentRootPath, builder.Environment.IsDevelopment());
builder.Services.AddScoped<VendorContext>();
builder.Services.AddFastEndpoints().SwaggerDocument(options =>
{
    options.DocumentSettings = settings => settings.Title = "Vendor Desk";
});
builder.Services.AddCors(options => options.AddPolicy("web", policy =>
    policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// Nginx on the BlinksMed server terminates HTTPS and proxies HTTP to this API.
// Trust only loopback, and run this before the session cookie is written.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownProxies.Add(IPAddress.Loopback);
    options.KnownProxies.Add(IPAddress.IPv6Loopback);
});

var app = builder.Build();
app.UseForwardedHeaders();
app.UseCors("web");
app.Use(async (context, next) =>
{
    if (context.Request.Cookies.TryGetValue(SessionCookies.Name, out var token) && !string.IsNullOrWhiteSpace(token))
    {
        var hasher = context.RequestServices.GetRequiredService<ITokenHasher>();
        var store = context.RequestServices.GetRequiredService<IDeskStore>();
        var session = await store.FindSession(hasher.Hash(token), context.RequestAborted);
        if (session is not null)
            context.RequestServices.GetRequiredService<VendorContext>().VendorId = session.VendorId;
    }
    await next();
});
var endpoints = app.UseFastEndpoints();
if (app.Environment.IsDevelopment())
{
    endpoints.UseSwaggerGen();
    app.MapGet("/swagger/index", () => Results.Redirect("/swagger/index.html"));
}
app.MapGet("/api/health", async (VendorDeskDbContext db, CancellationToken cancellationToken) =>
    await db.Database.CanConnectAsync(cancellationToken) ? Results.Ok(new { ok = true }) : Results.Json(new { error = "Database is unavailable." }, statusCode: 503));

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<VendorDeskDbContext>();
    await db.Database.MigrateAsync();
    await db.SeedCatalog(CancellationToken.None);
}

app.Run();
