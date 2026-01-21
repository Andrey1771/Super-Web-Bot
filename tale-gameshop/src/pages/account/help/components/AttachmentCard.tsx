import React from 'react';
import type { AttachmentMeta } from '../../../../types/support';
import './ticket-details-modal.css';

interface AttachmentCardProps {
    attachment: AttachmentMeta;
}

const formatSize = (size: number) => {
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentCard: React.FC<AttachmentCardProps> = ({ attachment }) => {
    return (
        <div className="ticket-attachment">
            <div className="ticket-attachment__icon" aria-hidden="true">📎</div>
            <div className="ticket-attachment__meta">
                <span className="ticket-attachment__name">{attachment.fileName}</span>
                <span className="ticket-attachment__size">{formatSize(attachment.sizeBytes)}</span>
            </div>
            <a
                className="ticket-attachment__download"
                href={`/api/support/attachments/${attachment.id}/download`}
                target="_blank"
                rel="noreferrer"
            >
                Download
            </a>
        </div>
    );
};

export default AttachmentCard;
