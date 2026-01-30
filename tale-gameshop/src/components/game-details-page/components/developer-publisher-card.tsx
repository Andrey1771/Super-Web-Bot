import React from 'react';
import type { DeveloperPublisherInfo } from '../../../models/game-details';

interface DeveloperPublisherCardProps {
    info: DeveloperPublisherInfo;
    developerName: string;
    publisherName: string;
}

const DeveloperPublisherCard: React.FC<DeveloperPublisherCardProps> = ({ info, developerName, publisherName }) => {
    return (
        <div className="card gd-section-card">
            <h3>Developer & Publisher</h3>
            <div className="gd-devpub-row">
                <a href={info.developerUrl} className="gd-devpub-item">
                    <img src={info.developerLogoUrl} alt={`${developerName} logo`} />
                    <div>
                        <div className="gd-devpub-label">Developer</div>
                        <div className="gd-devpub-name">{developerName}</div>
                    </div>
                </a>
                <a href={info.publisherUrl} className="gd-devpub-item">
                    <img src={info.publisherLogoUrl} alt={`${publisherName} logo`} />
                    <div>
                        <div className="gd-devpub-label">Publisher</div>
                        <div className="gd-devpub-name">{publisherName}</div>
                    </div>
                </a>
            </div>
            <button className="btn btn-outline gd-devpub-cta" type="button">More games from this studio</button>
        </div>
    );
};

export default DeveloperPublisherCard;
