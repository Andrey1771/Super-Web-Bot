import { faCrown, faMedal, faStar, faTrophy } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

/** Иконки уровней в кабинете — одни и те же в обзоре и на странице кэшбэка. */
const TIER_ICON: Record<string, IconDefinition> = {
    rookie: faStar,
    veteran: faMedal,
    elite: faTrophy,
    legend: faCrown,
};

/** Иконка уровня; уровень, заведённый в админке под другим id, получает звезду. */
export const tierIcon = (id: string): IconDefinition => TIER_ICON[id] ?? faStar;
