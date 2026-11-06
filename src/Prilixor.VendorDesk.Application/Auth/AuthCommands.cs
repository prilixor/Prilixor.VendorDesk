using FluentValidation;
using Prilixor.VendorDesk.Application.Abstractions;
using Prilixor.VendorDesk.Domain;

namespace Prilixor.VendorDesk.Application.Auth;

public sealed record RequestOtpCommand(string Email, string Purpose, string? BusinessName, string? Phone, string? Address) : ICommand<OtpRequested>;
public sealed record OtpRequested(string Email, DateTimeOffset ExpiresAt);

public sealed class RequestOtpCommandValidator : AbstractValidator<RequestOtpCommand>
{
    public RequestOtpCommandValidator()
    {
        RuleFor(command => command.Email).NotEmpty().WithMessage("Enter a valid email.").EmailAddress().WithMessage("Enter a valid email.").MaximumLength(320).WithMessage("Enter a valid email.").When(command => command.Purpose == "register");
        RuleFor(command => command.Purpose).Must(purpose => purpose is "register" or "login");
        RuleFor(command => command.BusinessName).NotEmpty().MinimumLength(2).MaximumLength(160).Must(name => name is not null && name.Any(char.IsLetter)).WithMessage("Enter the business name.").When(command => command.Purpose == "register");
        RuleFor(command => command.Phone).Must(phone => phone is not null && System.Text.RegularExpressions.Regex.IsMatch(new string(phone.Where(char.IsDigit).ToArray()), @"^[6-9]\d{9}$")).WithMessage("Enter a valid 10-digit mobile.");
        RuleFor(command => command.Address).Must(address => { var text = address?.Trim() ?? ""; return text.Length is >= 5 and <= 500 && text.Any(char.IsLetter); }).WithMessage("Enter the shop address.").When(command => command.Purpose == "register");
    }
}

internal sealed class RequestOtpCommandHandler(IDeskStore store, IOtpSms sms, ITokenHasher hasher)
    : ICommandHandler<RequestOtpCommand, OtpRequested>
{
    public async Task<Result<OtpRequested>> Handle(RequestOtpCommand request, CancellationToken cancellationToken)
    {
        var phone = new string((request.Phone ?? "").Where(char.IsDigit).ToArray());
        string email;
        if (request.Purpose == "login")
        {
            var matches = await store.FindVendorsByPhone(phone, cancellationToken);
            if (matches.Count == 0)
                return Result.Failure<OtpRequested>(new Error("auth.unknown", "No shop is registered with that mobile.", ErrorCategory.NotFound));
            if (matches.Count > 1)
                return Result.Failure<OtpRequested>(new Error("auth.phone", "More than one shop uses this mobile.", ErrorCategory.Conflict));
            email = matches[0].Email;
        }
        else
        {
            email = request.Email.Trim().ToLowerInvariant();
            if (await store.FindVendorByEmail(email, cancellationToken) is not null)
                return Result.Failure<OtpRequested>(new Error("auth.exists", "That email is already registered. Sign in instead.", ErrorCategory.Conflict));
            if ((await store.FindVendorsByPhone(phone, cancellationToken)).Count > 0)
                return Result.Failure<OtpRequested>(new Error("auth.exists", "That mobile is already registered. Sign in instead.", ErrorCategory.Conflict));
        }

        var recent = await store.LatestOtpByPhone(phone, cancellationToken);
        if (recent is not null && recent.CreatedAt > DateTimeOffset.UtcNow.AddSeconds(-45))
            return Result.Failure<OtpRequested>(new Error("auth.cooldown", "Wait a moment before asking for another code.", ErrorCategory.Validation));

        var code = hasher.NewCode();
        var otp = new EmailOtp
        {
            Id = Guid.NewGuid(),
            Email = email,
            Purpose = request.Purpose,
            CodeHash = hasher.Hash(code),
            BusinessName = request.BusinessName?.Trim(),
            Phone = phone,
            City = request.Address?.Trim(),
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10),
            CreatedAt = DateTimeOffset.UtcNow
        };
        store.AddOtp(otp);
        await store.Save(cancellationToken);
        try
        {
            await sms.Send(phone, code, cancellationToken);
        }
        catch (Exception)
        {
            store.RemoveOtp(otp);
            await store.Save(cancellationToken);
            return Result.Failure<OtpRequested>(new Error("auth.sms", "The text message could not be sent. Try again.", ErrorCategory.Validation));
        }
        return Result.Success(new OtpRequested(phone, otp.ExpiresAt));
    }
}

public sealed record VerifyOtpCommand(string Phone, string Code, string Purpose) : ICommand<SignedIn>;
public sealed record SignedIn(VendorProfile Profile, string SessionToken, DateTimeOffset ExpiresAt);

public sealed class VerifyOtpCommandValidator : AbstractValidator<VerifyOtpCommand>
{
    public VerifyOtpCommandValidator()
    {
        RuleFor(command => command.Phone).Must(phone => System.Text.RegularExpressions.Regex.IsMatch(new string((phone ?? "").Where(char.IsDigit).ToArray()), @"^[6-9]\d{9}$")).WithMessage("Enter a valid 10-digit mobile.");
        RuleFor(command => command.Code).Length(6);
        RuleFor(command => command.Purpose).Must(purpose => purpose is "register" or "login");
    }
}

internal sealed class VerifyOtpCommandHandler(IDeskStore store, ITokenHasher hasher) : ICommandHandler<VerifyOtpCommand, SignedIn>
{
    public async Task<Result<SignedIn>> Handle(VerifyOtpCommand request, CancellationToken cancellationToken)
    {
        var phone = new string(request.Phone.Where(char.IsDigit).ToArray());
        var otp = await store.LatestOtpByPhone(phone, cancellationToken);
        if (otp is null || otp.Purpose != request.Purpose || otp.ConsumedAt is not null || otp.ExpiresAt < DateTimeOffset.UtcNow)
            return Result.Failure<SignedIn>(new Error("auth.code", "That code is not valid.", ErrorCategory.Unauthorized));
        otp.Attempts++;
        if (otp.Attempts > 5 || hasher.Hash(request.Code.Trim()) != otp.CodeHash)
        {
            await store.Save(cancellationToken);
            return Result.Failure<SignedIn>(new Error("auth.code", "That code is not valid.", ErrorCategory.Unauthorized));
        }

        otp.ConsumedAt = DateTimeOffset.UtcNow;
        var email = otp.Email.Trim().ToLowerInvariant();
        var vendor = await store.FindVendorByEmail(email, cancellationToken);
        if (request.Purpose == "register")
        {
            if (vendor is not null)
                return Result.Failure<SignedIn>(new Error("auth.exists", "That email is already registered. Sign in instead.", ErrorCategory.Conflict));
            vendor = new Vendor
            {
                Id = Guid.NewGuid(),
                BusinessName = otp.BusinessName ?? "",
                Email = email,
                Phone = otp.Phone ?? "",
                Address = otp.City ?? "",
                CreatedAt = DateTimeOffset.UtcNow
            };
            store.AddVendor(vendor);
        }
        if (vendor is null)
            return Result.Failure<SignedIn>(new Error("auth.unknown", "No shop is registered with that mobile.", ErrorCategory.NotFound));

        var token = hasher.NewToken();
        var session = new VendorSession
        {
            Id = Guid.NewGuid(),
            VendorId = vendor.Id,
            TokenHash = hasher.Hash(token),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(50),
            CreatedAt = DateTimeOffset.UtcNow
        };
        store.AddSession(session);
        await store.Save(cancellationToken);
        return Result.Success(new SignedIn(VendorProfiles.From(vendor), token, session.ExpiresAt));
    }
}

public sealed record SignOutCommand(string? Token) : ICommand;

internal sealed class SignOutCommandHandler(IDeskStore store, ITokenHasher hasher) : ICommandHandler<SignOutCommand>
{
    public async Task<Result> Handle(SignOutCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token)) return Result.Success();
        var session = await store.FindSession(hasher.Hash(request.Token), cancellationToken);
        if (session is not null) session.RevokedAt = DateTimeOffset.UtcNow;
        await store.Save(cancellationToken);
        return Result.Success();
    }
}

public sealed record CurrentVendorQuery(Guid VendorId) : IQuery<VendorProfile>;
public sealed record VendorProfile(Guid Id, string BusinessName, string Email, string Phone, string City, string OwnerName, string Address, string Gstin, decimal TaxPercent, decimal DiscountPercent, bool ProfileComplete, string? Logo);

public static class VendorProfiles
{
    public static VendorProfile From(Vendor vendor) => new(
        vendor.Id,
        vendor.BusinessName,
        vendor.Email,
        vendor.Phone,
        vendor.City,
        vendor.OwnerName,
        vendor.Address,
        vendor.Gstin,
        vendor.TaxPercent,
        vendor.DiscountPercent,
        !string.IsNullOrWhiteSpace(vendor.BusinessName)
        && !string.IsNullOrWhiteSpace(vendor.OwnerName)
        && !string.IsNullOrWhiteSpace(vendor.Address)
        && !string.IsNullOrWhiteSpace(vendor.Phone),
        string.IsNullOrWhiteSpace(vendor.Logo) ? null : vendor.Logo);
}

internal sealed class CurrentVendorQueryHandler(IDeskStore store) : IQueryHandler<CurrentVendorQuery, VendorProfile>
{
    public async Task<Result<VendorProfile>> Handle(CurrentVendorQuery request, CancellationToken cancellationToken)
    {
        var vendor = await store.FindVendor(request.VendorId, cancellationToken);
        if (vendor is null) return Result.Failure<VendorProfile>(new Error("auth.unknown", "Sign in required.", ErrorCategory.Unauthorized));
        return Result.Success(VendorProfiles.From(vendor));
    }
}
