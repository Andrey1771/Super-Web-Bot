import React from 'react';
import type { AwardsBadge } from '../../../models/game-details';

interface AboutGameCardProps {
    paragraphs: string[];
    features: string[];
    awards: AwardsBadge[];
}

const AboutGameCard: React.FC<AboutGameCardProps> = ({ paragraphs, features, awards }) => {
    return (
        <div className="card gd-section-card">
            <h2>About this game</h2>
            <div className="gd-paragraphs">
                {paragraphs.map((paragraph, index) => (
                    <p key={`about-${index}`}>{paragraph}</p>
                ))}
            </div>
            <div className="gd-feature-block">
                <h3 className="gd-subtitle">Key features</h3>
                <ul className="gd-feature-list">
                    {features.map((feature, index) => (
                        <li key={`feature-${index}`}>{feature}</li>
                    ))}
                </ul>
            </div>
            <div className="gd-awards">
                <h3 className="gd-subtitle">Awards & nominations</h3>
                <div className="gd-awards-row">
                    {awards.map((award) => (
                        <div key={award.id} className="gd-award-badge">
                            <img src={award.iconUrl} alt="Trophy badge" />
                            <span>{award.title}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AboutGameCard;
