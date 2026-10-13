import { applyLanguage } from '../i18n';
import { apiErrorText, describeApiError, serverErrorText, SESSION_EXPIRED_MESSAGE } from './api-error';

/** Одно правило описания ошибок действий: сессия, конфликт, текст сервера, сеть, запасной текст. */

afterEach(async () => {
  await applyLanguage('en');
});

it('maps a 401 to an expired session regardless of the server text', () => {
  expect(describeApiError({ response: { status: 401, data: { message: 'nope' } } }, 'fallback')).toEqual({
    kind: 'session',
    message: SESSION_EXPIRED_MESSAGE
  });
});

it('passes the server message through for conflicts and validation', () => {
  expect(describeApiError({ response: { status: 409, data: { message: 'You have already reported this review.' } } }, 'fallback')).toEqual({
    kind: 'conflict',
    message: 'You have already reported this review.'
  });
  expect(describeApiError({ response: { status: 400, data: { message: 'Pick a reason for the report.' } } }, 'fallback')).toEqual({
    kind: 'validation',
    message: 'Pick a reason for the report.'
  });
  expect(describeApiError({ response: { status: 409 } }, 'fallback').message).toBe('fallback');
});

it('recognises a request that never got a response as a network problem', () => {
  expect(describeApiError({ request: {}, message: 'Network Error' }, 'fallback')).toEqual({
    kind: 'network',
    message: 'Check your connection and try again.'
  });
});

it('falls back to the caller text for anything else', () => {
  expect(describeApiError(new Error('boom'), 'Could not save that.')).toEqual({ kind: 'unknown', message: 'Could not save that.' });
  expect(describeApiError({ response: { status: 500 } }, 'Could not save that.').kind).toBe('unknown');
});

it('translates a known error code on the language of the site, keeping the server text as fallback', async () => {
  await applyLanguage('ru');
  // Код известен — текст из словаря с подстановками, английское сообщение сервера не показывается.
  expect(apiErrorText({ code: 'review.alreadyReported', message: 'You have already reported this review.' }, 'x')).toBe('Вы уже пожаловались на этот отзыв.');
  expect(apiErrorText({ code: 'ticket.maxFiles', args: { max: 5 }, detail: 'Max 5 files per message.' }, 'x')).toBe('Не более 5 файлов к сообщению.');
  expect(apiErrorText({ code: 'order.wrongPassword', args: { count: 2 } }, 'x')).toBe('Неверный пароль. Осталось 2 попытки.');
  // Код страны в подстановке — названием на языке сайта.
  expect(apiErrorText({ code: 'checkout.notInCountry', args: { title: 'Game', country: 'DE' } }, 'x')).toBe('«Game» нельзя активировать в вашей стране (Германия).');
  // Неизвестный код — сообщение сервера как раньше; ProblemDetails и событие потока — тоже.
  expect(apiErrorText({ code: 'nope.unknown', message: 'Server says so.' }, 'x')).toBe('Server says so.');
  expect(apiErrorText({ detail: 'Problem detail.' }, 'x')).toBe('Problem detail.');
  expect(apiErrorText({ error: 'Stream error.' }, 'x')).toBe('Stream error.');
  expect(apiErrorText('Bare string body.', 'x')).toBe('Bare string body.');
  expect(apiErrorText({}, 'fallback')).toBe('fallback');
  expect(serverErrorText({ response: { status: 400, data: { code: 'promo.notFound', message: 'Promo code does not exist.' } } }, 'x')).toBe('Такого промокода нет.');
});

it('shows the server reason for refusals with a code (403, 429) instead of the generic fallback', () => {
  expect(describeApiError({ response: { status: 403, data: { code: 'review.purchaseOnly', message: 'Only customers…' } } }, 'fallback')).toEqual({
    kind: 'validation',
    message: 'Only customers who bought this game can review it.'
  });
  expect(describeApiError({ response: { status: 403, data: {} } }, 'fallback').kind).toBe('unknown');
});
