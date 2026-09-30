import {useTranslation} from 'react-i18next';
import React from 'react';

type DangerZoneCardProps = {
    onDelete: () => void;
    onDownloadReport: () => void;
};

const DangerZoneCard: React.FC<DangerZoneCardProps> = ({onDelete, onDownloadReport}) => {
    const {t} = useTranslation();
    return (
        <div className="security-section" data-testid="security-danger">
            <h3>{t('account.security.danger.title')}</h3>
            <div className="card security-danger-card">
                <div className="security-danger-actions">
                    <button type="button" className="btn btn-outline security-danger-btn" onClick={onDelete}>
                        {t('account.security.danger.delete')}
                    </button>
                    <button type="button" className="btn btn-outline security-secondary-btn" onClick={onDownloadReport}>
                        {t('account.security.danger.downloadReport')}
                    </button>
                </div>
                <div className="security-danger-text">
                    <p>{t('account.security.danger.text1')}</p>
                    <p>{t('account.security.danger.text2')}</p>
                </div>
            </div>
        </div>
    );
};

export default DangerZoneCard;
