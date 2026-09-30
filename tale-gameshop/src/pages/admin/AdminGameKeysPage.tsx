import PageHeader, { GAMES_TABS } from "../../components/layout/PageHeader";
import React, { useCallback, useRef, useState } from "react";
import Drawer from "../../components/ui/Drawer";
import KeyInventorySection from "../../components/admin/KeyInventorySection";
import KeyStockOverview from "../../components/admin/KeyStockOverview";
import KeyRegionStock from "../../components/admin/KeyRegionStock";
import "./game-keys-page.css";

/**
 * Ключи по играм.
 *
 * Пул ключей открывается панелью по клику на строку остатка. Раньше он появлялся внизу
 * страницы — примерно двумя экранами ниже, без перехода и без подсветки: страница просто
 * становилась длиннее где-то за пределами видимого, и понять, к какой игре относится
 * появившийся блок, было нельзя.
 *
 * Отдельного поля выбора игры здесь больше нет: таблица остатков и так показывает весь
 * каталог (включая игры без единого ключа) и умеет искать, поэтому второй поиск на той же
 * странице только путал — их было три на одном экране.
 */
const AdminGameKeysPage: React.FC = () => {
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);

  /**
   * Есть ли в формах панели набранное, которое пропадёт при закрытии.
   *
   * Именно ref, а не состояние: панель закрывается обычным обработчиком нажатия клавиши,
   * который срабатывает сразу, а состояние доезжает к следующей отрисовке. С состоянием
   * между «вставил ключи» и «промахнулся мимо панели» остаётся щель, в которую вставленное
   * теряется молча. Значение отсюда не рисуется, поэтому перерисовка и не нужна.
   */
  const unsavedRef = useRef(false);

  const requestClose = useCallback(() => {
    if (unsavedRef.current && !window.confirm("The keys you pasted have not been added yet. Close and lose them?")) {
      return;
    }
    unsavedRef.current = false;
    setSelected(null);
  }, []);

  const markUnsaved = useCallback((dirty: boolean) => {
    unsavedRef.current = dirty;
  }, []);

  return (
    <div className="admin-grid">
      <PageHeader
        title="Product keys"
        description="Key pool per game or software: stock, import, manual grants. Pick a row to open its keys."
        breadcrumbs={["Catalog", "Product keys"]}
        tabs={GAMES_TABS}
      />

      <KeyStockOverview
        onSelectGame={(id, title) => setSelected({ id, title })}
        selectedGameId={selected?.id}
      />
      <KeyRegionStock onSelectGame={(id, title) => setSelected({ id, title })} />

      <div className="keys-drawer">
        <Drawer
          isOpen={Boolean(selected)}
          title={selected ? `Keys — ${selected.title}` : "Keys"}
          onClose={requestClose}
        >
          {/* Секция монтируется вместе с панелью: закрыли — состояние формы добавления
              ключей не остаётся висеть от прошлой игры. */}
          {selected && <KeyInventorySection gameId={selected.id} onDirtyChange={markUnsaved} />}
        </Drawer>
      </div>
    </div>
  );
};

export default AdminGameKeysPage;
