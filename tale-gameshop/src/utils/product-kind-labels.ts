import i18n from '../i18n';

/**
 * Подписи, которые у игр и ПО разные: у игры — платформы, разработчик и издания, у программы — системы, вендор и
 * лицензии. Одна карта на витрину и админку вместо троек `software ? "…" : "…"`, разбросанных по файлам: новое слово
 * добавляется здесь и сразу везде совпадает.
 */
export type ProductKindLabels = {
  /** «Platforms» у игр — «Works on» у ПО: у программы системы берутся из карточки, а не из ключей. */
  platforms: string;
  developer: string;
  /** Заголовок карточки о студии: у ПО издателя нет — только вендор. */
  developerAndPublisher: string;
  /** Раздел редактора о студии, языках и возрасте. */
  credits: string;
  /** Издание у игр — лицензия у ПО (в единственном числе, строчными: для кодов и счётчиков). */
  edition: string;
  editions: string;
  addEdition: string;
  /** Существительное для подписей: «this game» / «this software». */
  noun: 'game' | 'software';
  nounPlural: string;
  unknownProduct: string;
  noSimilar: string;
};

// Тексты — в словаре: kind.game.* и kind.software.*; здесь только сборка по текущему языку.
export const kindLabels = (software: boolean): ProductKindLabels => {
  const noun = software ? 'software' : 'game';
  const label = (key: string) => i18n.t(`kind.${noun}.${key}`);
  return {
    platforms: label('platforms'),
    developer: label('developer'),
    developerAndPublisher: label('developerAndPublisher'),
    credits: label('credits'),
    edition: label('edition'),
    editions: label('editions'),
    addEdition: label('addEdition'),
    noun,
    nounPlural: label('nounPlural'),
    unknownProduct: label('unknownProduct'),
    noSimilar: label('noSimilar'),
  };
};
