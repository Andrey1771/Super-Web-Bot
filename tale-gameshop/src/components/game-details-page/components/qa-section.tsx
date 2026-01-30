import React from 'react';
import type { QAItem } from '../../../models/game-details';

interface QASectionProps {
    items: QAItem[];
}

const QASection: React.FC<QASectionProps> = ({ items }) => {
    return (
        <div className="card gd-qa-section">
            <div className="gd-qa-header">
                <h3>Q & A</h3>
                <button className="btn btn-outline" type="button">Ask a question</button>
            </div>
            <div className="gd-qa-list">
                {items.map((item) => (
                    <div key={item.id} className="gd-qa-item">
                        <div className="gd-qa-question">{item.question}</div>
                        <div className="gd-qa-answer">{item.answer}</div>
                        <div className="gd-qa-time">{item.createdAt}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default QASection;
