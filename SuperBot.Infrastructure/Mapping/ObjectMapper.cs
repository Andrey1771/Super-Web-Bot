using System.Collections;
using System.Collections.Concurrent;
using System.Linq.Expressions;
using System.Reflection;
using Microsoft.Extensions.DependencyInjection;

namespace SuperBot.Infrastructure.Mapping;

/// <summary>
/// Прежний контракт AutoMapper, которым пользуются репозитории: <c>_mapper.Map&lt;GameDb&gt;(game)</c>,
/// в том числе для списков. Сами преобразования сгенерированы в <see cref="DbMapper"/>.
/// </summary>
public interface IMapper
{
    TDestination Map<TDestination>(object? source);
}

/// <summary>
/// Выбирает метод <see cref="DbMapper"/> по паре «тип источника → тип результата» и повторяет два
/// поведения AutoMapper, на которые опирается код: null вместо коллекции даёт пустую коллекцию,
/// а объект уже нужного типа возвращается как есть (так контроллер «отображает» Game в Game).
/// </summary>
public sealed class ObjectMapper : IMapper
{
    private static readonly IReadOnlyDictionary<(Type Source, Type Target), Func<object, object>> Maps = BuildMaps();
    private static readonly ConcurrentDictionary<Type, Type?> ElementTypes = new();

    public TDestination Map<TDestination>(object? source)
    {
        var target = typeof(TDestination);
        var element = CollectionElement(target);

        if (source is null)
        {
            return element is null ? default! : (TDestination)EmptyCollection(target, element);
        }

        if (element is not null && source is IEnumerable items and not string)
        {
            var list = (IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(element))!;
            foreach (var item in items)
            {
                list.Add(item is null ? null : MapOne(item, element));
            }
            return (TDestination)(target.IsArray ? ToArray(list, element) : list);
        }

        return (TDestination)MapOne(source, target);
    }

    /// <summary>Все пары, которые умеет <see cref="DbMapper"/>: публичные методы с одним параметром.</summary>
    public static IEnumerable<(Type Source, Type Target)> KnownPairs => Maps.Keys;

    private static object MapOne(object source, Type target)
    {
        if (Maps.TryGetValue((source.GetType(), target), out var map))
        {
            return map(source);
        }
        if (target.IsInstanceOfType(source))
        {
            return source;
        }
        throw new InvalidOperationException($"No mapping from {source.GetType().Name} to {target.Name}.");
    }

    private static IReadOnlyDictionary<(Type, Type), Func<object, object>> BuildMaps()
    {
        var maps = new Dictionary<(Type, Type), Func<object, object>>();
        foreach (var method in typeof(DbMapper).GetMethods(BindingFlags.Public | BindingFlags.Static))
        {
            var parameters = method.GetParameters();
            if (parameters.Length != 1 || method.ReturnType == typeof(void))
            {
                continue;
            }
            // Скомпилированный делегат вместо MethodInfo.Invoke: репозитории гоняют через него списки.
            var input = Expression.Parameter(typeof(object), "source");
            var call = Expression.Call(method, Expression.Convert(input, parameters[0].ParameterType));
            var lambda = Expression.Lambda<Func<object, object>>(Expression.Convert(call, typeof(object)), input);
            maps[(parameters[0].ParameterType, method.ReturnType)] = lambda.Compile();
        }
        return maps;
    }

    private static Type? CollectionElement(Type type) => ElementTypes.GetOrAdd(type, static type =>
    {
        if (type == typeof(string))
        {
            return null;
        }
        if (type.IsArray)
        {
            return type.GetElementType();
        }
        if (type.IsGenericType)
        {
            var definition = type.GetGenericTypeDefinition();
            if (definition == typeof(List<>) || definition == typeof(IList<>) || definition == typeof(ICollection<>)
                || definition == typeof(IEnumerable<>) || definition == typeof(IReadOnlyList<>) || definition == typeof(IReadOnlyCollection<>))
            {
                return type.GetGenericArguments()[0];
            }
        }
        return null;
    });

    private static object EmptyCollection(Type target, Type element)
    {
        var list = (IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(element))!;
        return target.IsArray ? ToArray(list, element) : list;
    }

    private static Array ToArray(IList list, Type element)
    {
        var array = Array.CreateInstance(element, list.Count);
        list.CopyTo(array, 0);
        return array;
    }
}

public static class ObjectMapperServiceCollectionExtensions
{
    public static IServiceCollection AddDbMapper(this IServiceCollection services) =>
        services.AddSingleton<IMapper, ObjectMapper>();
}
