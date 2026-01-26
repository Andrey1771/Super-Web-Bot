import DOMPurify from "dompurify";
import { marked } from "marked";

export const renderMarkdown = (markdown: string): string => {
  const raw = marked.parse(markdown ?? "");
  return DOMPurify.sanitize(raw);
};
