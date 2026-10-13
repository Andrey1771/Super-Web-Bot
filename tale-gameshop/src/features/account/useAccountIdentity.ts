import { useKeycloak } from "@react-keycloak/web";
import { useTranslation } from "react-i18next";
import { useAccountProfile } from "./context/AccountProfileContext";

export interface AccountIdentity {
  /** Профиль ещё грузится и подставить нечего — показываем скелетон, а не выдуманные данные. */
  isLoading: boolean;
  displayName: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
}

/**
 * Кто вошёл — для боковой панели кабинета и карточки на обзоре (раньше обзор подставлял на время загрузки
 * моковые «Alex R.» с чужой почтой, и карточка перескакивала на настоящие данные).
 * Пока профиль не пришёл — данные из токена Keycloak; их нет — скелетон.
 */
export const useAccountIdentity = (): AccountIdentity => {
  const { t } = useTranslation();
  const { profile, isLoading } = useAccountProfile();
  const { keycloak } = useKeycloak();
  const claims = (keycloak?.tokenParsed ?? {}) as { name?: string; preferred_username?: string; email?: string };

  const displayName = profile?.displayName || claims.name || claims.preferred_username || t("account.myAccount");
  const email = profile?.email || claims.email || "";
  const initials =
    (displayName || email)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";

  return {
    isLoading: isLoading && !profile,
    displayName,
    email,
    initials,
    avatarUrl: profile?.avatarUrl ?? null,
  };
};
