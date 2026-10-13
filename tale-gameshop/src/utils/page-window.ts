/**
 * Окно строк поверх постраничного API.
 *
 * Таблица просит произвольный отрезок [skip, skip + take), а сервер умеет отдавать только
 * страницы фиксированного размера. Обычно отрезок точно совпадает со страницей и уходит
 * ровно один запрос; но полагаться на это нельзя — стоит гриду попросить отрезок со
 * сдвигом, и наивное `page = skip / take + 1` молча отдало бы не те строки. Поэтому берём
 * все страницы, которые накрывают отрезок, и отрезаем от них ровно запрошенное.
 */
export async function fetchWindow<T>(
  skip: number,
  take: number,
  pageSize: number,
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
): Promise<{ items: T[]; total: number }> {
  const firstPage = Math.floor(skip / pageSize) + 1;
  const lastPage = Math.floor((skip + Math.max(take, 1) - 1) / pageSize) + 1;

  const collected: T[] = [];
  let total = 0;

  for (let page = firstPage; page <= lastPage; page += 1) {
    const response = await fetchPage(page, pageSize);
    total = response.total;
    collected.push(...response.items);

    // Список кончился раньше, чем накрыли отрезок — дальше запрашивать нечего.
    if (response.items.length < pageSize) {
      break;
    }
  }

  const offset = skip - (firstPage - 1) * pageSize;
  return { items: collected.slice(offset, offset + take), total };
}
