import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCircleInfo,
    faClock,
    faFileLines,
    faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons';
import { supportDocs } from '../../content/support/docs';
import type { SupportDoc, SupportDocCallout } from '../../content/support/docs';
import './support-doc-page.css';

const slugify = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Грубая оценка «минут чтения» по объёму текста — как в блоге, для ощущения ухоженной статьи.
const estimateReadingMinutes = (doc: SupportDoc): number => {
    const words = [
        doc.shortDescription,
        doc.intro ?? '',
        doc.callout?.text ?? '',
        ...doc.sections.flatMap((section) => [
            section.title,
            section.intro ?? '',
            section.callout?.text ?? '',
            ...section.bullets
        ])
    ]
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length;
    return Math.max(1, Math.round(words / 180));
};

const Callout: React.FC<{ callout: SupportDocCallout }> = ({ callout }) => (
    <div className={`support-doc-callout is-${callout.tone}`}>
        <FontAwesomeIcon
            icon={callout.tone === 'warning' ? faTriangleExclamation : faCircleInfo}
            className="support-doc-callout-icon"
        />
        <div>
            {callout.title && <strong>{callout.title}</strong>}
            <p>{callout.text}</p>
        </div>
    </div>
);

const SupportDocPage: React.FC = () => {
    const { docId } = useParams<{ docId: string }>();
    const doc = supportDocs.find((item) => item.id === docId);

    if (!doc) {
        return (
            <div className="support-doc-page">
                <div className="container">
                    <div className="card support-doc-notfound">
                        <h1>Document not found</h1>
                        <p>Please return to Support to browse our guides and policies.</p>
                        <Link to="/support" className="btn btn-primary">
                            Back to Support
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const otherDocs = supportDocs.filter((item) => item.id !== doc.id);
    const readingMinutes = estimateReadingMinutes(doc);

    return (
        <div className="support-doc-page">
            <div className="container">
                <div className="support-doc-breadcrumbs">
                    <Link to="/">Home</Link>
                    <span>/</span>
                    <Link to="/support">Support</Link>
                    <span>/</span>
                    <span>{doc.title}</span>
                </div>

                <div className="support-doc-layout">
                    <main className="support-doc-main">
                        <header className="card support-doc-hero">
                            <span className={`support-doc-kind is-${doc.kind}`}>
                                {doc.kind === 'policy' ? 'Policy' : 'Guide'}
                            </span>
                            <h1>{doc.title}</h1>
                            <p className="support-doc-lead">{doc.intro ?? doc.shortDescription}</p>
                            <div className="support-doc-meta">
                                <span>
                                    <FontAwesomeIcon icon={faClock} /> {readingMinutes} min read
                                </span>
                                <span>{doc.lastUpdated}</span>
                                {doc.action && (
                                    <Link to={doc.action.to} className="btn btn-primary support-doc-action">
                                        {doc.action.label}
                                    </Link>
                                )}
                            </div>
                        </header>

                        {doc.callout && <Callout callout={doc.callout} />}

                        {doc.sections.map((section, index) => (
                            <section
                                key={section.title}
                                id={slugify(section.title)}
                                className="card support-doc-section"
                            >
                                <div className="support-doc-section-header">
                                    <span className="support-doc-section-num" aria-hidden="true">
                                        {index + 1}
                                    </span>
                                    <h2>{section.title}</h2>
                                </div>
                                {section.intro && <p className="support-doc-section-intro">{section.intro}</p>}
                                {section.ordered ? (
                                    <ol className="support-doc-steps">
                                        {section.bullets.map((bullet, stepIndex) => (
                                            <li key={bullet}>
                                                <span className="support-doc-step-num" aria-hidden="true">
                                                    {stepIndex + 1}
                                                </span>
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <ul className="support-doc-list">
                                        {section.bullets.map((bullet) => (
                                            <li key={bullet}>{bullet}</li>
                                        ))}
                                    </ul>
                                )}
                                {section.callout && <Callout callout={section.callout} />}
                            </section>
                        ))}

                        <section className="card support-doc-cta">
                            <div>
                                <h2>Didn’t find what you need?</h2>
                                <p>Our support team replies within a few hours — attach your order number to speed things up.</p>
                            </div>
                            <div className="support-doc-cta-actions">
                                <Link to="/account/help" className="btn btn-primary">
                                    Contact support
                                </Link>
                                <Link to="/support" className="btn btn-outline">
                                    Back to Support
                                </Link>
                            </div>
                        </section>
                    </main>

                    <aside className="support-doc-aside">
                        <nav className="card support-doc-toc" aria-label="On this page">
                            <h3>On this page</h3>
                            <ul>
                                {doc.sections.map((section, index) => (
                                    <li key={section.title}>
                                        <a href={`#${slugify(section.title)}`}>
                                            <span aria-hidden="true">{index + 1}</span>
                                            {section.title}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                        <div className="card support-doc-related">
                            <h3>More guides &amp; policies</h3>
                            <ul>
                                {otherDocs.map((item) => (
                                    <li key={item.id}>
                                        <span className="support-doc-related-icon" aria-hidden="true">
                                            <FontAwesomeIcon icon={faFileLines} />
                                        </span>
                                        <Link to={item.route}>{item.title}</Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default SupportDocPage;
