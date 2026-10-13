import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Game } from '../../../models/game';
import GameShelf from '../../../components/tale-gameshop-main-page/GameShelf';
import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type { IUrlService } from '../../../iterfaces/i-url-service';
import { ITEM_LISTS, trackItemSelect, useItemListView } from '../../../utils/item-list-tracking';
import { catalogHref } from '../../../utils/software';

/**
 * «More like this» — та же полка, что на главной (GameShelf): карточка сайта с обложкой 3:2,
 * скидкой, платформой и ценой, четыре в ряд. Раньше тут была своя карточка с портретной обложкой,
 * текстовым рейтингом и кнопкой «Add to cart» и сетка «сколько влезет» — на широком экране восемь
 * карточек ложились как 6 + 2. Покупка — на странице игры, сюда кнопка не нужна.
 * Обёртка добавляет к полке аналитику подборки.
 */
const RecommendationsCarousel = ({ items, software = false }: { items: Game[]; software?: boolean }) => {
  const { t } = useTranslation();
  const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
  const currency = items[0]?.currency;

  useItemListView(
    ITEM_LISTS.recommendationsGame,
    items.map((item) => ({ id: item.id ?? item.title, title: item.title, price: item.finalPrice ?? item.price })),
    currency
  );

  return (
    <GameShelf
      embedded
      eyebrow={t('product.recommendations')}
      title={t('product.moreLikeThis')}
      games={items}
      baseUrl={urlService.apiBaseUrl}
      viewAllTo={catalogHref(software)}
      viewAllLabel={software ? t('product.allSoftware') : t('header.allGames')}
      onSelect={(game, index) =>
        trackItemSelect(
          ITEM_LISTS.recommendationsGame,
          { id: game.id ?? game.title, title: game.title, price: game.finalPrice ?? game.price },
          index,
          currency
        )
      }
    />
  );
};

export default RecommendationsCarousel;
