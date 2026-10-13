import React, { useCallback, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { AdminHeaderContext } from "./AdminHeaderContext";

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/bot": "Bot Status",
  "/admin/health": "Service Health",
  "/admin/botChanger": "Bot Data",
  "/admin/siteChanger": "Media Manager",
  "/admin/cardAdder": "Catalog",
  "/admin/games/details": "Game Details",
  "/admin/userInfo": "Login History",
  "/admin/userStats": "Game Statistics",
  "/admin/orders": "Orders",
  "/admin/payments/issues": "Payment issues",
  "/admin/profile": "Profile",
  "/admin/settings": "Settings",
  "/admin/cashback": "Cashback",
  "/admin/data-tools": "Import / Export",
  "/admin/steam-import": "Steam import",
  "/admin/support/live-chat": "Support / Live Chat",
  "/admin/support/chat-stats": "Support / Chat stats",
  "/admin/support/knowledge": "Support / Knowledge",
};

const AdminLayout: React.FC = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Заголовок хранится вместе с путём, для которого его выставили. Сбрасывать его эффектом
  // родителя нельзя: эффекты детей выполняются раньше родительских, поэтому сброс затирал бы
  // заголовок, который страница только что поставила при первой отрисовке, а при переходе
  // между страницами — нет. Сравнение с текущим путём убирает эту зависимость от порядка.
  const [override, setOverride] = useState<{ path: string; title: string } | null>(null);

  const title =
    override?.path === location.pathname
      ? override.title
      : pageTitles[location.pathname] ?? "Admin";

  const path = location.pathname;
  const setPageTitle = useCallback(
    (next: string) =>
      // Тот же заголовок — то же состояние: лишняя перерисовка шапки никому не нужна.
      setOverride((prev) =>
        prev && prev.path === path && prev.title === next ? prev : { path, title: next },
      ),
    [path],
  );

  // Заголовок страницы виден во вкладке браузера: на экране он уже есть — его рисует
  // сама страница (PageHeader), и второй такой же в шапке был бы дублем.
  React.useEffect(() => {
    document.title = `${title} · Tale Shop admin`;
  }, [title]);

  // Бургер и выезжающая панель существуют только на узком экране (медиазапрос 1024px).
  // Само состояние «открыт» при расширении окна никто не сбрасывал: панель оставалась
  // открытой, и убрать её было нечем — кнопка бургера на широком экране уже не показывается.
  React.useEffect(() => {
    const wide = window.matchMedia("(min-width: 1025px)");
    const sync = () => {
      if (wide.matches) {
        setIsSidebarOpen(false);
      }
    };
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  // Переход по пункту меню на узком экране должен закрывать панель: иначе она остаётся
  // поверх только что открытой страницы.
  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <AdminHeaderContext.Provider value={{ title, setPageTitle }}>
      <div className="admin-layout">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className="admin-layout__content">
          <Topbar onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)} />
          <main className="admin-layout__main">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminHeaderContext.Provider>
  );
};

export default AdminLayout;
