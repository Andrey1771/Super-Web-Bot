import React, { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { AdminHeaderContext, HeaderAction } from "./AdminHeaderContext";

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/botChanger": "Bot Data",
  "/admin/siteChanger": "Media Manager",
  "/admin/cardAdder": "Catalog",
  "/admin/userInfo": "Login History",
  "/admin/userStats": "Game Statistics",
  "/admin/orders": "Orders",
  "/admin/profile": "Profile",
  "/admin/settings": "Settings",
  "/admin/data-tools": "Import / Export",
};

const AdminLayout: React.FC = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [actions, setActions] = useState<HeaderAction[]>([]);
  const [pageTitle, setPageTitle] = useState("Admin");

  const title = useMemo(() => {
    return pageTitles[location.pathname] ?? "Admin";
  }, [location.pathname]);

  React.useEffect(() => {
    setPageTitle(title);
    setActions([]);
  }, [title]);

  return (
    <AdminHeaderContext.Provider
      value={{
        title: pageTitle,
        actions,
        setHeaderActions: setActions,
        setPageTitle,
      }}
    >
      <div className="admin-layout">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className="admin-layout__content">
          <Topbar
            title={pageTitle}
            actions={actions}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          />
          <main className="admin-layout__main">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminHeaderContext.Provider>
  );
};

export default AdminLayout;
