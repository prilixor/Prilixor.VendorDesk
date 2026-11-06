using FluentValidation;
using MediatR;
using Prilixor.VendorDesk.Application.Abstractions;

namespace Prilixor.VendorDesk.Application.Behaviours;

public sealed class ValidationBehaviour<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        if (!validators.Any()) return await next(cancellationToken);
        var context = new ValidationContext<TRequest>(request);
        var results = await Task.WhenAll(validators.Select(validator => validator.ValidateAsync(context, cancellationToken)));
        var failures = results.SelectMany(result => result.Errors).Where(error => error is not null).ToList();
        if (failures.Count == 0) return await next(cancellationToken);

        var errors = failures.Select(failure => new Error(failure.PropertyName, failure.ErrorMessage, ErrorCategory.Validation)).ToList();
        if (typeof(TResponse) == typeof(Result)) return (TResponse)(object)Result.Failure(errors);
        if (typeof(TResponse).IsGenericType && typeof(TResponse).GetGenericTypeDefinition() == typeof(Result<>))
        {
            var method = typeof(Result).GetMethods()
                .First(candidate => candidate.Name == "Failure" && candidate.IsGenericMethod && candidate.GetParameters()[0].ParameterType == typeof(IReadOnlyList<Error>))
                .MakeGenericMethod(typeof(TResponse).GetGenericArguments()[0]);
            return (TResponse)method.Invoke(null, [errors])!;
        }

        throw new ValidationException(failures);
    }
}
