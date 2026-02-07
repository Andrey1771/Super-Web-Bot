import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AccountProfile } from "../../../types/account-profile";
import { fetchAccountProfile } from "../../../api/accountApi";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IKeycloakService } from "../../../iterfaces/i-keycloak-service";

type AccountProfileContextValue = {
  profile: AccountProfile | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  updateAvatar: (avatarUrl: string | null) => void;
};

const AccountProfileContext = createContext<AccountProfileContextValue | undefined>(undefined);

export const AccountProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);

  const refresh = useCallback(async () => {
    if (!keycloakService.keycloak?.authenticated) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchAccountProfile();
      setProfile(data);
    } catch (error: any) {
      if (error?.response?.status !== 401) {
        console.error("Failed to load account profile", error);
      }
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [keycloakService]);

  const updateAvatar = useCallback((avatarUrl: string | null) => {
    setProfile((prev) => (prev ? { ...prev, avatarUrl } : prev));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      profile,
      isLoading,
      refresh,
      updateAvatar,
    }),
    [profile, isLoading, refresh, updateAvatar]
  );

  return <AccountProfileContext.Provider value={value}>{children}</AccountProfileContext.Provider>;
};

export const useAccountProfile = () => {
  const context = useContext(AccountProfileContext);
  if (!context) {
    throw new Error("useAccountProfile must be used within AccountProfileProvider");
  }
  return context;
};
