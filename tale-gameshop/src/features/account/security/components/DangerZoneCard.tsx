import React from 'react';

type DangerZoneCardProps = {
    canDeactivate: boolean;
    canDownloadReport: boolean;
    readOnlyHint?: string;
    onDeactivate: () => void;
    onDownloadReport: () => void;
};

const DangerZoneCard: React.FC<DangerZoneCardProps> = ({canDeactivate, canDownloadReport, readOnlyHint, onDeactivate, onDownloadReport}) => {
    return (
        <div className="security-section" data-testid="security-danger">
            <h3>Danger zone</h3>
            <div className="card security-danger-card">
                <div className="security-danger-actions">
                    <button type="button" className="btn btn-outline security-danger-btn" onClick={onDeactivate} disabled={!canDeactivate}>
                        Deactivate account
                    </button>
                    <button type="button" className="btn btn-outline security-secondary-btn" onClick={onDownloadReport} disabled={!canDownloadReport}>
                        Download security report
                    </button>
                </div>
                <div className="security-danger-text">
                    <p>Deactivate your account and sign out from all active sessions.</p>
                    <p>Your account is disabled in identity provider and can be restored only via support.</p>
                    {readOnlyHint && <p>{readOnlyHint}</p>}
                </div>
            </div>
        </div>
    );
};

export default DangerZoneCard;
