import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventEmitter from 'eventemitter3';
import SessionExpiredNotice, { SESSION_EXPIRED_EVENT } from './SessionExpiredNotice';

/**
 * Плашка «сессия истекла»: появляется по событию сервиса Keycloak, «Sign in» уводит на вход с
 * возвратом на текущую страницу, крестик прячет, успешный вход прячет сам.
 */

const mockEmitter = new EventEmitter();
const mockKeycloak = { authenticated: false };
const mockLogin = jest.fn().mockResolvedValue(undefined);

jest.mock('../../inversify.config', () => ({
  __esModule: true,
  default: {
    get: (id: symbol) =>
      String(id).includes('IKeycloakAuthService')
        ? { loginWithRedirect: mockLogin }
        : { keycloak: mockKeycloak, stateChangedEmitter: mockEmitter }
  }
}));

beforeEach(() => mockLogin.mockClear());

it('stays hidden until the session expires, then offers to sign in on the same page', async () => {
  render(<SessionExpiredNotice />);
  expect(screen.queryByRole('alert')).toBeNull();

  act(() => {
    mockEmitter.emit(SESSION_EXPIRED_EVENT);
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Your session has expired.');

  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(mockLogin).toHaveBeenCalledWith(mockKeycloak, window.location.href);
});

it('hides when an action has already shown its own sign-in prompt', () => {
  render(<SessionExpiredNotice />);
  act(() => {
    mockEmitter.emit(SESSION_EXPIRED_EVENT);
  });
  expect(screen.getByRole('alert')).toBeInTheDocument();
  act(() => {
    mockEmitter.emit('onSessionExpiredHandled');
  });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('can be dismissed and disappears by itself after a successful sign-in', async () => {
  render(<SessionExpiredNotice />);
  act(() => {
    mockEmitter.emit(SESSION_EXPIRED_EVENT);
  });
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('alert')).toBeNull();

  act(() => {
    mockEmitter.emit(SESSION_EXPIRED_EVENT);
  });
  expect(screen.getByRole('alert')).toBeInTheDocument();
  act(() => {
    mockEmitter.emit('onAuthSuccess');
  });
  expect(screen.queryByRole('alert')).toBeNull();
});
