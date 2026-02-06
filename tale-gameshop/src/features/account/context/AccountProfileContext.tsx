import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AccountProfile } from "../../../types/account-profile";
import { fetchAccountProfile } from "../../../api/accountApi";

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

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAccountProfile();
      setProfile(data);
    } catch (error) {
      console.error("Failed to load account profile", error);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
