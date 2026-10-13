import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DataGrid, Column, Paging, Scrolling, Sorting, type DataGridRef } from "../../components/grid";
import PageHeader, { GAMES_TABS } from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import { GRID_PAGE_SIZE, REMOTE_PAGING, gridStatusText, useGridWindow } from "../../hooks/use-grid-window";
import {
  getPriceMatrix,
  setPrice,
  type PriceCell,
  type PriceRow,
  type PriceSummary,
} from "../../api/adminPricesApi";
import { formatMoney } from "../../utils/format-money";
import "./prices-page.css";

/**
 * Прайс-лист: игра × валюта одной таблицей. В ячейке видно цену и откуда она — базовая, ручная,
 * по курсу или «не продаётся». Клик по ячейке — ручная цена; очистить — вернуться к курсу.
 *
 * Строки приезжают окнами по мере прокрутки: каталог растёт, а раньше страница забирала его
 * целиком и фильтровала в браузере. Поиск и фильтр «только ручные» тоже ушли на сервер —
 * фильтровать одно загруженное окно значило бы показывать «ничего не найдено» там, где просто
 * не долистали.
 */

const SOURCE_LABEL: Record<PriceCell["source"], string> = {
  base: "base",
  manual: "manual",
  rate: "by rate",
  none: "not sold",
};

type Editing = { gameId: string; currency: string; value: string } | null;

/** Шапка таблицы: валюты и курсы приходят вместе с первым окном строк. */
type Meta = {
  baseCurrency: string;
  currencies: string[];
  markupPercent: number;
  rates: Record<string, number | null>;
  summary: PriceSummary | null;
};

const PricesPage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const [meta, setMeta] = useState<Meta | null>(null);
  /** Метка перечитывания шапки: сводка «сколько игр без цены» меняется после правки цены. */
  const [metaTick, setMetaTick] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [onlyManual, setOnlyManual] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const gridRef = useRef<DataGridRef<PriceRow, string> | null>(null);
  /** «Сохранение уже идёт» — синхронно, в отличие от состояния: blur успевает раньше рендера. */
  const savingRef = useRef(false);

  // Строки. Ничего, кроме строк: состояние колонок отсюда не трогаем — см. следующий эффект.
  const loadRows = useCallback(
    (skip: number, take: number) =>
      getPriceMatrix({ q: query || undefined, skip, take, onlyManual }).then((matrix) => ({
        items: matrix.games,
        total: matrix.total,
      })),
    [onlyManual, query]
  );

  const { source, retry, loaded, total, error } = useGridWindow<PriceRow>(loadRows, "gameId");

  /**
   * Шапка таблицы (какие валюты, курсы, сводка) — отдельным запросом, а не вместе со строками.
   *
   * Иначе получался замкнутый круг: загрузка окна строк меняла состав колонок, смена колонок
   * заставляла таблицу перечитать данные, та снова меняла колонки — таблица дёргалась и
   * бесконечно показывала «Loading…». Запрос лёгкий: одна строка, всё остальное в нём — шапка.
   */
  useEffect(() => {
    let cancelled = false;

    getPriceMatrix({ q: query || undefined, skip: 0, take: 1, onlyManual })
      .then((matrix) => {
        if (cancelled) {
          return;
        }
        setMeta({
          baseCurrency: matrix.baseCurrency,
          currencies: matrix.currencies,
          markupPercent: matrix.markupPercent,
          rates: matrix.rates,
          summary: matrix.summary,
        });
      })
      .catch((metaError) => console.error("Price matrix header failed", metaError));

    return () => {
      cancelled = true;
    };
  }, [onlyManual, query, metaTick]);

  // Поиск уходит на сервер с задержкой: иначе каждый символ — отдельный запрос.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPageTitle("Prices");
  }, [setPageTitle]);

  /**
   * Сохранить правку ячейки. Значение приходит из самого поля, а не из состояния: поле
   * неуправляемое, чтобы набор цифр не перерисовывал страницу на каждый символ — вместе со
   * страницей перерисовывалась бы и таблица.
   */
  const commit = async (raw: string) => {
    // Enter сохраняет и закрывает поле, а закрытие вызывает blur — без этой отсечки
    // одна правка уходила бы на сервер дважды.
    if (!editing || savingRef.current) {
      return;
    }
    const value = raw.trim() === "" ? null : Number(raw.trim());
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      addToast("Enter a non-negative number, or leave empty to use the rate.", "error");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await setPrice(editing.gameId, editing.currency, value);
      setEditing(null);
      // Строка живёт в таблице — просим её перечитать загруженное, прокрутка остаётся на месте.
      gridRef.current?.instance().refresh();
      setMetaTick((tick) => tick + 1);
    } catch (err: any) {
      console.error("Set price failed", err);
      addToast(err?.response?.data?.message ?? "Could not save the price.", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /** Одна ячейка «игра × валюта»: значение или поле ввода, если её сейчас правят. */
  const renderCell = (row: PriceRow, currency: string) => {
    const cell = row.cells[currency];
    const isEditing = editing?.gameId === row.gameId && editing.currency === currency;

    if (isEditing) {
      return (
        <input
          className="input prices__input"
          type="number"
          step="any"
          min={0}
          autoFocus
          disabled={saving}
          defaultValue={editing.value}
          placeholder={currency === row.baseCurrency ? "" : "by rate"}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void commit(event.currentTarget.value);
            }
            if (event.key === "Escape") {
              setEditing(null);
            }
          }}
          onBlur={(event) => void commit(event.currentTarget.value)}
        />
      );
    }

    return (
      <button
        type="button"
        className="prices__value"
        title={`${SOURCE_LABEL[cell?.source ?? "none"]} — click to edit`}
        onClick={() =>
          setEditing({ gameId: row.gameId, currency, value: cell?.manual != null ? String(cell.manual) : "" })
        }
      >
        <span className="prices__amount">{cell?.price != null ? formatMoney(cell.price, currency) : "—"}</span>
        <span className="prices__source">{SOURCE_LABEL[cell?.source ?? "none"]}</span>
      </button>
    );
  };

  return (
    <div className="admin-grid prices">
      <PageHeader
        title="Prices"
        description="Every game in every storefront currency. Click a cell to set a manual price; clear it to fall back to the rate."
        breadcrumbs={["Catalog", "Prices"]}
        tabs={GAMES_TABS}
      />

      {meta && meta.summary && (
        <Card>
          <div className="prices__facts">
            <div><span className="prices__fact-label">Base</span><span className="prices__fact-value">{meta.baseCurrency}</span></div>
            <div><span className="prices__fact-label">Markup on rate</span><span className="prices__fact-value">{meta.markupPercent}%</span></div>
            {meta.summary.perCurrency.filter((p) => p.currency !== meta.baseCurrency).map((p) => (
              <div key={p.currency}>
                <span className="prices__fact-label">{p.currency} · rate {meta.rates[p.currency] ?? "—"}</span>
                <span className="prices__fact-value">
                  {p.sold}/{meta.summary?.total ?? 0} sold
                  {p.manual > 0 && <span className="prices__muted"> · {p.manual} manual</span>}
                  {p.missing > 0 && <span className="prices__warn"> · {p.missing} missing</span>}
                </span>
              </div>
            ))}
            <Link className="prices__link" to="/admin/payments/currencies">Rates & FX →</Link>
          </div>
        </Card>
      )}

      <Card>
        <div className="prices__toolbar">
          <input className="input prices__search" type="search" placeholder="Find a game…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="prices__check">
            <input type="checkbox" checked={onlyManual} onChange={(e) => setOnlyManual(e.target.checked)} /> only with manual prices
          </label>
          <span className="prices__muted">{gridStatusText(loaded, total, "game")}</span>
          {/* Обновление относится к этой таблице (и к сводке над ней — данные одни),
              поэтому стоит здесь, а не в дальнем углу заголовка страницы. */}
          <button
            className="btn btn-outline prices__refresh"
            type="button"
            onClick={() => {
              gridRef.current?.instance().refresh();
              setMetaTick((tick) => tick + 1);
            }}
          >
            Refresh
          </button>
        </div>

        {error ? (
          <p className="prices__warn">
            Failed to load prices.{" "}
            <button type="button" className="btn btn-outline" onClick={retry}>Try again</button>
          </p>
        ) : meta && meta.currencies.length === 0 ? (
          /* Только когда состав валют УЖЕ известен: пока meta === null, ничего не известно,
             и говорить «валют нет» рано. */
          <p className="prices__muted">No storefront currencies configured.</p>
        ) : (
          <DataGrid
            ref={gridRef}
            dataSource={source}
            className="prices__grid"
            showBorders
            showRowLines
            showColumnLines
            height={620}
            width="100%"
            columnAutoWidth
            allowColumnResizing
            columnResizingMode="widget"
            remoteOperations={REMOTE_PAGING}
            noDataText={query ? `Nothing found for "${query}".` : "No games yet."}
            onCellPrepared={(event) => {
              // Полоска слева у ячейки — это источник цены. Класс вешаем на саму ячейку:
              // разметку строк рисует таблица, className из cellRender до td не доходит.
              const currency = event.column?.caption;
              if (event.rowType === "data" && currency && currency !== "Game") {
                const cell = (event.data as PriceRow).cells[currency];
                event.cellElement.classList.add("prices__cell", `prices__cell--${cell?.source ?? "none"}`);
              }
            }}
          >
            <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
            <Paging enabled pageSize={GRID_PAGE_SIZE} />
            {/* Порядок задаёт сервер (по названию); сортировка загруженного окна врала бы. */}
            <Sorting mode="none" />

            <Column
              dataField="title"
              caption="Game"
              minWidth={220}
              fixed
              cellRender={(cell: { data: PriceRow }) => (
                <span className="prices__title" title={cell.data.title}>{cell.data.title}</span>
              )}
            />
            {/* Колонка на валюту: их состав приходит с сервера вместе со строками, поэтому
                до первого ответа тут только колонка с названием игры. */}
            {(meta?.currencies ?? []).map((currency) => (
              <Column
                key={currency}
                caption={currency}
                width={150}
                allowSorting={false}
                headerCellRender={() => (
                  <span>
                    {currency}
                    {currency === meta?.baseCurrency && <span className="prices__pill">base</span>}
                  </span>
                )}
                cellRender={(cell: { data: PriceRow }) => renderCell(cell.data, currency)}
              />
            ))}
          </DataGrid>
        )}
      </Card>
    </div>
  );
};

export default PricesPage;
