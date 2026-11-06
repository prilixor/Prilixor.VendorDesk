using System.Text.Json.Serialization;
using MediatR;

namespace Prilixor.VendorDesk.Application.Abstractions;

public enum ErrorCategory
{
    NotFound,
    Validation,
    Unauthorized,
    Forbidden,
    Conflict
}

public sealed record Error(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("description")] string? Description = null,
    [property: JsonPropertyName("category")] ErrorCategory? Category = null);

public class Result
{
    protected Result(bool isSuccess, IReadOnlyList<Error> errors)
    {
        if (isSuccess && errors.Count > 0 || !isSuccess && errors.Count == 0)
            throw new InvalidOperationException();
        IsSuccess = isSuccess;
        Errors = errors;
    }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public IReadOnlyList<Error> Errors { get; }

    public static Result Success() => new(true, []);
    public static Result Failure(Error error) => new(false, [error]);
    public static Result Failure(IReadOnlyList<Error> errors) => new(false, errors);
    public static Result<T> Success<T>(T value) => new(value, true, []);
    public static Result<T> Failure<T>(Error error) => new(default!, false, [error]);
    public static Result<T> Failure<T>(IReadOnlyList<Error> errors) => new(default!, false, errors);
}

public sealed class Result<T> : Result
{
    internal Result(T value, bool isSuccess, IReadOnlyList<Error> errors) : base(isSuccess, errors) => Value = value;
    public T Value { get; }
}

public interface ICommand : IRequest<Result>;
public interface ICommand<TResponse> : IRequest<Result<TResponse>>;
public interface IQuery<TResponse> : IRequest<Result<TResponse>>;
public interface ICommandHandler<TCommand> : IRequestHandler<TCommand, Result> where TCommand : ICommand;
public interface ICommandHandler<TCommand, TResponse> : IRequestHandler<TCommand, Result<TResponse>> where TCommand : ICommand<TResponse>;
public interface IQueryHandler<TQuery, TResponse> : IRequestHandler<TQuery, Result<TResponse>> where TQuery : IQuery<TResponse>;
