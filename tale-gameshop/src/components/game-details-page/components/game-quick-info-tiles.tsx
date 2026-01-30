import React from 'react';
import type { QuickInfoTile } from '../../../models/game-details';

interface GameQuickInfoTilesProps {
    tiles: QuickInfoTile[];
}

const iconMap: Record<string, string> = {
    language: '🌐',
    age: '🔞',
    online: '👥',
    controller: '🎮'
};

const GameQuickInfoTiles: React.FC<GameQuickInfoTilesProps> = ({ tiles }) => {
    return (
        <div className="gd-quick-info-grid">
            {tiles.map((tile) => (
                <div key={tile.id} className="gd-quick-info-tile card">
                    <div className="gd-quick-info-icon" aria-hidden="true">
                        {iconMap[tile.icon] ?? 'ℹ️'}
                    </div>
                    <div>
                        <div className="gd-quick-info-label">{tile.label}</div>
                        <div className="gd-quick-info-value">{tile.value}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default GameQuickInfoTiles;
