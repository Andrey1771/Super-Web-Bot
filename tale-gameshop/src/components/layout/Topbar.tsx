import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IKeycloakService } from "../../iterfaces/i-keycloak-service";
import type { HeaderAction } from "./AdminHeaderContext";

type TopbarProps = {
  title: string;
  actions: HeaderAction[];
  onToggleSidebar: () => void;
};

type TokenProfile = {
  email?: string;
  preferred_username?: string;
  sub?: string;
  realm_access?: { roles?: string[] };
};

const Topbar: React.FC<TopbarProps> = ({ title, actions, onToggleSidebar }) => {
  const navigate = useNavigate();
  const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const token = keycloakService.keycloak.tokenParsed as TokenProfile | undefined;
  const displayName = token?.preferred_username ?? token?.email ?? "Admin";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const roleLabel = useMemo(() => {
    const roles = token?.realm_access?.roles ?? [];
    if (roles.includes("admin")) {
      return "Admin";
    }
    return roles[0] ?? "User";
  }, [token?.realm_access?.roles]);

  const handleActionClick = (action: HeaderAction) => {
    if (action.type === "link") {
      navigate(action.to);
    }
    if (action.type === "button") {
      action.onClick();
    }
  };

  const handleMenuItem = (item: HeaderAction & { type: "menu" }["items"][number]) => {
    if (item.to) {
      navigate(item.to);
    }
    if (item.onClick) {
      item.onClick();
    }
    setMenuOpenId(null);
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    await keycloakService.keycloak.logout({
      redirectUri: `${window.location.origin}/logIn`,
    });
  };

  return (
    <header className="admin-topbar">
      {/* Открыть выезжающее меню — только на узких экранах (см. .admin-topbar__menu в CSS):
          на десктопе сайдбар всегда виден, и второй бургер рядом с первым только путал. */}
      <button className="btn btn-outline admin-topbar__menu" onClick={onToggleSidebar} aria-label="Open menu">
        ☰
      </button>
      <div className="admin-topbar__title">{title}</div>
      <div className="admin-topbar__actions">
        {actions.map((action) => {
          if (action.type === "menu") {
            return (
              <div key={action.id} className="admin-menu">
                <button
                  className="btn btn-outline"
                  onClick={() => setMenuOpenId(menuOpenId === action.id ? null : action.id)}
                >
                  {action.icon}
                  {action.label}
                </button>
                {menuOpenId === action.id && (
                  <div className="admin-menu__dropdown">
                    {action.items.map((item) => (
                      <button
                        key={item.id}
                        className={`admin-menu__item ${item.danger ? "danger" : ""}`}
                        onClick={() => handleMenuItem(item)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const variantClass = action.variant === "outline" ? "btn-outline" : "btn-primary";
          return (
            <button
              key={action.id}
              className={`btn ${variantClass}`}
              onClick={() => handleActionClick(action)}
            >
              {action.icon}
              {action.label}
            </button>
          );
        })}
        <div className="admin-menu">
          <button
            className="admin-profile"
            onClick={() => setProfileOpen((prev) => !prev)}
          >
            <span className="admin-profile__avatar">{initials}</span>
            <span className="admin-profile__text">
              <span className="admin-profile__name">{displayName}</span>
              <span className="admin-profile__role">{roleLabel}</span>
            </span>
            <span className="admin-profile__chevron" aria-hidden="true">▾</span>
          </button>
          {profileOpen && (
            <div className="admin-menu__dropdown admin-menu__dropdown--right">
              <button
                className="admin-menu__item"
                onClick={() => {
                  setProfileOpen(false);
                  navigate("/admin/profile");
                }}
              >
                My profile
              </button>
              <button
                className="admin-menu__item"
                onClick={() => {
                  setProfileOpen(false);
                  navigate("/admin/settings");
                }}
              >
                Settings
              </button>
              <button className="admin-menu__item danger" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
