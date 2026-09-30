import React from 'react';
import i18n from '../../../i18n';

/** Скелет страницы на время загрузки — повторяет сетку хиро, чтобы контент не «прыгал». */
const GameDetailsSkeleton = () => (
  <main className="game-details-page" aria-busy="true" aria-label={i18n.t('product.loadingGame')}>
    <div className="container game-details-container">
      <div className="gd-skeleton gd-skeleton--crumbs" />
      <section className="gd-hero">
        <div className="gd-hero__media">
          <div className="gd-skeleton gd-skeleton--media" />
          <div className="gd-skeleton-row">
            <div className="gd-skeleton gd-skeleton--thumb" />
            <div className="gd-skeleton gd-skeleton--thumb" />
            <div className="gd-skeleton gd-skeleton--thumb" />
          </div>
        </div>
        <div className="gd-hero__info">
          <div className="gd-skeleton gd-skeleton--badge" />
          <div className="gd-skeleton gd-skeleton--title" />
          <div className="gd-skeleton gd-skeleton--line" />
          <div className="gd-skeleton gd-skeleton--line short" />
          <div className="gd-skeleton gd-skeleton--line" />
          <div className="gd-skeleton gd-skeleton--line short" />
        </div>
        <aside className="gd-hero__buy">
          <div className="card purchase-card">
            <div className="gd-skeleton gd-skeleton--badge" />
            <div className="gd-skeleton gd-skeleton--price" />
            <div className="gd-skeleton gd-skeleton--button" />
            <div className="gd-skeleton gd-skeleton--button outline" />
            <div className="gd-skeleton gd-skeleton--line" />
            <div className="gd-skeleton gd-skeleton--line short" />
          </div>
        </aside>
      </section>
    </div>
  </main>
);

export default GameDetailsSkeleton;
