import { kindLabels } from '../../../utils/product-kind-labels';
import { analyticsClient } from '../../../utils/analytics-client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../i18n/format';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faChevronLeft,
    faChevronRight,
    faMagnifyingGlass
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import { useGameKeys } from '../../../hooks/use-game-keys';
import './account-keys-page.css';
import { activationPlace, isSoftware, licenseText } from '../../../utils/software';

const PAGE_SIZE = 4;

const AccountKeysPage: React.FC = () => {
    const { t } = useTranslation();
    const {
        items: keyRows,
        isLoading: isKeysLoading,
        error: keysError,
        reload: reloadKeys
    } = useGameKeys(50);

    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState('Newest');
    const [typeFilter, setTypeFilter] = useState('All types');
    const [page, setPage] = useState(1);

    // Доступные типы ключей формируем из реальных данных + базовые опции.
    const keyTypeOptions = useMemo(() => {
        const set = new Set<string>();
        keyRows.forEach((row) => {
            if (row.keyType) {
                set.add(row.keyType);
            }
        });
        return Array.from(set);
    }, [keyRows]);

    const filteredRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const rows = keyRows.filter((row) => {
            const title = (row.game?.title ?? row.game?.name ?? '').toLowerCase();
            const key = (row.key ?? '').toLowerCase();
            const matchesSearch = query === '' || title.includes(query) || key.includes(query);
            const matchesType = typeFilter === 'All types' || (row.keyType ?? '') === typeFilter;
            return matchesSearch && matchesType;
        });

        return rows.slice().sort((a, b) => {
            const aTime = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
            const bTime = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
            return sortOrder === 'Oldest' ? aTime - bTime : bTime - aTime;
        });
    }, [keyRows, searchQuery, typeFilter, sortOrder]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // При смене фильтров возвращаемся на первую страницу.
    useEffect(() => {
        setPage(1);
    }, [searchQuery, typeFilter, sortOrder]);

    const hasActiveFilters = searchQuery !== '' || sortOrder !== 'Newest' || typeFilter !== 'All types';

    const paginationLabel = isKeysLoading
        ? t('common.loading')
        : keysError
            ? t('account.keys.loadFailed')
            : filteredRows.length === 0
                ? (hasActiveFilters ? t('account.keys.noMatch') : t('account.keys.none'))
                : t('common.showingRange', { from: (currentPage - 1) * PAGE_SIZE + 1, to: Math.min(currentPage * PAGE_SIZE, filteredRows.length), total: filteredRows.length });

    const handleClearFilters = () => {
        setSearchQuery('');
        setSortOrder('Newest');
        setTypeFilter('All types');
        setPage(1);
    };

    const handleCopyKey = async (keyValue: string) => {
        if (!keyValue) {
            return;
        }

        try {
            await navigator.clipboard?.writeText(keyValue);
            // Замыкает путь: покупка без забранного ключа — недоделанная сделка, и по этому
            // событию видно, сколько таких. Сам ключ в аналитику, разумеется, не уходит.
            analyticsClient.trackEvent('key_revealed');
        } catch (error) {
            console.error('Failed to copy key:', error);
        }
    };

    return (
        <AccountShell
            title={t('account.keys.title')}
            sectionLabel={t('account.keys.title')}
            subtitle={(
                <div className="keys-description">
                    <p>{t('account.keys.intro')}</p>
                    <p>
                        {t('account.keys.readOur')}
                        <Link to="/support/docs/activation-guide" className="keys-link">
                            {t('account.keys.activationGuide')}
                        </Link>{' '}
                        {keyRows.some((row) => isSoftware(row.kind)) && (
                            <>
                                {t('account.keys.or')}
                                <Link to="/support/docs/software-activation" className="keys-link">
                                    {t('account.keys.activatingSoftware')}
                                </Link>{' '}
                            </>
                        )}
                        {t('account.keys.forHelp')}
                    </p>
                </div>
            )}
        >
            <div className="card keys-toolbar">
                <div className="keys-toolbar-row">
                    <div className="keys-search">
                        <FontAwesomeIcon icon={faMagnifyingGlass} />
                        <input
                            type="text"
                            placeholder={t('account.keys.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                    <div className="keys-filters">
                        <div className="keys-sort">
                            <span>{t('common.sortLabel')}</span>
                            <select
                                className="keys-select"
                                value={sortOrder}
                                onChange={(event) => setSortOrder(event.target.value)}
                            >
                                <option value="Newest">{t('common.newest')}</option>
                                <option value="Oldest">{t('common.oldest')}</option>
                            </select>
                        </div>
                        <select
                            className="keys-select"
                            value={typeFilter}
                            onChange={(event) => setTypeFilter(event.target.value)}
                        >
                            <option value="All types">{t('account.keys.allTypes')}</option>
                            {keyTypeOptions.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="keys-toolbar-footer">
                    <button
                        type="button"
                        className="btn btn-outline keys-clear-btn"
                        onClick={handleClearFilters}
                        disabled={!hasActiveFilters}
                    >
                        {t('account.keys.clearFilters')}
                    </button>
                </div>
            </div>

            <div className="card keys-table-card">
                <div className="keys-table-wrapper">
                    <table className="keys-table">
                        <thead>
                            <tr>
                                <th>{t('account.keys.product')}</th>
                                <th>{t('account.keys.type')}</th>
                                <th>{t('account.keys.date')}</th>
                                <th>{t('account.keys.keyActivation')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isKeysLoading && (
                                <tr>
                                    <td colSpan={4} className="keys-table-state">
                                        {t('account.keys.loading')}
                                    </td>
                                </tr>
                            )}
                            {!isKeysLoading && keysError && (
                                <tr>
                                    <td colSpan={4} className="keys-table-state">
                                        <div className="keys-table-state-content">
                                            <span>{keysError}</span>
                                            <button type="button" className="btn btn-outline keys-copy-btn" onClick={reloadKeys}>
                                                {t('common.retry')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!isKeysLoading && !keysError && filteredRows.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="keys-table-state">
                                        {hasActiveFilters
                                            ? t('account.keys.noMatchDot')
                                            : t('account.keys.noneDot')}
                                    </td>
                                </tr>
                            )}
                            {!isKeysLoading && !keysError && pagedRows.map((row, index) => {
                                const software = isSoftware(row.kind);
                                const title = row.game?.title ?? row.game?.name ?? kindLabels(software).unknownProduct;
                                const dateLabel = row.issuedAt ? formatDate(row.issuedAt) : t('common.pending');
                                // У ПО тип ключа вендорский и покупателю ничего не говорит — показываем лицензию.
                                const keyType = software
                                    ? licenseText({ termMonths: row.licenseTermMonths, devices: row.licenseDevices, isSubscription: row.licenseIsSubscription, label: row.license }) || t('account.keys.software')
                                    : row.keyType ?? t('account.keys.key');
                                const place = software ? activationPlace(row.activation) : null;

                                return (
                                    <tr key={`${row.key}-${index}`}>
                                        {/* Классы ячеек нужны узкой раскладке: там таблица
                                            превращается в список карточек, и каждая ячейка
                                            встаёт на своё место. По порядку колонок этого
                                            делать нельзя — порядок ещё поменяется. */}
                                        <td className="keys-cell-game">
                                            <div className="keys-game-cell">
                                                <div className="keys-game-cover" aria-hidden="true" />
                                                <span className="keys-product">
                                                    <span>{title}</span>
                                                    {/* Где активировать — прямо под названием: ключ ПО вводят не в Steam. */}
                                                    {software && (
                                                        <span className="keys-activation-note">
                                                            {t('account.keys.activateOn')}
                                                            {row.activation?.url ? (
                                                                <a href={row.activation.url} target="_blank" rel="noreferrer noopener">{place}</a>
                                                            ) : (
                                                                place
                                                            )}
                                                            {' · '}
                                                            <Link to="/support/docs/software-activation">{t('account.keys.howToActivate')}</Link>
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="keys-cell-type">
                                            <span className="badge keys-type-badge">{keyType}</span>
                                        </td>
                                        <td className="keys-cell-date">{dateLabel}</td>
                                        <td className="keys-cell-key">
                                            {row.key ? (
                                                <div className="keys-key-actions">
                                                    <span className="keys-key-pill">{row.key}</span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline keys-copy-btn"
                                                        onClick={() => handleCopyKey(row.key)}
                                                    >
                                                        {t('common.copy')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button type="button" className="btn btn-outline keys-activation-btn">
                                                    {t('account.keys.goToActivation')}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="keys-pagination">
                <div className="keys-pagination-controls">
                    <button
                        type="button"
                        className="btn btn-outline keys-page-btn"
                        aria-label={t('common.previousPage')}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage <= 1}
                    >
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNumber) => (
                        <button
                            key={pageNumber}
                            type="button"
                            className={`btn btn-outline keys-page-btn ${pageNumber === currentPage ? 'is-active' : ''}`}
                            onClick={() => setPage(pageNumber)}
                        >
                            {pageNumber}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="btn btn-outline keys-page-btn"
                        aria-label={t('common.nextPage')}
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage >= totalPages}
                    >
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                </div>
                <span className="keys-pagination-note">{paginationLabel}</span>
            </div>

        </AccountShell>
    );
};

export default AccountKeysPage;
