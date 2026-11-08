// Readable-text floor (accessibility).
// The UI scales fluidly with the viewport, so on short screens (phone landscape) some text would shrink below
// what this audience can comfortably read. After layout and on every resize / DOM change, raise any visible
// text element rendered below the floor to the floor: 18px for text, 16px for letters inside key/controller
// badges (both multiplied by the text-size setting). Text already above the floor is untouched, so hierarchy stays.
const MIN_TEXT = 18;
const MIN_GLYPH = 16;
const ROOTS = ".overlay, .notebook, .notebook-backdrop, .bw, .loading, .rotate";
const MARK = "data-tf"; // elements we bumped (their inline font-size is ours to reset)

let scheduled = false;
let running = false;

function textScale(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ts"));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function apply() {
  scheduled = false;
  if (running) return;
  running = true;
  try {
    const ts = textScale();
    // 1) reset our previous bumps so we re-measure the natural size after a resize / setting change
    document.querySelectorAll<HTMLElement>(`[${MARK}]`).forEach((el) => { el.style.removeProperty("font-size"); el.removeAttribute(MARK); });
    // 2) find text-bearing elements under the UI roots
    const roots = document.querySelectorAll<HTMLElement>(ROOTS);
    const seen = new Set<HTMLElement>();
    roots.forEach((root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = w.nextNode())) {
        if (!n.textContent || !n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        if (el.closest(".sr-only, svg, canvas, [aria-hidden='true'] .sr-only")) continue;
        if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") continue; // not rendered
        const fs = parseFloat(getComputedStyle(el).fontSize);
        const floor = (el.closest("kbd, .glyph, .keycap") ? MIN_GLYPH : MIN_TEXT) * ts;
        if (fs + 0.25 < floor) { el.style.setProperty("font-size", `${floor}px`, "important"); el.setAttribute(MARK, ""); }
      }
    });
  } finally {
    running = false;
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  // wait a frame so layout (fluid units, brackets) has settled
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

export function startTextFloor() {
  if (typeof window === "undefined") return;
  schedule();
  window.addEventListener("resize", schedule);
  window.addEventListener("rc-device", schedule);
  window.addEventListener("orientationchange", schedule);
  // DOM changes (screens opening, new text) — ignore our own style/attribute writes
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList" && (r.addedNodes.length || r.removedNodes.length)) { schedule(); return; }
      if (r.type === "characterData") { schedule(); return; }
      if (r.type === "attributes" && r.attributeName === "class") { schedule(); return; }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  // settings (text size) live on <html> style / data attributes
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-size", "data-theme"] });
}
