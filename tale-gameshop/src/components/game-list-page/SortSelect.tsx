import React, { useEffect, useRef, useState } from 'react';

export type SortOption = { value: string; label: string };

export type SortSelectProps = {
    options: SortOption[];
    value: string;
    onChange: (value: string) => void;
};

/**
 * Выбор порядка выдачи.
 *
 * Собственный список вместо системного `<select>`: тот рисуется средствами операционной
 * системы и в оформление сайта не вписывается — на светлой витрине открывалась синяя
 * системная панель. Здесь же список выглядит так же, как остальные элементы каталога.
 *
 * Клавиатура работает как у настоящего списка: стрелки водят по пунктам, Enter выбирает,
 * Escape закрывает и возвращает фокус на кнопку.
 */
const SortSelect: React.FC<SortSelectProps> = ({ options, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    const selected = options.find((option) => option.value === value) ?? options[0];

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const onOutside = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', onOutside);
        return () => document.removeEventListener('mousedown', onOutside);
    }, [isOpen]);

    const open = () => {
        setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
        setIsOpen(true);
    };

    const choose = (next: string) => {
        onChange(next);
        setIsOpen(false);
        buttonRef.current?.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (!isOpen) {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
            return;
        }

        if (event.key === 'Escape') {
            setIsOpen(false);
            buttonRef.current?.focus();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((previous) => (previous + 1) % options.length);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((previous) => (previous <= 0 ? options.length - 1 : previous - 1));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(options[activeIndex].value);
        }
    };

    return (
        <div className="sort-select" ref={rootRef} onKeyDown={handleKeyDown}>
            <button
                type="button"
                ref={buttonRef}
                className="sort-select-button"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => (isOpen ? setIsOpen(false) : open())}
            >
                <span className="sort-select-caption">Sort</span>
                <span className="sort-select-value">{selected?.label}</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
            </button>

            {isOpen && (
                <ul className="sort-select-list" role="listbox" aria-label="Sort games">
                    {options.map((option, index) => (
                        <li
                            key={option.value}
                            role="option"
                            aria-selected={option.value === value}
                            className={`${option.value === value ? 'is-selected' : ''} ${
                                index === activeIndex ? 'is-active' : ''
                            }`}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => choose(option.value)}
                        >
                            {option.label}
                            {option.value === value && (
                                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                    <path
                                        d="m5 10.5 3.2 3.2L15 7"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SortSelect;
