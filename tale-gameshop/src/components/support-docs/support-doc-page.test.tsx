import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SupportDocPage from './support-doc-page';

/**
 * Оглавление длинного документа: подсветка текущего раздела и кнопка «наверх».
 *
 * Вживую это не проверить — обе вещи считаются на прокрутке через requestAnimationFrame,
 * а он не срабатывает в скрытой вкладке. Здесь положение разделов задаётся напрямую,
 * поэтому проверяется само правило: текущий — последний раздел, чей заголовок уже ушёл
 * под шапку сайта.
 */

const mockGetLegalDetails = jest.fn();

jest.mock('../../api/legalApi', () => {
    const actual = jest.requireActual('../../api/legalApi');
    return { ...actual, getLegalDetails: () => mockGetLegalDetails() };
});

/** Полный набор реквизитов: столько же полей, сколько отдаёт сервер. */
const filledLegal = (overrides: Record<string, unknown> = {}) => ({
    ...Object.fromEntries(
        jest.requireActual('../../api/legalApi').LEGAL_FIELDS.map((field: string) => [field, `value-of-${field}`])
    ),
    draft: false,
    ...overrides,
});

const originalRaf = window.requestAnimationFrame;
const originalRect = Element.prototype.getBoundingClientRect;

/** Верхняя граница каждого раздела: id → отступ от верха окна. */
let tops: Record<string, number> = {};

const setScroll = (y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
};

const scroll = async () => {
    await act(async () => {
        window.dispatchEvent(new Event('scroll'));
    });
};

beforeAll(() => {
    // Кадр выполняем сразу: ждать его в тесте нечего, а поведение то же.
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
    }) as typeof window.requestAnimationFrame;

    Element.prototype.getBoundingClientRect = function () {
        const top = tops[(this as HTMLElement).id] ?? 10_000;
        return { top, bottom: top + 200, left: 0, right: 0, width: 0, height: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    };
});

afterAll(() => {
    window.requestAnimationFrame = originalRaf;
    Element.prototype.getBoundingClientRect = originalRect;
});

beforeEach(() => {
    tops = {};
    setScroll(0);
    mockGetLegalDetails.mockResolvedValue(filledLegal());
});

const renderDoc = async () => {
    render(
        <MemoryRouter initialEntries={['/support/docs/terms-of-sale']}>
            <Routes>
                <Route path="/support/docs/:docId" element={<SupportDocPage />} />
            </Routes>
        </MemoryRouter>,
    );
    // Реквизиты приходят асинхронно; дожидаемся, чтобы их появление не пришло после конца теста.
    await act(async () => {});
};

const activeLink = () => document.querySelector('.support-doc-toc a.is-active');

it('marks the section the reader is actually on', async () => {
    await renderDoc();

    // Первые три ушли под шапку, четвёртый ещё ниже — читают третий.
    // Якоря — по номеру раздела: одинаковы на всех языках сайта.
    tops = {
        'section-1': -900,
        'section-2': -400,
        'section-3': 60,
        'section-4': 700,
    };
    await scroll();

    expect(activeLink()).toHaveTextContent('Where the key works');
    // Для читалок это перемещение по странице, а не переход на другую.
    expect(activeLink()).toHaveAttribute('aria-current', 'location');
});

it('falls back to the first section while the page is still at the top', async () => {
    await renderDoc();

    tops = { 'who-you-are-buying-from': 300, 'what-you-are-buying': 800 };
    await scroll();

    expect(activeLink()).toHaveTextContent('Who you are buying from');
});

it('offers the way back only once the top is far away', async () => {
    await renderDoc();

    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();

    setScroll(2000);
    await scroll();

    const button = screen.getByRole('button', { name: 'Back to top' });
    const scrollTo = jest.fn();
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, configurable: true });

    await userEvent.click(button);

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
});

it('gives every section its own link to quote in a support reply', async () => {
    await renderDoc();

    const anchors = document.querySelectorAll('.support-doc-section-anchor');
    const sections = document.querySelectorAll('.support-doc-section');
    expect(anchors).toHaveLength(sections.length);

    // Шестой пункт условий — про немедленную выдачу; ссылка ведёт именно в него. Якорь по номеру,
    // а не по заголовку: заголовок переводится, а ссылка из переписки должна работать на любом языке.
    const withdrawal = screen.getByLabelText(/Link to section 6:/);
    expect(withdrawal).toHaveAttribute('href', '#section-6');
    expect(document.getElementById('section-6')).toHaveTextContent('Immediate delivery and your right to withdraw');
});

it('prints the seller details the server sent, not placeholders', async () => {
    await renderDoc();

    expect(await screen.findByText(/value-of-entity/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('[TO FILL');
    expect(screen.queryByText(/Draft — do not rely/)).not.toBeInTheDocument();
});

it('marks the document a draft when a detail is missing, and shows where', async () => {
    mockGetLegalDetails.mockResolvedValue(filledLegal({ registrationNumber: '' }));

    await renderDoc();

    expect(await screen.findByText(/Draft — do not rely/)).toBeInTheDocument();
    // Пропуск виден в тексте, а не проглочен пустой строкой.
    expect(screen.getByText('[TO FILL: registrationNumber]', { exact: false })).toBeInTheDocument();
});

it('still warns while a lawyer has not read it, even with every detail filled', async () => {
    mockGetLegalDetails.mockResolvedValue(filledLegal({ draft: true }));

    await renderDoc();

    expect(await screen.findByText(/has not been reviewed by a lawyer/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('[TO FILL');
});
