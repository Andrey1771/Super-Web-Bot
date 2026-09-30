import React, { createContext, useContext } from "react";

type AdminHeaderContextValue = {
  /** Заголовок текущей страницы — уходит в заголовок вкладки браузера. */
  title: string;
  setPageTitle: (title: string) => void;
};

export const AdminHeaderContext = createContext<AdminHeaderContextValue | null>(null);

export const useAdminHeader = (): AdminHeaderContextValue => {
  const context = useContext(AdminHeaderContext);
  if (!context) {
    throw new Error("useAdminHeader must be used within AdminHeaderContext");
  }
  return context;
};
