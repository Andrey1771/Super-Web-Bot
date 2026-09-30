import React from "react";
import LocalizedField from "../../components/admin/LocalizedField";
import type {
  GameSystemRequirementBlock,
  GameSystemRequirementSpec,
  GameSystemRequirements,
} from "../../types/game-details";

/**
 * Системные требования целиком: три системы × минимальные и рекомендуемые.
 *
 * Форма показывала только Windows-минимум — пять полей, — хотя модель хранит и Mac, и Linux,
 * и рекомендуемые характеристики, и заметки. Из-за этого шаг «Requirements» выглядел пустым,
 * а заполнить остальное было нельзя вообще ниоткуда.
 *
 * Каждая система добавляется по кнопке и убирается ею же, включая Windows: игра может быть
 * только для macOS, только для Linux или вовсе консольной. Пустыми блоками они не висят —
 * это была бы форма на два экрана ради того, что у большинства игр не заполняется.
 * Отсутствие блока и есть «не поддерживается».
 */

const FIELDS: Array<{ key: keyof GameSystemRequirementSpec; label: string; placeholder: string }> = [
  { key: "os", label: "OS", placeholder: "Windows 10 64-bit" },
  { key: "cpu", label: "CPU", placeholder: "Intel Core i5-8400" },
  { key: "ram", label: "RAM", placeholder: "8 GB" },
  { key: "gpu", label: "GPU", placeholder: "NVIDIA GTX 1060 6 GB" },
  { key: "storage", label: "Storage", placeholder: "50 GB SSD" },
  { key: "notes", label: "Notes", placeholder: "Broadband connection required" },
];

// Ни одна система не обязательна: игра может быть только для macOS, только для Linux или
// вовсе консольной. Раньше Windows была прибита гвоздями и её нельзя было убрать — пустой
// блок при этом читался бы как «поддерживается, требования не заполнены», что неправда.
const OSES: Array<{ key: "windows" | "mac" | "linux"; label: string }> = [
  { key: "windows", label: "Windows" },
  { key: "mac", label: "macOS" },
  { key: "linux", label: "Linux" },
];

const emptySpec = (): GameSystemRequirementSpec => ({});
const emptyBlock = (): GameSystemRequirementBlock => ({ minimum: emptySpec() });

const SpecFields: React.FC<{
  title: string;
  spec: GameSystemRequirementSpec;
  onChange: (next: GameSystemRequirementSpec) => void;
  onRemove?: () => void;
}> = ({ title, spec, onChange, onRemove }) => (
  <div className="sysreq__column">
    <div className="sysreq__column-head">
      <strong>{title}</strong>
      {onRemove && (
        <button type="button" className="btn btn-outline btn-small" onClick={onRemove}>
          Clear
        </button>
      )}
    </div>
    {FIELDS.map((field) => {
      const input = (
        <input
          className="input"
          value={(spec[field.key] as string | undefined) ?? ""}
          placeholder={field.placeholder}
          onChange={(event) => onChange({ ...spec, [field.key]: event.target.value })}
        />
      );
      return (
        <label key={field.key}>
          {field.label}
          {/* Переводятся только примечания: ОС, процессор и память — названия и цифры. */}
          {field.key === "notes" ? (
            <LocalizedField label="Notes" i18n={spec.notesI18n} placeholder={spec.notes ?? ""} onI18nChange={(next) => onChange({ ...spec, notesI18n: next })}>
              {input}
            </LocalizedField>
          ) : (
            input
          )}
        </label>
      );
    })}
  </div>
);

const SystemRequirementsEditor: React.FC<{
  value: GameSystemRequirements;
  onChange: (next: GameSystemRequirements) => void;
}> = ({ value, onChange }) => (
  <div className="sysreq">
    {OSES.map((os) => {
      const block = value[os.key];

      if (!block) {
        return (
          <div key={os.key} className="sysreq__add">
            <span>{os.label} — not supported</span>
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => onChange({ ...value, [os.key]: emptyBlock() })}
            >
              Add {os.label} requirements
            </button>
          </div>
        );
      }

      const setBlock = (next: GameSystemRequirementBlock | undefined) =>
        onChange({ ...value, [os.key]: next });

      return (
        <fieldset key={os.key} className="sysreq__os">
          <legend className="sysreq__legend">
            {os.label}
            <button type="button" className="btn btn-outline btn-small" onClick={() => setBlock(undefined)}>
              Remove
            </button>
          </legend>
          <div className="sysreq__columns">
            <SpecFields
              title="Minimum"
              spec={block.minimum ?? emptySpec()}
              onChange={(minimum) => setBlock({ ...block, minimum })}
            />
            {block.recommended ? (
              <SpecFields
                title="Recommended"
                spec={block.recommended}
                onChange={(recommended) => setBlock({ ...block, recommended })}
                onRemove={() => setBlock({ ...block, recommended: undefined })}
              />
            ) : (
              <div className="sysreq__add sysreq__add--column">
                <span>No recommended specs</span>
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={() => setBlock({ ...block, recommended: emptySpec() })}
                >
                  Add recommended
                </button>
              </div>
            )}
          </div>
        </fieldset>
      );
    })}
  </div>
);

export default SystemRequirementsEditor;
