import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataGrid, Column, Paging, Scrolling, Sorting } from "../../components/grid";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import { GRID_PAGE_SIZE, REMOTE_PAGING, gridStatusText, useGridWindow } from "../../hooks/use-grid-window";
import { fetchWindow } from "../../utils/page-window";
import {
  getModerationSummary,
  hideReview,
  listModerationReviews,
  publishReview,
  removeReviewAuthorAvatar,
  type ModerationReview,
  type ReviewFilter,
} from "../../api/adminModerationApi";
import "./moderation-page.css";

/**
 * Модерация: отзывы с жалобами и вопросы без ответа. Две вкладки, потому что это две разные
 * очереди с разным ритмом: жалобы — редко и срочно, вопросы — часто и терпят день.
 *
 * Обе очереди копятся без предела, поэтому строки приезжают окнами по мере прокрутки, а не
 * страницами с кнопками Previous/Next.
 */

/**
 * Общие настройки обеих очередей. Объявлены снаружи компонента: они не меняются, и незачем
 * собирать их заново на каждый рендер (прежний грид DevExtreme на этом уходил в перезагрузку).
 */
const GRID_PROPS = {
  showBorders: true,
  showRowLines: true,
  height: 600,
  width: "100%",
  columnAutoWidth: true,
  allowColumnResizing: true,
  columnResizingMode: "widget" as const,
  wordWrapEnabled: true,
  remoteOperations: REMOTE_PAGING,
};

type ReviewRevisionView = NonNullable<ModerationReview["revisions"]>[number];

/**
 * История правок отзыва в ячейке очереди: плашка «Edited N×» (жёлтая, если правили уже под
 * жалобами), по клику раскрываются прошлые версии. Читателю на витрине история не показывается,
 * как у Steam; модератору она нужна, чтобы увидеть, что было до правки. Экспорт — ради теста.
 */
export const ReviewRevisions = ({ revisions, editedAt }: { revisions: ReviewRevisionView[]; editedAt?: string | null }) => {
  const [open, setOpen] = useState(false);
  if (revisions.length === 0) {
    return null;
  }
  const afterReport = revisions.some((rev) => rev.underReport);
  const when = editedAt ? new Date(editedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : null;
  return (
    <div className="moderation__revisions">
      <button
        type="button"
        className={`moderation__pill moderation__revisions-toggle${afterReport ? " moderation__pill--warn" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        title={afterReport ? "The text was changed after reports came in — compare the versions" : when ? `Last edited ${when}` : undefined}
      >
        {afterReport ? "Edited after report" : `Edited ${revisions.length}×`}
      </button>
      {open && (
        <ul className="moderation__revision-list">
          {revisions.map((rev, index) => (
            <li key={`${rev.replacedAt}-${index}`} className={`moderation__revision${rev.underReport ? " moderation__revision--under-report" : ""}`}>
              <div className="moderation__revision-head">
                <span>{"★".repeat(rev.rating)}{"☆".repeat(Math.max(0, 5 - rev.rating))}</span>
                <span>until {new Date(rev.replacedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                {rev.underReport && <span className="moderation__pill moderation__pill--warn">under report</span>}
              </div>
              <p className="moderation__revision-text">{rev.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Отрисовщик ячейки только для настоящих строк. Прежний грид (DevExtreme) рисовал и строки-заглушки
 * без данных — cellRender приходил с пустым `data`, и обращение к полю роняло страницу целиком.
 * Нынешняя таблица заглушек не рисует, но проверка дешёвая и страхует от пустых строк с сервера.
 */
export const dataCell =
  <T extends { id: string }>(render: (row: T) => React.ReactNode) =>
  (cell: { data?: Partial<T> | null }) =>
    cell.data && typeof cell.data.id === "string" ? render(cell.data as T) : null;

const ModerationPage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const [summary, setSummary] = useState<{ pendingReviews: number } | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("pending");
  const [reloadToken, setReloadToken] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getModerationSummary());
    } catch {
      /* счётчики в заголовках вкладок — подсказка, не функциональность */
    }
  }, []);

  const loadReviews = useCallback(
    (skip: number, take: number) =>
      fetchWindow(skip, take, GRID_PAGE_SIZE, (page, pageSize) => listModerationReviews(reviewFilter, page, pageSize)),
    [reviewFilter],
  );

  const reviewsGrid = useGridWindow<ModerationReview>(loadReviews, "id", reloadToken);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, reloadToken]);

  useEffect(() => {
    setPageTitle("Moderation");
  }, [setPageTitle]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  /** Действие модератора с тостом и перечитыванием очереди; возвращает, удалось ли оно. */
  const run = async (id: string, action: () => Promise<{ ok?: boolean; message?: string }>) => {
    setBusyId(id);
    try {
      const result = await action();
      addToast(result?.message ?? "Done.", result?.ok === false ? "error" : "success");
      // Решение меняет и саму строку, и счётчики вкладок — перечитываем очередь целиком.
      reload();
      return result?.ok !== false;
    } catch (err) {
      console.error("Moderation action failed", err);
      addToast("Action failed.", "error");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const gameLink = (gameId: string, gameTitle: string) => (
    <Link className="moderation__game" to={`/admin/games/details?game=${encodeURIComponent(gameId)}`}>
      {gameTitle}
    </Link>
  );

  return (
    <div className="admin-grid moderation">
      <PageHeader
        title="Moderation"
        description="Reported reviews from game pages."
        breadcrumbs={["Support", "Moderation"]}
        primaryAction={
          <button className="btn btn-outline" onClick={reload}>
            Refresh
          </button>
        }
      />

      {/* Одна очередь — отзывы; заголовок со счётчиком ожидающих вместо вкладок. */}
      <div className="moderation__tabs" role="presentation">
        <span className="moderation__tab moderation__tab--active">
          Reviews{summary && summary.pendingReviews > 0 && <span className="moderation__badge">{summary.pendingReviews}</span>}
        </span>
      </div>

        <Card>
          <div className="moderation__toolbar">
            <select className="input moderation__filter" value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value as ReviewFilter)}>
              <option value="pending">Reported (pending)</option>
              <option value="hidden">Hidden</option>
              <option value="published">Published</option>
              <option value="all">All</option>
            </select>
            <span className="moderation__muted">{gridStatusText(reviewsGrid.loaded, reviewsGrid.total, "review")}</span>
          </div>

          {reviewsGrid.error ? (
            <EmptyState
              title="Unable to load reviews"
              description={reviewsGrid.error}
              action={<button className="btn btn-primary" onClick={reviewsGrid.retry}>Retry</button>}
            />
          ) : (
            <DataGrid
              {...GRID_PROPS}
              dataSource={reviewsGrid.source}
              noDataText={reviewFilter === "pending" ? "No reported reviews — nothing to decide." : "Nothing here."}
              onRowPrepared={(event) => {
                // Строка носит статус отзыва — как раньше носил класс карточки.
                if (event.rowType === "data") {
                  const status = (event.data as Partial<ModerationReview> | undefined)?.status;
                  if (status) event.rowElement.classList.add(`moderation__row--${status.toLowerCase()}`);
                }
              }}
            >
              <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
              <Paging enabled pageSize={GRID_PAGE_SIZE} />
              {/* Порядок задаёт сервер; сортировка загруженного окна врала бы. */}
              <Sorting mode="none" />

              <Column
                caption="Game"
                minWidth={170}
                cellRender={dataCell<ModerationReview>((row) => gameLink(row.gameId, row.gameTitle))}
              />
              <Column
                caption="Author"
                minWidth={180}
                cellRender={dataCell<ModerationReview>((row) => (
                  <span className="moderation__author">
                    {/* Картинка — такая же часть отзыва, как текст, и жалоба приходит той же
                        кнопкой. Показываем её здесь, чтобы модератор видел, на что жалуются,
                        не открывая витрину. */}
                    {row.avatarUrl ? (
                      <img className="moderation__avatar" src={row.avatarUrl} alt="" />
                    ) : (
                      <span className="moderation__avatar moderation__avatar--initial" aria-hidden="true">
                        {(row.userName || "?").trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="moderation__muted">
                      {row.userName}
                      <br />
                      {"★".repeat(row.rating)}{"☆".repeat(Math.max(0, 5 - row.rating))} · {new Date(row.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                ))}
              />
              <Column
                dataField="text"
                caption="Review"
                minWidth={280}
                cellRender={dataCell<ModerationReview>((row) => (
                  <div>
                    {/* Три строки максимум: иначе высота строк пляшет и виртуальная прокрутка
                        начинает дёргаться. Полный текст — в подсказке. */}
                    <p className="moderation__text line-clamp-3" title={row.text}>{row.text}</p>
                    <ReviewRevisions revisions={row.revisions ?? []} editedAt={row.editedAt} />
                  </div>
                ))}
              />
              <Column
                caption="Flags"
                width={150}
                cellRender={dataCell<ModerationReview>((row) => (
                  <div className="moderation__flags">
                    {row.reportCount > 0 && (
                      <span className="moderation__pill moderation__pill--warn">
                        {row.reportCount} report{row.reportCount === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="moderation__pill">{row.status}</span>
                    {row.refunded && <span className="moderation__pill" title="The purchase was refunded; the review stays with a “Refunded” note">Refunded</span>}
                    {/* Причины сгруппированы («Spam ×2»); комментарии и авторы — в подсказке. */}
                    {(row.reports?.length ?? 0) > 0 && (
                      <ul className="moderation__reasons" title={row.reports!.map((r) => `${r.userName}: ${r.reason}${r.comment ? " — " + r.comment : ""}`).join("\n")}>
                        {Object.entries(
                          row.reports!.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.reason]: (acc[r.reason] ?? 0) + 1 }), {})
                        ).map(([reason, count]) => (
                          <li key={reason}>
                            {reason}
                            {count > 1 ? ` ×${count}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              />
              <Column
                caption="Actions"
                width={300}
                cellRender={dataCell<ModerationReview>((row) => {
                  const review = row;
                  return (
                    <div className="moderation__actions">
                      {review.status !== "Published" && (
                        <button className="btn btn-primary" disabled={busyId === review.id} onClick={() => run(review.id, () => publishReview(review.id))}>Publish</button>
                      )}
                      {review.status !== "Hidden" && (
                        <button className="btn btn-outline moderation__danger" disabled={busyId === review.id} onClick={() => run(review.id, () => hideReview(review.id))}>Hide</button>
                      )}
                      {/* Отдельно от «Hide»: текст бывает нормальным при непристойной картинке
                          и наоборот. Аватар снимается у профиля и пропадает сразу везде. */}
                      {review.avatarUrl && (
                        <button
                          className="btn btn-outline moderation__danger"
                          disabled={busyId === review.id}
                          title="Removes the photo from the author's profile everywhere, not just here"
                          onClick={() => run(review.id, async () => {
                            const { removed } = await removeReviewAuthorAvatar(review.id);
                            // «Снимать было нечего» — тоже успех, но модератору стоит сказать
                            // прямо: иначе непонятно, сработала кнопка или нет.
                            return { message: removed ? "Avatar removed from the profile." : "There was no avatar to remove." };
                          })}
                        >
                          Remove avatar
                        </button>
                      )}
                    </div>
                  );
                })}
              />
            </DataGrid>
          )}
        </Card>
    </div>
  );
};

export default ModerationPage;
