import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { catalogHref } from '../../../utils/software';
import { kindLabels } from '../../../utils/product-kind-labels';
import type { DlcProduct, GameDetails, GameStudioInfo } from '../../../types/game-details';
import DlcChecklist from './DlcChecklist';

type DetailRow = { id: string; label: string; value: string | string[] };

/**
 * Вкладка «Overview». Правило: нет данных — нет блока. Пустые карточки «Edition», «DLC»,
 * «Awards» с одним заголовком раньше занимали полстраницы и выглядели как недоделка.
 */
const GameDetailsCard = ({ details }: { details: DetailRow[] }) => {
  const { t } = useTranslation();
  const rows = details.filter((row) => (Array.isArray(row.value) ? row.value.length > 0 : Boolean(row.value)));
  if (rows.length === 0) return null;
  return (
    <div className="card" id="details">
      <h2>{t('product.gameDetails')}</h2>
      <div className="detail-rows">
        {rows.map((detail) => (
          <div key={detail.id} className="detail-row">
            <span className="detail-label">{detail.label}</span>
            <span className="detail-value">{Array.isArray(detail.value) ? detail.value.join(', ') : detail.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Языки таблицей «язык · интерфейс · озвучка» — стандарт магазинов ключей: покупателю важно,
 * есть ли его язык и в каком виде. Раньше показывали «English + 1 more» и всё.
 */
const LanguagesCard = ({ languages }: { languages?: { text?: string[]; audio?: string[] } }) => {
  const { t } = useTranslation();
  const text = languages?.text ?? [];
  const audio = languages?.audio ?? [];
  const all = Array.from(new Set([...text, ...audio])).filter(Boolean);
  if (all.length === 0) return null;
  return (
    <div className="card" id="languages">
      <h2>{t('product.languages')}</h2>
      <table className="gd-languages">
        <thead>
          <tr>
            <th>{t('product.language')}</th>
            <th>{t('product.interfaceSubtitles')}</th>
            <th>{t('product.audio')}</th>
          </tr>
        </thead>
        <tbody>
          {all.map((language) => (
            <tr key={language}>
              <td>{language}</td>
              <td className={text.includes(language) ? 'is-yes' : 'is-no'}>{text.includes(language) ? '✓' : '—'}</td>
              <td className={audio.includes(language) ? 'is-yes' : 'is-no'}>{audio.includes(language) ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const StudioRow = ({ role, studio }: { role: string; studio: GameStudioInfo }) => {
  const inner = (
    <>
      {studio.logoUrl ? <img src={studio.logoUrl} alt="" /> : <span className="studio-mark">{studio.name.slice(0, 1)}</span>}
      <div>
        <p className="studio-name">{studio.name}</p>
        <span className="studio-link">{role}</span>
      </div>
    </>
  );
  return studio.website ? (
    <a href={studio.website} className="studio-item" target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <div className="studio-item">{inner}</div>
  );
};

const DeveloperPublisherCard = ({ developer, publisher, software = false }: { developer?: GameStudioInfo; publisher?: GameStudioInfo; software?: boolean }) => {
  const { t } = useTranslation();
  const labels = kindLabels(software);
  const hasDeveloper = Boolean(developer?.name);
  const hasPublisher = Boolean(publisher?.name);
  if (!hasDeveloper && !hasPublisher) return null;
  const samePublisher = hasDeveloper && hasPublisher && developer!.name === publisher!.name;
  // Steam перечисляет студии через запятую («Firaxis Games, Feral Interactive (Mac)»): ссылка — на первую,
  // основную; каталог находит игры по любой студии из такого списка.
  const studioName = (developer ?? publisher)!.name.split(',')[0].trim();

  return (
    <div className="card">
      <h2>{labels.developerAndPublisher}</h2>
      <div className="studio-list">
        {hasDeveloper && <StudioRow role={samePublisher ? labels.developerAndPublisher : labels.developer} studio={developer!} />}
        {hasPublisher && !samePublisher && <StudioRow role={t('product.publisher')} studio={publisher!} />}
      </div>
      {/* Каталог умеет фильтровать по студии (?studio=) — ссылка ведёт на выдачу того же вида товара. */}
      <Link to={catalogHref(software, { studio: studioName })} className="btn btn-outline studio-more">
        {t('product.moreFrom', { items: labels.nounPlural, studio: studioName })}
      </Link>
    </div>
  );
};

type OverviewTabProps = {
  game: GameDetails;
  dlc: DlcProduct[];
  /** ПО: без игровых режимов, облачных сохранений и DLC; сверху — сравнение лицензий и активация. */
  software?: boolean;
  softwareBlocks?: React.ReactNode;
};

const OverviewTab = ({ game, dlc, software = false, softwareBlocks }: OverviewTabProps) => {
  const { t } = useTranslation();
  const detailRows: DetailRow[] = software
    ? []
    : [
        { id: 'detail-online', label: t('product.modes'), value: game.onlineFeatures ?? [] },
        { id: 'detail-cloud', label: t('product.cloudSaves'), value: game.cloudSavesSupported ? t('product.supported') : '' }
      ];

  // Описание переехало в левую колонку хиро (GameAbout) — над вкладками, а не под ними.
  // Здесь остаётся то, что дополняет его, а не дублирует.
  // DLC — первыми и во всю ширину основной колонки: список с галочками, датой и ценой в узкую боковую не помещается.
  const main = [
    ...(software ? [<React.Fragment key="software">{softwareBlocks}</React.Fragment>] : []),
    ...(software ? [] : [<DlcChecklist key="dlc" products={dlc} legacy={game.dlcItems ?? []} />]),
    <LanguagesCard key="languages" languages={game.languages} />,
    <GameDetailsCard key="details" details={detailRows} />
  ];
  const side = [
    <DeveloperPublisherCard key="studio" developer={game.developer} publisher={game.publisher} software={software} />
  ];

  return (
    <section className="game-details-section">
      <div className="details-grid">
        <div className="details-main">{main}</div>
        <aside className="details-sidebar">{side}</aside>
      </div>
    </section>
  );
};

export default OverviewTab;
