import React from 'react';

const HelpCentrePage: React.FC = () => {
    return (
        <div className="container">
            <div className="card">
                <h1 className="section-title">Help Centre</h1>
                <p className="section-subtitle">Find quick answers to the most common Tale Shop questions.</p>
                <div className="grid-responsive">
                    <div className="card">
                        <h3>Managing your account</h3>
                        <p className="section-subtitle">Update your profile, change your password, and review active sessions from the Account page.</p>
                    </div>
                    <div className="card">
                        <h3>Payments & refunds</h3>
                        <p className="section-subtitle">We support secure card payments. Refunds are processed back to the original method within 5–7 days.</p>
                    </div>
                    <div className="card">
                        <h3>Game library access</h3>
                        <p className="section-subtitle">Your purchased keys and downloads stay available in your library after checkout.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HelpCentrePage;
