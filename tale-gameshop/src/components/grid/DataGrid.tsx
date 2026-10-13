import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CustomStore, { isCustomStore, type SortDescriptor } from "./custom-store";
import "./data-grid.css";

/*
 * Таблица админки. Раньше это был DataGrid из DevExtreme, но с 25-й версии он требует
 * платный лицензионный ключ. Здесь ровно то подмножество его API, которым пользуются
 * страницы: колонки дочерними элементами, загрузка окнами при прокрутке (CustomStore),
 * сортировка на сервере или по загруженным строкам, свои ячейки, классы строк, выбор строк
 * флажками, выбор колонок и refresh() через ref. Поэтому страницы поменяли только импорт.
 */

type Align = "left" | "right" | "center";

export type ColumnProps<T = any> = {
  dataField?: string;
  caption?: string;
  name?: string;
  width?: number | string;
  minWidth?: number;
  alignment?: Align;
  visible?: boolean;
  allowSorting?: boolean;
  dataType?: "string" | "number" | "date" | "datetime" | "boolean";
  format?: string;
  cssClass?: string;
  /** Колонка остаётся на месте при горизонтальной прокрутке (у левого края). */
  fixed?: boolean;
  defaultSortOrder?: "asc" | "desc";
  sortOrder?: "asc" | "desc";
  calculateCellValue?: (row: T) => unknown;
  cellRender?: (cell: CellInfo<T>) => React.ReactNode;
  headerCellRender?: (header: { column: ColumnProps<T> }) => React.ReactNode;
};

export type CellInfo<T = any> = {
  data: T;
  value: any;
  text: string;
  displayValue: any;
  rowIndex: number;
  column: ColumnProps<T>;
};

export type PagingProps = { enabled?: boolean; pageSize?: number };
export type ScrollingProps = { mode?: string; rowRenderingMode?: string; showScrollbar?: string };
export type SortingProps = { mode?: "none" | "single" | "multiple" };
export type SelectionProps = { mode?: "none" | "single" | "multiple"; showCheckBoxesMode?: string; selectAllMode?: string };

// Настроечные элементы ничего не рисуют: таблица читает их свойства, как devextreme-react.
// Как у DevExtreme, строка и значение в колонке — any: колонка не знает тип источника.
export const Column = (_: ColumnProps<any>) => null;
export const Paging = (_: PagingProps) => null;
export const Scrolling = (_: ScrollingProps) => null;
export const Sorting = (_: SortingProps) => null;
export const Selection = (_: SelectionProps) => null;

export type RowPreparedEvent<T> = { rowType: "data"; data: T; rowIndex: number; rowElement: HTMLTableRowElement };
export type CellPreparedEvent<T> = {
  rowType: "data";
  data: T;
  rowIndex: number;
  value: unknown;
  column: ColumnProps<T>;
  cellElement: HTMLTableCellElement;
};
export type RowClickEvent<T> = { rowType: "data"; data: T; rowIndex: number; key: unknown; event: React.MouseEvent };
export type SelectionChangedEvent<T> = { selectedRowKeys: unknown[]; selectedRowsData: T[] };

export type DataGridProps<T> = {
  dataSource?: T[] | CustomStore<T> | null;
  keyExpr?: string;
  height?: number | string;
  width?: number | string;
  noDataText?: string;
  showBorders?: boolean;
  columnAutoWidth?: boolean;
  wordWrapEnabled?: boolean;
  hoverStateEnabled?: boolean;
  remoteOperations?: boolean | { paging?: boolean; sorting?: boolean };
  selectedRowKeys?: unknown[];
  className?: string;
  onRowClick?: (event: RowClickEvent<T>) => void;
  onRowPrepared?: (event: RowPreparedEvent<T>) => void;
  onCellPrepared?: (event: CellPreparedEvent<T>) => void;
  onSelectionChanged?: (event: SelectionChangedEvent<T>) => void;
  children?: React.ReactNode;
  // Остальные настройки DevExtreme (showRowLines, allowColumnResizing, scrolling и т.п.)
  // принимаются, чтобы страницы не менялись, но на вид таблицы не влияют.
  [option: string]: unknown;
};

export type DataGridInstance = {
  /** Перечитать строки с начала (для CustomStore) или перерисовать массив. */
  refresh: () => Promise<void>;
  /** Открыть список колонок, где их можно скрыть и вернуть. */
  showColumnChooser: () => void;
};

export type DataGridRef<T = unknown, K = unknown> = { instance: () => DataGridInstance; __types?: [T, K] };

/** Сколько строк массива дорисовывается за раз при прокрутке. */
const ARRAY_WINDOW = 100;

function flattenChildren(children: React.ReactNode): React.ReactElement[] {
  const result: React.ReactElement[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      result.push(...flattenChildren((child.props as { children?: React.ReactNode }).children));
    } else {
      result.push(child);
    }
  });
  return result;
}

function readPath(row: unknown, path: string | undefined): unknown {
  if (!path || row == null) return undefined;
  return path.split(".").reduce<unknown>((value, key) => (value == null ? value : (value as Record<string, unknown>)[key]), row);
}

function pad(value: number, size = 2) {
  return String(value).padStart(size, "0");
}

/** Формат даты в духе DevExtreme: yyyy, MM, dd, HH, mm, ss. */
export function formatDate(value: Date, format: string): string {
  return format
    .replace(/yyyy/g, String(value.getFullYear()))
    .replace(/MM/g, pad(value.getMonth() + 1))
    .replace(/dd/g, pad(value.getDate()))
    .replace(/HH/g, pad(value.getHours()))
    .replace(/mm/g, pad(value.getMinutes()))
    .replace(/ss/g, pad(value.getSeconds()));
}

function displayText(value: unknown, column: ColumnProps): string {
  if (value == null || value === "") return "";
  if (column.dataType === "date" || column.dataType === "datetime") {
    const date = value instanceof Date ? value : new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      if (column.format) return formatDate(date, column.format);
      return column.dataType === "date" ? date.toLocaleDateString() : date.toLocaleString();
    }
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const dateA = a instanceof Date ? a.getTime() : NaN;
  const dateB = b instanceof Date ? b.getTime() : NaN;
  if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) return dateA - dateB;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function cellValue<T>(row: T, column: ColumnProps<T>): unknown {
  return column.calculateCellValue ? column.calculateCellValue(row) : readPath(row, column.dataField);
}

function columnKey(column: ColumnProps, index: number): string {
  return column.name ?? column.dataField ?? column.caption ?? `column-${index}`;
}

function DataGridInner<T>(props: DataGridProps<T>, ref: React.ForwardedRef<DataGridRef<T>>) {
  const {
    dataSource,
    keyExpr,
    height,
    width,
    noDataText = "No data",
    showBorders,
    columnAutoWidth,
    wordWrapEnabled,
    hoverStateEnabled,
    remoteOperations,
    selectedRowKeys,
    className,
    onRowClick,
    onRowPrepared,
    onCellPrepared,
    onSelectionChanged,
    children,
  } = props;

  // ---- Настройки из дочерних элементов ----
  const config = useMemo(() => {
    const columns: ColumnProps<T>[] = [];
    let paging: PagingProps = {};
    let sorting: SortingProps = { mode: "single" };
    let selection: SelectionProps = { mode: "none" };
    for (const child of flattenChildren(children)) {
      if (child.type === Column) columns.push(child.props as ColumnProps<T>);
      else if (child.type === Paging) paging = child.props as PagingProps;
      else if (child.type === Sorting) sorting = { mode: "single", ...(child.props as SortingProps) };
      else if (child.type === Selection) selection = child.props as SelectionProps;
    }
    return { columns, paging, sorting, selection };
  }, [children]);

  const pageSize = config.paging.enabled === false ? undefined : config.paging.pageSize;
  const remoteSorting = typeof remoteOperations === "object" ? Boolean(remoteOperations.sorting) : Boolean(remoteOperations);
  const store = isCustomStore<T>(dataSource) ? dataSource : null;
  const key = keyExpr ?? store?.key;

  // ---- Сортировка ----
  const initialSort = useMemo<SortDescriptor | null>(() => {
    const sorted = config.columns.find((column) => column.sortOrder ?? column.defaultSortOrder);
    return sorted?.dataField ? { selector: sorted.dataField, desc: (sorted.sortOrder ?? sorted.defaultSortOrder) === "desc" } : null;
    // Порядок по умолчанию берётся один раз, как у DevExtreme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sort, setSort] = useState<SortDescriptor | null>(initialSort);

  const toggleSort = (column: ColumnProps<T>) => {
    if (config.sorting.mode === "none" || column.allowSorting === false || !column.dataField) return;
    setSort((current) => {
      if (!current || current.selector !== column.dataField) return { selector: column.dataField!, desc: false };
      if (!current.desc) return { selector: column.dataField!, desc: true };
      return null;
    });
  };

  // ---- Загрузка строк ----
  const [storeRows, setStoreRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const generation = useRef(0);
  const inFlight = useRef(false);

  const loadWindow = useCallback(
    async (skip: number, currentGeneration: number) => {
      if (!store || inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      try {
        const result = await store.load({ skip, take: pageSize, sort: remoteSorting && sort ? [sort] : null });
        if (currentGeneration !== generation.current) return;
        setStoreRows((previous) => (skip === 0 ? result.data : [...previous, ...result.data]));
        const loadedNow = skip + result.data.length;
        const known = typeof result.totalCount === "number" ? result.totalCount : null;
        // Конец данных: сервер назвал общее число и оно набрано, либо окно пришло неполным.
        setExhausted(known !== null ? loadedNow >= known : pageSize === undefined || result.data.length < pageSize);
      } catch {
        // Ошибку показывает страница (useGridWindow): таблица просто не просит следующее окно.
        if (currentGeneration === generation.current) setExhausted(true);
      } finally {
        if (currentGeneration === generation.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [store, pageSize, remoteSorting, sort],
  );

  useEffect(() => {
    if (!store) return;
    generation.current += 1;
    inFlight.current = false;
    setStoreRows([]);
    setExhausted(false);
    void loadWindow(0, generation.current);
    // Перечитываем только при смене источника, серверной сортировки или явном refresh().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, remoteSorting ? sort : null, reloadToken]);

  // ---- Строки к показу ----
  const allRows = useMemo<T[]>(() => {
    const base = store ? storeRows : Array.isArray(dataSource) ? dataSource : [];
    if (!sort || (store && remoteSorting)) return base;
    const column = config.columns.find((candidate) => candidate.dataField === sort.selector);
    const sorted = [...base].sort((a, b) => {
      const result = compareValues(column ? cellValue(a, column) : readPath(a, sort.selector), column ? cellValue(b, column) : readPath(b, sort.selector));
      return sort.desc ? -result : result;
    });
    return sorted;
  }, [store, storeRows, dataSource, sort, remoteSorting, config.columns]);

  // Массив дорисовывается частями по мере прокрутки: тысячи строк разом тормозили бы страницу.
  const [arrayLimit, setArrayLimit] = useState(ARRAY_WINDOW);
  useEffect(() => setArrayLimit(ARRAY_WINDOW), [dataSource]);
  const rows = store ? allRows : allRows.slice(0, arrayLimit);
  const hasMore = store ? !exhausted : allRows.length > arrayLimit;

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (store) {
          if (!inFlight.current) void loadWindow(storeRows.length, generation.current);
        } else {
          setArrayLimit((limit) => limit + ARRAY_WINDOW);
        }
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, store, storeRows.length, loadWindow, rows.length]);

  // ---- Колонки и их видимость ----
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [chooserOpen, setChooserOpen] = useState(false);
  const columns = config.columns
    .map((column, index) => ({ column, id: columnKey(column, index) }))
    .filter(({ column, id }) => column.visible !== false && !hidden.has(id));

  // ---- Выбор строк ----
  const selectable = config.selection.mode === "multiple" || config.selection.mode === "single";
  const [ownSelection, setOwnSelection] = useState<unknown[]>([]);
  const selection = selectedRowKeys ?? ownSelection;
  const rowKey = (row: T, index: number): unknown => (key ? readPath(row, key) : index);

  const changeSelection = (next: unknown[]) => {
    if (!selectedRowKeys) setOwnSelection(next);
    const chosen = new Set(next);
    onSelectionChanged?.({
      selectedRowKeys: next,
      selectedRowsData: allRows.filter((row, index) => chosen.has(rowKey(row, index))),
    });
  };

  const toggleRow = (row: T, index: number) => {
    const id = rowKey(row, index);
    const isSelected = selection.includes(id);
    if (config.selection.mode === "single") {
      changeSelection(isSelected ? [] : [id]);
    } else {
      changeSelection(isSelected ? selection.filter((item) => item !== id) : [...selection, id]);
    }
  };

  // «Выбрать все» — только загруженные строки, как selectAllMode="page" у DevExtreme.
  const loadedKeys = rows.map((row, index) => rowKey(row, index));
  const allSelected = loadedKeys.length > 0 && loadedKeys.every((id) => selection.includes(id));
  const toggleAll = () =>
    changeSelection(allSelected ? selection.filter((id) => !loadedKeys.includes(id)) : Array.from(new Set([...selection, ...loadedKeys])));

  // ---- Императивный API ----
  useImperativeHandle(
    ref,
    () => ({
      instance: () => ({
        refresh: async () => {
          if (store) setReloadToken((token) => token + 1);
          else setArrayLimit(ARRAY_WINDOW);
        },
        showColumnChooser: () => setChooserOpen(true),
      }),
    }),
    [store],
  );

  // ---- onRowPrepared / onCellPrepared: после каждой отрисовки, с чистого листа ----
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || (!onRowPrepared && !onCellPrepared)) return;
    body.querySelectorAll<HTMLTableRowElement>("tr[data-row-index]").forEach((rowElement) => {
      const rowIndex = Number(rowElement.dataset.rowIndex);
      const data = rows[rowIndex];
      if (data === undefined) return;
      rowElement.className = rowElement.dataset.baseClass ?? "";
      rowElement.removeAttribute("style");
      onRowPrepared?.({ rowType: "data", data, rowIndex, rowElement });
      if (onCellPrepared) {
        rowElement.querySelectorAll<HTMLTableCellElement>("td[data-column-index]").forEach((cellElement) => {
          const entry = columns[Number(cellElement.dataset.columnIndex)];
          if (!entry) return;
          cellElement.className = cellElement.dataset.baseClass ?? "";
          onCellPrepared({ rowType: "data", data, rowIndex, value: cellValue(data, entry.column), column: entry.column, cellElement });
        });
      }
    });
  });

  const style: React.CSSProperties = {
    height: typeof height === "number" ? `${height}px` : height,
    width: typeof width === "number" ? `${width}px` : width,
  };
  const rootClass = [
    "data-grid",
    showBorders ? "data-grid--bordered" : "",
    wordWrapEnabled ? "data-grid--wrap" : "",
    columnAutoWidth ? "data-grid--auto-width" : "",
    hoverStateEnabled || onRowClick ? "data-grid--hover" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const colSpan = columns.length + (selectable ? 1 : 0) || 1;
  const firstLoad = store !== null && loading && storeRows.length === 0;

  return (
    <div className={rootClass} style={style}>
      <div className="data-grid__scroll" ref={scrollRef}>
        <table className="admin-table data-grid__table">
          <colgroup>
            {selectable && <col style={{ width: 44 }} />}
            {columns.map(({ column, id }) => (
              <col
                key={id}
                style={{
                  width: typeof column.width === "number" ? `${column.width}px` : column.width,
                  minWidth: column.minWidth,
                }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {selectable && (
                <th className="data-grid__check">
                  {config.selection.mode === "multiple" && (
                    <input type="checkbox" aria-label="Select all loaded rows" checked={allSelected} onChange={toggleAll} />
                  )}
                </th>
              )}
              {columns.map(({ column, id }) => {
                const sortable = config.sorting.mode !== "none" && column.allowSorting !== false && Boolean(column.dataField);
                const direction = sort && sort.selector === column.dataField ? (sort.desc ? "desc" : "asc") : null;
                return (
                  <th
                    key={id}
                    style={{ textAlign: column.alignment, minWidth: column.minWidth }}
                    className={[sortable ? "data-grid__sortable" : "", column.fixed ? "data-grid__fixed" : ""].filter(Boolean).join(" ") || undefined}
                    aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}
                    onClick={sortable ? () => toggleSort(column) : undefined}
                  >
                    {column.headerCellRender ? column.headerCellRender({ column }) : column.caption ?? column.dataField}
                    {direction && <span className="data-grid__sort-mark" aria-hidden="true">{direction === "asc" ? " ▲" : " ▼"}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {rows.map((row, rowIndex) => {
              const id = rowKey(row, rowIndex);
              const isSelected = selectable && selection.includes(id);
              const baseClass = isSelected ? "data-grid__row data-grid__row--selected" : "data-grid__row";
              return (
                <tr
                  key={String(id ?? rowIndex)}
                  className={baseClass}
                  data-base-class={baseClass}
                  data-row-index={rowIndex}
                  onClick={onRowClick ? (event) => onRowClick({ rowType: "data", data: row, rowIndex, key: id, event }) : undefined}
                >
                  {selectable && (
                    <td className="data-grid__check" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={isSelected}
                        onChange={() => toggleRow(row, rowIndex)}
                      />
                    </td>
                  )}
                  {columns.map(({ column, id: columnId }, columnIndex) => {
                    const value = cellValue(row, column);
                    const text = displayText(value, column);
                    const cellClass = [column.cssClass, column.fixed ? "data-grid__fixed" : ""].filter(Boolean).join(" ");
                    return (
                      <td
                        key={columnId}
                        className={cellClass}
                        data-base-class={cellClass}
                        data-column-index={columnIndex}
                        style={{ textAlign: column.alignment, minWidth: column.minWidth }}
                      >
                        {column.cellRender
                          ? column.cellRender({ data: row, value, text, displayValue: value, rowIndex, column })
                          : text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {firstLoad && (
              <tr className="data-grid__status">
                <td colSpan={colSpan}>Loading…</td>
              </tr>
            )}
            {!firstLoad && rows.length === 0 && (
              <tr className="data-grid__status">
                <td colSpan={colSpan}>{noDataText}</td>
              </tr>
            )}
            {hasMore && rows.length > 0 && (
              <tr ref={sentinelRef} className="data-grid__status data-grid__sentinel">
                <td colSpan={colSpan}>{loading ? "Loading…" : ""}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {chooserOpen && (
        <div className="data-grid__chooser" role="dialog" aria-label="Columns">
          <div className="data-grid__chooser-head">
            <strong>Columns</strong>
            <button type="button" onClick={() => setChooserOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          {config.columns.map((column, index) => {
            if (column.visible === false) return null;
            const id = columnKey(column, index);
            return (
              <label key={id} className="data-grid__chooser-item">
                <input
                  type="checkbox"
                  checked={!hidden.has(id)}
                  onChange={() =>
                    setHidden((current) => {
                      const next = new Set(current);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                />
                {column.caption ?? column.dataField ?? id}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const DataGrid = forwardRef(DataGridInner) as <T = any>(
  props: DataGridProps<T> & { ref?: React.Ref<DataGridRef<T, any> | null> },
) => React.ReactElement;

export { CustomStore };
export default DataGrid;
