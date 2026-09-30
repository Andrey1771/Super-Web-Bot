import { MINIAPP_CATALOG_URL, toMiniAppGames } from './miniapp-catalog';

/**
 * Mini App ходит в живой каталог витрины. Прежний адрес /api/game убран вместе со старым контроллером, и приложение
 * молча показывало «не удалось загрузить каталог» — этот тест держит адрес на существующем эндпоинте и проверяет
 * разбор его ответа.
 */
it('asks the storefront catalog for all product kinds', () => {
    expect(MINIAPP_CATALOG_URL.startsWith('/api/game/catalog?')).toBe(true);
    expect(MINIAPP_CATALOG_URL).toContain('kind=all');
    expect(MINIAPP_CATALOG_URL).not.toBe('/api/game');
});

it('maps catalog cards to Mini App games and turns the category into a genre list', () => {
    const games = toMiniAppGames({
        items: [
            { id: 'a', title: 'Portal 2', price: 9.99, finalPrice: 4.99, category: 'Puzzle', currency: 'USD' },
            { id: 'b', name: 'wds', price: '12', genres: ['Indie', 'Action'] },
            { title: 'no id — not shown' },
        ],
        total: 3,
    });

    expect(games.map((g) => g.id)).toEqual(['a', 'b']);
    expect(games[0]).toMatchObject({ name: 'Portal 2', title: 'Portal 2', genres: ['Puzzle'], finalPrice: 4.99 });
    expect(games[1]).toMatchObject({ title: 'wds', price: 12, genres: ['Indie', 'Action'] });
});

it('still accepts a plain array, as the old endpoint returned', () => {
    expect(toMiniAppGames([{ id: 'x', title: 'X', price: 1 }])).toHaveLength(1);
    expect(toMiniAppGames(null)).toEqual([]);
});
