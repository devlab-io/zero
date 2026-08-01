export function normalizeComposerLink(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return `mailto:${input}`;
  if (/^(https?:|mailto:|tel:)/i.test(input)) return input;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(input)) return `https://${input}`;

  return null;
}
