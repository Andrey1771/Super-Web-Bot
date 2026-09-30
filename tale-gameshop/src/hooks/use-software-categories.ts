import { getSoftwareCategories, type SoftwareCategory } from '../api/catalogApi';
import { createCachedResource } from './use-cached-resource';

/** Шапка, подвал и режим софта каталога спрашивают одно и то же, а счётчики меняются редко — один общий ответ. */
const useCategoriesResource = createCachedResource(getSoftwareCategories, { total: 0, categories: [] as SoftwareCategory[] });

/** Категории софта с числом товаров и общее число товаров ПО. Пока не загрузились — пустой список. */
export const useSoftwareCategories = () => useCategoriesResource().data;
