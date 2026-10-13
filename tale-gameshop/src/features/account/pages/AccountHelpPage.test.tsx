import React from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import AccountHelpPage from './AccountHelpPage';

/**
 * Блок «Still need help?» в кабинете. Его кнопки были свёрстаны без обработчиков и ничего не делали:
 * «Contact support» должна открывать форму обращения, «Open live chat» — виджет чата в углу сайта.
 */

jest.mock('../components/AccountShell', () => ({
    __esModule: true,
    default: ({children}: {children: React.ReactNode}) => <div>{children}</div>,
}));

jest.mock('../components/NewSupportRequestModal', () => ({
    __esModule: true,
    default: ({isOpen}: {isOpen: boolean}) => (isOpen ? <div role="dialog">New request form</div> : null),
}));

jest.mock('../../../pages/account/help/components/TicketDetailsModal', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../support/supportApi', () => ({
    listSupportTickets: () => Promise.resolve([]),
}));

const renderPage = async () => {
    render(
        <MemoryRouter>
            <AccountHelpPage />
        </MemoryRouter>
    );
    // Дождаться загрузки списка обращений, иначе она завершится после клика и зашумит вывод.
    await screen.findByText('No support requests yet.');
};

it('opens the support request form from the "Still need help?" block', async () => {
    await renderPage();
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', {name: 'Contact support'}));

    expect(screen.getByRole('dialog')).toHaveTextContent('New request form');
});

it('asks the site-wide chat widget to open from "Open live chat"', async () => {
    await renderPage();
    const onOpenChat = jest.fn();
    window.addEventListener('taleshop:open-support-chat', onOpenChat);

    await userEvent.click(screen.getByRole('button', {name: 'Open live chat'}));

    expect(onOpenChat).toHaveBeenCalledTimes(1);
    window.removeEventListener('taleshop:open-support-chat', onOpenChat);
});
