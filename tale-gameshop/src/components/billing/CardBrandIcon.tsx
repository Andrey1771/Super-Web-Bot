import React from 'react';

// Узнаваемые значки платёжных систем для сохранённых карт и списка принимаемых брендов.
// Бренд приходит от Stripe (card.brand: 'visa' | 'mastercard' | 'amex' | 'discover' | ...),
// плюс поддержаны локальные 'maestro' и 'mir'. Неизвестный бренд → нейтральный значок карты.

type CardBrandIconProps = {
    brand?: string | null;
    className?: string;
};

const VIEWBOX = '0 0 44 28';

const Frame: React.FC<{ fill?: string; stroke?: string; children: React.ReactNode }> = ({
    fill = '#ffffff',
    stroke = '#e5e7eb',
    children
}) => (
    <svg viewBox={VIEWBOX} xmlns="http://www.w3.org/2000/svg" role="presentation">
        <rect x="0.5" y="0.5" width="43" height="27" rx="4" fill={fill} stroke={stroke} />
        {children}
    </svg>
);

const brandLabels: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    maestro: 'Maestro',
    mir: 'Mir',
    amex: 'American Express',
    discover: 'Discover',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    diners: 'Diners Club'
};

const normalize = (brand?: string | null) => {
    const value = (brand ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (value.includes('master')) return 'mastercard';
    if (value.includes('amex') || value.includes('american')) return 'amex';
    if (value.includes('union')) return 'unionpay';
    if (value.includes('diners')) return 'diners';
    return value;
};

const renderMark = (brand: string) => {
    switch (brand) {
        case 'visa':
            return (
                <Frame>
                    <text x="22" y="19" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="13" fontStyle="italic" fontWeight="700" letterSpacing="0.5" fill="#1A1F71">
                        VISA
                    </text>
                </Frame>
            );
        case 'mastercard':
            return (
                <Frame>
                    <circle cx="18" cy="14" r="7" fill="#EB001B" />
                    <circle cx="26" cy="14" r="7" fill="#F79E1B" fillOpacity="0.92" />
                </Frame>
            );
        case 'maestro':
            return (
                <Frame>
                    <circle cx="18" cy="14" r="7" fill="#0099DF" />
                    <circle cx="26" cy="14" r="7" fill="#ED0006" fillOpacity="0.9" />
                </Frame>
            );
        case 'mir':
            return (
                <Frame fill="#16a05a" stroke="none">
                    <text x="22" y="18" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="800" letterSpacing="0.5" fill="#ffffff">
                        МИР
                    </text>
                </Frame>
            );
        case 'amex':
            return (
                <Frame fill="#2E77BC" stroke="none">
                    <text x="22" y="18" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="9" fontWeight="700" letterSpacing="0.4" fill="#ffffff">
                        AMEX
                    </text>
                </Frame>
            );
        case 'discover':
            return (
                <Frame>
                    <text x="20" y="18" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="6.6" fontWeight="700" letterSpacing="0.2" fill="#2a2a2a">
                        DISCOVER
                    </text>
                    <circle cx="37" cy="15" r="4" fill="#F58220" />
                </Frame>
            );
        default:
            // Нейтральный значок карты для остальных брендов (jcb, unionpay, diners, unknown).
            return (
                <Frame>
                    <rect x="5" y="9.5" width="34" height="3.5" rx="1" fill="#cbd5e1" />
                    <rect x="5" y="17" width="13" height="3" rx="1.5" fill="#e2e8f0" />
                    <rect x="30" y="16.5" width="9" height="4" rx="1" fill="#a78bfa" />
                </Frame>
            );
    }
};

const CardBrandIcon: React.FC<CardBrandIconProps> = ({ brand, className }) => {
    const normalized = normalize(brand);
    const label = brandLabels[normalized] ?? (brand ? `${brand} card` : 'Payment card');
    return (
        <span className={`card-brand-icon ${className ?? ''}`} role="img" aria-label={label} title={label}>
            {renderMark(normalized)}
        </span>
    );
};

export default CardBrandIcon;
