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

const formatTimestamp = (value: number) => new Date(value).toLocaleString();

const ActiveSessionsCard: React.FC<ActiveSessionsCardProps> = ({
    sessions,
    isLoading,
    onLogoutSession,
    onLogoutAll
}) => {
    return (
        <div className="security-section" data-testid="security-sessions">
            <h3>Active sessions</h3>
            <div className="card security-sessions-card">
                {isLoading && <div className="security-session-empty">Loading sessions...</div>}
                {!isLoading && sessions.length === 0 && (
                    <div className="security-session-empty">No active sessions found.</div>
                )}
                {!isLoading && sessions.map((session) => (
                    <div key={session.id} className="security-session-row">
                        <div className="security-session-icon" aria-hidden="true">
                            <FontAwesomeIcon icon={faDesktop} />
                        </div>
                        <div className="security-session-details">
                            <strong>{session.device}</strong>
                            <span>
                                {formatTimestamp(session.lastAccess)} · IP {session.ipAddress}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="btn btn-outline security-secondary-btn"
                            onClick={() => onLogoutSession(session.id)}
                        >
                            Log out
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                ))}
                <button type="button" className="btn btn-outline security-logout-all" onClick={onLogoutAll} disabled={isLoading}>
                    Log out all sessions
                </button>
            </div>
        </div>
    );
};

export default ActiveSessionsCard;
