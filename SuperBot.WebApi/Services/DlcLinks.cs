using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Правила привязки DLC к игре — одни для редактора карточки, формы каталога и импорта. Витрина умеет один уровень:
/// игра → её DLC. Поэтому DLC к DLC, DLC у программы и «игра с дополнениями, ставшая чьим-то DLC» не допускаются:
/// такие дополнения пропали бы и из общего каталога, и из блока DLC на странице игры.
/// </summary>
public static class DlcLinks
{
    /// <summary>Почему нельзя сделать <paramref name="dlc"/> дополнением <paramref name="parent"/>; null — можно.</summary>
    /// <param name="dlcHasOwnDlc">У будущего DLC есть свои дополнения (оно — чья-то базовая игра).</param>
    public static string? CheckAttach(Game? dlc, Game? parent, bool dlcHasOwnDlc)
    {
        if (dlc is null)
        {
            return "The add-on was not found.";
        }
        if (parent is null)
        {
            return "The base game was not found.";
        }
        if (string.Equals(dlc.Id, parent.Id, StringComparison.OrdinalIgnoreCase))
        {
            return "A game cannot be a DLC of itself.";
        }
        if (dlc.Kind == ProductKind.Software || parent.Kind == ProductKind.Software)
        {
            return "Software has no DLC: both products must be games.";
        }
        if (!string.IsNullOrWhiteSpace(parent.ParentGameId))
        {
            return $"“{Title(parent)}” is itself a DLC — attach the add-on to its base game instead.";
        }
        if (dlcHasOwnDlc)
        {
            return $"“{Title(dlc)}” has its own DLC, so it can't become a DLC. Detach its add-ons first.";
        }
        return null;
    }

    public static string Title(Game game) => string.IsNullOrWhiteSpace(game.Title) ? game.Name ?? "" : game.Title;
}
