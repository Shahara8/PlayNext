// Browser-side halves of the accessibility checks (scripts/smoke.ts). Each is
// a JS expression evaluated in the page; it only measures and reports raw
// computed styles, and scripts/a11y-lib.ts (unit-tested) judges them.
// Shared helpers are defined inside each expression, since every
// Runtime.evaluate runs on its own.

const HELPERS = `
  const visible = (el) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    // .sr-only and similar: clipped to nothing.
    for (let n = el; n && n !== document.body; n = n.parentElement)
      if (getComputedStyle(n).clipPath === 'inset(50%)') return false;
    return true;
  };
  const label = (el, text) => {
    const tag = el.tagName.toLowerCase();
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/)[0] : '';
    const words = (text ?? el.getAttribute('aria-label') ?? el.textContent ?? '')
      .replace(/\\s+/g, ' ').trim().slice(0, 40);
    return tag + cls + (words ? ' "' + words + '"' : '');
  };
  // Background layers from el up, nearest first; stops at the first opaque one.
  // Null when an image or gradient sits behind (can't be judged from colors).
  const backgrounds = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') return null;
      const c = cs.backgroundColor;
      layers.push(c);
      if (/^rgb\\(/.test(c) || /,\\s*1\\)$/.test(c)) break;
    }
    return layers;
  };
  const opacity = (el) => {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  };
`;

/**
 * Every visible piece of text, plus form controls' own text and
 * placeholders, with the colors behind it. Disabled controls are left out
 * (WCAG exempts them), and so is text over an image (the poster titles).
 */
export const textSamplesProbe = `(() => {
  ${HELPERS}
  const samples = [];
  const add = (el, text, color) => {
    const bgs = backgrounds(el);
    if (!bgs) return;
    const cs = getComputedStyle(el);
    samples.push({
      label: label(el, text),
      color: color ?? cs.color,
      backgrounds: bgs,
      fontSizePx: parseFloat(cs.fontSize),
      fontWeight: parseInt(cs.fontWeight, 10),
      opacity: opacity(el),
    });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || seen.has(el) || !t.textContent.trim()) continue;
    if (el.closest('script, style, noscript, option, title, svg')) continue;
    if (el.closest(':disabled')) continue;
    if (!visible(el)) continue;
    seen.add(el);
    add(el, t.textContent);
  }
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (el.disabled || !visible(el)) continue;
    if (el.value) add(el, el.tagName === 'SELECT' ? el.selectedOptions[0]?.text : el.value);
    if (el.placeholder) add(el, el.placeholder, getComputedStyle(el, '::placeholder').color);
  }
  return samples;
})()`;

/**
 * Every visible interactive element's size. A ::before/::after placed with
 * position:absolute counts as the hit area when it's bigger (the title
 * cards' 36 px icon buttons have a 44 px one). Links inside a sentence are
 * marked inline.
 */
export const tapTargetsProbe = `(() => {
  ${HELPERS}
  const sel = 'a[href], button, select, input:not([type=hidden]), textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])';
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    let width = r.width, height = r.height;
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === 'none' || ps.position !== 'absolute') continue;
      const px = (v) => (v.endsWith('px') ? parseFloat(v) : NaN);
      const [t, rt, b, l] = [ps.top, ps.right, ps.bottom, ps.left].map(px);
      if ([t, rt, b, l].some(Number.isNaN)) continue;
      width = Math.max(width, r.width - l - rt);
      height = Math.max(height, r.height - t - b);
    }
    // In a sentence: an inline-level link (inline, inline-block,
    // inline-flex) with bare text beside it ("Title data from TMDB",
    // "…, or browse by service."). Links among other elements only (a nav)
    // aren't in a sentence.
    let inline = false;
    if (el.tagName === 'A' && getComputedStyle(el).display.startsWith('inline')) {
      inline = [...(el.parentElement?.childNodes ?? [])].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
      );
    }
    out.push({ label: label(el), width, height, inline });
  }
  return out;
})()`;

/**
 * The focused element after a Tab: its outline, the colors behind the ring
 * (its parent's, since the ring is drawn outside it), whether an overflow
 * container cuts the ring off, and its box in page coordinates (for a
 * screenshot). Null when focus is on the body or left the page.
 */
export const focusSampleProbe = `(() => {
  ${HELPERS}
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const reach = parseFloat(cs.outlineWidth) + Math.max(0, parseFloat(cs.outlineOffset) || 0);
  let clipped = false;
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const ns = getComputedStyle(n);
    if (ns.overflowX === 'visible' && ns.overflowY === 'visible') continue;
    const c = n.getBoundingClientRect();
    // Only the axes that clip; a scroller's own scroll range doesn't count,
    // only its visible box, minus a pixel of rounding.
    const clipsX = ns.overflowX !== 'visible';
    const clipsY = ns.overflowY !== 'visible';
    if ((clipsY && (r.top - reach < c.top - 1 || r.bottom + reach > c.bottom + 1)) ||
        (clipsX && (r.left - reach < c.left - 1 || r.right + reach > c.right + 1))) {
      clipped = true;
      break;
    }
  }
  return {
    label: label(el),
    focusVisible: el.matches(':focus-visible'),
    outlineStyle: cs.outlineStyle,
    outlineWidthPx: parseFloat(cs.outlineWidth) || 0,
    outlineColor: cs.outlineColor,
    backgrounds: backgrounds(el.parentElement ?? el) ?? ['rgb(255, 255, 255)'],
    clipped,
    box: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
  };
})()`;
