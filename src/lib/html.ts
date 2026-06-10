function escapeHtmlChar(char: string) {
  switch (char) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '"':
      return '&quot;';
    case '\'':
      return '&#39;';
    default:
      return char;
  }
}

export function sanitizeEmailHtml(html: string | null | undefined): string | null {
  if (typeof html !== 'string') return null;
  return html.replace(/[&<>"']/g, escapeHtmlChar);
}
