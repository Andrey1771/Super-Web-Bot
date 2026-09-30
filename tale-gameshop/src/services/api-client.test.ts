import 'reflect-metadata';

/**
 * Клиент API обновляет токен Keycloak перед запросом: токен живёт пять минут, и без обновления
 * любой вход в API после пяти минут на странице получал 401, хотя человек оставался «вошедшим».
 */

const mockMarkSessionExpired = jest.fn();
const mockKeycloak = {
  authenticated: true,
  token: 'old-token',
  updateToken: jest.fn(async (minValidity: number) => {
    mockKeycloak.token = `fresh-token-${minValidity}`;
    return true;
  })
};

jest.mock('../inversify.config', () => ({
  __esModule: true,
  default: {
    get: (id: symbol | string) =>
      String(id).includes('Keycloak')
        ? { keycloak: mockKeycloak, markSessionExpired: mockMarkSessionExpired }
        : { apiBaseUrl: 'http://api.test', keycloak: {} }
  }
}));

jest.mock('../context/site-preferences', () => ({ currentCountry: () => 'US', currentLang: () => 'pl' }));

import { ApiClient } from './api-client';

type Handler = { fulfilled: (config: { headers?: Record<string, string> }) => Promise<{ headers: Record<string, string> }> };
const requestHandler = (client: ApiClient): Handler =>
  ((client.api.interceptors.request as unknown as { handlers: Handler[] }).handlers[0]);

beforeEach(() => {
  mockKeycloak.authenticated = true;
  mockKeycloak.token = 'old-token';
  mockKeycloak.updateToken.mockClear();
  mockMarkSessionExpired.mockClear();
});

type ResponseHandler = { rejected: (error: unknown) => Promise<never> };
const responseHandler = (client: ApiClient): ResponseHandler =>
  ((client.api.interceptors.response as unknown as { handlers: ResponseHandler[] }).handlers[0]);

it('treats a 401 for a signed-in user as an expired session', async () => {
  const client = new ApiClient();
  await expect(responseHandler(client).rejected({ response: { status: 401 } })).rejects.toBeTruthy();
  expect(mockMarkSessionExpired).toHaveBeenCalledTimes(1);
});

it('leaves a guest 401 alone — nothing to expire', async () => {
  mockKeycloak.authenticated = false;
  const client = new ApiClient();
  await expect(responseHandler(client).rejected({ response: { status: 401 } })).rejects.toBeTruthy();
  expect(mockMarkSessionExpired).not.toHaveBeenCalled();
});

it('refreshes the token before a request and sends the fresh one', async () => {
  const client = new ApiClient();
  const config = await requestHandler(client).fulfilled({ headers: {} });

  expect(mockKeycloak.updateToken).toHaveBeenCalledWith(30);
  expect(config.headers.Authorization).toBe('Bearer fresh-token-30');
  expect(config.headers['X-Buyer-Country']).toBe('US');
  // Язык сайта уходит с каждым запросом: по нему сервер выбирает язык писем по заказу.
  expect(config.headers['Accept-Language']).toBe('pl');
});

it('still sends the current token when the refresh fails, so the server can answer 401 itself', async () => {
  mockKeycloak.updateToken.mockRejectedValueOnce(new Error('refresh failed'));
  const client = new ApiClient();
  const config = await requestHandler(client).fulfilled({ headers: {} });
  expect(config.headers.Authorization).toBe('Bearer old-token');
});

it('does not touch Keycloak for a guest', async () => {
  mockKeycloak.authenticated = false;
  mockKeycloak.token = '';
  const client = new ApiClient();
  const config = await requestHandler(client).fulfilled({ headers: {} });
  expect(mockKeycloak.updateToken).not.toHaveBeenCalled();
  expect(config.headers.Authorization).toBeUndefined();
});
