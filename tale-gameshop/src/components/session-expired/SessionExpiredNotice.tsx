import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { IKeycloakService } from '../../iterfaces/i-keycloak-service';
import type { IKeycloakAuthService } from '../../iterfaces/i-keycloak-auth-service';
import { CloseGlyph } from '../common/MediaGlyphs';
import './session-expired-notice.css';

/** Имя события в stateChangedEmitter сервиса Keycloak: сессия закончилась, токен обновить нельзя. */
export const SESSION_EXPIRED_EVENT = 'onSessionExpired';
/** Действие само показало «сессия истекла» с кнопкой входа — общая плашка внизу лишняя, прячем. */
export const SESSION_HANDLED_EVENT = 'onSessionExpiredHandled';

export const acknowledgeSessionExpired = () => {
  try {
    container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService).stateChangedEmitter.emit(SESSION_HANDLED_EVENT);
  } catch {
    // Контейнер не собран (тесты, мини-приложение) — прятать нечего.
  }
};

/**
 * Плашка «сессия истекла». Раньше после 30 минут бездействия сайт молчал: шапка показывала
 * «Account», а каждый запрос получал 401, и человек видел «не работает». Теперь сервис Keycloak
 * при неудачном обновлении токена или 401 от API снимает вход и шлёт событие, а плашка предлагает
 * войти заново с возвратом на ту же страницу. Как в вебе Steam и Epic: тихая просрочка заканчивается
 * предложением войти, а не мёртвыми кнопками.
 */
const SessionExpiredNotice = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
    const show = () => setVisible(true);
    const hide = () => setVisible(false);
    keycloakService.stateChangedEmitter.on(SESSION_EXPIRED_EVENT, show);
    keycloakService.stateChangedEmitter.on(SESSION_HANDLED_EVENT, hide);
    keycloakService.stateChangedEmitter.on('onAuthSuccess', hide);
    return () => {
      keycloakService.stateChangedEmitter.off(SESSION_EXPIRED_EVENT, show);
      keycloakService.stateChangedEmitter.off(SESSION_HANDLED_EVENT, hide);
      keycloakService.stateChangedEmitter.off('onAuthSuccess', hide);
    };
  }, []);

  if (!visible) return null;

  const signIn = () => {
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
    const authService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    void authService.loginWithRedirect(keycloakService.keycloak, window.location.href);
  };

  return (
    <div className="session-expired" role="alert">
      <div className="session-expired__text">
        <strong>{t('session.expired')}</strong>
        <span>{t('session.text')}</span>
      </div>
      <div className="session-expired__actions">
        <button type="button" className="btn btn-primary" onClick={signIn}>
          {t('common.signIn')}
        </button>
        <button type="button" className="session-expired__dismiss" aria-label={t('session.dismiss')} onClick={() => setVisible(false)}>
          <CloseGlyph size={18} />
        </button>
      </div>
    </div>
  );
};

export default SessionExpiredNotice;
