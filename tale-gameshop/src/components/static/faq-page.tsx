import React from 'react';

const FaqPage: React.FC = () => {
    const faqs = [
        {
            question: 'How do I redeem a game?',
            answer: 'After checkout you will see your activation key with instructions for Steam, Epic, or the listed platform.'
        },
        {
            question: 'Can I cancel an order?',
            answer: 'If the key was not revealed yet, reach out to support and we will cancel or exchange it.'
        },
        {
            question: 'Is my payment information safe?',
            answer: 'We use PCI-compliant providers and never store raw card data on Tale Shop servers.'
        }
    ];

    return (
        <div className="container">
            <div className="card">
                <h1 className="section-title">FAQs</h1>
                <p className="section-subtitle">Short answers to frequent questions from our community.</p>
                <div className="grid-responsive">
                    {faqs.map((item) => (
                        <div className="card" key={item.question}>
                            <h3>{item.question}</h3>
                            <p className="section-subtitle">{item.answer}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FaqPage;
