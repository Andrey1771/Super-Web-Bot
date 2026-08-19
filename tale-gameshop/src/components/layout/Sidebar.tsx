import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useKeycloak } from "@react-keycloak/web";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faAnglesLeft,
  faAnglesRight,
  faArrowRightArrowLeft,
  faArrowRotateLeft,
  faBook,
  faBoxArchive,
  faChartLine,
  faChevronDown,
  faClockRotateLeft,
  faComments,
  faEnvelopeOpenText,
  faGamepad,
  faGauge,
  faImages,
  faKey,
  faLifeRing,
  faNewspaper,
  faPenToSquare,
  faReceipt,
  faRobot,
  faShieldHalved,
  faSliders,
  faTags,
  faTicket,
  faTriangleExclamation,
  faUserClock,
  faUsers,
  faUserShield,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import { listChatSessions } from "../../api/supportChatApi";
import logo from "../../assets/images/tale-shop-logo.svg";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

type NavItem = {
  label: string;
  to?: string;
  /** Внешняя ссылка (консоль Keycloak): открывается в новой вкладке, активной не подсвечивается. */
  href?: string;
  icon: IconDefinition;
  roles?: string[];
  badge?: number;
};

type NavGroup = {
  key: string;
  title: string;
  items: NavItem[];
};

const PENDING_CHATS_POLL_MS = 30000;
const COLLAPSED_GROUPS_KEY = "taleshop_admin_sidebar_collapsed_groups";

/**
 * Сколько диалогов ждёт человека. Пока счётчика не было, о новом обращении узнавали только
 * из Telegram или почты: в самой админке ничто не менялось, на какой бы странице ты ни сидел.
 */
const usePendingChatCount = (enabled: boolean) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        // pageSize=1: нужен только total, сами диалоги здесь не показываем.
        const response = await listChatSessions({ status: "needs_agent", page: 1, pageSize: 1 });
        if (!cancelled) {
          setCount(response.total ?? 0);
        }
      } catch {
        // Счётчик — подсказка, а не функциональность: молчим, чтобы не сыпать в консоль каждые полминуты.
      }
    };

    load();
    const interval = window.setInterval(load, PENDING_CHATS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled]);

  return count;
};

// Роли и сессии живут в Keycloak, и делать это лучше него мы не станем — ведём в его консоль.
// Адрес — тот же, которым логинится сайт, поэтому в докере и на проде он всегда верный.
export const keycloakConsoleUrl = (section: "" | "users" | "roles" | "sessions" = ""): string | undefined => {
  const cfg = typeof window !== "undefined" ? window.__APP_CONFIG__?.keycloak : undefined;
  if (!cfg?.url || !cfg?.realm) {
    return undefined;
  }
  const base = String(cfg.url).replace(/\/+$/, "");
  return `${base}/admin/master/console/#/${encodeURIComponent(cfg.realm)}${section ? `/${section}` : ""}`;
};

// Свёрнутые группы переживают перезагрузку: меню длинное, и раскладывать его заново при каждом
// входе — та ещё радость.
const readCollapsedGroups = (): Set<string> => {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { keycloak } = useKeycloak();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(readCollapsedGroups);
  // @ts-ignore Тип возвращаемых данных и объекта keycloak отличается
  const resourceRoles = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"] ?? [];
  // @ts-ignore Тип возвращаемых данных и объекта keycloak отличается
  const realmRoles = keycloak.tokenParsed?.realm_access?.roles ?? [];
  const roles = useMemo(() => [...resourceRoles, ...realmRoles], [resourceRoles, realmRoles]);
  const hasRoles = (required?: string[]) => {
    if (!required || required.length === 0) {
      return true;
    }
    return required.some((role) => roles.includes(role));
  };

  // Эндпоинт списка диалогов закрыт теми же ролями, что и сам пункт меню, — без них не опрашиваем.
  const pendingChats = usePendingChatCount(hasRoles(["admin", "support"]));

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      try {
        localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* приватный режим */
      }
      return next;
    });
  }, []);

  /*
   * Структура меню — по тому, чем занимается человек, а не по тому, как устроен код.
   * Дубли названий («Overview» дважды, «Settings» дважды) убраны; серые «Coming soon» —
   * тоже: недоделанное не должно занимать четверть меню. Media переехала к играм: это
   * картинки витрины, а не системная настройка.
   */
  const groups = useMemo<NavGroup[]>(
    () => [
      {
        key: "dashboard",
        title: "Dashboard",
        items: [{ label: "Overview", to: "/admin", icon: faGauge }],
      },
      {
        key: "games",
        title: "Games",
        items: [
          { label: "Catalog", to: "/admin/cardAdder", icon: faGamepad },
          { label: "Game details", to: "/admin/games/details", icon: faPenToSquare, roles: ["admin"] },
          { label: "Game keys", to: "/admin/games/keys", icon: faKey, roles: ["admin"] },
          { label: "Prices", to: "/admin/games/prices", icon: faTags, roles: ["admin"] },
          { label: "Discounts", to: "/admin/game-discounts", icon: faTags, roles: ["admin"] },
          { label: "Promo codes", to: "/admin/promo-codes", icon: faTicket, roles: ["admin"] },
          { label: "Media", to: "/admin/siteChanger", icon: faImages },
        ],
      },
      {
        key: "orders",
        title: "Orders & payments",
        items: [
          { label: "Orders", to: "/admin/orders", icon: faReceipt },
          { label: "Refunds", to: "/admin/payments/refunds", icon: faArrowRotateLeft, roles: ["admin"] },
          { label: "Payment issues", to: "/admin/payments/issues", icon: faTriangleExclamation, roles: ["admin"] },
          { label: "Currencies & FX", to: "/admin/payments/currencies", icon: faArrowRightArrowLeft, roles: ["admin"] },
        ],
      },
      {
        key: "customers",
        title: "Customers",
        items: [
          { label: "Customers", to: "/admin/customers", icon: faUsers, roles: ["admin", "support"] },
          { label: "Roles", href: keycloakConsoleUrl("roles"), icon: faUserShield, roles: ["admin"] },
          { label: "Sessions", href: keycloakConsoleUrl("sessions"), icon: faUserClock, roles: ["admin"] },
        ],
      },
      {
        key: "support",
        title: "Support",
        items: [
          { label: "Live chat", to: "/admin/support/live-chat", icon: faComments, roles: ["admin", "support"], badge: pendingChats },
          { label: "Tickets", to: "/admin/support/tickets", icon: faEnvelopeOpenText, roles: ["admin", "support"] },
          { label: "Moderation", to: "/admin/support/moderation", icon: faShieldHalved, roles: ["admin", "support"] },
          { label: "Knowledge base", to: "/admin/support/knowledge", icon: faBook, roles: ["admin", "support"] },
          { label: "Account recovery", to: "/admin/support/recovery", icon: faLifeRing, roles: ["admin", "support"] },
          { label: "Chat stats", to: "/admin/support/chat-stats", icon: faChartLine, roles: ["admin", "support"] },
        ],
      },
      {
        key: "content",
        title: "Content & bot",
        items: [
          { label: "Blog posts", to: "/admin/blog", icon: faNewspaper, roles: ["admin", "editor"] },
          { label: "Blog comments", to: "/admin/blog/comments", icon: faComments, roles: ["admin"] },
          { label: "Newsletter", to: "/admin/newsletter", icon: faEnvelopeOpenText, roles: ["admin"] },
          { label: "Bot status", to: "/admin/bot", icon: faRobot },
          { label: "Bot texts", to: "/admin/botChanger", icon: faWandMagicSparkles },
        ],
      },
      {
        key: "analytics",
        title: "Analytics",
        items: [
          { label: "Analytics", to: "/admin/analytics", icon: faChartLine },
          { label: "Tracking (GA / Metrika)", to: "/admin/analytics/settings", icon: faSliders },
          { label: "Cart statistics", to: "/admin/userStats", icon: faChartLine },
        ],
      },
      {
        key: "system",
        title: "System",
        items: [
          { label: "Site settings", to: "/admin/settings", icon: faSliders },
          { label: "Import / Export", to: "/admin/data-tools", icon: faBoxArchive, roles: ["admin"] },
          { label: "Login history", to: "/admin/userInfo", icon: faClockRotateLeft, roles: ["admin"] },
          { label: "Keycloak console", href: keycloakConsoleUrl(), icon: faUserShield, roles: ["admin"] },
        ],
      },
    ],
    [pendingChats]
  );

  const isActivePath = (to: string) =>
    to === "/admin" ? location.pathname === "/admin" : location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <aside className={`admin-sidebar ${isCollapsed ? "collapsed" : ""} ${isOpen ? "open" : ""}`}>
      <div className="admin-sidebar__header">
        {/* Бренд — ссылка на дашборд, как логотип витрины ведёт на главную: раньше он ничего не
            делал и выглядел кнопкой, которая не нажимается. Логотип тот же, что на сайте. */}
        <Link className="admin-sidebar__brand" to="/admin" onClick={onClose} title="Dashboard">
          <img className="admin-sidebar__logo" src={logo} alt="Tale Shop" />
          <span className="admin-sidebar__brand-text">
            <strong>Tale Shop</strong>
            <span className="muted">Admin panel</span>
          </span>
        </Link>
        {/* Свернуть/развернуть меню — единственный бургер на десктопе; кнопка в топбаре только
            для узких экранов, где сайдбар выезжает поверх контента. */}
        <button
          className="admin-sidebar__toggle"
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-label={isCollapsed ? "Expand menu" : "Collapse menu"}
          title={isCollapsed ? "Expand menu" : "Collapse menu"}
        >
          <FontAwesomeIcon icon={isCollapsed ? faAnglesRight : faAnglesLeft} />
        </button>
      </div>

      {groups.map((group) => {
        const visible = group.items.filter((item) => hasRoles(item.roles) && (item.to || item.href));
        if (visible.length === 0) {
          return null;
        }
        // Группу с активной страницей не сворачиваем: иначе непонятно, где ты.
        const containsActive = visible.some((item) => item.to && isActivePath(item.to));
        const collapsed = collapsedGroups.has(group.key) && !containsActive && !isCollapsed;
        const groupBadge = visible.reduce((sum, item) => sum + (item.badge ?? 0), 0);

        return (
          <div key={group.key} className="admin-sidebar__group">
            <button
              type="button"
              className={`admin-sidebar__section-title admin-sidebar__section-toggle${collapsed ? " is-collapsed" : ""}`}
              onClick={() => toggleGroup(group.key)}
              aria-expanded={!collapsed}
              title={collapsed ? `Expand ${group.title}` : `Collapse ${group.title}`}
            >
              <span>{group.title}</span>
              {collapsed && groupBadge > 0 && <span className="admin-sidebar__badge">{groupBadge > 99 ? "99+" : groupBadge}</span>}
              <FontAwesomeIcon icon={faChevronDown} className="admin-sidebar__chevron" />
            </button>
            {!collapsed && (
              <div className="admin-sidebar__nav">
                {visible.map((item) => {
                  if (item.href) {
                    return (
                      <a
                        key={item.label}
                        className="admin-sidebar__link"
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${item.label} — opens the Keycloak console`}
                      >
                        <span className="admin-sidebar__icon"><FontAwesomeIcon icon={item.icon} fixedWidth /></span>
                        <span className="admin-sidebar__link-label">{item.label} ↗</span>
                      </a>
                    );
                  }
                  return (
                    <NavLink
                      key={item.label}
                      to={item.to!}
                      className={`admin-sidebar__link ${isActivePath(item.to!) ? "active" : ""}`}
                      onClick={onClose}
                      title={item.badge ? `${item.label} — ${item.badge} waiting` : item.label}
                    >
                      <span className="admin-sidebar__icon"><FontAwesomeIcon icon={item.icon} fixedWidth /></span>
                      <span className="admin-sidebar__link-label">{item.label}</span>
                      {Boolean(item.badge) && (
                        <span className="admin-sidebar__badge" aria-label={`${item.badge} waiting`}>
                          {item.badge! > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
};

export default Sidebar;
