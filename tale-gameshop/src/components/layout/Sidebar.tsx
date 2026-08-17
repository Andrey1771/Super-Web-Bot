import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useKeycloak } from "@react-keycloak/web";
import { listChatSessions } from "../../api/supportChatApi";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

type NavItem = {
  label: string;
  to?: string;
  icon: React.ReactNode;
  disabled?: boolean;
  roles?: string[];
  badge?: number;
};

const PENDING_CHATS_POLL_MS = 30000;

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

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { keycloak } = useKeycloak();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
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

  // Тип задан явно: по литералам выводился союз, в котором необязательные поля пункта
  // (disabled, badge) есть не у всех веток, и обращение к ним не проходило проверку.
  const groups = useMemo<Array<{ title: string; items: NavItem[] }>>(
    () => [
      {
        title: "Dashboard",
        items: [
          {
            label: "Overview",
            to: "/admin",
            icon: "🏠",
          },
        ],
      },
      {
        title: "Games",
        items: [
          {
            label: "Catalog",
            to: "/admin/cardAdder",
            icon: "🎮",
          },
          {
            label: "Game details",
            to: "/admin/games/details",
            icon: "🧩",
            roles: ["admin"],
          },
          {
            label: "Game keys",
            to: "/admin/games/keys",
            icon: "🔑",
            roles: ["admin"],
          },
          {
            label: "Genres/Tags",
            icon: "🏷️",
            disabled: true,
          },
          {
            label: "Prices/Discounts",
            to: "/admin/game-discounts",
            icon: "💸",
            roles: ["admin"],
          },
        ],
      },
      {
        title: "Orders & Payments",
        items: [
          {
            label: "Orders",
            to: "/admin/orders",
            icon: "🧾",
          },
          {
            label: "Payment issues",
            to: "/admin/payments/issues",
            icon: "🚨",
            roles: ["admin"],
          },
          {
            label: "Refunds",
            icon: "↩️",
            disabled: true,
          },
          {
            label: "Payouts",
            icon: "💳",
            disabled: true,
          },
        ],
      },
      {
        title: "Users",
        items: [
          {
            label: "Users",
            to: "/admin/userInfo",
            icon: "👤",
          },
          {
            label: "Roles",
            icon: "🔐",
            disabled: true,
          },
          {
            label: "Sessions",
            icon: "🕒",
            disabled: true,
          },
        ],
      },
      {
        title: "Support",
        items: [
          {
            label: "Tickets",
            to: "/admin/support/tickets",
            icon: "🎫",
            roles: ["admin", "support"],
          },
          {
            label: "Live chat",
            to: "/admin/support/live-chat",
            icon: "💬",
            roles: ["admin", "support"],
            badge: pendingChats,
          },
          {
            label: "Chat stats",
            to: "/admin/support/chat-stats",
            icon: "📈",
            roles: ["admin", "support"],
          },
          {
            label: "Knowledge",
            to: "/admin/support/knowledge",
            icon: "📚",
            roles: ["admin", "support"],
          },
          {
            label: "Account recovery",
            to: "/admin/support/recovery",
            icon: "🛟",
            roles: ["admin", "support"],
          },
        ],
      },
      {
        title: "Bot / Content",
        items: [
          {
            label: "Bot status",
            to: "/admin/bot",
            icon: "🤖",
          },
          {
            label: "Bot texts",
            to: "/admin/botChanger",
            icon: "✍️",
          },
          {
            label: "Blog posts",
            to: "/admin/blog",
            icon: "📰",
            roles: ["admin", "editor"],
          },
          {
            label: "Blog comments",
            to: "/admin/blog/comments",
            icon: "💬",
            roles: ["admin"],
          },
          {
            label: "Newsletter",
            to: "/admin/newsletter",
            icon: "📧",
            roles: ["admin"],
          },
          {
            label: "Commands",
            icon: "⌨️",
            disabled: true,
          },
          {
            label: "Keyboard Keys",
            icon: "🧩",
            disabled: true,
          },
          {
            label: "Templates",
            icon: "📄",
            disabled: true,
          },
        ],
      },
      {
        title: "Analytics",
        items: [
          {
            label: "Overview",
            to: "/admin/analytics",
            icon: "📈",
          },
          {
            label: "Settings",
            to: "/admin/analytics/settings",
            icon: "🧭",
          },
          {
            label: "Game stats",
            to: "/admin/userStats",
            icon: "📊",
          },
        ],
      },
      {
        title: "System/Settings",
        items: [
          {
            label: "Media",
            to: "/admin/siteChanger",
            icon: "🖼️",
          },
          {
            label: "Import / Export",
            to: "/admin/data-tools",
            icon: "📦",
            roles: ["admin"],
          },
          {
            label: "Settings",
            to: "/admin/settings",
            icon: "⚙️",
          },
        ],
      },
    ],
    [pendingChats]
  );

  return (
    <aside
      className={`admin-sidebar ${isCollapsed ? "collapsed" : ""} ${
        isOpen ? "open" : ""
      }`}
    >
      <div className="admin-sidebar__header">
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__brand-mark">TS</span>
          <div className="admin-sidebar__brand-text">
            <strong>Tale Shop</strong>
            <div className="muted">Admin</div>
          </div>
        </div>
        <button
          className="admin-sidebar__toggle"
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <div className="admin-sidebar__section-title">{group.title}</div>
          <div className="admin-sidebar__nav">
            {group.items.map((item) => {
              if (!hasRoles(item.roles)) {
                return null;
              }
              if (item.disabled || !item.to) {
                return (
                  <div
                    key={item.label}
                    className="admin-sidebar__link admin-sidebar__link--disabled"
                    title="Coming soon"
                  >
                    <span>{item.icon}</span>
                    <span className="admin-sidebar__link-label">{item.label}</span>
                  </div>
                );
              }

              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={({ isActive }) =>
                    `admin-sidebar__link ${
                      isActive ||
                      location.pathname === item.to ||
                      location.pathname.startsWith(`${item.to}/`)
                        ? "active"
                        : ""
                    }`
                  }
                  onClick={onClose}
                  title={item.badge ? `${item.label} — ${item.badge} waiting` : undefined}
                >
                  <span>{item.icon}</span>
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
        </div>
      ))}
    </aside>
  );
};

export default Sidebar;
