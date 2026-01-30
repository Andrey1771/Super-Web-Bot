import React from 'react';

interface GameDetailsCardProps {
    genres: string[];
    themes: string[];
    modes: string[];
    tags: string[];
    supportedLanguages: string[];
    cloudSaves: string;
}

const GameDetailsCard: React.FC<GameDetailsCardProps> = ({
    genres,
    themes,
    modes,
    tags,
    supportedLanguages,
    cloudSaves
}) => {
    return (
        <div className="card gd-section-card">
            <h2>Game details</h2>
            <div className="gd-details-table">
                <div className="gd-details-row">
                    <span className="gd-details-label">Genre</span>
                    <span className="gd-details-value">{genres.join(', ')}</span>
                </div>
                <div className="gd-details-row">
                    <span className="gd-details-label">Themes</span>
                    <span className="gd-details-value">{themes.join(', ')}</span>
                </div>
                <div className="gd-details-row">
                    <span className="gd-details-label">Modes</span>
                    <span className="gd-details-value">{modes.join(', ')}</span>
                </div>
                <div className="gd-details-row">
                    <span className="gd-details-label">Tags</span>
                    <span className="gd-details-value">{tags.join(', ')}</span>
                </div>
                <div className="gd-details-row">
                    <span className="gd-details-label">Supported languages</span>
                    <span className="gd-details-value">{supportedLanguages.join(', ')}</span>
                </div>
                <div className="gd-details-row">
                    <span className="gd-details-label">Cloud saves</span>
                    <span className="gd-details-value">{cloudSaves}</span>
                </div>
            </div>
        </div>
    );
};

export default GameDetailsCard;
