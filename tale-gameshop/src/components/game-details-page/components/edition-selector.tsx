import React from 'react';
import type { Edition } from '../../../models/game-details';

interface EditionSelectorProps {
    editions: Edition[];
    selectedId: string;
    onChange: (id: string) => void;
}

const EditionSelector: React.FC<EditionSelectorProps> = ({ editions, selectedId, onChange }) => {
    return (
        <div className="card gd-section-card gd-edition-card">
            <h3>Edition</h3>
            <div className="gd-edition-list">
                {editions.map((edition) => (
                    <label key={edition.id} className={`gd-edition-item ${selectedId === edition.id ? 'is-active' : ''}`}>
                        <input
                            type="radio"
                            name="edition"
                            value={edition.id}
                            checked={selectedId === edition.id}
                            onChange={() => onChange(edition.id)}
                        />
                        <div className="gd-edition-info">
                            <div className="gd-edition-title">{edition.name}</div>
                            <div className="gd-edition-description">{edition.description}</div>
                        </div>
                        <div className="gd-edition-price">
                            <span>
                                {edition.pricing.currency}
                                {edition.pricing.price.toFixed(2)}
                            </span>
                            {edition.pricing.oldPrice && (
                                <span className="gd-old-price">
                                    {edition.pricing.currency}
                                    {edition.pricing.oldPrice.toFixed(2)}
                                </span>
                            )}
                        </div>
                    </label>
                ))}
            </div>
            <div className="gd-edition-actions">
                <button className="btn btn-primary" type="button">Add to cart</button>
                <button className="btn btn-outline" type="button">Wishlist</button>
            </div>
            <div className="gd-purchase-note">Instant delivery • Official key • Refund policy</div>
        </div>
    );
};

export default EditionSelector;
