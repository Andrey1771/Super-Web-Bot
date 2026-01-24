import React, { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/botChanger": "Bot Data",
  "/admin/siteChanger": "Media Manager",
  "/admin/cardAdder": "Catalog",
  "/admin/userInfo": "Login History",
  "/admin/userStats": "Game Statistics",
};

const AdminLayout: React.FC = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const title = useMemo(() => {
    return pageTitles[location.pathname] ?? "Admin";
  }, [location.pathname]);

  return (
    <div className="admin-layout">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="admin-layout__content">
        <Topbar
          title={title}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />
        <main className="admin-layout__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
