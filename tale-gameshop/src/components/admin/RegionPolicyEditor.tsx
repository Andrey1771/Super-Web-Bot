import React, { useEffect, useState } from 'react';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { IApiClient } from '../../iterfaces/i-api-client';

/** Политика активации: Global с исключениями стран или набор регионов (+ исключения). */
export type RegionPolicy = {
  mode: 'Global' | 'Regions';
  regions: string[];
  excludedCountries: string[];
};

export type RegionDefinition = { code: string; name: string; countries: string[] };

export const emptyPolicy = (): RegionPolicy => ({ mode: 'Global', regions: [], excludedCountries: [] });

/** Справочник регионов — с витринного эндпоинта, тот же, что видят покупатели. */
export const useRegionCatalog = () => {
  const [regions, setRegions] = useState<RegionDefinition[]>([]);
  useEffect(() => {
    let cancelled = false;
    container
      .get<IApiClient>(IDENTIFIERS.IApiClient)
      .api.get('/api/storefront/region')
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data?.regions)) setRegions(data.regions);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return regions;
};

/** «Global −RU,BY» / «EU, NA −UA» / «Anywhere» — подпись для списков и подтверждений. */
export const describePolicy = (policy: RegionPolicy | null | undefined, regions: RegionDefinition[] = []) => {
  if (!policy) return 'Anywhere';
  const names = policy.regions.map((code) => regions.find((r) => r.code === code)?.name ?? code);
  const head = policy.mode === 'Regions' ? (names.length > 0 ? names.join(', ') : 'Nowhere') : 'Global';
  return policy.excludedCountries.length > 0 ? `${head} − ${policy.excludedCountries.join(', ')}` : head;
};

/**
 * Редактор политики: режим, чекбоксы регионов, исключения стран через запятую (ISO alpha-2).
 * Используется при заливке партии ключей и для политики игры по умолчанию.
 */
const RegionPolicyEditor: React.FC<{
  value: RegionPolicy;
  onChange: (next: RegionPolicy) => void;
  regions: RegionDefinition[];
  disabled?: boolean;
}> = ({ value, onChange, regions, disabled }) => {
  const [excludedText, setExcludedText] = useState(value.excludedCountries.join(', '));
  useEffect(() => {
    setExcludedText(value.excludedCountries.join(', '));
  }, [value.excludedCountries]);

  const toggleRegion = (code: string) => {
    const set = new Set(value.regions);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    onChange({ ...value, regions: Array.from(set) });
  };

  const commitExcluded = () => {
    const codes = excludedText
      .split(/[\s,;]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));
    onChange({ ...value, excludedCountries: Array.from(new Set(codes)) });
  };

  return (
    <div className="region-policy">
      <div className="region-policy__row">
        <label className="region-policy__radio">
          <input type="radio" name="region-mode" checked={value.mode === 'Global'} disabled={disabled} onChange={() => onChange({ ...value, mode: 'Global' })} />
          Global — works everywhere (minus exclusions)
        </label>
        <label className="region-policy__radio">
          <input type="radio" name="region-mode" checked={value.mode === 'Regions'} disabled={disabled} onChange={() => onChange({ ...value, mode: 'Regions' })} />
          Only these regions
        </label>
      </div>
      {value.mode === 'Regions' && (
        <div className="region-policy__regions">
          {regions.map((region) => (
            <label key={region.code} className={`region-policy__chip${value.regions.includes(region.code) ? ' is-on' : ''}`} title={region.countries.join(', ')}>
              <input type="checkbox" checked={value.regions.includes(region.code)} disabled={disabled} onChange={() => toggleRegion(region.code)} />
              {region.name}
            </label>
          ))}
          {regions.length === 0 && <span className="muted">Region list is loading…</span>}
        </div>
      )}
      <label className="region-policy__excluded">
        <span>Doesn't work in (ISO codes, comma-separated)</span>
        <input className="input" placeholder="RU, BY, CN" value={excludedText} disabled={disabled} onChange={(e) => setExcludedText(e.target.value)} onBlur={commitExcluded} />
      </label>
    </div>
  );
};

export default RegionPolicyEditor;
