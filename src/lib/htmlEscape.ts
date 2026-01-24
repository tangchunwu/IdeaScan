// HTML Escape Utility
// Prevents XSS attacks by escaping special HTML characters in user-controlled content

const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes HTML special characters to prevent XSS attacks
 * Use this for any user-controlled content that will be embedded in HTML
 */
export function escapeHtml(text: string | null | undefined): string {
  if (text == null) return '';
  return String(text).replace(/[&<>"']/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Escapes an array of strings for HTML embedding
 */
export function escapeHtmlArray(items: string[] | null | undefined): string[] {
  if (!items) return [];
  return items.map(escapeHtml);
}
