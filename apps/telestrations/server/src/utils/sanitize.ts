/**
 * Escape HTML entities in user-provided text.
 * Prevents XSS when text is rendered in the browser.
 * This is server-side defense-in-depth; the client should also escape on render.
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
