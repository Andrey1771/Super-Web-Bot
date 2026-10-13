import { useCallback, useMemo, useRef, useState } from "react";
import { CustomStore } from "../components/grid";

/** Сколько строк тянуть за одно окно прокрутки. Тем же размером ходим на сервер. */
export const GRID_PAGE_SIZE = 50;

/**
 * Настройка «страницы считает сервер» для DataGrid.
 *
 * Константа, а не объект в разметке. Прежний грид (DevExtreme) сравнивал свойства по ссылке и
 * на объекте из JSX уходил в бесконечную перезагрузку. Нынешняя таблица (components/grid)
 * перечитывает данные только при смене источника, но константа по-прежнему правильнее:
 * настройки не меняются, и незачем создавать их заново на каждый рендер.
 */
export const REMOTE_PAGING = { paging: true } as const;

/** То же самое, когда сервер умеет ещё и сортировку. */
export const REMOTE_PAGING_AND_SORTING = { paging: true, sorting: true } as const;

export type GridWindow<T> = { items: T[]; total: number };

type GridState = { loaded: number; total: number | null; error: string | null };

/**
 * Источник данных для таблицы с виртуальной прокруткой.
 *
 * Таблица просит окна строк по мере движения — сюда приходит уже готовый загрузчик окна, а
 * хук оборачивает его в CustomStore и следит за тем, что показывать под таблицей: сколько
 * строк загружено, сколько всего, и не упал ли запрос.
 *
 * @param load       загрузка окна; в неё передаются границы, которые запросила таблица
 * @param key        поле-идентификатор строки
 * @param reloadToken любое значение: меняется — источник пересобирается и таблица начинает
 *                    с первого окна. Нужен там, где запрос не изменился, а данные да
 *                    (кнопка Refresh, правка строки).
 */
export function useGridWindow<T>(
  load: (skip: number, take: number) => Promise<GridWindow<T>>,
  key: string,
  reloadToken?: unknown,
) {
  const [state, setState] = useState<GridState>({ loaded: 0, total: null, error: null });
  const [retryToken, setRetryToken] = useState(0);
  const loadedRef = useRef(0);

  const source = useMemo(() => {
    loadedRef.current = 0;

    return new CustomStore({
      key,
      load: async (options: { skip?: number; take?: number }) => {
        const skip = options.skip ?? 0;
        const take = options.take ?? GRID_PAGE_SIZE;

        try {
          const window = await load(skip, take);
          loadedRef.current = skip + window.items.length;
          setState({ loaded: loadedRef.current, total: window.total, error: null });
          return { data: window.items, totalCount: window.total };
        } catch (err: any) {
          console.error("Grid window failed to load", err);
          setState((prev) => ({
            ...prev,
            error: err?.response?.data?.message ?? err?.message ?? "Request failed.",
          }));
          throw err;
        }
      },
    });
    // load меняется вместе с фильтрами страницы — этого достаточно, чтобы начать заново.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, key, reloadToken, retryToken]);

  const retry = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
    setRetryToken((token) => token + 1);
  }, []);

  return { source, retry, loaded: state.loaded, total: state.total, error: state.error };
}

/** Подпись под таблицей: сколько строк уже подтянулось из скольких. */
export function gridStatusText(loaded: number, total: number | null, noun: string): string {
  if (total === null) {
    return "Loading…";
  }
  return `${loaded} of ${total} ${noun}${total === 1 ? "" : "s"} loaded`;
}
