using FastEndpoints;
using MediatR;
using Prilixor.VendorDesk.Application.Abstractions;
using Prilixor.VendorDesk.Application.Auth;

namespace Prilixor.VendorDesk.Api.Endpoints;

public sealed class RequestOtpRequest
{
    public string Email { get; set; } = "";
    public string Purpose { get; set; } = "";
    public string? BusinessName { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
}

public sealed class RequestOtpResponse
{
    public string Email { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
}

public sealed class RequestOtpEndpoint(IMediator mediator) : Endpoint<RequestOtpRequest, RequestOtpResponse>
{
    public override void Configure()
    {
        Post("/api/auth/otp");
        AllowAnonymous();
    }

    public override async Task HandleAsync(RequestOtpRequest req, CancellationToken ct)
    {
        var result = await mediator.Send(new RequestOtpCommand(req.Email, req.Purpose, req.BusinessName, req.Phone, req.Address), ct);
        if (result.IsFailure)
        {
            await ApiProblems.Write(HttpContext, result.Errors[0], ct);
            return;
        }
        await Send.OkAsync(new RequestOtpResponse
        {
            Email = result.Value.Email,
            ExpiresAt = result.Value.ExpiresAt
        }, ct);
    }

}

public sealed class VerifyOtpRequest
{
    public string Phone { get; set; } = "";
    public string Code { get; set; } = "";
    public string Purpose { get; set; } = "";
}

public sealed class VerifyOtpEndpoint(IMediator mediator) : Endpoint<VerifyOtpRequest, VendorProfile>
{
    public override void Configure()
    {
        Post("/api/auth/verify");
        AllowAnonymous();
    }

    public override async Task HandleAsync(VerifyOtpRequest req, CancellationToken ct)
    {
        var result = await mediator.Send(new VerifyOtpCommand(req.Phone, req.Code, req.Purpose), ct);
        if (result.IsFailure)
        {
            await ApiProblems.Write(HttpContext, result.Errors[0], ct);
            return;
        }
        HttpContext.Response.Cookies.Append(SessionCookies.Name, result.Value.SessionToken, SessionCookies.Options(HttpContext.Request));
        await Send.OkAsync(result.Value.Profile, ct);
    }
}

public sealed class SignOutEndpoint(IMediator mediator) : EndpointWithoutRequest
{
    public override void Configure()
    {
        Post("/api/auth/logout");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Request.Cookies.TryGetValue(SessionCookies.Name, out var token);
        await mediator.Send(new SignOutCommand(token), ct);
        HttpContext.Response.Cookies.Delete(SessionCookies.Name, SessionCookies.Options(HttpContext.Request));
        await Send.OkAsync(new { ok = true }, ct);
    }
}

public sealed class MeEndpoint(IMediator mediator, VendorContext vendor) : EndpointWithoutRequest<VendorProfile>
{
    public override void Configure()
    {
        Get("/api/auth/me");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        if (vendor.VendorId is null)
        {
            await ApiProblems.Write(HttpContext, 401, "Sign in required.", ct);
            return;
        }
        var result = await mediator.Send(new CurrentVendorQuery(vendor.VendorId.Value), ct);
        if (result.IsFailure)
        {
            await ApiProblems.Write(HttpContext, result.Errors[0], ct);
            return;
        }
        await Send.OkAsync(result.Value, ct);
    }
}

static class SessionCookies
{
    public const string Name = "vd_session";

    public static CookieOptions Options(HttpRequest request) => new()
    {
        HttpOnly = true,
        Secure = request.IsHttps,
        SameSite = SameSiteMode.Lax,
        Path = "/",
        MaxAge = TimeSpan.FromDays(50)
    };
}
