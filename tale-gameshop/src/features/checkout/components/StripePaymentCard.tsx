import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import './stripe-payment-card.css';

type StripePaymentCardProps = {
    children: React.ReactNode;
};

const StripePaymentCard: React.FC<StripePaymentCardProps> = ({children}) => {
    const { t } = useTranslation();
    return (
    <div className="card stripe-payment-card" data-testid="stripe-payment-card">
        <div className="stripe-payment-header">
            <h2>{t('checkout.paymentMethod')}</h2>
            <p>{t('checkout.stripeNote')}</p>
        </div>
        <div className="stripe-payment-body">{children}</div>
        {/* Раньше здесь стоял нессылающийся текст про документы, одного из которых не
            существовало вовсе. Теперь все три открываются. */}
        <p className="stripe-payment-note">
            {t('checkout.agreeBefore')}
            <Link to="/support/docs/terms-of-sale">{t('checkout.termsOfSale')}</Link>,{' '}
            <Link to="/support/docs/refund-policy">{t('checkout.refundPolicy')}</Link>{t('checkout.and')}
            <Link to="/support/docs/regional-restrictions">{t('checkout.regionalRestrictions')}</Link>.
        </p>
    </div>
    );
};

export default StripePaymentCard;
