/**
 * Ошибка действия — одним правилом на всю витрину, чтобы человек видел причину, а не «попробуйте ещё раз»:
 * 401 — сессия истекла (нужен вход), 409 — конфликт («вы уже жаловались»), 400 — текст с сервера,
 * нет ответа — сеть, остальное — запасной текст вызывающего.
 *
 * Текст сервера берём по коду: сервер шлёт {code, args, message} (или ProblemDetails с detail),
 * и по коду текст находится в словаре `api.*` на языке сайта. Кода нет или он неизвестен —
 * показываем английское сообщение сервера, как раньше.
 */
export type ApiErrorKind = 'session' | 'conflict' | 'validation' | 'network' | 'unknown';

export type ApiErrorDescription = { kind: ApiErrorKind; message: string };

import i18n from '../i18n';
import { countryName } from './region-text';

/** Текст берётся из словаря в момент ошибки — на языке сайта. */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Sign in to continue.';

/** Тело ошибки сервера: обычное {code, message}, ProblemDetails {detail}, старое {error} или событие потока. */
export type ApiErrorPayload = {
  code?: unknown;
  args?: unknown;
  message?: unknown;
  detail?: unknown;
  error?: unknown;
};

type AxiosLikeError = { response?: { status?: number; data?: ApiErrorPayload | string | null }; request?: unknown; message?: string };

const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** Подстановки для перевода; код страны превращаем в название на языке сайта. */
const translationArgs = (args: unknown): Record<string, unknown> => {
  if (!args || typeof args !== 'object') return {};
  const values: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  if (typeof values.country === 'string' && /^[A-Za-z]{2}$/.test(values.country)) {
    values.country = countryName(values.country);
  }
  return values;
};

/**
 * Текст ошибки из тела ответа: перевод по коду, иначе сообщение сервера, иначе запасной текст.
 * Тело — строка (старый ответ) считается сообщением.
 */
export const apiErrorText = (payload: unknown, fallback: string): string => {
  if (typeof payload === 'string') return payload.trim() || fallback;
  if (!payload || typeof payload !== 'object') return fallback;
  const body = payload as ApiErrorPayload;
  const code = asText(body.code);
  // Подстановки нужны и проверке: ключ со счётчиком живёт только с суффиксом множественного числа.
  const args = translationArgs(body.args);
  if (code && i18n.exists('api.' + code, args)) {
    return i18n.t('api.' + code, args);
  }
  return asText(body.message) ?? asText(body.detail) ?? asText(body.error) ?? fallback;
};

/** То же для ошибки axios: текст из ответа или запасной. */
export const serverErrorText = (error: unknown, fallback: string): string =>
  apiErrorText((error as AxiosLikeError | null)?.response?.data, fallback);

/** Есть ли в ответе что показать (код, известный словарю, или текст сервера). */
const hasServerText = (data: unknown): boolean => apiErrorText(data, '') !== '';

export const describeApiError = (error: unknown, fallback: string): ApiErrorDescription => {
  const err = (error ?? {}) as AxiosLikeError;
  const status = err.response?.status;
  const data = err.response?.data;

  if (status === 401) return { kind: 'session', message: i18n.t('errors.sessionExpired') };
  if (status === 409) return { kind: 'conflict', message: apiErrorText(data, fallback) };
  if (status === 400 || status === 422) return { kind: 'validation', message: apiErrorText(data, fallback) };
  // Отказ с объяснением (403 «только покупатели», 429 «слишком часто») — причина важнее статуса.
  if ((status === 403 || status === 404 || status === 410 || status === 429) && hasServerText(data)) {
    return { kind: 'validation', message: apiErrorText(data, fallback) };
  }
  // axios: ответа нет, но запрос был — сеть или сервер недоступен.
  if (!err.response && err.request) return { kind: 'network', message: i18n.t('errors.network') };
  return { kind: 'unknown', message: fallback };
};
