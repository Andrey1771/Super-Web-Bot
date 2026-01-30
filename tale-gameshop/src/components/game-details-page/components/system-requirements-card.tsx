import React from 'react';

interface SystemRequirementsCardProps {
    minimum: string[];
    recommended: string[];
}

const SystemRequirementsCard: React.FC<SystemRequirementsCardProps> = ({ minimum, recommended }) => {
    return (
        <div className="card gd-section-card">
            <h2>System requirements</h2>
            <div className="gd-system-grid">
                <div>
                    <h4>Minimum</h4>
                    <ul className="gd-requirements-list">
                        {minimum.map((item, index) => (
                            <li key={`min-${index}`}>{item}</li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h4>Recommended</h4>
                    <ul className="gd-requirements-list">
                        {recommended.map((item, index) => (
                            <li key={`rec-${index}`}>{item}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default SystemRequirementsCard;
