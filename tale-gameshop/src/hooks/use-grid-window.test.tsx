import React, { useCallback, useState } from "react";
import { render, waitFor } from "@testing-library/react";
import { DataGrid, Column, Paging, Scrolling, Sorting } from "devextreme-react/data-grid";
import { GRID_PAGE_SIZE, REMOTE_PAGING, useGridWindow } from "./use-grid-window";

/**
 * Проверка того, что таблица с серверной загрузкой не перезапускает саму себя.
 *
 * Поводом стала страница цен: загрузка строк меняла состояние страницы, из-за этого
 * пересобирались колонки, смена колонок заставляла DevExtreme перечитать данные — и таблица
 * уходила в бесконечный круг, мигая и не гася «Loading…». Симптом виден только в браузере,
 * поэтому проверяем то, что можно измерить: сколько раз таблица сходила за данными.
 */

type Row = { id: string; title: string };

const rows: Row[] = Array.from({ length: 5 }, (_, index) => ({
  id: String(index),
  title: `Game ${index}`,
}));

/** Сколько раз хранилище сходило за окном строк. */
let loadCalls = 0;

beforeEach(() => {
  loadCalls = 0;
});

/** Таблица с динамическими колонками — ровно как на странице цен. */
const Grid: React.FC<{ currencies: string[] }> = ({ currencies }) => {
  const load = useCallback(async () => {
    loadCalls++;
    return { items: rows, total: rows.length };
  }, []);

  const { source, loaded, total } = useGridWindow<Row>(load, "id");

  return (
    <div>
      <p>{`${loaded} of ${total ?? 0}`}</p>
      <DataGrid
        dataSource={source}
        showBorders
        height={300}
        width="100%"
        remoteOperations={REMOTE_PAGING}
        onCellPrepared={() => undefined}
      >
        <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
        <Paging enabled pageSize={GRID_PAGE_SIZE} />
        <Sorting mode="none" />

        <Column dataField="title" caption="Game" />
        {currencies.map((currency) => (
          <Column key={currency} caption={currency} cellRender={() => <span>{currency}</span>} />
        ))}
      </DataGrid>
    </div>
  );
};

test("таблица забирает данные один раз и не перезапускает себя", async () => {
  render(<Grid currencies={["USD", "EUR"]} />);

  await waitFor(() => expect(loadCalls).toBeGreaterThan(0));
  // Даём таблице время «раскачаться»: цикл проявляется именно после первой загрузки.
  await new Promise((resolve) => setTimeout(resolve, 700));

  expect(loadCalls).toBeLessThanOrEqual(2);
});

/**
 * Сторож против повторения той же ошибки.
 *
 * Объект настроек, записанный прямо в разметке грида, создаётся заново на каждый рендер.
 * devextreme-react сравнивает свойства по ссылке, поэтому считает это сменой настроек,
 * пересоздаёт источник и грузит данные снова — а загрузка вызывает следующий рендер.
 * Замер на этом же гриде: с объектом в разметке было 10 загрузок вместо одной, в браузере
 * таблица мигала и не гасила «Loading…».
 *
 * Настройки должны лежать константами вне компонента (см. REMOTE_PAGING рядом).
 */
test("настройки гридов не собираются заново на каждый рендер", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");

  // Свойства, которые DevExtreme применяет к источнику данных или к разметке целиком.
  const risky = ["remoteOperations", "scrolling", "columnChooser", "pager", "selection", "stateStoring"];
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) {
        continue;
      }

      const source = fs.readFileSync(full, "utf8");
      if (!source.includes("DataGrid")) {
        continue;
      }
      for (const prop of risky) {
        if (source.includes(`${prop}={{`)) {
          offenders.push(`${path.relative(__dirname, full)}: ${prop}`);
        }
      }
    }
  };

  walk(path.join(__dirname, ".."));

  expect(offenders).toEqual([]);
});
