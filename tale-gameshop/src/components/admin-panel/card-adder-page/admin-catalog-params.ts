/**
 * Запрос списка товаров для админки.
 *
 * kind=all: витринный каталог по умолчанию отдаёт только игры, а админке нужен весь товар, включая ПО.
 * includeDrafts: черновик (например, свежая копия товара) не должен пропадать из списка, пока его не опубликуют.
 * includeDlc: витрина скрывает дополнения из общего списка (они живут в карточке базовой игры), а админке DLC
 * нужны как обычные товары — без этого созданное DLC исчезало из списка и поиска.
 *
 * Вид «dlc» — только дополнения (dlc=only), «game» — игры без дополнений: иначе DLC шли вперемешку с играми. Поиск в
 * режиме DLC находит дополнения и по названию их игры (сервер добавляет его в текст поиска).
 */
export type AdminCatalogKind = "all" | "game" | "dlc" | "software";

export const buildAdminCatalogParams = (options: { page: number; pageSize: number; kind: AdminCatalogKind | string; status: string; search: string }) => {
  const params = new URLSearchParams({
    page: String(options.page),
    pageSize: String(options.pageSize),
    kind: options.kind === "dlc" ? "game" : options.kind,
    includeDrafts: "true",
  });
  if (options.kind === "dlc") {
    params.set("dlc", "only");
  } else if (options.kind !== "game") {
    params.set("includeDlc", "true");
  }
  if (options.status !== "all") {
    params.set("status", options.status);
  }
  if (options.search) {
    params.set("q", options.search);
  }
  return params;
};
