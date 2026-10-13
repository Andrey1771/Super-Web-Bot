/**
 * Источник строк для таблицы, которая грузит их с сервера окнами. Повторяет ту часть CustomStore
 * из DevExtreme, которой пользовалась админка: ключ строки и функция загрузки окна.
 */
export type SortDescriptor = { selector: string; desc: boolean };

export type LoadOptions = {
  skip?: number;
  take?: number;
  sort?: SortDescriptor[] | null;
};

export type LoadResult<T> = T[] | { data: T[]; totalCount?: number };

export type CustomStoreOptions<T> = {
  key?: string;
  load: (options: LoadOptions) => Promise<LoadResult<T>> | LoadResult<T>;
};

export default class CustomStore<T = any> {
  constructor(private readonly options: CustomStoreOptions<T>) {}

  get key(): string | undefined {
    return this.options.key;
  }

  /** Окно строк и, если сервер его знает, общее количество. */
  async load(options: LoadOptions): Promise<{ data: T[]; totalCount?: number }> {
    const result = await this.options.load(options);
    return Array.isArray(result) ? { data: result } : result;
  }
}

export function isCustomStore<T>(value: unknown): value is CustomStore<T> {
  return value instanceof CustomStore;
}
