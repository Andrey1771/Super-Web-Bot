import { fetchWindow } from "./page-window";

/** Сервер, отдающий страницы из заранее известного списка. */
const server = (all: number[], pageSize: number, calls: number[][] = []) => ({
  calls,
  fetchPage: async (page: number, size: number) => {
    calls.push([page, size]);
    return { items: all.slice((page - 1) * size, page * size), total: all.length };
  },
});

const list = Array.from({ length: 130 }, (_, i) => i);

test("окно, совпадающее со страницей, стоит одного запроса", async () => {
  const s = server(list, 50);
  const window = await fetchWindow(50, 50, 50, s.fetchPage);

  expect(window.items).toEqual(list.slice(50, 100));
  expect(window.total).toBe(130);
  expect(s.calls).toEqual([[2, 50]]);
});

test("сдвинутое окно собирается из накрывающих страниц и режется по границам", async () => {
  const s = server(list, 50);
  const window = await fetchWindow(70, 50, 50, s.fetchPage);

  // Именно 70..120, а не «страница 2» целиком — иначе таблица показала бы не те строки.
  expect(window.items).toEqual(list.slice(70, 120));
  expect(s.calls).toEqual([[2, 50], [3, 50]]);
});

test("за концом списка отдаётся то, что есть, и лишних запросов нет", async () => {
  const s = server(list, 50);
  const window = await fetchWindow(100, 50, 50, s.fetchPage);

  expect(window.items).toEqual(list.slice(100, 130));
  expect(s.calls).toEqual([[3, 50]]);
});
