/**
 * Shared DOM helpers for the rules.
 *
 * These run inside the page, so they may only use browser APIs and must not
 * reach for anything Node-specific.
 */

export function normalise(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Whether an element takes part in the accessibility tree.
 *
 * Deliberately cheap and conservative: an element we wrongly treat as hidden is
 * simply not reported, whereas reporting a violation on something nobody can
 * reach wastes the developer's time and costs the tool its credibility.
 */
export function isVisible(element: Element): boolean {
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (element.hasAttribute('hidden')) return false;

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return true;

  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * An approximation of the accessible name, covering the cases these rules need.
 *
 * Not a full implementation of the accname specification — axe already does that
 * properly for the rules that depend on it. What matters here is the text a
 * reader would announce for links and buttons.
 */
export function accessibleText(element: Element): string {
  const label = element.getAttribute('aria-label');
  if (normalise(label)) return normalise(label);

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (normalise(text)) return normalise(text);
  }

  const own = normalise(element.textContent);
  if (own) return own;

  // An image-only link takes its name from the image's alternative.
  const image = element.querySelector('img[alt], [role="img"][aria-label]');
  if (image) {
    return normalise(image.getAttribute('alt') ?? image.getAttribute('aria-label'));
  }

  return normalise(element.getAttribute('title'));
}

/** Visible text of the page, capped so the work stays bounded on large documents. */
export function pageText(document: Document, limit = 20_000): string {
  const body = document.body;
  if (!body) return '';

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let length = 0;

  while (length < limit) {
    const node = walker.nextNode();
    if (!node) break;

    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest('script, style, noscript, template')) continue;
    if (!isVisible(parent)) continue;

    const text = normalise(node.textContent);
    if (!text) continue;

    parts.push(text);
    length += text.length;
  }

  return parts.join(' ');
}
