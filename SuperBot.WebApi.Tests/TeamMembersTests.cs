using SuperBot.WebApi.Services.SiteSettings;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Список людей на странице «О нас».
///
/// Главное здесь — что пустой список является нормой, а не поводом подставить заготовку:
/// раньше в разметке лежали четверо выдуманных сотрудников именно потому, что «раздел не
/// может быть пустым». Может.
/// </summary>
public class TeamMembersTests
{
    [Fact]
    public void Nothing_saved_means_nobody_shown()
    {
        Assert.Empty(TeamMembers.Parse(null));
        Assert.Empty(TeamMembers.Parse("   "));
        Assert.Empty(TeamMembers.Parse("[]"));
    }

    [Fact]
    public void Broken_json_hides_the_section_instead_of_breaking_the_page()
    {
        Assert.Empty(TeamMembers.Parse("{ this is not json"));
    }

    [Fact]
    public void People_survive_a_round_trip()
    {
        var saved = TeamMembers.Serialize(new[]
        {
            new TeamMember { Name = "Sam Rivera", Role = "Founder", Description = "Answers support.", Badge = "Support" },
        });

        var read = TeamMembers.Parse(saved);

        Assert.Single(read);
        Assert.Equal("Sam Rivera", read[0].Name);
        Assert.Equal("Founder", read[0].Role);
        Assert.Equal("Support", read[0].Badge);
    }

    [Fact]
    public void A_person_without_a_name_is_not_a_person()
    {
        var read = TeamMembers.Normalize(new[]
        {
            new TeamMember { Name = "  ", Role = "Ghost" },
            new TeamMember { Name = "Sam Rivera" },
        });

        Assert.Single(read);
        Assert.Equal("Sam Rivera", read[0].Name);
    }

    [Fact]
    public void Spaces_around_fields_are_trimmed()
    {
        var read = TeamMembers.Normalize(new[]
        {
            new TeamMember { Name = "  Sam Rivera ", Role = " Founder ", Description = " Hi ", Badge = " Support " },
        });

        Assert.Equal("Sam Rivera", read[0].Name);
        Assert.Equal("Founder", read[0].Role);
        Assert.Equal("Hi", read[0].Description);
        Assert.Equal("Support", read[0].Badge);
    }

    [Fact]
    public void Translations_survive_a_round_trip_without_junk_and_are_picked_for_the_buyer()
    {
        var saved = TeamMembers.Serialize(new[]
        {
            new TeamMember
            {
                Name = "Sam Rivera",
                Role = "Founder",
                RoleI18n = new() { ["ru"] = " Основатель ", ["de"] = "ignored", ["pl"] = "  " },
                Description = "Answers support.",
                DescriptionI18n = new() { ["uk"] = "Відповідає в підтримці." },
                Badge = "Support",
            },
        });

        var read = TeamMembers.Parse(saved);
        Assert.Equal(new[] { "ru" }, read[0].RoleI18n!.Keys);
        Assert.Equal("Основатель", read[0].RoleI18n!["ru"]);
        Assert.Null(read[0].BadgeI18n);

        var russian = TeamMembers.Localize(read, "ru")[0];
        Assert.Equal("Sam Rivera", russian.Name);
        Assert.Equal("Основатель", russian.Role);
        Assert.Equal("Answers support.", russian.Description);
        Assert.Equal("Support", russian.Badge);
        Assert.Null(russian.RoleI18n);

        var ukrainian = TeamMembers.Localize(read, "uk-UA,uk;q=0.9")[0];
        Assert.Equal("Founder", ukrainian.Role);
        Assert.Equal("Відповідає в підтримці.", ukrainian.Description);

        Assert.Equal("Founder", TeamMembers.Localize(read, null)[0].Role);
    }

    [Fact]
    public void The_list_has_a_ceiling()
    {
        var many = Enumerable.Range(1, TeamMembers.MaxMembers + 5)
            .Select(i => new TeamMember { Name = $"Person {i}" });

        Assert.Equal(TeamMembers.MaxMembers, TeamMembers.Normalize(many).Count);
    }

    [Fact]
    public void Null_fields_do_not_blow_up()
    {
        var read = TeamMembers.Normalize(new[]
        {
            new TeamMember { Name = "Sam Rivera", Role = null!, Description = null!, Badge = null!, PhotoUrl = null! },
        });

        Assert.Equal(string.Empty, read[0].Role);
        Assert.Equal(string.Empty, read[0].Description);
        Assert.Equal(string.Empty, read[0].PhotoUrl);
    }

    [Theory]
    [InlineData("/uploads/images/sam.png")]
    [InlineData("https://cdn.example.com/sam.png")]
    [InlineData("http://cdn.example.com/sam.png")]
    public void A_usable_photo_address_is_kept(string url)
    {
        var read = TeamMembers.Normalize(new[] { new TeamMember { Name = "Sam", PhotoUrl = url } });

        Assert.Equal(url, read[0].PhotoUrl);
    }

    /// <summary>
    /// Адрес уезжает прямо в img src на публичной странице. Всё, что там не картинка,
    /// отбрасывается — карточка честно покажет букву вместо чужой схемы.
    /// </summary>
    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")]
    [InlineData("file:///etc/passwd")]
    [InlineData("//evil.example.com/sam.png")]
    [InlineData("просто текст")]
    public void Anything_else_is_dropped(string url)
    {
        var read = TeamMembers.Normalize(new[] { new TeamMember { Name = "Sam", PhotoUrl = url } });

        Assert.Equal(string.Empty, read[0].PhotoUrl);
    }

    [Fact]
    public void The_photo_survives_a_round_trip()
    {
        var saved = TeamMembers.Serialize(new[]
        {
            new TeamMember { Name = "Sam Rivera", PhotoUrl = "/uploads/images/sam.png" },
        });

        Assert.Equal("/uploads/images/sam.png", TeamMembers.Parse(saved)[0].PhotoUrl);
    }
}
