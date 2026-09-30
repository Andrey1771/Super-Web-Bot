using System.Collections.Concurrent;
using System.Reflection;
using Microsoft.Extensions.DependencyInjection;

namespace SuperBot.Application.Messaging;

// Посредник для команд Telegram-бота. Раньше это был MediatR, но с 13-й версии он платный, а боту
// нужна малая часть: команда → единственный обработчик, без уведомлений и конвейеров. Контракт
// повторяет MediatR (IRequest, IRequestHandler, IMediator.Send), поэтому обработчики не менялись.

/// <summary>Общий предок команд — чтобы посредник мог принять любую из них.</summary>
public interface IBaseRequest
{
}

/// <summary>Команда без результата.</summary>
public interface IRequest : IBaseRequest
{
}

/// <summary>Команда с результатом <typeparamref name="TResponse"/>.</summary>
public interface IRequest<out TResponse> : IBaseRequest
{
}

public interface IRequestHandler<in TRequest>
    where TRequest : IRequest
{
    Task Handle(TRequest request, CancellationToken cancellationToken);
}

public interface IRequestHandler<in TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    Task<TResponse> Handle(TRequest request, CancellationToken cancellationToken);
}

public interface IMediator
{
    Task Send(IRequest request, CancellationToken cancellationToken = default);

    Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default);
}

/// <summary>
/// Находит обработчик по типу команды в контейнере и вызывает его. Обработчик ровно один: вторая
/// регистрация на ту же команду — ошибка конфигурации, и она всплывает при первом же вызове.
/// </summary>
public sealed class Mediator(IServiceProvider services) : IMediator
{
    // Типизированная обёртка на каждый тип команды строится один раз: дальше вызов идёт без рефлексии.
    private static readonly ConcurrentDictionary<Type, object> Invokers = new();

    public Task Send(IRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var invoker = (VoidInvoker)Invokers.GetOrAdd(
            request.GetType(),
            type => Activator.CreateInstance(typeof(VoidInvoker<>).MakeGenericType(type))!);
        return invoker.Invoke(request, services, cancellationToken);
    }

    public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var invoker = (ResponseInvoker<TResponse>)Invokers.GetOrAdd(
            request.GetType(),
            type => Activator.CreateInstance(typeof(ResponseInvoker<,>).MakeGenericType(type, typeof(TResponse)))!);
        return invoker.Invoke(request, services, cancellationToken);
    }

    private abstract class VoidInvoker
    {
        public abstract Task Invoke(object request, IServiceProvider services, CancellationToken cancellationToken);
    }

    private sealed class VoidInvoker<TRequest> : VoidInvoker
        where TRequest : IRequest
    {
        public override Task Invoke(object request, IServiceProvider services, CancellationToken cancellationToken) =>
            services.GetRequiredService<IRequestHandler<TRequest>>().Handle((TRequest)request, cancellationToken);
    }

    private abstract class ResponseInvoker<TResponse>
    {
        public abstract Task<TResponse> Invoke(object request, IServiceProvider services, CancellationToken cancellationToken);
    }

    private sealed class ResponseInvoker<TRequest, TResponse> : ResponseInvoker<TResponse>
        where TRequest : IRequest<TResponse>
    {
        public override Task<TResponse> Invoke(object request, IServiceProvider services, CancellationToken cancellationToken) =>
            services.GetRequiredService<IRequestHandler<TRequest, TResponse>>().Handle((TRequest)request, cancellationToken);
    }
}

public static class MediatorServiceCollectionExtensions
{
    /// <summary>
    /// Регистрирует посредник и все обработчики команд из сборки. Обработчики — transient, как было
    /// в MediatR: состояние между командами они не держат.
    /// </summary>
    public static IServiceCollection AddMediator(this IServiceCollection services, Assembly assembly)
    {
        services.AddTransient<IMediator, Mediator>();

        var handlerContracts = new[] { typeof(IRequestHandler<>), typeof(IRequestHandler<,>) };
        foreach (var type in assembly.GetTypes().Where(type => type is { IsClass: true, IsAbstract: false, IsGenericTypeDefinition: false }))
        {
            foreach (var contract in type.GetInterfaces()
                         .Where(i => i.IsGenericType && handlerContracts.Contains(i.GetGenericTypeDefinition())))
            {
                services.AddTransient(contract, type);
            }
        }

        return services;
    }
}
