import { useTranslation } from 'react-i18next';
import { currentLang } from '../../context/site-preferences';
import React from 'react';
import { Link } from 'react-router-dom';
import { useKeycloak } from '@react-keycloak/web';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCoins } from '@fortawesome/free-solid-svg-icons';
import { formatMoney } from '../../utils/format-money';
import { CashbackTier, cashbackForOrder, tierForSpend, tierName } from '../../utils/cashback';
import { useCashbackProgram } from '../../hooks/use-cashback-program';
import { useCashbackStatus } from '../../hooks/use-cashback-status';
import './cashback-hints.css';

/**
 * Кэшбэк там, где покупают: страница игры, корзина, оформление.
 *
 * Оформление — часть интерфейса магазина, а не баннер: зелёный — где деньги вернутся,
 * лиловый — где нужно действие (войти, включить списание). Гостю считаем по стартовому
 * уровню и зовём войти; вошедшему — по его уровню.
 */

export type CashbackOffer = {
    /** Keycloak ответил — до этого ничего не показываем, чтобы не мигать гостем. */
    ready: boolean;
    /** Показываем вид покупателя: вошёл или включено демо. */
    member: boolean;
    /** Цифры из демо-набора, а не с сервера. */
    isDemo: boolean;
    /**
     * Программа включена. Выключенная — ни начислений, ни списаний: обещать «+$0.60 вернётся» или предлагать оплату
     * кэшбэком было бы неправдой, поэтому все подсказки прячутся. Демо показывает их всегда.
     */
    enabled: boolean;
    tier: CashbackTier;
    available: number;
    signIn: () => void;
};

export const useCashbackOffer = (): CashbackOffer => {
    const { keycloak } = useKeycloak();
    const status = useCashbackStatus();
    const { tiers, enabled } = useCashbackProgram();
    const member = status.signedIn || status.isDemo;
    // Вошедшему — его уровень с сервера (там же, где баланс); гостю и демо — по условиям программы.
    const serverTier = status.signedIn && !status.isDemo
        ? status.level.tiers.find((item) => item.id === status.level.tierId)
        : undefined;
    return {
        ready: status.ready || status.isDemo,
        member,
        isDemo: status.isDemo,
        enabled: status.isDemo || enabled,
        // Гость — всегда стартовый уровень: чужого прогресса у него нет.
        tier: serverTier ?? tierForSpend(member ? status.totalSpent : 0, tiers),
        available: member ? status.available : 0,
        signIn: () => keycloak.login({ redirectUri: window.location.href, locale: currentLang() }),
    };
};

const Coin: React.FC = () => (
    <span className="cbh-coin" aria-hidden="true">
        <FontAwesomeIcon icon={faCoins} />
    </span>
);

/** Под ценой на странице игры. */
export const GameCashbackBadge: React.FC<{ price: number; currency: string }> = ({ price, currency }) => {
    const { t } = useTranslation();
    const offer = useCashbackOffer();
    if (!offer.ready || !offer.enabled || price <= 0) {
        return null;
    }
    const amount = formatMoney(cashbackForOrder(price, offer.tier), currency);

    return offer.member ? (
        <span className="cbh-badge">
            <Coin />{t('cashback.badge', { amount })}
            <em>{t('cashback.atTier', { percent: offer.tier.percent, tier: tierName(offer.tier) })}</em>
        </span>
    ) : (
        <span className="cbh-badge is-guest">
            <Coin />{t('cashback.badge', { amount })}
            <em>
                ·{' '}
                <button type="button" className="cbh-link" onClick={offer.signIn}>{t('common.signIn')}</button>
                {' '}{t('cashback.signInToEarn')}
            </em>
        </span>
    );
};

/** В итоге корзины, над кнопкой Checkout. */
export const CartCashbackNote: React.FC<{ total: number; currency: string }> = ({ total, currency }) => {
    const { t } = useTranslation();
    const offer = useCashbackOffer();
    if (!offer.ready || !offer.enabled || total <= 0) {
        return null;
    }
    const amount = formatMoney(cashbackForOrder(total, offer.tier), currency);

    return offer.member ? (
        <div className="cbh-note">
            <Coin />
            <div>
                <b>{t('cashback.comesBack', { amount })}</b>
                <small>
                    {t('cashback.atYourLevel', { percent: offer.tier.percent, tier: tierName(offer.tier) })}{' '}
                    <Link to="/rewards" className="cbh-link">{t('cashback.howItWorks')}</Link>
                </small>
            </div>
        </div>
    ) : (
        <div className="cbh-note is-guest">
            <Coin />
            <div>
                <b>{t('cashback.getBack', { amount })}</b>
                <small>{t('cashback.fromFirstOrder', { percent: offer.tier.percent })}</small>
            </div>
            <button type="button" className="cbh-link cbh-note-action" onClick={offer.signIn}>{t('common.signIn')}</button>
        </div>
    );
};

type CheckoutToggleProps = {
    available: number;
    applied: number;
    on: boolean;
    onToggle: (next: boolean) => void;
    currency: string;
};

/** Списание кэшбэка при оформлении: весь доступный баланс, но не больше суммы заказа. */
export const CheckoutCashbackToggle: React.FC<CheckoutToggleProps> = ({ available, applied, on, onToggle, currency }) => {
    const { t } = useTranslation();
    return (
    <label className={`cbh-pay${on ? ' is-on' : ''}`}>
        <Coin />
        <span className="cbh-pay-text">
            <b>{on ? t('cashback.paying', { amount: formatMoney(applied, currency) }) : t('cashback.payWith')}</b>
            <small>
                {on
                    ? applied < available
                        ? t('cashback.stays', { amount: formatMoney(available - applied, currency) })
                        : t('cashback.wholeBalance')
                    : t('cashback.available', { amount: formatMoney(available, currency) })}
            </small>
        </span>
        <input
            type="checkbox"
            role="switch"
            className="cbh-switch"
            checked={on}
            onChange={(event) => onToggle(event.target.checked)}
            aria-label={t('cashback.payWith')}
        />
    </label>
    );
};

type CheckoutBackProps = {
    member: boolean;
    tier: CashbackTier;
    /** Сколько платится деньгами — с этой суммы и считается возврат. */
    paid: number;
    /** Часть оплачена кэшбэком — тогда показываем, с какой суммы процент. */
    showBase: boolean;
    currency: string;
    onSignIn: () => void;
};

/** Под итогом оформления: сколько вернётся с этого заказа. */
export const CheckoutCashbackBack: React.FC<CheckoutBackProps> = ({ member, tier, paid, showBase, currency, onSignIn }) => {
    const { t } = useTranslation();
    const amount = formatMoney(cashbackForOrder(paid, tier), currency);
    if (!member) {
        return (
            <div className="cbh-back is-guest">
                <span><FontAwesomeIcon icon={faCoins} /> {t('cashback.getBack', { amount })}</span>
                <button type="button" className="cbh-link" onClick={onSignIn}>{t('common.signIn')}</button>
            </div>
        );
    }
    return (
        <div className="cbh-back">
            <span>
                <FontAwesomeIcon icon={faCoins} /> {t('cashback.comesBackAfter', { percent: tier.percent })}
                {showBase && t('cashback.ofAmount', { amount: formatMoney(paid, currency) })}
            </span>
            <strong>+{amount}</strong>
        </div>
    );
};
