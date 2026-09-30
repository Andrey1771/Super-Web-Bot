/**
 * Переводы списка по позициям (жанры, теги): при правке английского списка переводы должны следовать
 * за своими значениями, а не за номерами позиций — иначе удаление первого тега молча вешает его перевод
 * на второй. Правило: перевод ищется по значению; если длина списка не изменилась и значение на той же
 * позиции пропало (пункт переименован на месте), перевод остаётся на позиции; иначе — пусто.
 */
export function realignI18n(
  prevValues: readonly string[],
  nextValues: readonly string[],
  i18n: Record<string, string[]> | null | undefined
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const sameLength = prevValues.length === nextValues.length;
  for (const [lang, list] of Object.entries(i18n ?? {})) {
    const translations = list ?? [];
    out[lang] = nextValues.map((value, index) => {
      const byValue = prevValues.indexOf(value);
      if (byValue >= 0) {
        return translations[byValue] ?? "";
      }
      const renamedInPlace = sameLength && !nextValues.includes(prevValues[index]);
      return renamedInPlace ? translations[index] ?? "" : "";
    });
  }
  return out;
}
