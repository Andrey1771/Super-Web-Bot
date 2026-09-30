import React, { createRef } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Column, CustomStore, DataGrid, Paging, Selection, Sorting, formatDate, type DataGridRef } from ".";

/**
 * Таблица админки, заменившая DataGrid из DevExtreme. Проверяется поведение, на которое
 * опираются страницы: окна с сервера при прокрутке, сортировка, выбор строк, классы строк
 * от страницы, refresh() и список колонок.
 */

type Row = { id: string; title: string; price: number; created?: string };

const rows: Row[] = [
  { id: "a", title: "Bravo", price: 20 },
  { id: "b", title: "Alpha", price: 5 },
  { id: "c", title: "Charlie", price: 12 },
];

/** jsdom не умеет IntersectionObserver: подменяем, чтобы «прокрутить» до конца таблицы вручную. */
let reachBottom: () => void = () => undefined;
beforeEach(() => {
  reachBottom = () => undefined;
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe() {
      reachBottom = () => this.callback([{ isIntersecting: true }]);
    }
    disconnect() {}
  };
});

const bodyRows = () => screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-index"));

test("рисует колонки, свои ячейки и текст «нет данных»", () => {
  const { rerender } = render(
    <DataGrid dataSource={rows} keyExpr="id">
      <Column dataField="title" caption="Title" />
      <Column caption="Price" cellRender={({ data }) => <b>${data.price}</b>} />
    </DataGrid>,
  );
  expect(screen.getByText("Title")).toBeInTheDocument();
  expect(screen.getByText("$20")).toBeInTheDocument();

  rerender(
    <DataGrid dataSource={[]} noDataText="Nothing here">
      <Column dataField="title" caption="Title" />
    </DataGrid>,
  );
  expect(screen.getByText("Nothing here")).toBeInTheDocument();
});

test("клик по шапке сортирует загруженные строки, повторный — в обратном порядке", () => {
  render(
    <DataGrid dataSource={rows} keyExpr="id">
      <Column dataField="title" caption="Title" />
    </DataGrid>,
  );
  const titles = () => bodyRows().map((row) => row.textContent);
  expect(titles()).toEqual(["Bravo", "Alpha", "Charlie"]);
  fireEvent.click(screen.getByText("Title"));
  expect(titles()).toEqual(["Alpha", "Bravo", "Charlie"]);
  fireEvent.click(screen.getByText("Title"));
  expect(titles()).toEqual(["Charlie", "Bravo", "Alpha"]);
});

test("с Sorting mode=none шапка не сортирует", () => {
  render(
    <DataGrid dataSource={rows} keyExpr="id">
      <Sorting mode="none" />
      <Column dataField="title" caption="Title" />
    </DataGrid>,
  );
  fireEvent.click(screen.getByText("Title"));
  expect(bodyRows()[0]).toHaveTextContent("Bravo");
});

test("CustomStore грузит следующее окно, когда таблицу докрутили до конца, и останавливается на total", async () => {
  const calls: { skip?: number; take?: number }[] = [];
  const all = Array.from({ length: 5 }, (_, index) => ({ id: String(index), title: `Row ${index}`, price: index }));
  const store = new CustomStore<Row>({
    key: "id",
    load: async (options) => {
      calls.push({ skip: options.skip, take: options.take });
      const skip = options.skip ?? 0;
      return { data: all.slice(skip, skip + (options.take ?? 2)), totalCount: all.length };
    },
  });

  render(
    <DataGrid dataSource={store}>
      <Paging enabled pageSize={2} />
      <Column dataField="title" caption="Title" />
    </DataGrid>,
  );

  await waitFor(() => expect(bodyRows()).toHaveLength(2));
  await act(async () => reachBottom());
  await waitFor(() => expect(bodyRows()).toHaveLength(4));
  await act(async () => reachBottom());
  await waitFor(() => expect(bodyRows()).toHaveLength(5));
  expect(calls).toEqual([{ skip: 0, take: 2 }, { skip: 2, take: 2 }, { skip: 4, take: 2 }]);
});

test("серверная сортировка уходит в CustomStore и начинает загрузку заново", async () => {
  const sorts: unknown[] = [];
  const store = new CustomStore<Row>({
    key: "id",
    load: async (options) => {
      sorts.push(options.sort ?? null);
      return { data: rows, totalCount: rows.length };
    },
  });
  render(
    <DataGrid dataSource={store} remoteOperations={{ paging: true, sorting: true }}>
      <Column dataField="price" caption="Price" />
    </DataGrid>,
  );
  await waitFor(() => expect(sorts).toHaveLength(1));
  fireEvent.click(screen.getByText("Price"));
  await waitFor(() => expect(sorts).toEqual([null, [{ selector: "price", desc: false }]]));
});

test("выбор строк флажками: по одной и «все загруженные»", () => {
  const changes: unknown[][] = [];
  render(
    <DataGrid dataSource={rows} keyExpr="id" onSelectionChanged={(event) => changes.push(event.selectedRowKeys)}>
      <Selection mode="multiple" showCheckBoxesMode="always" selectAllMode="page" />
      <Column dataField="title" caption="Title" />
    </DataGrid>,
  );
  fireEvent.click(within(bodyRows()[1]).getByRole("checkbox"));
  expect(changes.at(-1)).toEqual(["b"]);
  fireEvent.click(screen.getByLabelText("Select all loaded rows"));
  expect(changes.at(-1)).toEqual(["b", "a", "c"]);
  fireEvent.click(screen.getByLabelText("Select all loaded rows"));
  expect(changes.at(-1)).toEqual([]);
});

test("onRowPrepared пересчитывается с каждым рендером: снятое выделение уходит со строки", () => {
  const Page: React.FC<{ selected: string | null }> = ({ selected }) => (
    <DataGrid
      dataSource={rows}
      keyExpr="id"
      onRowPrepared={(event) => {
        if (event.data.id === selected) event.rowElement.classList.add("picked");
      }}
    >
      <Column dataField="title" caption="Title" />
    </DataGrid>
  );
  const { rerender } = render(<Page selected="a" />);
  expect(bodyRows()[0]).toHaveClass("picked");
  rerender(<Page selected="c" />);
  expect(bodyRows()[0]).not.toHaveClass("picked");
  expect(bodyRows()[2]).toHaveClass("picked");
});

test("refresh() перечитывает CustomStore с начала, выбор колонок прячет колонку", async () => {
  let loads = 0;
  const store = new CustomStore<Row>({
    key: "id",
    load: async () => {
      loads++;
      return { data: rows, totalCount: rows.length };
    },
  });
  const ref = createRef<DataGridRef<Row> | null>();
  render(
    <DataGrid dataSource={store} ref={ref}>
      <Column dataField="title" caption="Title" />
      <Column dataField="price" caption="Price" />
    </DataGrid>,
  );
  await waitFor(() => expect(loads).toBe(1));
  await act(async () => {
    await ref.current!.instance().refresh();
  });
  await waitFor(() => expect(loads).toBe(2));

  act(() => ref.current!.instance().showColumnChooser());
  fireEvent.click(within(screen.getByRole("dialog", { name: "Columns" })).getByLabelText("Price"));
  expect(screen.queryByRole("columnheader", { name: "Price" })).not.toBeInTheDocument();
});

test("даты выводятся в формате колонки", () => {
  expect(formatDate(new Date(2026, 8, 30, 7, 5, 9), "yyyy-MM-dd HH:mm:ss")).toBe("2026-09-30 07:05:09");
  render(
    <DataGrid dataSource={[{ id: "a", title: "x", price: 1, created: "2026-09-30T12:00:00" }]} keyExpr="id">
      <Column dataField="created" caption="Created" dataType="date" format="dd.MM.yyyy" />
    </DataGrid>,
  );
  expect(screen.getByText("30.09.2026")).toBeInTheDocument();
});
