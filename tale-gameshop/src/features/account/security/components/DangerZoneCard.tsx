import React from 'react';

type DangerZoneCardProps = {
    onDelete: () => void;
    onDownloadReport: () => void;
};

const DangerZoneCard: React.FC<DangerZoneCardProps> = ({onDelete, onDownloadReport}) => {
    return (
        <div className="security-section" data-testid="security-danger">
            <h3>Danger zone</h3>
            <div className="card security-danger-card">
                <div className="security-danger-actions">
                    <button type="button" className="btn btn-outline security-danger-btn" onClick={onDelete}>
                        Delete account
                    </button>
                    <button type="button" className="btn btn-outline security-secondary-btn" onClick={onDownloadReport}>
                        Download security report
                    </button>
                </div>
                <div className="security-danger-text">
                    <p>Permanently delete your account and data. This action cannot be undone.</p>
                    <p>Proceed with caution and make sure you have downloaded your security report.</p>
                </div>
            </div>
        </div>
    );
};

export default DangerZoneCard;
