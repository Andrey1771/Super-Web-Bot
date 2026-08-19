import React from "react";
import { NavLink } from "react-router-dom";

export type PageTab = {
  label: string;
  to: string;
  /** Точное совпадение пути (для корня раздела), иначе — по префиксу. */
  end?: boolean;
};

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: string[];
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
  return (
    <div className="admin-page-header">
      <div className="admin-page-header__main">
        {breadcrumbs && (
          <div className="admin-page-header__breadcrumbs">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb}>
                {crumb}
                {index < breadcrumbs.length - 1 && " → "}
              </span>
            ))}
          </div>
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
      {primaryAction && <div>{primaryAction}</div>}
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
