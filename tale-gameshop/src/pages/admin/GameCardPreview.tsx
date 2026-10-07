import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { DlcProduct, GameDetails, ParentGameRef } from "../../types/game-details";
import GameHero, { orderMedia } from "../game-details-page/components/GameHero";
import GameAbout from "../game-details-page/components/GameAbout";
import OverviewTab from "../game-details-page/components/OverviewTab";
import PurchaseCard from "../game-details-page/components/PurchaseCard";
import GameTabs, { type GameTabDef, type GameTabId } from "../game-details-page/components/GameTabs";
import SystemRequirementsTab, { hasSystemRequirements } from "../game-details-page/components/SystemRequirementsTab";
import { ratingLabelFor } from "../game-details-page/components/shared";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import { getGameDlc } from "../../api/adminDlcApi";
import { getKeyInventory } from "../../api/adminKeysApi";
import { kindLabels } from "../../utils/product-kind-labels";
import { slugify } from "../../utils/slugify";
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

/**
 * То, чего нет в черновике формы, но есть на живой странице: игра-родитель (у DLC), опубликованные DLC игры и остаток
 * ключей. Берётся из админского API — черновик ещё может быть не опубликован, и витринный API его не отдал бы.
 */
const usePreviewContext = (gameId: string) => {
  const [context, setContext] = useState<{ parentGame: ParentGameRef | null; dlc: DlcProduct[]; keys: number | null }>({
    parentGame: null,
    dlc: [],
    keys: null,
  });
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    Promise.all([getGameDlc(gameId).catch(() => null), getKeyInventory(gameId).catch(() => null)]).then(([dlcInfo, inventory]) => {
      if (cancelled) return;
      setContext({
        parentGame: dlcInfo?.parent ? { id: dlcInfo.parent.id, slug: dlcInfo.parent.slug, title: dlcInfo.parent.title } : null,
        // На витрине черновиков нет — и в превью их нет.
        dlc: (dlcInfo?.items ?? [])
          .filter((item) => !item.isDraft)
          .map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            coverUrl: item.imagePath,
            releaseDate: item.releaseDate,
            isComingSoon: item.isComingSoon,
            inStock: item.keysAvailable > 0,
            pricing: { price: item.price, currency: item.currency },
          })),
        keys: inventory ? inventory.available : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [gameId]);
  return context;
};

const PreviewBody: React.FC<{ details: GameDetails; software: boolean }> = ({ details, software }) => {
  const { t } = useTranslation();
  const context = usePreviewContext(details.gameId);
  const [activeTab, setActiveTab] = useState<GameTabId>("overview");
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

  // Те же данные, что собирает живая страница (GameDetailsPage), — из черновика и контекста выше.
  const currency = details.currency || "USD";
  const editions = details.editions ?? [];
  const selectedEdition = editions.find((edition) => edition.isDefault) ?? editions[0];
  const editionPricing = Object.fromEntries(editions.map((edition) => [edition.code, { price: edition.price, currency }]));
  const pricing = selectedEdition
    ? editionPricing[selectedEdition.code]
    : Number(details.basePrice) > 0
      ? { price: Number(details.basePrice), currency }
      : null;
  const isComingSoon = Boolean(details.releaseDate && new Date(details.releaseDate).getTime() > Date.now());
  const tabs: GameTabDef[] = [
    { id: "overview", label: t("product.tabs.overview") },
    { id: "reviews", label: t("product.tabs.reviews"), count: details.reviewsCount ?? 0 },
    ...(hasSystemRequirements(details.systemRequirements) ? [{ id: "system-requirements" as const, label: t("product.tabs.sysreq") }] : []),
  ];
  const effectiveTab: GameTabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : "overview";
  const breadcrumbItems = [
    { label: t("common.nav.home"), to: "/" },
    { label: software ? t("common.nav.software") : t("product.gameKeys"), to: "/games" },
    ...(context.parentGame
      ? [{ label: context.parentGame.title, to: `/games/${context.parentGame.slug}` }]
      : !software && details.genres?.[0]
        ? [{ label: details.genres[0], to: `/games/category/${slugify(details.genres[0])}` }]
        : []),
    { label: details.title },
  ];
  const rating = {
    summary: { average: details.ratingAvg ?? 0, totalReviews: details.reviewsCount ?? 0, label: ratingLabelFor(details.ratingAvg ?? 0, details.reviewsCount ?? 0) },
    isTopRated: details.isTopRated,
  };

  const card = (
    <div className="game-details-page" onClickCapture={swallowLinks}>
      <div className="container game-details-container">
        <Breadcrumbs items={breadcrumbItems} />
        {/* Каждый блок под своей границей ошибок: если карточка не собирается, панель называет
            виновника по имени, а соседние блоки продолжают показываться. */}
        <Block label="Hero (gallery, facts, tags)">
          <GameHero
            game={details}
            media={orderMedia(details)}
            software={software}
            parentGame={context.parentGame}
            rating={rating}
            purchase={
              <Block label="Purchase card">
                {/* Настоящая карточка покупки, но без нажатий: из превью ничего не должно попадать в корзину. */}
                <div className="game-preview__inert" aria-hidden="true">
                  <PurchaseCard
                    gameId={details.gameId}
                    slug={details.slug}
                    gameTitle={details.title}
                    coverUrl={details.cover?.url}
                    pricing={pricing}
                    siteCurrency={currency}
                    editions={editions}
                    editionPricing={editionPricing}
                    selectedEditionCode={selectedEdition?.code ?? ""}
                    onSelectEdition={() => undefined}
                    availability={context.keys === null ? undefined : { status: context.keys > 0 ? "inStock" : "outOfStock" }}
                    parentGame={context.parentGame}
                    keyType={details.keyType}
                    isComingSoon={isComingSoon}
                    releaseDate={details.releaseDate}
                    software={software}
                    activation={details.activation}
                  />
                </div>
              </Block>
            }
            about={
              <Block label="Description">
                <GameAbout
                  descriptionMarkdown={details.descriptionMarkdown}
                  features={details.keyFeatures ?? []}
                  awards={details.awards ?? []}
                  noun={context.parentGame ? "dlc" : kindLabels(software).noun}
                />
              </Block>
            }
          />
        </Block>
        <div className="gd-tabs-anchor">
          <GameTabs tabs={tabs} active={effectiveTab} onChange={setActiveTab} />
          {effectiveTab === "overview" && (
            <Block label="Overview tab (DLC, languages, details, studios)">
              <OverviewTab game={details} dlc={context.dlc} software={software} />
            </Block>
          )}
          {effectiveTab === "reviews" && (
            <div className="card game-preview__note">Reviews come from buyers and are shown on the live page.</div>
          )}
          {effectiveTab === "system-requirements" && (
            <Block label="System requirements">
              <SystemRequirementsTab requirements={details.systemRequirements} />
            </Block>
          )}
        </div>
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

const GameCardPreview: React.FC<{ details: GameDetails; software?: boolean }> = ({ details, software = false }) => (
  <PreviewBoundary label="Preview">
    <PreviewBody details={details} software={software} />
  </PreviewBoundary>
);

export default GameCardPreview;
