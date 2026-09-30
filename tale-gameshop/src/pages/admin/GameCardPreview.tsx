import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GameDetails } from "../../types/game-details";
import GameHero, { orderMedia } from "../game-details-page/components/GameHero";
import GameAbout from "../game-details-page/components/GameAbout";
import OverviewTab from "../game-details-page/components/OverviewTab";
// Стили витрины должны попасть в сборку и в родительский документ: copyStyles клонирует
// в iframe именно то, что есть в head страницы. Без импорта превью осталось бы без оформления.
// Протечки в админку нет: единственный общий класс .btn-small ограничен .game-details-page.
import "../game-details-page/game-details-page.css";

/**
 * Живое превью карточки: те же самые компоненты витрины, что видит покупатель, отрисованные
 * из черновика формы. Второй вёрстки нет — значит превью не может «врать».
 *
 * Карточка рисуется в iframe. Это единственный способ дать ей НАСТОЯЩИЙ вьюпорт: медиазапросы
 * витрины считают ширину окна, а не контейнера. Попытка обойтись обычным div-ом и задать
 * ширину контейнеру дала ложную картину — при «мобильных» 420px витрина продолжала применять
 * десктопную раскладку и вжимала колонку покупки в 340px из имеющихся 420, ломая вёрстку.
 *
 * Роутер внутрь НЕ ставим: админка уже внутри BrowserRouter приложения, а react-router v6
 * запрещает вложенные роутеры и в production бросает invariant без текста сообщения.
 * Контекст роутера доходит до содержимого портала сам — портал остаётся в дереве React,
 * даже когда его DOM лежит в другом документе.
 */

/** Ширины совпадают с брейкпоинтами витрины: на 900 сужается колонка покупки, на 420 — одна колонка. */
const WIDTHS = [
  { key: "desktop", label: "Desktop", width: 1280 },
  { key: "tablet", label: "Tablet", width: 900 },
  { key: "mobile", label: "Mobile", width: 420 },
] as const;
type WidthKey = (typeof WIDTHS)[number]["key"];

const widthOf = (key: WidthKey) => WIDTHS.find((option) => option.key === key)!.width;

/** Переносит стили родительского документа внутрь iframe: и <style> от сборщика, и <link>. */
const copyStyles = (target: Document) => {
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    target.head.appendChild(node.cloneNode(true));
  });
  const base = target.createElement("style");
  // Внутри iframe нет фона страницы — берём тот же, что у витрины, иначе превью «висит в воздухе».
  base.textContent = "html,body{margin:0;background:#f6f2fb;}";
  target.head.appendChild(base);
};

/** Кадр с собственным вьюпортом. Содержимое отдаётся порталом в body его документа. */
const PreviewFrame: React.FC<{
  width: number;
  height: number | string;
  scale?: number;
  children: React.ReactNode;
}> = ({ width, height, scale = 1, children }) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) {
      return;
    }
    if (!doc.head.querySelector("style, link")) {
      copyStyles(doc);
    }
    setBody(doc.body);
  }, []);

  return (
    <>
      <iframe
        ref={frameRef}
        title="Storefront preview"
        className="game-preview__frame"
        style={{
          width,
          height,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
      {body && createPortal(children, body)}
    </>
  );
};

const PreviewBody: React.FC<{ details: GameDetails }> = ({ details }) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [widthKey, setWidthKey] = useState<WidthKey>("desktop");

  // Встроенное превью занимает всю ширину редактора и показывает десктопную карточку.
  // Ширина здесь не переключается: для сравнения раскладок есть разворот, там для трёх
  // ширин хватает места, а тут переключатель только отнимал бы его у самой карточки.
  const inlineHeight = 900;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const fit = () => setScale(Math.min(1, box.clientWidth / WIDTHS[0].width));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Escape закрывает разворот — как любое модальное окно.
  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  // Превью — картинка, а не рабочая витрина: клик по жанру уводил бы админа со страницы
  // редактирования вместе с несохранёнными правками.
  const swallowLinks = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest("a")) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const card = (
    <div className="game-details-page" onClickCapture={swallowLinks}>
      <div className="container game-details-container">
        {/* Каждый блок под своей границей ошибок: если карточка не собирается, панель называет
            виновника по имени, а соседние блоки продолжают показываться. */}
        <Block label="Hero (gallery, facts, tags)">
          <GameHero
            game={details}
            media={orderMedia(details)}
            purchase={<PurchaseStub />}
            about={
              <Block label="Description">
                <GameAbout
                  descriptionMarkdown={details.descriptionMarkdown}
                  features={details.keyFeatures ?? []}
                  awards={details.awards ?? []}
                />
              </Block>
            }
          />
        </Block>
        <Block label="Overview tab (languages, details, DLC, studios)">
          <OverviewTab game={details} dlc={[]} />
        </Block>
      </div>
    </div>
  );

  return (
    <div className="game-preview">
      <div className="game-preview__bar">
        <span className="game-preview__title">Storefront preview</span>
        <span className="game-preview__actions">
          <span className="game-preview__scale">{Math.round(scale * 100)}%</span>
          <button type="button" className="btn btn-outline" onClick={() => setIsFullscreen(true)}>
            Full screen
          </button>
        </span>
      </div>

      <div className="game-preview__box" ref={boxRef} style={{ height: inlineHeight * scale }}>
        {!isFullscreen && (
          <PreviewFrame width={WIDTHS[0].width} height={inlineHeight} scale={scale}>
            {card}
          </PreviewFrame>
        )}
      </div>

      {/* Разворот рисуем порталом в body: боковая панель липкая, и внутри неё оверлей
          обрезался бы её же контекстом наложения. */}
      {isFullscreen &&
        createPortal(
          <div className="game-preview-full" role="dialog" aria-label="Storefront preview">
            <div className="game-preview-full__bar">
              <span className="game-preview__title">Storefront preview — full size</span>
              <span className="game-preview__actions">
                {WIDTHS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`btn btn-outline${widthKey === option.key ? " is-active" : ""}`}
                    aria-pressed={widthKey === option.key}
                    onClick={() => setWidthKey(option.key)}
                  >
                    {option.label} {option.width}
                  </button>
                ))}
                <button type="button" className="btn btn-outline" onClick={() => setIsFullscreen(false)}>
                  Close (Esc)
                </button>
              </span>
            </div>
            <div className="game-preview-full__body">
              {/* key по ширине: при смене размера кадр пересоздаётся, и вьюпорт внутри
                  становится новым. Без этого iframe сохранял бы прежнюю ширину. */}
              <PreviewFrame key={widthKey} width={widthOf(widthKey)} height="100%">
                {card}
              </PreviewFrame>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

/**
 * Заглушка карточки покупки. Настоящая ходит в API за способами оплаты — в превью это лишний
 * запрос и лишняя точка отказа, а на раскладку она влияет только шириной колонки.
 */
const PurchaseStub: React.FC = () => (
  <div className="card game-preview__purchase">
    <strong>Purchase card</strong>
    <p>Price, stock and buttons are rendered on the live page.</p>
  </div>
);

/**
 * Превью — вспомогательная панель, и падать вместе с ней редактор не должен: правки формы
 * при этом теряются. Ловим ошибку здесь, показываем её текст и имя блока — по одному лишь
 * message причину не найти, он часто пустой.
 */
class PreviewBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { error: Error | null; where: string }
> {
  state: { error: Error | null; where: string } = { error: null, where: "" };

  static getDerivedStateFromError(error: Error) {
    return { error, where: "" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const where = (info.componentStack ?? "").split("\n").filter(Boolean).slice(0, 6).join("\n");
    this.setState({ where });
    console.error(
      `[Card preview] ${this.props.label ?? "card"} failed:`,
      error?.name,
      error?.message,
      error?.stack,
      info.componentStack
    );
  }

  componentDidUpdate(prev: { children: React.ReactNode }) {
    if (this.state.error && prev.children !== this.props.children) {
      this.setState({ error: null, where: "" });
    }
  }

  render() {
    if (this.state.error) {
      const { error, where } = this.state;
      return (
        <div className="game-preview game-preview--failed">
          <div className="game-preview__bar">
            <span className="game-preview__title">{this.props.label ?? "Preview"} failed</span>
          </div>
          <div className="game-preview__error">
            <p>This block could not be rendered from the current draft.</p>
            <code>
              {error.name}: {error.message || "(no message)"}
            </code>
            {where && <code>{where}</code>}
          </div>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

/** Граница ошибок вокруг одного блока карточки — чтобы падение не уносило соседние. */
const Block: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <PreviewBoundary label={label}>{children}</PreviewBoundary>
);

const GameCardPreview: React.FC<{ details: GameDetails }> = ({ details }) => (
  <PreviewBoundary label="Preview">
    <PreviewBody details={details} />
  </PreviewBoundary>
);

export default GameCardPreview;
