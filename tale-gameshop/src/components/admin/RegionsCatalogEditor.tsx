import React from "react";
import type { RegionDefinition } from "./RegionPolicyEditor";

/**
 * Справочник регионов для политик активации: код, имя, страны (ISO alpha-2 через запятую).
 * Редактируется как список строк; пустой список = «как в конфиге/по умолчанию».
 */
const RegionsCatalogEditor: React.FC<{
  value: RegionDefinition[];
  defaults: RegionDefinition[];
  overridden: boolean;
  onChange: (next: RegionDefinition[] | null) => void;
}> = ({ value, defaults, overridden, onChange }) => {
  const rows = value;
  const update = (index: number, patch: Partial<RegionDefinition>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="regions-editor">
      <div className="regions-editor__row" style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>
        <span>Code</span>
        <span>Name</span>
        <span>Countries (ISO alpha-2)</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <div key={`${index}-${row.code}`} className="regions-editor__row">
          <input className="input" value={row.code} onChange={(e) => update(index, { code: e.target.value.toUpperCase() })} placeholder="EU" />
          <input className="input" value={row.name} onChange={(e) => update(index, { name: e.target.value })} placeholder="Europe" />
          <input
            className="input"
            defaultValue={row.countries.join(", ")}
            onBlur={(e) =>
              update(index, {
                countries: e.target.value
                  .split(/[\s,;]+/)
                  .map((c) => c.trim().toUpperCase())
                  .filter((c) => /^[A-Z]{2}$/.test(c)),
              })
            }
            placeholder="DE, FR, PL…"
          />
          <button type="button" className="btn btn-outline" onClick={() => onChange(rows.filter((_, i) => i !== index))} title="Remove region">
            ×
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        <button type="button" className="btn btn-outline" onClick={() => onChange([...rows, { code: "", name: "", countries: [] }])}>
          Add region
        </button>
        <button type="button" className="btn btn-outline" onClick={() => onChange(defaults.map((d) => ({ ...d, countries: [...d.countries] })))} title="Load the built-in set into the editor">
          Load defaults
        </button>
        {overridden && (
          <button type="button" className="btn btn-outline" onClick={() => onChange(null)} title="Drop the override and use config/defaults">
            Reset to config
          </button>
        )}
      </div>
    </div>
  );
};

export default RegionsCatalogEditor;
