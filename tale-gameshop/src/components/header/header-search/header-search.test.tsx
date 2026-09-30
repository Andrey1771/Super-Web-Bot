import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import HeaderSearch from './header-search';

/**
 * Поиск в шапке при коротком запросе.
 *
 * По одной букве совпадений слишком много, и шесть игр из пятнадцати — это не подсказка,
 * а случайная выборка. Поэтому на одном символе список игр не запрашивается. Но раньше он
 * не показывал и ничего другого, и поиск выглядел сломанным, хотя Enter работал и тогда.
 * Тесты держат ровно это: запроса нет, а ответ есть.
 */

const mockApiGet = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../../inversify.config', () => ({
    __esModule: true,
    default: { get: () => ({ api: { get: (...args: unknown[]) => mockApiGet(...args) }, apiBaseUrl: 'http://api.test' }) },
}));

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockNavigate,
}));

jest.mock('../../../context/site-preferences', () => ({
    useSitePreferences: () => ({ currency: 'USD' }),
    formatMoney: (value: number) => `$${value}`,
}));

jest.mock('../../../utils/analytics-client', () => ({
    analyticsClient: { trackEvent: jest.fn() },
}));

const renderSearch = () =>
    render(
        <MemoryRouter>
            <HeaderSearch />
        </MemoryRouter>,
    );

const field = () => screen.getByRole('combobox', { name: 'Search games and software' });

beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: { items: [{ id: '1', title: 'Ghostrunner', slug: 'ghostrunner', price: 30 }] } });
});

it('answers a single letter instead of going silent', async () => {
    renderSearch();

    await userEvent.type(field(), 'g');

    // Список игр по одной букве не просим — он был бы случайной выборкой.
    expect(mockApiGet).not.toHaveBeenCalled();
    // Но человек видит, что поиск жив, и куда его нажатие приведёт.
    expect(await screen.findByText(/Search the catalog for/)).toBeInTheDocument();
});

it('suggests games from the second letter and still offers the whole catalog', async () => {
    renderSearch();

    await userEvent.type(field(), 'gh');

    expect(await screen.findByText('Ghostrunner')).toBeInTheDocument();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(screen.getByText(/See all results for/)).toBeInTheDocument();
});

it('takes a one-letter query to the catalog, filter and all', async () => {
    renderSearch();

    await userEvent.type(field(), 'g');
    await userEvent.click(await screen.findByText(/Search the catalog for/));

    expect(mockNavigate).toHaveBeenCalledWith('/games?filterName=g');
});

it('searches both kinds, marks software and sends "see all" where most matches are', async () => {
    mockApiGet.mockResolvedValue({
        data: {
            items: [{ id: '2', title: 'Nova Security', slug: 'nova-security', price: 30, kind: 'Software' }],
            facets: { kinds: [{ value: 'Game', count: 1 }, { value: 'Software', count: 4 }] },
        },
    });
    renderSearch();

    await userEvent.type(field(), 'nova');

    expect(await screen.findByText('Nova Security')).toBeInTheDocument();
    expect(mockApiGet.mock.calls[0][0]).toContain('kind=all');
    expect(screen.getByText('Software')).toBeInTheDocument();

    await userEvent.click(screen.getByText(/See all results for/));
    // Раздела /software нет — «все результаты» открывают каталог в режиме софта.
    expect(mockNavigate).toHaveBeenCalledWith('/games?type=software&filterName=nova');
});

it('opens a software suggestion at its product address', async () => {
    mockApiGet.mockResolvedValue({
        data: { items: [{ id: '3', title: 'Harbor VPN', slug: 'harbor-vpn', price: 5, kind: 'Software' }] },
    });
    renderSearch();

    await userEvent.type(field(), 'harbor');
    await userEvent.click(await screen.findByText('Harbor VPN'));

    expect(mockNavigate).toHaveBeenCalledWith('/games/harbor-vpn');
});

it('keeps the catalog row when nothing matched', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } });
    renderSearch();

    await userEvent.type(field(), 'zzzz');

    // Молчание здесь читалось бы как поломка — а каталог с фильтрами всё ещё может помочь.
    expect(await screen.findByText(/Search the catalog for/)).toBeInTheDocument();
});
