import { useEffect } from 'react';

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

/**
 * Заголовок, описание и служебные теги страницы.
 *
 * Приложение рисуется в браузере, поэтому теги проставляются после загрузки — поисковые
 * роботы это выполняют, но раньше их не было вовсе: все страницы делили один заголовок
 * «Tale Shop» и одно описание из index.html, то есть в выдаче выглядели одинаково.
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

        if (canonicalPath) {
            const absolute = `${window.location.origin}${canonicalPath}`;
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
            const script = upsertTag('script[type="application/ld+json"]', () => {
                const element = document.createElement('script');
                element.setAttribute('type', 'application/ld+json');
                return element;
            });
            script.textContent = JSON.stringify(structuredData);
        } else {
            removeOwned('script[type="application/ld+json"]');
        }
    }, [title, description, canonicalPath, noIndex, imageUrl, ogType, structuredData]);

    useEffect(
        // Уходя со страницы, убираем за собой: иначе разметка товара осталась бы висеть
        // на следующей странице и описывала бы уже не то, что на ней показано.
        () => () => {
            removeOwned('script[type="application/ld+json"]');
            removeOwned('meta[name="robots"]');
        },
        []
    );

    return null;
};

export default PageMeta;
