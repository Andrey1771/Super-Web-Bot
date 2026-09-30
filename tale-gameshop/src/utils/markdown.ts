import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Markdown → безопасный HTML. Используется и на витрине (описание игры), и в превью админки,
 * поэтому результат в обоих местах гарантированно совпадает.
 *
 * Санитизация оставляет вёрстку и вырезает исполняемое: теги разметки, инлайновые style и
 * атрибуты выравнивания проходят (админ может обтекать текст вокруг картинки), а <script>,
 * <iframe>, обработчики вроде onerror и ссылки javascript: удаляются.
 */
/**
 * Готовый HTML из админки (тело статьи в режиме HTML) — через тот же санитайзер, что и markdown.
 * Пишет его админ, но при угоне админского входа сырой HTML превращался бы в скрипт на витрине.
 */
export const sanitizeHtml = (html: string): string => DOMPurify.sanitize(html ?? "");

export const renderMarkdown = (markdown: string): string => {
  // marked.parse объявлен как string | Promise<string> — асинхронным он становится только
  // при async-расширениях, которых здесь нет. Приводим явно, иначе DOMPurify получает
  // несовместимый тип и падает проверка типов.
  const raw = marked.parse(markdown ?? "") as string;
  return DOMPurify.sanitize(raw);
};
