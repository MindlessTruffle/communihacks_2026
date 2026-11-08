// Overlay overlap checker.  Usage:  node tools/overlap-check.mjs [url]   (needs `playwright` resolvable, e.g. npx playwright install chromium)
// Drives: court(ask/reply/advisor) -> morning -> summary -> street -> budget -> market -> checkout at 5 sizes and reports
// visible overlay panels/buttons that intersect (excluding ancestor/descendant) or leave the viewport.
// The same `collect` function is what we paste into the Playwright MCP when playwright is not installed locally.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

export const SELECTOR = ".panel:not(.admin), .btn, .corner-btn, .thought, .stats, .phase-dots, .speech, .advisor-tip, .hint-pill, .item-pop, .list-pin, .wallet, .captions, .interact, .joystick, .item-tile, .toast";
export function collect(selector) {
  const W = innerWidth, H = innerHeight;
  // visible rect = element rect clipped by scrolling/hidden ancestors (scrolled-away tiles are not "visible")
  const vis = (e) => { let r = e.getBoundingClientRect(); r = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(o.overflowY + o.overflowX) && p.className !== "scroll") { const q = p.getBoundingClientRect();
      r.left = Math.max(r.left, q.left); r.top = Math.max(r.top, q.top); r.right = Math.min(r.right, q.right); r.bottom = Math.min(r.bottom, q.bottom); } }
    r.width = r.right - r.left; r.height = r.bottom - r.top; return r; };
  const els = [...document.querySelectorAll(selector)].filter((e) => {
    const cs = getComputedStyle(e); const r = vis(e);
    return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05 && r.width > 6 && r.height > 6 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H;
  });
  const tag = (e) => (e.className && typeof e.className === "string" ? "." + e.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : e.tagName) + (e.textContent ? `"${e.textContent.trim().slice(0, 14)}"` : "");
  const out = [];
  const scrollers = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p; } return null; };
  for (let i = 0; i < els.length; i++) {
    const a = els[i], ra = vis(a);
    if (ra.left < -2 || ra.top < -2 || ra.right > W + 2 || ra.bottom > H + 2) out.push(`OFFSCREEN ${tag(a)} [${[ra.left, ra.top, ra.right, ra.bottom].map(Math.round)}]`);
    for (let j = i + 1; j < els.length; j++) {
      const b = els[j]; if (a.contains(b) || b.contains(a)) continue;
      if (scrollers(a) && scrollers(a) === scrollers(b)) continue;
      const rb = vis(b);
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 3 && h > 3) out.push(`OVERLAP ${tag(a)} x ${tag(b)} (${Math.round(w)}x${Math.round(h)})`);
    }
  }
  return out;
}

async function main() {
const URL_ = process.argv[2] || "http://localhost:5201";
// sizes: argv[3] "WxH,WxH" or env SIZES; default set below. Also run at in-between sizes (e.g. 800x500,1100x650,1366x768,1600x900,2560x1080,3840x2160).
const SIZES = (process.argv[3] || process.env.SIZES || "667x375,1024x768,1280x720,1920x1080,2560x1440").split(",").map((s) => s.split("x").map(Number));
const admin = async (p, label) => { await p.evaluate(() => { for (let i = 0; i < 4; i++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" })); }); await p.waitForTimeout(250); await p.getByRole("button", { name: label }).click(); await p.waitForTimeout(250); await p.getByRole("button", { name: "Close" }).click(); };
const ready = (p) => p.waitForFunction(() => !document.querySelector(".loading"), null, { timeout: 40000 }).catch(() => {});

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let bad = 0;
for (const [W, H] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } }); await ctx.addInitScript(() => { try { localStorage.setItem("rc-intro-seen", "1"); } catch {} }); const p = await ctx.newPage(); p.setDefaultTimeout(150000);
  const report = async (name) => { await p.waitForTimeout(700); if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${W}x${H}-${name}.png`, timeout: 120000 }).catch(() => {}); const r = await p.evaluate(collect, SELECTOR); bad += r.length; console.log(`${W}x${H} ${name}: ${r.length ? "\n  " + r.join("\n  ") : "ok"}`); };
  await p.goto(URL_); await p.waitForTimeout(1800);
  await p.getByText("START").first().click(); await p.waitForTimeout(3000); await report("setup");
  await p.getByText("Begin").click(); await p.waitForTimeout(400);
  for (let i = 0; i < 6 && (await p.locator(".tap-hint").count()); i++) { await p.mouse.click(W / 2, H / 2); await p.waitForTimeout(250); }
  await report("morning");
  await p.getByText("Open the court").click(); await p.waitForTimeout(4500); await report("court-ask");
  await p.keyboard.press("y"); await p.waitForTimeout(1500); await report("court-reply");
  await p.keyboard.press("Space"); await p.waitForTimeout(1200); await report("court-advisor");
  await admin(p, "Skip court"); await p.waitForTimeout(800); await report("court-done");
  await p.getByText("See the day").click().catch(() => {}); await p.waitForTimeout(1000); await report("summary");
  await admin(p, "→ Evening street"); await ready(p); await p.waitForTimeout(1500); await report("street");
  await admin(p, "→ Budget/market"); await ready(p); await p.waitForTimeout(1200); await report("budget");
  await p.getByText("Enter the Night Market").click(); await p.waitForTimeout(5000); await report("market");
  await p.evaluate(async () => { const m = await import("/src/game/store.ts"); const s = m.useGame.getState(); for (const id of s.market?.list ?? []) s.addToBasket?.(id); s.checkout?.(); });
  await report("checkout");
  await p.context().close();
}
await browser.close();
console.log(bad ? `\n${bad} issue(s)` : "\nno overlaps");
process.exit(bad ? 1 : 0);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
