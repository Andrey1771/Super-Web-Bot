import { buildAdminCatalogParams } from './admin-catalog-params';

/**
 * Список товаров в админке идёт через витринный каталог, который по умолчанию скрывает черновики, ПО и DLC.
 * Админке нужно всё: без includeDlc созданное дополнение исчезало из списка и поиска.
 */
it('asks the catalog for drafts, every product kind and DLC', () => {
    const params = buildAdminCatalogParams({ page: 2, pageSize: 40, kind: 'all', status: 'all', search: '' });

    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('40');
    expect(params.get('kind')).toBe('all');
    expect(params.get('includeDrafts')).toBe('true');
    expect(params.get('includeDlc')).toBe('true');
    expect(params.has('status')).toBe(false);
    expect(params.has('q')).toBe(false);
});

it('passes the status filter and search only when set', () => {
    const params = buildAdminCatalogParams({ page: 1, pageSize: 20, kind: 'software', status: 'draft', search: 'vpn' });

    expect(params.get('status')).toBe('draft');
    expect(params.get('q')).toBe('vpn');
    expect(params.get('includeDlc')).toBe('true');
});

it('shows only DLC in the DLC view and games without DLC in the Games view', () => {
    const dlc = buildAdminCatalogParams({ page: 1, pageSize: 20, kind: 'dlc', status: 'all', search: 'crimson' });
    expect(dlc.get('kind')).toBe('game');
    expect(dlc.get('dlc')).toBe('only');
    expect(dlc.get('q')).toBe('crimson');

    const games = buildAdminCatalogParams({ page: 1, pageSize: 20, kind: 'game', status: 'all', search: '' });
    expect(games.get('kind')).toBe('game');
    expect(games.has('includeDlc')).toBe(false);
    expect(games.has('dlc')).toBe(false);
});
