import React from "react";

/**
 * Дата и время одной точки во времени: два поля вместо одного `datetime-local`.
 *
 * Причин две.
 *
 * Первая — вид. У встроенного в браузер `datetime-local` выпадашка совмещает календарь и
 * два столбца с часами и минутами; столбцы жмутся сбоку, и разобраться в них тяжелее, чем
 * в обычном календаре и обычном поле времени по отдельности. Стилями это не лечится:
 * виджет рисует браузер, и он же выбирает язык — оттого календарь бывает русским на
 * английской админке.
 *
 * Вторая важнее. Раньше значение подставлялось как `iso.slice(0, 16)`, то есть UTC-время
 * из базы показывалось так, будто оно местное: скидка, начинающаяся в 11:31 UTC, в Москве
 * показывалась как 11:31, хотя на самом деле это 14:31. Обратно уходила такая же строка без
 * зоны, а сервер сравнивает её с UTC. Ошибка ровно на смещение часового пояса — в обе
 * стороны. Здесь перевод делается на границе: наружу компонент всегда отдаёт UTC ISO,
 * внутри показывает местное время и подписывает, какое именно.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** UTC ISO → местные дата и время для полей ввода. */
const splitLocal = (iso?: string | null): { date: string; time: string } => {
  if (!iso) {
    return { date: "", time: "" };
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return { date: "", time: "" };
  }
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
};

/** Местные дата и время → UTC ISO. Пустая дата означает «значения нет». */
const joinUtc = (date: string, time: string): string => {
  if (!date) {
    return "";
  }
  // Время не выбрали — начало суток. Дата без времени бессмысленна для сравнения с «сейчас».
  const at = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(at.getTime()) ? "" : at.toISOString();
};

const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time";
  } catch {
    return "your local time";
  }
};

const DateTimeField: React.FC<{
  label: string;
  /** Значение в UTC ISO — ровно то, что хранит и сравнивает сервер. */
  value?: string | null;
  onChange: (utcIso: string) => void;
}> = ({ label, value, onChange }) => {
  const { date, time } = splitLocal(value);

  return (
    <div className="admin-field datetime-field">
      <span className="field-label">{label}</span>
      <div className="datetime-field__inputs">
        <input
          className="input"
          type="date"
          value={date}
          onChange={(event) => onChange(joinUtc(event.target.value, time))}
        />
        <input
          className="input"
          type="time"
          value={time}
          disabled={!date}
          onChange={(event) => onChange(joinUtc(date, event.target.value))}
        />
      </div>
      <span className="datetime-field__hint">
        {date ? `${localZone()} — stored as UTC` : localZone()}
      </span>
    </div>
  );
};

export default DateTimeField;
