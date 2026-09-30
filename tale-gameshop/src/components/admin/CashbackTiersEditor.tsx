import React, { useMemo, useState } from "react";
import type { CashbackTierSetting } from "../../api/adminCashbackApi";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IUrlService } from "../../iterfaces/i-url-service";
import MediaPickerModal from "../admin-panel/media-library/MediaPickerModal";
import { tierArt } from "../rewards-page/rewardsArt";

/**
 * Уровни кэшбэка: картинка, id, название, процент, порог суммы покупок (USD). Сервер проверяет, что это
 * лестница — первый уровень с нуля, пороги растут, процент не падает, — и не сохранит иначе.
 * id показывается покупателю только косвенно (по нему кабинет узнаёт уровень), поэтому менять
 * его у действующей программы не стоит.
 *
 * Картинка — из медиатеки (выбрать или загрузить). Без неё у четырёх встроенных уровней остаётся своя 3D-медаль,
 * у новых — запасная звезда; превью показывает ровно то, что увидит покупатель на странице кэшбэка.
 */
const CashbackTiersEditor: React.FC<{
  value: CashbackTierSetting[];
  defaults: CashbackTierSetting[];
  overridden: boolean;
  onChange: (next: CashbackTierSetting[] | null) => void;
}> = ({ value, defaults, overridden, onChange }) => {
  const rows = value;
  const [picking, setPicking] = useState<number | null>(null);
  const apiBaseUrl = useMemo(() => container.get<IUrlService>(IDENTIFIERS.IUrlService).apiBaseUrl, []);

  // Правка возможна только в переопределённом списке: пока уровни «как в конфиге», первое изменение
  // копирует их в редактор — так же, как кнопка «Edit levels».
  const editable = () => (overridden ? rows : defaults.map((tier) => ({ ...tier })));
  const update = (index: number, patch: Partial<CashbackTierSetting>) =>
    onChange(editable().map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const number = (raw: string) => (raw === "" ? 0 : Number(raw));

  return (
    <div className="cashback-tiers">
      <div className="cashback-tiers__row cashback-tiers__row--head">
        <span>Image</span>
        <span>Id</span>
        <span>Name</span>
        <span>Cashback, %</span>
        <span>From spent, USD</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <div key={index} className="cashback-tiers__row">
          <span className="cashback-tiers__image">
            <button
              type="button"
              className="cashback-tiers__thumb"
              onClick={() => setPicking(index)}
              title={row.imageUrl ? "Change image" : "Choose or upload an image"}
              aria-label={`Image for level ${row.name || index + 1}`}
            >
              <img src={tierArt({ id: row.id, imageUrl: row.imageUrl }, apiBaseUrl)} alt="" />
            </button>
            {row.imageUrl && (
              <button type="button" className="cashback-tiers__clear" onClick={() => update(index, { imageUrl: null })} title="Use the default image">
                ×
              </button>
            )}
          </span>
          <input className="input" value={row.id} onChange={(e) => update(index, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="veteran" aria-label="Level id" />
          <input className="input" value={row.name} onChange={(e) => update(index, { name: e.target.value })} placeholder="Veteran" aria-label="Level name" />
          <input className="input" type="number" min={0} max={50} step={0.5} value={row.percent} onChange={(e) => update(index, { percent: number(e.target.value) })} aria-label="Cashback percent" />
          <input
            className="input"
            type="number"
            min={0}
            step={50}
            value={row.spendThresholdUsd}
            disabled={index === 0 && row.spendThresholdUsd === 0}
            onChange={(e) => update(index, { spendThresholdUsd: number(e.target.value) })}
            aria-label="Spend threshold in USD"
          />
          <button type="button" className="btn btn-outline" onClick={() => onChange(editable().filter((_, i) => i !== index))} disabled={rows.length <= 1} title="Remove level">
            ×
          </button>
        </div>
      ))}
      <p className="cashback-tiers__hint">
        Images: PNG or WebP with a transparent background look best on the dark track; they are shown inside a round medal.
        No image — built-in levels keep their medal, new ones get a star.
      </p>
      <div className="cashback-tiers__actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            const current = editable();
            const last = current[current.length - 1];
            onChange([...current, { id: "", name: "", percent: last?.percent ?? 0, spendThresholdUsd: (last?.spendThresholdUsd ?? 0) + 500, imageUrl: null }]);
          }}
          disabled={rows.length >= 10}
        >
          Add level
        </button>
        {overridden && (
          <button type="button" className="btn btn-outline" onClick={() => onChange(null)} title="Drop the override and use configuration levels">
            Reset to config
          </button>
        )}
        {!overridden && (
          <button type="button" className="btn btn-outline" onClick={() => onChange(defaults.map((tier) => ({ ...tier })))} title="Copy the current levels into the editor">
            Edit levels
          </button>
        )}
      </div>

      <MediaPickerModal
        isOpen={picking !== null}
        onClose={() => setPicking(null)}
        filterType="image"
        onSelect={(asset) => {
          if (picking !== null) {
            update(picking, { imageUrl: asset.url });
          }
          setPicking(null);
        }}
      />
    </div>
  );
};

export default CashbackTiersEditor;
