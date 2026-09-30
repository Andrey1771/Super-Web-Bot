import { useEffect } from 'react';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { useSitePreferences, type LangCode } from '../../context/site-preferences';

export type PageMetaProps = {
    /** Заголовок вкладки и сниппета в выдаче. Суффикс магазина добавляется сам. */
    title: string;
    description?: string;
    /**
     * Канонический адрес страницы — путь от корня. Нужен там, где один и тот же товар
     * доступен по нескольким адресам: с фильтрами, со страницей, с utm-метками.
     */
    canonicalPath?: string;
    /**
     * Убрать страницу из выдачи. Ставится на отфильтрованные и постраничные виды каталога:
     * это те же товары в другом порядке, и в индексе они конкурируют сами с собой.
     */
    noIndex?: boolean;
    /** Картинка для превью в соцсетях и мессенджерах. */
    imageUrl?: string;
    /** Тип страницы для Open Graph: витрина — website, карточка товара — product. */
    ogType?: 'website' | 'product' | 'article';
    /** Разметка Schema.org. Объект сериализуется в JSON-LD. */
    structuredData?: Record<string, unknown> | null;
};

const SITE_NAME = 'Tale Shop';

/** Атрибут, которым помечаются созданные нами теги: чужие (из index.html) не трогаем. */
const OWNED_ATTRIBUTE = 'data-page-meta';

/** Локали Open Graph для языков сайта. */
const OG_LOCALES: Record<LangCode, string> = { en: 'en_US', ru: 'ru_RU', uk: 'uk_UA', pl: 'pl_PL' };

/**
 * Адрес языковой версии страницы. Язык — параметр `?lang=`, а не префикс пути: маршруты и все
 * ссылки витрины остаются прежними, а поисковику хватает отдельного адреса на каждый язык.
 * Английская версия живёт по «голому» адресу — она же x-default.
 */
export const languageHref = (path: string, lang: LangCode): string =>
    lang === 'en' ? path : `${path}${path.includes('?') ? '&' : '?'}lang=${lang}`;

/** Путь текущей страницы без параметра языка — основа для hreflang и канонического адреса. */
const currentPathWithoutLang = (): string => {
    const params = new URLSearchParams(window.location.search);
    params.delete('lang');
    const search = params.toString();
    return `${window.location.pathname}${search ? `?${search}` : ''}`;
};

const upsertTag = (selector: string, create: () => HTMLElement): HTMLElement => {
    let element = document.head.querySelector<HTMLElement>(selector);
    if (!element) {
        element = create();
        element.setAttribute(OWNED_ATTRIBUTE, 'true');
        document.head.appendChild(element);
    }
    return element;
};

const setMeta = (attribute: 'name' | 'property', key: string, content: string) => {
    const element = upsertTag(`meta[${attribute}="${key}"]`, () => {
        const meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        return meta;
    });
    element.setAttribute('content', content);
};

const removeOwned = (selector: string) => {
    document.head.querySelector(`${selector}[${OWNED_ATTRIBUTE}]`)?.remove();
};

const removeAllOwned = (selector: string) => {
    document.head.querySelectorAll(`${selector}[${OWNED_ATTRIBUTE}]`).forEach((element) => element.remove());
};

/** Страница — на языке сайта: ставим языковые альтернативы (hreflang) и локаль Open Graph. */
const setLanguageTags = (basePath: string, lang: LangCode) => {
    const origin = window.location.origin;

    removeAllOwned('link[rel="alternate"][hreflang]');
    const addAlternate = (hreflang: string, href: string) => {
        const link = document.createElement('link');
        link.setAttribute('rel', 'alternate');
        link.setAttribute('hreflang', hreflang);
        link.setAttribute('href', href);
        link.setAttribute(OWNED_ATTRIBUTE, 'true');
        document.head.appendChild(link);
    };
    for (const code of SUPPORTED_LANGUAGES) {
        addAlternate(code, `${origin}${languageHref(basePath, code)}`);
    }
    addAlternate('x-default', `${origin}${basePath}`);

    setMeta('property', 'og:locale', OG_LOCALES[lang]);
    removeAllOwned('meta[property="og:locale:alternate"]');
    for (const code of SUPPORTED_LANGUAGES) {
        if (code === lang) continue;
        const meta = document.createElement('meta');
        meta.setAttribute('property', 'og:locale:alternate');
        meta.setAttribute('content', OG_LOCALES[code]);
        meta.setAttribute(OWNED_ATTRIBUTE, 'true');
        document.head.appendChild(meta);
    }
};

/**
 * Заголовок, описание и служебные теги страницы.
 *
 * Приложение рисуется в браузере, поэтому теги проставляются после загрузки — поисковые
 * роботы это выполняют, но раньше их не было вовсе: все страницы делили один заголовок
 * «Tale Shop» и одно описание из index.html, то есть в выдаче выглядели одинаково.
 *
 * Язык страницы попадает в канонический адрес (`?lang=`), в hreflang-альтернативы, в локаль
 * Open Graph и в разметку Schema.org (inLanguage) — так каждая языковая версия индексируется
 * отдельно, а не как дубликат английской.
 *
 * Ничего не рисует — только правит <head>.
 */
const PageMeta: React.FC<PageMetaProps> = ({
    title,
    description,
    canonicalPath,
    noIndex = false,
    imageUrl,
    ogType = 'website',
    structuredData = null
}) => {
    const { lang } = useSitePreferences();

    useEffect(() => {
        const fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
        document.title = fullTitle;

        setMeta('property', 'og:title', fullTitle);
        setMeta('property', 'og:type', ogType);
        setMeta('property', 'og:site_name', SITE_NAME);
        setMeta('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');

        if (description) {
            setMeta('name', 'description', description);
            setMeta('property', 'og:description', description);
        }

        if (imageUrl) {
            setMeta('property', 'og:image', imageUrl);
        } else {
            removeOwned('meta[property="og:image"]');
        }

        // Основа адреса: канонический путь страницы, а без него — текущий адрес без параметра языка.
        const basePath = canonicalPath ?? currentPathWithoutLang();
        setLanguageTags(basePath, lang);

        if (canonicalPath) {
            // У неанглийской версии свой канонический адрес: иначе поисковик считал бы её дубликатом английской.
            const absolute = `${window.location.origin}${languageHref(canonicalPath, lang)}`;
            const link = upsertTag('link[rel="canonical"]', () => {
                const element = document.createElement('link');
                element.setAttribute('rel', 'canonical');
                return element;
            });
            link.setAttribute('href', absolute);
            setMeta('property', 'og:url', absolute);
        }

        if (noIndex) {
            // follow оставляем: страница в индекс не нужна, но ссылки с неё на товары — нужны.
            setMeta('name', 'robots', 'noindex, follow');
        } else {
            removeOwned('meta[name="robots"]');
        }

        if (structuredData) {
            // Язык разметки — у всего, кроме Product: у товара по Schema.org такого свойства нет.
            const withLanguage =
                structuredData['@type'] !== 'Product' && !('inLanguage' in structuredData)
                    ? { ...structuredData, inLanguage: lang }
                    : structuredData;
            const script = upsertTag('script[type="application/ld+json"]', () => {
                const element = document.createElement('script');
                element.setAttribute('type', 'application/ld+json');
                return element;
            });
            script.textContent = JSON.stringify(withLanguage);
        } else {
            removeOwned('script[type="application/ld+json"]');
        }
    }, [title, description, canonicalPath, noIndex, imageUrl, ogType, structuredData, lang]);

    useEffect(
        // Уходя со страницы, убираем за собой: иначе разметка товара осталась бы висеть
        // на следующей странице и описывала бы уже не то, что на ней показано.
        () => () => {
            // Заголовок следующей страницы без своих мета-тегов не должен остаться от предыдущей.
            document.title = SITE_NAME;
            removeOwned('script[type="application/ld+json"]');
            removeOwned('meta[name="robots"]');
            // Канонический адрес и языковые альтернативы — тоже про эту страницу, а не про следующую.
            removeOwned('link[rel="canonical"]');
            removeOwned('meta[property="og:url"]');
            removeAllOwned('link[rel="alternate"][hreflang]');
        },
        []
    );

    return null;
};

export default PageMeta;
