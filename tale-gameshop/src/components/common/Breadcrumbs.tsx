import React from 'react';
import { Link } from 'react-router-dom';
import './breadcrumbs.css';

export type Crumb = {
    label: string;
    /** Путь от корня. У последней ступени его нет — это текущая страница. */
    to?: string;
};

/**
 * Путь до текущей страницы.
 *
 * Нужен не только для навигации: он показывает, где человек оказался, когда пришёл
 * из поиска, а не с главной. Разметку BreadcrumbList поисковики показывают в выдаче
 * вместо голого адреса.
 *
 * Последняя ступень намеренно не ссылка — вести на страницу, где уже находишься, незачем.
 */
const Breadcrumbs: React.FC<{ items: Crumb[] }> = ({ items }) => {
    if (items.length === 0) {
        return null;
    }

    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.label,
            ...(item.to ? { item: `${window.location.origin}${item.to}` } : {})
        }))
    };

    return (
        <nav className="breadcrumbs" aria-label="Breadcrumb">
            <ol>
                {items.map((item, index) => (
                    <li key={`${item.label}-${index}`}>
                        {item.to ? (
                            <Link to={item.to}>{item.label}</Link>
                        ) : (
                            <span aria-current="page">{item.label}</span>
                        )}
                        {index < items.length - 1 && (
                            <span className="breadcrumbs-separator" aria-hidden="true">
                                /
                            </span>
                        )}
                    </li>
                ))}
            </ol>
            {/* Разметку вставляем сырой: React экранировал бы скобки и кавычки,
                и робот получил бы не JSON, а текст. */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />
        </nav>
    );
};

export default Breadcrumbs;
