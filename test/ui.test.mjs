// The web app in a real browser (Playwright): several sources in the edit dialog (D36), what an outdated page does (A124)
// and the layout of top bar and board on a monitor turned upright (A127).
// Skipped when Playwright is not installed (`npm i -D playwright` and `npx playwright install chromium` to run them).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { BASE, USER, api, freshProject, item } from "./helpers.mjs";

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch {}
const skip = chromium ? false : "Playwright is not installed";

const TWO = "https://github.com/IlianP/cotrack/pull/50\nhttps://github.com/IlianP/cotrack/pull/51";

describe("web app", { skip }, () => {
  let browser, p;
  before(async () => {
    browser = await chromium.launch();
    p = await freshProject("ui", { repo: "ilianp/cotrack" });
  });
  after(async () => { await browser?.close(); });

  // A signed-in page; serve() may replace the page itself (an outdated version), api() may rewrite API answers.
  // noAutoReload: as if the page had just reloaded itself (it does so at most once a minute), so it stays as it is.
  async function open(path, { serve, apiHeader, noAutoReload, locale = "de-DE", viewport = { width: 1000, height: 900 }, dense } = {}) {
    const ctx = await browser.newContext({ viewport, locale });
    await ctx.addInitScript((t) => { try { localStorage.setItem("cotrack.token", t); } catch {} }, USER);
    if (dense) await ctx.addInitScript(() => { try { localStorage.setItem("cotrack.dense", "1"); } catch {} });
    if (noAutoReload) await ctx.addInitScript(() => { try { sessionStorage.setItem("cotrack.reloadAt", String(Date.now())); } catch {} });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (serve) {
      await page.route((url) => url.pathname === "/", async (route) => {
        const res = await route.fetch();
        await route.fulfill({ response: res, body: serve(await res.text()) });
      });
    }
    if (apiHeader) {
      await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
        const res = await route.fetch();
        const v = apiHeader();
        await route.fulfill({ response: res, headers: { ...res.headers(), ...(v ? { "x-cotrack-ui": v } : {}) } });
      });
    }
    await page.goto(`${BASE}/?t=${Math.random()}#${path}`);
    return { page, ctx, errors };
  }
  const dialogSource = (page) => page.evaluate(() => document.querySelector("dialog[open] .src-input")?.value);

  it("shows two sources as two lines and keeps them on save", async () => {
    const ref = (await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "Zwei Quellen", source: TWO } })).body.item.ref;
    const { page, ctx, errors } = await open(`${p}/${ref}`);
    await page.waitForSelector("dialog[open] .src-input");
    assert.equal(await dialogSource(page), TWO, "the field shows each source on its own line");
    assert.equal(await page.locator("dialog[open] .src-open a").count(), 2, "a link per source above the field");
    await page.click("dialog[open] button.primary");
    await page.waitForTimeout(600);
    assert.equal((await item(p, ref)).source, TWO, "saving the dialog unchanged keeps both lines");
    // the card: two links
    await page.goto(`${BASE}/?t=${Math.random()}#${p}`);
    await page.waitForSelector("li.item");
    const links = await page.evaluate((r) => {
      const li = [...document.querySelectorAll("li.item")].find((x) => x.querySelector(".ref")?.textContent === r);
      return [...li.querySelectorAll(".meta .pill a")].map((a) => a.href);
    }, ref);
    assert.deepEqual(links, TWO.split("\n"));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  it("keeps each source on one line in a small font – no wrapping that makes the field tall", async () => {
    const ref = (await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "Lange Adressen", source: TWO } })).body.item.ref;
    const { page, ctx } = await open(`${p}/${ref}`);
    await page.waitForSelector("dialog[open] .src-input");
    await page.waitForTimeout(100);
    const m = await page.evaluate(() => {
      const t = document.querySelector("dialog[open] .src-input"), cs = getComputedStyle(t);
      const lines = (t.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight);
      return { lines: Math.round(lines), font: parseFloat(cs.fontSize), cut: t.scrollHeight > t.clientHeight + 1, value: t.value };
    });
    assert.equal(m.lines, 2, "two sources, two lines – long addresses do not wrap");
    assert.ok(m.font <= 13, `small font (${m.font}px)`);
    assert.equal(m.cut, false, "nothing cut off vertically");
    assert.equal(m.value, TWO);
    await ctx.close();
  });

  it("blocks saving a fourth source in the dialog", async () => {
    const ref = (await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "Vier", source: TWO } })).body.item.ref;
    const { page, ctx } = await open(`${p}/${ref}`);
    await page.waitForSelector("dialog[open] .src-input");
    await page.fill("dialog[open] .src-input", "a.md\nb.md\nc.md\nd.md");
    await page.click("dialog[open] button.primary");
    await page.waitForTimeout(400);
    assert.equal(await page.locator("dialog[open] .src-input").count(), 1, "the dialog stays open");
    assert.equal((await item(p, ref)).source, TWO);
    await ctx.close();
  });

  it("reloads by itself when a newer version is live and nothing is open", async () => {
    let fake = null; // the API starts naming another version once the page is up
    const { page, ctx } = await open(p, { apiHeader: () => fake });
    await page.waitForSelector("li.item");
    // the reload is allowed once a minute per tab – clear the mark a previous test may have left
    await page.evaluate(() => sessionStorage.removeItem("cotrack.reloadAt"));
    await page.evaluate(() => { window.__before = true; }); // gone only when a new document was loaded
    fake = "ffffffff";
    // the next poll (every 4 s) notices it
    await page.waitForFunction(() => !window.__before && document.readyState === "complete", null, { timeout: 15000 });
    await ctx.close();
  });

  it("does not reload while quick add holds a title without the focus, and does once it is empty", async () => {
    let fake = null;
    const { page, ctx } = await open(p, { apiHeader: () => fake });
    await page.waitForSelector("li.item");
    await page.evaluate(() => sessionStorage.removeItem("cotrack.reloadAt"));
    // a title typed into quick add, then the focus went elsewhere
    await page.evaluate(() => { const t = document.querySelector("#addTitle"); t.value = "Halb getippt"; t.blur(); window.__before = true; });
    fake = "ffffffff";
    await page.waitForFunction(() => /aktualisiert/.test(document.querySelector("#toast")?.textContent || ""), null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => window.__before && document.querySelector("#addTitle").value), "Halb getippt", "title kept, no reload");
    await page.evaluate(() => { document.querySelector("#addTitle").value = ""; });
    await page.waitForFunction(() => !window.__before && document.readyState === "complete", null, { timeout: 15000 });
    await ctx.close();
  });

  it("an outdated page with an open dialog does not reload, and its save is refused", async () => {
    const ref = (await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "Veraltet", source: TWO } })).body.item.ref;
    // a page from an older version: same code, different version
    const { page, ctx } = await open(`${p}/${ref}`, { noAutoReload: true,
      serve: (html) => html.replace(/const UI_VERSION = "[0-9a-f]{8}"/, 'const UI_VERSION = "00000000"') });
    await page.waitForSelector("dialog[open] .src-input");
    await page.evaluate(() => { window.__before = true; });
    await page.fill("dialog[open] .src-input", "https://example.com/neu");
    await page.click("dialog[open] button.primary");
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.__before), true, "no reload while the dialog is open – the input stays");
    assert.equal(await page.locator("dialog[open] .src-input").count(), 1);
    const toast = await page.textContent("#toast");
    assert.match(toast, /nicht gespeichert/);
    assert.equal(await page.locator("#toast button").count(), 1, "the toast offers a reload");
    assert.equal((await item(p, ref)).source, TWO, "nothing was saved");
    await ctx.close();
  });

  // A monitor turned upright (the user's: 1193 × 1770), German labels and two-digit counts.
  describe("portrait monitor", () => {
    const UPRIGHT = { width: 1193, height: 1770 };
    let lp;
    before(async () => {
      lp = await freshProject("ui-layout");
      for (const [kind, n] of [["D", 12], ["A", 14], ["I", 12], ["W", 7]]) {
        for (let i = 1; i <= n; i++) await api(`/projects/${lp}/items`, { method: "POST", body: { kind, title: `${kind} Punkt ${i}` } });
      }
    });
    const topBar = (page) => page.evaluate(() => ({
      inTop: document.querySelector("#bar").parentElement === document.querySelector(".top"),
      menuRight: document.querySelector("#menuBtn").getBoundingClientRect().right,
      width: innerWidth, pageWidth: document.documentElement.scrollWidth,
    }));

    it("fits the filter bar into the top bar in one row, with ☰ on screen", async () => {
      const { page, ctx, errors } = await open(lp, { viewport: UPRIGHT });
      await page.waitForSelector("#kindChips .tg");
      let t = await topBar(page);
      assert.equal(t.inTop, true, "one row: the filter bar sits in the top bar (a little tighter)");
      assert.ok(t.menuRight <= t.width, `☰ ends at ${t.menuRight}px in a ${t.width}px window`);
      assert.equal(t.pageWidth, t.width, "no sideways scrolling");
      // the open search needs more room: the bar goes into its own row instead of pushing ☰ out
      await page.click("#searchBtn");
      t = await topBar(page);
      assert.ok(t.menuRight <= t.width, `with the search open ☰ ends at ${t.menuRight}px`);
      assert.equal(await page.evaluate(() => document.activeElement?.id), "search", "the field keeps the cursor");
      await page.keyboard.type("Punkt");
      await page.waitForTimeout(400);
      assert.equal(await page.inputValue("#search"), "Punkt");
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    it("keeps the filter bar in its own row when even the tighter top bar is too narrow", async () => {
      const { page, ctx } = await open(lp, { viewport: { width: 1100, height: 1700 } });
      await page.waitForSelector("#kindChips .tg");
      const t = await topBar(page);
      assert.equal(t.inTop, false);
      assert.ok(t.menuRight <= t.width);
      await ctx.close();
    });

    it("compact board: a category sharing a column ends after its items, no empty box above the next one", async () => {
      const { page, ctx } = await open(lp, { viewport: UPRIGHT, dense: true });
      await page.waitForSelector("#board.fit .fitcol section.col li.item");
      const boxes = await page.evaluate(() => [...document.querySelectorAll("#board .fitcol")]
        .filter((col) => col.children.length > 1)
        .flatMap((col) => [...col.children].map((s) => {
          // where its content ends: the last item plus the list's padding (the list itself may be stretched)
          const ul = s.querySelector(".items"), last = ul.lastElementChild;
          return { kind: s.dataset.kind, bottom: s.getBoundingClientRect().bottom,
            content: last.getBoundingClientRect().bottom + parseFloat(getComputedStyle(ul).paddingBottom) };
        })));
      assert.ok(boxes.length >= 2, "at least one column holds two categories");
      for (const b of boxes) assert.ok(b.bottom <= b.content + 4, `${b.kind}: box ends at ${b.bottom}px, its items at ${b.content}px`);
      await ctx.close();
    });
  });
});
