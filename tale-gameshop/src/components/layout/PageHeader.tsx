import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

export type PageTab = {
  label: string;
  to: string;
  /** Точное совпадение пути (для корня раздела), иначе — по префиксу. */
  end?: boolean;
};

/**
 * Куда ведёт крошка с таким названием.
 *
 * Раньше крошки были просто текстом: «Settings → Bot → Bot Data» выглядело как путь, но
 * никуда не вело — приходилось искать раздел в боковом меню заново. Карта здесь, а не в
 * каждой странице, по двум причинам: названия разделов повторяются на десятках страниц,
 * и держать их согласованными в одном месте проще, чем править двадцать пять файлов.
 *
 * Чего тут нет — то и остаётся текстом: раздел без своей страницы (например «System»)
 * ссылкой быть не должен.
 */
const CRUMB_ROUTES: Record<string, string> = {
  Overview: "/admin",

  Catalog: "/admin/cardAdder",
  "Product details": "/admin/games/details",
  "Product keys": "/admin/games/keys",
  Prices: "/admin/games/prices",

  Sales: "/admin/orders",
  Orders: "/admin/orders",
  Refunds: "/admin/payments/refunds",
  "Payment issues": "/admin/payments/issues",
  "Currencies & FX": "/admin/payments/currencies",

  Marketing: "/admin/game-discounts",
  Discounts: "/admin/game-discounts",
  "Promo codes": "/admin/promo-codes",
  Cashback: "/admin/cashback",
  Newsletter: "/admin/newsletter",

  Content: "/admin/blog",
  Blog: "/admin/blog",
  Comments: "/admin/blog/comments",
  Media: "/admin/siteChanger",

  Customers: "/admin/customers",
  "Login history": "/admin/userInfo",

  Support: "/admin/support/live-chat",
  "Live chat": "/admin/support/live-chat",
  Moderation: "/admin/support/moderation",

  Reports: "/admin/analytics",
  Analytics: "/admin/analytics",
  "Period report": "/admin/reports/period",
  "Inventory value": "/admin/reports/inventory",
  "Cart statistics": "/admin/userStats",
  "Abandoned carts": "/admin/reports/abandoned-carts",

  Bot: "/admin/bot",
  Status: "/admin/bot",
  "Bot texts": "/admin/botChanger",

  System: "/admin/settings",
  "Site settings": "/admin/settings",
  Tracking: "/admin/analytics/settings",
  "Import / Export": "/admin/data-tools",
  "Steam import": "/admin/steam-import",

  Account: "/admin/profile",
  Profile: "/admin/profile",
};

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: string[];
  /** Кнопки страницы: раньше они жили в шапке админки и показывались через раз. */
  primaryAction?: React.ReactNode;
  /**
   * Вкладки раздела под заголовком. Так связаны страницы одной сущности, которые исторически
   * живут в разных маршрутах (карточка игры: каталог, детали, ключи, цены, промо, медиа):
   * переключение между ними — один клик, а не поиск по меню.
   */
  tabs?: PageTab[];
};

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumbs,
  primaryAction,
  tabs,
}) => {
  const location = useLocation();

  return (
    <div className="admin-page-header">
      <div className="admin-page-header__main">
        {breadcrumbs && (
          // Список, а не набор span-ов: это навигация, и программы чтения с экрана должны
          // объявлять её как навигацию. Оформление — утилитами Tailwind, как в остальной
          // админке; своего CSS для крошек больше нет.
          <nav aria-label="Breadcrumb" className="text-[13px] text-slate-500">
            <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const to = CRUMB_ROUTES[crumb];
                // Последняя крошка — текущая страница, ссылка на саму себя бессмысленна.
                // Та, что ведёт туда, где мы уже стоим, — тоже.
                const linked = !isLast && to && to !== location.pathname;

                // Стрелка — псевдоэлементом: так она не попадает ни в текст страницы,
                // ни в буфер при копировании, ни в чтение с экрана.
                const separator =
                  index > 0
                    ? "before:mr-1.5 before:text-slate-300 before:content-['→']"
                    : "";

                return (
                  <li key={`${crumb}-${index}`} className={separator}>
                    {linked ? (
                      <Link
                        to={to}
                        className="rounded-sm text-inherit no-underline transition-colors hover:text-violet-600 hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                      >
                        {crumb}
                      </Link>
                    ) : (
                      <span
                        className={isLast ? "font-semibold text-slate-900" : undefined}
                        aria-current={isLast ? "page" : undefined}
                      >
                        {crumb}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <h1 className="admin-page-header__title">{title}</h1>
        {description && <p>{description}</p>}
        {tabs && tabs.length > 0 && (
          <nav className="admin-page-tabs" aria-label="Section">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) => `admin-page-tabs__tab${isActive ? " is-active" : ""}`}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
      {primaryAction && <div className="admin-page-header__actions">{primaryAction}</div>}
    </div>
  );
};

/** Вкладки раздела «Games» — одни на все страницы про игру. */
export const GAMES_TABS: PageTab[] = [
  { label: "Catalog", to: "/admin/cardAdder" },
  { label: "Details", to: "/admin/games/details" },
  { label: "Keys", to: "/admin/games/keys" },
  { label: "Prices", to: "/admin/games/prices" },
  { label: "Discounts", to: "/admin/game-discounts" },
  { label: "Promo codes", to: "/admin/promo-codes" },
  { label: "Media", to: "/admin/siteChanger" },
];

export default PageHeader;
