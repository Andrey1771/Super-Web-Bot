import React from 'react';
import type { DLCItem } from '../../../models/game-details';

interface DLCListProps {
    items: DLCItem[];
}

const DLCList: React.FC<DLCListProps> = ({ items }) => {
    return (
        <div className="card gd-section-card">
            <h3>DLC & bundles</h3>
            <div className="gd-dlc-list">
                {items.map((item) => (
                    <div key={item.id} className="gd-dlc-item">
                        <img src={item.coverUrl} alt={`${item.title} cover`} />
                        <div className="gd-dlc-info">
                            <div className="gd-dlc-title">{item.title}</div>
                            <div className="gd-dlc-price">${item.price.toFixed(2)}</div>
                        </div>
                        <button className="btn btn-outline" type="button">Add</button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DLCList;
