import { useTranslation } from 'react-i18next';
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faXmark } from '@fortawesome/free-solid-svg-icons';
import CardBrandIcon, { cardBrandLabel, normalizeCardBrand } from './CardBrandIcon';
import './payment-card-tile.css';

export interface PaymentCardTileMethod {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
    label?: string | null;
}

interface PaymentCardTileProps {
    method: PaymentCardTileMethod;
    onSetDefault?: (id: string) => void;
    onRemove?: (id: string) => void;
    busy?: boolean;
}

/** Цвета «пластика» по платёжной системе; незнакомая система — фиолетовый сайта. */
const PLASTIC_CLASS: Record<string, string> = {
    visa: 'is-visa',
    mastercard: 'is-mastercard',
    maestro: 'is-maestro',
    amex: 'is-amex',
    discover: 'is-discover',
    mir: 'is-mir',
};

/**
 * Сохранённая карта в кабинете, нарисованная как карта: пропорции и цвет платёжной системы, название системы и её
 * знак, номер моноширинным, срок обычными словами, метка «Default» на самой карте. Раньше это была строка настроек
 * с мелким значком, и с первого взгляда не читалось, что перед тобой карта и какая из них основная.
 */
const PaymentCardTile: React.FC<PaymentCardTileProps> = ({ method, onSetDefault, onRemove, busy = false }) => {
    const { t } = useTranslation();
    const brand = normalizeCardBrand(method.brand);
    const brandName = cardBrandLabel(method.brand);
    const expiry = `${String(method.expMonth).padStart(2, '0')}/${method.expYear}`;
    const name = `${t('billing.endingIn', { brand: brandName, last4: method.last4 })}${method.isDefault ? t('billing.defaultSuffix') : ''}`;
    // Своя подпись показывается, только если несёт что-то новое: «Default» уже говорит звезда, «Card» — знак системы.
    const label = method.label && !/^(default|card)$/i.test(method.label.trim()) ? method.label : null;

    return (
        <div className="payment-card" data-testid="payment-card">
            <div className={`payment-card__plastic ${PLASTIC_CLASS[brand] ?? 'is-generic'}`} data-testid="payment-card-plastic">
                {/* Как в кошельках Stripe и PayPal: форма и цвет карты остаются, а надписи — обычными словами, без
                    чипа и «VALID THRU». Имитация пластика читалась как игрушка, а мелкая подпись над датой терялась. */}
                <div className="payment-card__top">
                    <span className="payment-card__brand-name">
                        {brandName}
                        {label && <small className="payment-card__label">{label}</small>}
                    </span>
                    <CardBrandIcon brand={method.brand} className="payment-card__brand" />
                </div>
                <div className="payment-card__number" role="img" aria-label={name}>
                    <span aria-hidden="true">••••</span><span aria-hidden="true">••••</span><span aria-hidden="true">••••</span>
                    <span className="payment-card__last4" aria-hidden="true">{method.last4}</span>
                </div>
                <div className="payment-card__bottom">
                    <span className="payment-card__expiry" aria-hidden="true">{t('billing.expires', { expiry })}</span>
                    {/* Действия прямо на карте: звезда — основная (у основной залита и служит меткой), крестик — удалить.
                        Отдельная строка кнопок под картой смотрелась оторванной от неё. */}
                    <span className="payment-card__tools">
                        {method.isDefault ? (
                            <span className="payment-card__tool is-active" role="img" aria-label={t('billing.defaultCard')} title={t('billing.defaultCard')}>
                                <FontAwesomeIcon icon={faStar} />
                            </span>
                        ) : onSetDefault ? (
                            <button type="button" className="payment-card__tool" onClick={() => onSetDefault(method.id)} disabled={busy} aria-label={t('billing.setDefault')} title={t('billing.setDefault')}>
                                <FontAwesomeIcon icon={faStar} />
                            </button>
                        ) : null}
                        {onRemove && (
                            <button type="button" className="payment-card__tool payment-card__tool--danger" onClick={() => onRemove(method.id)} disabled={busy} aria-label={t('billing.removeCard')} title={t('billing.removeCard')}>
                                <FontAwesomeIcon icon={faXmark} />
                            </button>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default PaymentCardTile;
