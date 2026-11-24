// The web app in a real browser (Playwright): several sources in the edit dialog (D36), what an outdated page does (A124),
// the item history after a change was set back or undone (D22, D33), the layout of top bar and board on a monitor turned upright (A127) and on a tablet (A134–A136).
// Skipped when Playwright is not installed (`npm i -D playwright` and `npx playwright install chromium` to run them).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { BASE, USER, AI, api, freshProject, item, events } from "./helpers.mjs";

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
  // storage: further localStorage entries for this device (density, footer bar, …).
  async function open(path, { serve, apiHeader, noAutoReload, locale = "de-DE", viewport = { width: 1000, height: 900 }, dense, storage } = {}) {
    const ctx = await browser.newContext({ viewport, locale });
    await ctx.addInitScript((t) => { try { localStorage.setItem("cotrack.token", t); } catch {} }, USER);
    if (dense) await ctx.addInitScript(() => { try { localStorage.setItem("cotrack.dense", "1"); } catch {} });
    if (storage) await ctx.addInitScript((s) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } catch {} }, storage);
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

  // The rows of the item history in the open edit dialog (D22), newest first.
  async function histRows(page) {
    await page.click("dialog[open] .ihist summary");
    await page.waitForSelector("dialog[open] .ihist-tab");
    return page.$$eval("dialog[open] .ihist-tab td.a", (tds) => tds.map((td) => td.textContent));
  }
  const byAi = async (body) => (await api(`/projects/${p}/items`, { method: "POST", token: AI, body: { kind: "A", owner: "user", ...body } })).body.item.ref;
  const patch = (ref, body) => api(`/projects/${p}/items/${ref}`, { method: "PATCH", body });

  it("history: what was set back within minutes leaves no row – done and reopened, a tick, a deletion", async () => {
    const ref = await byAi({ title: "Erledigt und zurück", body: "- [ ] eins" });
    await patch(ref, { status: "done" });
    await patch(ref, { status: "open" }); // by hand, as before undo noted itself (the reported case)
    await patch(ref, { check: "1" });
    await patch(ref, { uncheck: "1" });
    await api(`/projects/${p}/items/${ref}`, { method: "DELETE" });
    await api(`/projects/${p}/items/${ref}/restore`, { method: "POST" });
    const { page, ctx, errors } = await open(`${p}/${ref}`);
    await page.waitForSelector("dialog[open] .ihist");
    assert.deepEqual(await histRows(page), ["angelegt"]);
    assert.equal(await page.textContent("dialog[open] .ihist-toggle"), "Verlauf (1)");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  it("undo in the web app leaves no trace: no history row (even where the log lacks the value before), changed time as before", async () => {
    const ref = await byAi({ title: "Rückgängig", body: "Alt" }); // the creation event does not record the body
    const created = await item(p, ref);
    const { page, ctx, errors } = await open(`${p}/${ref}`);
    await page.waitForSelector("dialog[open] .ihist");
    await page.fill("dialog[open] textarea:not(.src-input)", "Neu");
    await page.click("dialog[open] button.primary");
    await page.waitForSelector("#toast.show button");
    await page.click("#toast button");
    await page.waitForFunction(() => /rückgängig gemacht/.test(document.querySelector("#toast")?.textContent || ""));
    assert.equal((await item(p, ref)).body, "Alt");
    assert.equal((await events(p, ref))[0].data.undo, true, "the undo notes itself on the event");
    const after = await item(p, ref);
    assert.deepEqual([after.updated_at, after.updated_by], [created.updated_at, "ai"], "changed time and author as before");
    await page.goto(`${BASE}/?t=${Math.random()}#${p}/${ref}`);
    await page.waitForSelector("dialog[open] .ihist");
    assert.deepEqual(await histRows(page), ["angelegt"]);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  it("history: what changed in the end stays named – the latest status, a field set back whose old value is unknown", async () => {
    const ref = await byAi({ title: "Bleibt", body: "Alt" });
    await patch(ref, { status: "done" });
    await patch(ref, { status: "open" });
    await patch(ref, { status: "doing" });
    await patch(ref, { body: "Neu" });
    await patch(ref, { body: "Alt" }); // by hand: the log cannot tell it is the old text, so it stays named
    const { page, ctx } = await open(`${p}/${ref}`);
    await page.waitForSelector("dialog[open] .ihist");
    assert.deepEqual(await histRows(page), ["Status: in Arbeit, Beschreibung", "angelegt"]);
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

  // A tablet: the user's Redmi Pad 2 Pro, about 1280 × 800 CSS px, minus the browser's bars – long titles, a long category.
  describe("tablet", () => {
    const LAND = { width: 1280, height: 720 }, PORT = { width: 800, height: 1200 };
    const LONG = "Impressum und Datenschutzerklärung an die neue Adresse anpassen";
    let tp;
    before(async () => {
      tp = await freshProject("ui-tablet");
      for (const [kind, n] of [["D", 3], ["A", 30], ["I", 4], ["W", 2]]) {
        for (let i = 1; i <= n; i++) await api(`/projects/${tp}/items`, { method: "POST", body: { kind, title: `${LONG} ${i}` } });
      }
    });
    const board = (page) => page.evaluate(() => {
      const cols = [...document.querySelectorAll("#board section.col")], a = document.querySelector('#board section.col[data-kind="A"] .items');
      return { layout: document.querySelector("#board").className, page: document.documentElement.scrollHeight - innerHeight,
        lefts: new Set(cols.map((s) => Math.round(s.getBoundingClientRect().left))).size, scrolls: a.scrollHeight > a.clientHeight + 1 };
    });

    it("landscape: every category scrolls on its own, the others stay in view (A136)", async () => {
      const { page, ctx, errors } = await open(tp, { viewport: LAND });
      await page.waitForSelector("#board section.col li.item");
      const b = await board(page);
      assert.match(b.layout, /\bfit\b/);
      assert.equal(b.lefts, 4, "four categories side by side");
      assert.ok(b.page <= 0, `the page itself does not scroll (${b.page}px)`);
      assert.ok(b.scrolls, "the long category scrolls inside its column");
      const top = () => page.evaluate(() => document.querySelector('#board section.col[data-kind="D"]').getBoundingClientRect().top);
      const before = await top();
      await page.mouse.move(400, 500); // over the second column (A)
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(300);
      assert.ok(await page.evaluate(() => document.querySelector('#board section.col[data-kind="A"] .items').scrollTop) > 0, "A scrolled");
      assert.equal(await top(), before, "D did not move");
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    it("portrait: two columns that scroll on their own; a phone held sideways keeps the scrolling page", async () => {
      let { page, ctx } = await open(tp, { viewport: PORT });
      await page.waitForSelector("#board section.col li.item");
      let b = await board(page);
      assert.match(b.layout, /\bfit\b/);
      assert.equal(b.lefts, 2);
      await ctx.close();
      ({ page, ctx } = await open(tp, { viewport: { width: 844, height: 390 } }));
      await page.waitForSelector("#board section.col li.item");
      b = await board(page);
      assert.match(b.layout, /\bpage\b/, "too low for columns that scroll");
      await ctx.close();
    });

    it("density: one button steps through cards → whole title → one line and remembers it (A135)", async () => {
      const { page, ctx, errors } = await open(tp, { viewport: LAND });
      await page.waitForSelector("#board li.item");
      const look = () => page.evaluate(() => {
        const li = document.querySelector('#board section.col[data-kind="A"] li.item'), t = li.querySelector(".title");
        const r = li.getBoundingClientRect(), last = [...t.getClientRects()].pop();
        return { cls: li.className, saved: localStorage.getItem("cotrack.dense"), label: document.querySelector("#denseBtn").getAttribute("aria-label"),
          desc: !!li.querySelector(".desc, .meta"), cut: getComputedStyle(t).whiteSpace === "nowrap" && t.scrollWidth > t.clientWidth + 1,
          lines: t.getClientRects().length, inside: last.bottom <= r.bottom && last.right <= r.right };
      });
      let s = await look();
      assert.ok(!/\bdense\b/.test(s.cls), "starts with cards");
      assert.match(s.label, /Karten.*Kompakt, ganzer Titel/);
      await page.click("#denseBtn");
      s = await look();
      assert.match(s.cls, /\bdense\b.*\bwrap\b/);
      assert.equal(s.saved, "wrap");
      assert.equal(s.desc, false, "no description, no pills");
      assert.equal(s.cut, false, "the title is not cut");
      assert.ok(s.lines >= 2 && s.inside, `the whole title over ${s.lines} lines inside the item`);
      await page.click("#denseBtn");
      s = await look();
      assert.match(s.cls, /\bdense\b/);
      assert.ok(!/\bwrap\b/.test(s.cls));
      assert.equal(s.saved, "1", "one line – stored as before, so older pages and this one agree");
      assert.equal(s.cut, true, "one line: the long title is cut");
      await page.reload();
      await page.waitForSelector("#board li.item.dense");
      await page.click("#denseBtn");
      s = await look();
      assert.ok(!/\bdense\b/.test(s.cls), "back to cards");
      assert.equal(s.saved, null);
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    it("one line: a title that does not fit shows its short label, one that fits stays (A138)", async () => {
      // four categories, so the columns are narrow on the tablet and wide on a large screen
      const sp = await freshProject("ui-short"), MID = "Impressum und Datenschutz anpassen";
      await api(`/projects/${sp}/items`, { method: "POST", body: { kind: "A", title: MID, short: "Impressum" } });
      await api(`/projects/${sp}/items`, { method: "POST", body: { kind: "A", title: `${MID} ohne Kurzlabel` } });
      await api(`/projects/${sp}/items`, { method: "POST", body: { kind: "A", title: "Kurz genug", short: "Anderes Label" } });
      for (const kind of ["D", "I", "W"]) await api(`/projects/${sp}/items`, { method: "POST", body: { kind, title: "Noch einer" } });
      const titles = (page) => page.evaluate(() => [...document.querySelectorAll('#board section.col[data-kind="A"] li.item')]
        .map((li) => ({ text: li.querySelector(".title").textContent, tip: li.title })));
      const { page, ctx, errors } = await open(sp, { viewport: LAND, storage: { "cotrack.dense": "1" } });
      await page.waitForSelector("#board li.item.dense");
      let t = await titles(page);
      assert.deepEqual(t.map((x) => x.text), ["Impressum", `${MID} ohne Kurzlabel`, "Kurz genug"]);
      assert.equal(t[0].tip, MID, "the tooltip keeps the whole title");
      // wide enough for the title: it comes back
      await page.setViewportSize({ width: 2400, height: 900 });
      await page.waitForTimeout(400);
      t = await titles(page);
      assert.equal(t[0].text, MID);
      // the other compact step shows the whole title anyway
      await page.setViewportSize(LAND);
      await page.click("#denseBtn"); // line → cards
      await page.click("#denseBtn"); // → whole title
      await page.waitForSelector("#board li.item.wrap");
      t = await titles(page);
      assert.equal(t[0].text, MID);
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    it("footer bar: off by default, ☰ turns it on for this device, its references open the item (A134)", async () => {
      const { page, ctx, errors } = await open(tp, { viewport: LAND });
      await page.waitForSelector("#board li.item");
      assert.equal(await page.isVisible(".footline"), false, "no bar by default");
      const fill = () => page.evaluate(() => innerHeight - document.querySelector("#board").getBoundingClientRect().bottom);
      const free = await fill();
      await page.click("#menuBtn");
      await page.click("dialog[open] button:text-is('Je Gruppe')");
      await page.waitForSelector(".footline.multi #footerText .reflink");
      assert.equal(await page.evaluate(() => localStorage.getItem("cotrack.boardFooter")), "multi");
      assert.equal(await page.evaluate(() => document.querySelector("#footerText").textContent.split("\n").length), 3, "one line per group: 👤, 💡, ⚠️");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const foot = await page.evaluate(() => document.querySelector(".footline").offsetHeight);
      assert.ok(Math.abs(await fill() - free - foot) <= 2, "the board ends above the bar");
      const ref = await page.textContent("#footerText .reflink");
      await page.click("#footerText .reflink");
      await page.waitForSelector("dialog[open] input");
      assert.equal(await page.inputValue("dialog[open] input"), (await item(tp, ref)).title, `the bar's ${ref} opens ${ref}`);
      await page.keyboard.press("Escape");
      await page.reload();
      await page.waitForSelector(".footline.multi #footerText .reflink");
      await page.click("#menuBtn");
      await page.click("dialog[open] button:text-is('Aus')");
      await page.waitForTimeout(200);
      assert.equal(await page.isVisible(".footline"), false);
      assert.equal(await page.evaluate(() => localStorage.getItem("cotrack.boardFooter")), null);
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    it("footer bar: references of categories with longer codes open too, other words stay text", async () => {
      // categories are instance-wide: one of its own, retired again at the end (it then shows only where it holds items)
      const kind = { code: "TBUG", name: "Fehler", actionable: true, sort_order: 90 };
      assert.equal((await api("/kinds", { method: "POST", body: kind })).status, 200);
      try {
        const fp = await freshProject("ui-footer");
        await api(`/projects/${fp}/items`, { method: "POST", body: { kind: "TBUG", title: "Absturz beim Speichern", short: "Absturz" } });
        await api(`/projects/${fp}/items`, { method: "POST", body: { kind: "W", title: "Export veraltet", short: "HTML5 Export" } });
        const { page, ctx } = await open(fp, { viewport: LAND, storage: { "cotrack.boardFooter": "single" } });
        await page.waitForSelector("#footerText .reflink");
        const links = await page.evaluate(() => [...document.querySelectorAll("#footerText .reflink")].map((b) => b.textContent));
        assert.deepEqual(links, ["TBUG1", "W1"], "TBUG1 is a link, HTML5 is not");
        await page.click("#footerText .reflink");
        await page.waitForSelector("dialog[open] input");
        assert.equal(await page.inputValue("dialog[open] input"), "Absturz beim Speichern");
        await ctx.close();
      } finally {
        await api("/kinds", { method: "POST", body: { ...kind, active: false } });
      }
    });
  });
});
