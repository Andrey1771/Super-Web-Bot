import React, { createContext, useContext } from "react";

export type HeaderAction =
  | {
      type: "button";
      id: string;
      label: string;
      icon?: React.ReactNode;
      variant?: "primary" | "outline";
      onClick: () => void;
    }
  | {
      type: "link";
      id: string;
      label: string;
      icon?: React.ReactNode;
      to: string;
    }
  | {
      type: "menu";
      id: string;
      label: string;
      icon?: React.ReactNode;
      items: Array<{
        id: string;
        label: string;
        onClick?: () => void;
        to?: string;
        danger?: boolean;
      }>;
    };

type AdminHeaderContextValue = {
  title: string;
  actions: HeaderAction[];
  setHeaderActions: (actions: HeaderAction[]) => void;
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
