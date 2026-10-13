import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IKeycloakService } from "../../iterfaces/i-keycloak-service";

/**
 * Шапка админки: бургер на узком экране и меню профиля.
 *
 * Заголовок страницы и её кнопки здесь больше не показываются — их рисует сама страница
 * (PageHeader), вместе с хлебными крошками, описанием и вкладками раздела. Две шапки подряд
 * повторяли название, и появлялись они через раз: заголовок брался из карты путей, поэтому
 * при переходе между страницами с одинаковым именем в карте наверху оставались кнопки и
 * подпись предыдущей, а после обновления страницы их не было.
 */
type TopbarProps = {
  onToggleSidebar: () => void;
};

type TokenProfile = {
  email?: string;
  preferred_username?: string;
  sub?: string;
  realm_access?: { roles?: string[] };
};

const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar }) => {
  const navigate = useNavigate();
  const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
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
      <div className="admin-topbar__actions">
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
            <div className="admin-menu__dropdown admin-menu__dropdown--left">
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
