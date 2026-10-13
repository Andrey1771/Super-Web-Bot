import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import { getAnonId } from "../hooks/use-blog-tracking";

/**
 * Шаги воронки в СВОЮ аналитику.
 *
 * Отдельно от Google не случайно. Внешний счётчик отвечает на вопрос «откуда пришли», и его
 * можно заблокировать — у игровой аудитории это происходит чаще, чем у любой другой. Вопрос
 * «где мы теряем покупателей» должен опираться на источник, который не режется блокировщиком
 * и не выключается отказом от куки, иначе первое же расхождение обесценит весь отчёт.
 *
 * Покупку сюда не шлём: она уже записана в заказах. Второй источник тех же денег дал бы два
 * разных числа выручки — и выяснять, какое верное, пришлось бы каждый раз заново.
 *
 * Отправка «тихая»: ошибка счётчика не должна мешать человеку положить товар в корзину.
 */
export const trackFunnelStep = (step: "add_to_cart" | "begin_checkout", gameId?: string): void => {
  try {
    const api = container.get<IApiClient>(IDENTIFIERS.IApiClient).api;
    void api
      .post("/api/tracking/funnel", { step, gameId, anonId: getAnonId() })
      .catch(() => undefined);
  } catch {
    // Контейнер может быть не готов на самых ранних экранах — это не повод падать.
  }
};
