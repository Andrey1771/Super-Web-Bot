import React, { useState } from 'react';
import type { MediaItem } from '../../../models/game-details';

interface GameplayCardProps {
    trailer: MediaItem;
    screenshots: MediaItem[];
}

const GameplayCard: React.FC<GameplayCardProps> = ({ trailer, screenshots }) => {
    const [activeScreenshot, setActiveScreenshot] = useState<MediaItem | null>(null);

    return (
        <div className="card gd-section-card">
            <h2>Gameplay & trailer</h2>
            <div className="gd-video-embed">
                <video controls preload="metadata" poster={trailer.thumbUrl} aria-label="Official gameplay trailer">
                    <source src={trailer.url} />
                </video>
                <div className="gd-video-overlay">
                    <span className="gd-video-play" aria-hidden="true">▶</span>
                    <span className="gd-video-title">Official Gameplay Trailer</span>
                </div>
            </div>
            <div className="gd-screenshot-grid">
                {screenshots.map((shot) => (
                    <button
                        key={shot.id}
                        type="button"
                        className="gd-screenshot"
                        onClick={() => setActiveScreenshot(shot)}
                        aria-label="Open screenshot"
                    >
                        <img src={shot.thumbUrl} alt="Gameplay screenshot" loading="lazy" />
                        <span className="gd-screenshot-overlay">View</span>
                    </button>
                ))}
            </div>
            {activeScreenshot && (
                <div className="gd-lightbox" role="dialog" aria-modal="true">
                    <button
                        className="gd-lightbox-close"
                        type="button"
                        aria-label="Close screenshot"
                        onClick={() => setActiveScreenshot(null)}
                    >
                        ✕
                    </button>
                    <img src={activeScreenshot.url} alt="Expanded gameplay screenshot" />
                </div>
            )}
        </div>
    );
};

export default GameplayCard;
