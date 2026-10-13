import React from "react";
import { useTranslation } from "react-i18next";
import { CopyButton, TEST_CARD } from "./DemoCredentials";
import { useDemoConfig } from "./useDemoConfig";

/** Остальные поля тестовой карты: Stripe принимает любую будущую дату и любые три цифры — даём готовые, чтобы не думать. */
export const TEST_CARD_EXPIRY = "12/34";
export const TEST_CARD_CVC = "123";

/** Касса демо-сайта: прямо над полем карты — какой картой платить и что вписать в остальные поля. На обычном магазине ничего не рисует. */
const DemoTestCardHint: React.FC = () => {
  const { t } = useTranslation();
  const config = useDemoConfig();
  if (!config?.enabled) {
    return null;
  }
  return (
    <div className="demo-checkout-hint" role="note">
      <span className="demo-checkout-hint__badge">{t("demo.badge")}</span>
      <span className="demo-checkout-hint__text">{t("demo.checkoutHint")}</span>
      <code>{TEST_CARD}</code>
      <CopyButton value={TEST_CARD.replace(/ /g, "")} label={t("demo.testCard")} />
      <dl className="demo-checkout-hint__fields">
        <div>
          <dt>{t("demo.cardExpiry")}</dt>
          <dd><code>{TEST_CARD_EXPIRY}</code></dd>
        </div>
        <div>
          <dt>{t("demo.cardCvc")}</dt>
          <dd><code>{TEST_CARD_CVC}</code></dd>
        </div>
        <div>
          <dt>{t("demo.cardOther")}</dt>
          <dd>{t("demo.cardOtherValue")}</dd>
        </div>
      </dl>
    </div>
  );
};

export default DemoTestCardHint;
