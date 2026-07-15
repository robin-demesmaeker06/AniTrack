// AniList descriptions arrive as HTML (§3). Everything passes through
// DOMPurify before rendering — never dangerouslySetInnerHTML raw content.
import DOMPurify from "dompurify";

const config = {
  ALLOWED_TAGS: ["b", "strong", "i", "em", "br", "p", "a", "ul", "ol", "li", "span"],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

export function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, config);
  // Force external links out of the SPA safely.
  return clean.replaceAll(
    "<a ",
    '<a target="_blank" rel="noopener noreferrer" ',
  );
}
