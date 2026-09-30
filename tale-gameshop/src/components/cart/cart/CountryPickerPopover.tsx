import { useTranslation } from "react-i18next";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { localizeCountries } from "../../../utils/region-text";

/**
 * Выбор страны активации — списком в выпадающей панели, а не встроенным в строку select.
 *
 * Стран 248, и нативный список на такое количество неудобен: в нём нет поиска, он перекрывает
 * пол-экрана и закрывается от любого промаха. Здесь панель держится, пока покупатель не выбрал
 * страну или не щёлкнул мимо, и первым делом предлагает поиск.
 */
type CountryOption = { code: string; name: string };

type Props = {
  countries: CountryOption[];
  value: string | null;
  onSelect: (code: string | null) => void;
  onClose: () => void;
};

const CountryPickerPopover: React.FC<Props> = ({ countries: catalog, value, onSelect, onClose }) => {
  const { t, i18n } = useTranslation();
  // Названия стран — на языке сайта; каталог сервера английский и служит запасом.
  const countries = useMemo(() => localizeCountries(catalog), [catalog, i18n.language]);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Закрываем по щелчку мимо и по Esc — обычное поведение выпадающих панелей. Раньше панель
  // пропадала от простой потери фокуса, из-за чего исчезала при попытке проскроллить список.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      // Показываем все страны целиком.
      //
      // Здесь стоял slice(0, 120) «чтобы список не тормозил»: из 248 стран рендерились первые
      // 120, то есть до буквы G. Россия, США, Украина и вся вторая половина алфавита просто
      // отсутствовали, и найти их прокруткой было нельзя — при этом ничто не сообщало, что
      // список обрезан. Две с половиной сотни обычных кнопок браузер рисует незаметно.
      return countries;
    }

    return countries.filter(
      (option) =>
        option.name.toLowerCase().includes(needle) || option.code.toLowerCase().startsWith(needle),
    );
  }, [countries, query]);

  return (
    <div className="cart-country-popover" ref={boxRef}>
      <input
        className="cart-country-search"
        placeholder={t('header.searchCountry')}
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="cart-country-list" role="listbox">
        {visible.map((option) => (
          <button
            key={option.code}
            type="button"
            role="option"
            aria-selected={option.code === value}
            className={`cart-country-option${option.code === value ? " is-active" : ""}`}
            onClick={() => {
              onSelect(option.code);
              onClose();
            }}
          >
            <span className="cart-country-code">{option.code}</span>
            {option.name}
          </button>
        ))}
        {visible.length === 0 && <p className="cart-country-empty">{t('header.noSuchCountry')}</p>}
      </div>
    </div>
  );
};

export default CountryPickerPopover;
