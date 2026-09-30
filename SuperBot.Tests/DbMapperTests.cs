using System.Collections;
using System.Reflection;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Mapping;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Сгенерированный маппер сущностей и документов (замена AutoMapper) ведёт себя так, как привык
/// код: отсутствующая коллекция превращается в пустую, а не роняет запрос. Такое приходит и из
/// старых документов Mongo, и из JSON админки ("editions": null).
/// </summary>
public class DbMapperTests
{
    private static readonly NullabilityInfoContext Nullability = new();
    private static readonly MethodInfo MapMethod = typeof(IMapper).GetMethod(nameof(IMapper.Map))!;

    public static IEnumerable<object[]> Pairs() =>
        ObjectMapper.KnownPairs.Select(pair => new object[] { pair.Source, pair.Target });

    [Theory]
    [MemberData(nameof(Pairs))]
    public void Missing_collections_become_empty_instead_of_failing(Type source, Type target)
    {
        var instance = Activator.CreateInstance(source)!;
        foreach (var property in NonNullableCollections(source).Where(p => p.CanWrite))
        {
            property.SetValue(instance, null);
        }
        // Строки в настоящем документе есть всегда (id, коды), а у пустого объекта их нет: заполняем,
        // чтобы проверять именно коллекции, а не разбор несуществующего id.
        foreach (var property in source.GetProperties().Where(p => p.PropertyType == typeof(string) && p.CanWrite && p.GetValue(instance) is null))
        {
            property.SetValue(instance, property.Name.EndsWith("Id", StringComparison.Ordinal) ? Guid.NewGuid().ToString() : "");
        }

        var result = MapMethod.MakeGenericMethod(target).Invoke(new ObjectMapper(), new[] { instance });

        Assert.NotNull(result);
        foreach (var property in NonNullableCollections(target).Where(p => p.CanRead))
        {
            Assert.True(property.GetValue(result) is not null, $"{source.Name} → {target.Name}: {property.Name} stayed null");
        }
    }

    [Fact]
    public void A_list_maps_item_by_item_and_null_list_becomes_empty()
    {
        var mapper = new ObjectMapper();
        var documents = mapper.Map<List<GameDiscountDb>>(new List<GameDiscount> { new() { GameId = "a" }, new() { GameId = "b" } });
        Assert.Equal(new[] { "a", "b" }, documents.Select(document => document.GameId));

        Assert.Empty(mapper.Map<IReadOnlyList<GameDiscount>>(null));
    }

    [Fact]
    public void Enums_stored_as_strings_tolerate_missing_values_and_case()
    {
        var mapper = new ObjectMapper();
        // Старый документ без поля — значение по умолчанию, как было у AutoMapper, а не исключение.
        var legacy = mapper.Map<GameDetails>(new GameDetailsDb { GameId = "g", ControllerSupport = null!, KeyType = null! });
        Assert.Equal(default(ControllerSupport), legacy.ControllerSupport);
        Assert.Equal(default(GameKeyType), legacy.KeyType);

        var written = mapper.Map<GameDetails>(new GameDetailsDb { GameId = "g", ControllerSupport = ControllerSupport.Full.ToString().ToLowerInvariant() });
        Assert.Equal(ControllerSupport.Full, written.ControllerSupport);
    }

    [Fact]
    public void A_missing_optional_block_stays_missing()
    {
        // Требований для Mac в базе обычно нет, хотя свойство документа объявлено без «?».
        var details = new ObjectMapper().Map<GameDetails>(new GameDetailsDb
        {
            GameId = "g",
            SystemRequirements = new GameSystemRequirementsDb { Windows = new GameSystemRequirementBlockDb(), Mac = null! }
        });
        Assert.NotNull(details.SystemRequirements!.Windows);
        Assert.Null(details.SystemRequirements.Mac);
    }

    [Fact]
    public void An_object_of_the_requested_type_is_returned_as_is()
    {
        // Так контроллер создания игры «отображает» Game в Game — AutoMapper поступал так же.
        var game = new Game();
        Assert.Same(game, new ObjectMapper().Map<Game>(game));
    }

    [Fact]
    public void An_unknown_pair_fails_with_a_clear_message()
    {
        var error = Assert.Throws<InvalidOperationException>(() => new ObjectMapper().Map<GameDb>(new Cart()));
        Assert.Contains("Cart", error.Message);
    }

    private static IEnumerable<PropertyInfo> NonNullableCollections(Type type) =>
        type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(property => property.GetIndexParameters().Length == 0)
            .Where(property => property.PropertyType != typeof(string) && typeof(IEnumerable).IsAssignableFrom(property.PropertyType))
            .Where(property => Nullability.Create(property).WriteState == NullabilityState.NotNull
                               || Nullability.Create(property).ReadState == NullabilityState.NotNull);
}
