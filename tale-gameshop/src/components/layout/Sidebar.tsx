import React, { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

type NavItem = {
  label: string;
  to?: string;
  icon: React.ReactNode;
  disabled?: boolean;
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const groups = useMemo(
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
            label: "Genres/Tags",
            icon: "🏷️",
            disabled: true,
          },
          {
            label: "Prices/Discounts",
            icon: "💸",
            disabled: true,
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
        title: "Bot / Content",
        items: [
          {
            label: "Bot texts",
            to: "/admin/botChanger",
            icon: "🤖",
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
            label: "Settings",
            icon: "⚙️",
            disabled: true,
          },
        ],
      },
    ],
    []
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
                    `admin-sidebar__link ${isActive ? "active" : ""}`
                  }
                  onClick={onClose}
                >
                  <span>{item.icon}</span>
                  <span className="admin-sidebar__link-label">{item.label}</span>
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
