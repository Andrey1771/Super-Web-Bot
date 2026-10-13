import DOMPurify from "dompurify";

// The assistant may use light Markdown (bold, links, short lists). We render a safe subset —
// no raw HTML from the model is ever trusted; everything is escaped first, then a whitelist of
// inline formatting is re-applied, then sanitized with DOMPurify as a second line of defense.

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const inlineFormat = (line: string): string =>
  line
    // links: [text](http/https url) — restricted to safe protocols
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
      (_m, label, href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
    )
    // bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // italic (single * not part of **)
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    // inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>");

export const renderMarkdown = (raw: string): string => {
  const escaped = escapeHtml(raw ?? "");
  const lines = escaped.split(/\r?\n/);

  const html: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(trimmed);
    if (bulletMatch) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inlineFormat(bulletMatch[1])}</li>`);
      continue;
    }

    closeList();
    if (trimmed.length === 0) {
      html.push("<br/>");
    } else {
      html.push(`<p>${inlineFormat(trimmed)}</p>`);
    }
  }
  closeList();

  return DOMPurify.sanitize(html.join(""), {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "code", "ul", "li", "a"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
};
