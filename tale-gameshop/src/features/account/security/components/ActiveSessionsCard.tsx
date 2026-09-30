import {useTranslation} from 'react-i18next';
import {formatDateTime} from '../../../../i18n/format';
import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faDesktop, faChevronRight} from '@fortawesome/free-solid-svg-icons';
import type {AccountSession} from '../types';

type ActiveSessionsCardProps = {
    sessions: AccountSession[];
    isLoading: boolean;
    onLogoutSession: (id: string) => void;
    onLogoutAll: () => void;
};

const formatTimestamp = (value: number) => formatDateTime(value);

const ActiveSessionsCard: React.FC<ActiveSessionsCardProps> = ({
    sessions,
    isLoading,
    onLogoutSession,
    onLogoutAll
}) => {
    const {t} = useTranslation();
    return (
        <div className="security-section" data-testid="security-sessions">
            <h3>{t('account.security.sessions.title')}</h3>
            <div className="card security-sessions-card">
                {isLoading && <div className="security-session-empty">{t('account.security.sessions.loading')}</div>}
                {!isLoading && sessions.length === 0 && (
                    <div className="security-session-empty">{t('account.security.sessions.none')}</div>
                )}
                {!isLoading && sessions.map((session) => (
                    <div key={session.id} className="security-session-row">
                        <div className="security-session-icon" aria-hidden="true">
                            <FontAwesomeIcon icon={faDesktop} />
                        </div>
                        <div className="security-session-details">
                            <strong>{session.device}</strong>
                            <span>
                                {formatTimestamp(session.lastAccess)} · {t('account.security.sessions.ip')} {session.ipAddress}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="btn btn-outline security-secondary-btn"
                            onClick={() => onLogoutSession(session.id)}
                        >
                            {t('common.logOut')}
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                ))}
                <button type="button" className="btn btn-outline security-logout-all" onClick={onLogoutAll} disabled={isLoading}>
                    {t('account.security.sessions.logOutAll')}
                </button>
            </div>
        </div>
    );
};

export default ActiveSessionsCard;
