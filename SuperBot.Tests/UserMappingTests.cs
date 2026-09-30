using System.Collections.Generic;
using System.Linq;
using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Models;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Перенос пользователей из базы в сущности.
///
/// В коллекции Users соседствуют записи двух видов: покупатели из Telegram с числовым
/// идентификатором и учётки сайта, где в том же поле лежит GUID из Keycloak. Сущность User
/// хранит идентификатор числом, и на GUID преобразование падало — а вместе с ним падала
/// ЛЮБАЯ выборка всех пользователей. Наружу это выходило пятисоткой рассылки в админке бота,
/// без единой подсказки, что дело в одной чужой записи.
/// </summary>
public class UserMappingTests
{
    private static IMapper CreateMapper() =>
        new MapperConfiguration(config => config.AddProfile<UserProfile>()).CreateMapper();

    [Fact]
    public void Telegram_user_keeps_its_numeric_id()
    {
        var user = CreateMapper().Map<User>(new UserDb { UserId = "8394705453", Name = "buyer" });

        Assert.Equal(8394705453L, user.UserId);
    }

    [Fact]
    public void Site_account_with_guid_maps_to_zero_instead_of_throwing()
    {
        var user = CreateMapper().Map<User>(new UserDb
        {
            UserId = "dac35416-36cd-464b-8779-12ed41519fd2",
            Name = "admin"
        });

        // Ноль — это «не пользователь бота»: рассылка такие записи пропускает.
        Assert.Equal(0L, user.UserId);
    }

    [Fact]
    public void Mixed_collection_maps_whole_list()
    {
        var mapper = CreateMapper();
        var source = new List<UserDb>
        {
            new() { UserId = "dac35416-36cd-464b-8779-12ed41519fd2", Name = "admin" },
            new() { UserId = "8394705453", Name = "buyer" },
            new() { UserId = "218144e7-a894-4e05-8ace-3b7a91eb7a33", Name = "admin" },
        };

        var users = mapper.Map<IEnumerable<User>>(source).ToList();

        Assert.Equal(3, users.Count);
        Assert.Single(users.Where(user => user.UserId > 0));
    }
}
