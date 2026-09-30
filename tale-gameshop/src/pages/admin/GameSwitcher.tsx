import React, { useEffect, useMemo, useRef, useState } from "react";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";

/**
 * Переключение игры в редакторе: поиск по каталогу вместо выпадающего списка.
 *
 * Список со всеми играми не масштабируется дважды — как разметка (десять тысяч <option>)
 * и как трафик (весь каталог одним запросом на каждое открытие страницы). Здесь запрос
 * уходит только когда что-то набрали, и приносит не больше десяти совпадений.
 */

const RESULT_LIMIT = 10;
const DEBOUNCE_MS = 250;

type Hit = { id: string; name?: string; title?: string; slug?: string };

const GameSwitcher: React.FC<{ currentTitle: string; onPick: (id: string, title: string) => void }> = ({
  currentTitle,
  onPick,
}) => {
  const apiClient = useMemo(() => container.get<IApiClient>(IDENTIFIERS.IApiClient), []);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  // Сколько игр подошло всего. Показать только первые десять и промолчать нельзя: на «a»
  // подходят 38 игр, а список из десяти выглядит полным — человек решит, что остальных нет.
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const text = query.trim();
    let cancelled = false;
    setLoading(true);
    // Пустой ввод — не «показывать нечего», а первая страница по алфавиту: название игры
    // можно и не помнить, а раньше поле молчало, пока в него что-нибудь не наберут.
    // Десять записей стоят ровно столько же, сколько поисковая выдача, так что на
    // масштабируемости это не сказывается.
    // kind=all: по умолчанию каталог отдаёт только игры, а редактор правит и ПО. includeDrafts — черновики тоже правят.
    const url = text
      ? `/api/game/catalog?page=1&pageSize=${RESULT_LIMIT}&kind=all&includeDrafts=true&q=${encodeURIComponent(text)}`
      : `/api/game/catalog?page=1&pageSize=${RESULT_LIMIT}&kind=all&includeDrafts=true&sort=name-asc`;
    // Задержка, чтобы не слать запрос на каждую букву. Для пустого ввода ждать нечего:
    // список открывается по щелчку и должен появиться сразу.
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiClient.api.get(url);
        if (!cancelled) {
          setHits(response.data?.items ?? []);
          setTotal(response.data?.total ?? 0);
        }
      } catch {
        if (!cancelled) {
          setHits([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, text ? DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiClient, query, open]);

  // Клик мимо закрывает выдачу — иначе она перекрывает поля формы под собой.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (hit: Hit) => {
    setOpen(false);
    setQuery("");
    onPick(hit.id, hit.title || hit.name || "");
  };

  return (
    <div className="game-switch" ref={boxRef}>
      <input
        id="game-switch"
        className="input"
        type="search"
        value={query}
        placeholder={currentTitle || "Search games…"}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
          if (event.key === "Enter" && hits.length > 0) {
            event.preventDefault();
            pick(hits[0]);
          }
        }}
        autoComplete="off"
      />
      {open && (
        <ul className="game-switch__results" role="listbox">
          {loading && <li className="game-switch__empty">Searching…</li>}
          {!loading && hits.length === 0 && (
            <li className="game-switch__empty">{query.trim() ? "Nothing found" : "No games yet"}</li>
          )}
          {/* Строка состояния над списком. Главное в ней — сколько игр подошло всего:
              выдача обрезана до десяти, и без этого числа частичный список неотличим от
              полного. По «a» подходят 38 игр, а видно десять — и семь из них даже не на «A»,
              потому что совпадение ищется в любом месте названия и слага. */}
          {!loading && hits.length > 0 && (
            <li className="game-switch__note">
              {!query.trim()
                ? `First ${hits.length} of ${total} A–Z. Type to search, or open the Catalog tab for the full list.`
                : total > hits.length
                  ? `Showing ${hits.length} of ${total} matches — keep typing to narrow it down.`
                  : `${total} ${total === 1 ? "match" : "matches"}.`}
            </li>
          )}
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" className="game-switch__hit" onClick={() => pick(hit)}>
                <span>{hit.title || hit.name}</span>
                {hit.slug && <span className="game-switch__slug">{hit.slug}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default GameSwitcher;
