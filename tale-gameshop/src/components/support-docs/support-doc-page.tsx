import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { supportDocs } from '../../content/support/docs';
import './support-doc-page.css';

const SupportDocPage: React.FC = () => {
    const { docId } = useParams<{ docId: string }>();
    const doc = supportDocs.find((item) => item.id === docId);

    if (!doc) {
        return (
            <div className="support-doc-page">
                <div className="container support-doc-container">
                    <div className="card support-doc-card">
                        <Link to="/support" className="btn btn-outline support-doc-back">
                            Back to Support
                        </Link>
                        <h1>Document not found</h1>
                        <p>Please return to Support to browse our guides and policies.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="support-doc-page">
            <div className="container support-doc-container">
                <div className="card support-doc-card">
                    <Link to="/support" className="btn btn-outline support-doc-back">
                        Back to Support
                    </Link>
                    <div className="support-doc-header">
                        <h1>{doc.title}</h1>
                        <p className="support-doc-updated">{doc.lastUpdated}</p>
                    </div>
                    <div className="support-doc-body">
                        {doc.sections.map((section) => (
                            <section key={section.title} className="support-doc-section">
                                <h2>{section.title}</h2>
                                <ul>
                                    {section.bullets.map((bullet) => (
                                        <li key={bullet}>{bullet}</li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SupportDocPage;
