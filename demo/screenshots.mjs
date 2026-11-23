#!/usr/bin/env node
/**
 * The pictures in the README (docs/img/), taken from a local instance with the demo projects – invented data, never a
 * real instance:
 *
 *   node demo/screenshots.mjs        German and English
 *   node demo/screenshots.mjs en     only one language (de | en)
 *
 * Per language it starts `wrangler dev` on a fresh temporary D1 database (like npm test), seeds the demo projects (German:
 * demo/data.mjs, English: demo/data.en.mjs), takes the screenshots with Playwright and records the clip, which ffmpeg turns
 * into a GIF. Run it again after visible changes to the web app. Needs `npm install`, Playwright (`npm i -D playwright`,
 * `npx playwright install chromium`) and ffmpeg.
 *
 * Writes, per language (de | en):
 *   tour.<lang>.gif      the clip at the top of the README: board → the AI adds items → tick off → Next → Chains → Overview
 *   board.<lang>.png     Board         next.<lang>.png     Next          chains.<lang>.png   Chains
 *   overview.<lang>.png  Overview      phones.<lang>.png   on the phone, light and dark
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { seedSql } from "./data.mjs";
import { seedSqlEn } from "./data.en.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "docs", "img");
const wrangler = join(root, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
let chromium;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch {}
if (!existsSync(wrangler)) fail("wrangler is missing – run `npm install` first.");
if (!chromium) fail("Playwright is missing – `npm i -D playwright` and `npx playwright install chromium`.");
try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { fail("ffmpeg is missing (needed for the GIF)."); }

const USER = "shot-user-" + "u".repeat(32), AI = "shot-ai-" + "a".repeat(32);
const DESK = { width: 1280, height: 800 }, PHONE = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let rpc = 0; // MCP request ids

// What the clip says (one line under the app per step) and what the AI adds in it.
const TEXT = {
  de: {
    locale: "de-DE",
    steps: [
      ["Eine Liste pro Projekt", "Entscheidungen, Aufgaben, Ideen und Warnungen"],
      ["Deine KI schreibt mit", "per MCP – das Board zeigt es nach Sekunden"],
      ["Du auch", "abhaken, entscheiden, rückgängig machen"],
      ["Next", "ein Punkt nach dem anderen, nach Nutzen und Aufwand"],
      ["Ketten", "was wartet worauf"],
      ["Übersicht", "alle Projekte auf einen Blick"],
    ],
    warn: { title: "Cal.com-Gratistarif erlaubt nur eine Terminart", short: "Cal.com-Tarif",
      body: "Folge: Erstgespräch und Workshop-Anfrage lassen sich nicht getrennt buchen.\nGegenmaßnahme: Team-Tarif (12 €/Monat) oder zwei Links." },
  },
  en: {
    locale: "en-US",
    steps: [
      ["One list per project", "decisions, tasks, ideas and warnings"],
      ["Your AI writes along", "via MCP – the board shows it within seconds"],
      ["So do you", "tick off, decide, undo"],
      ["Next", "one item at a time, by benefit and effort"],
      ["Chains", "what waits for what"],
      ["Overview", "every project at a glance"],
    ],
    warn: { title: "Cal.com free plan allows only one booking type", short: "Cal.com plan",
      body: "Impact: first calls and workshop requests cannot be booked separately.\nCountermeasure: Teams plan (€12/month) or two links." },
  },
};

const langs = process.argv.slice(2).length ? process.argv.slice(2) : ["de", "en"];
for (const l of langs) if (!TEXT[l]) fail(`unknown language: ${l} (de | en)`);
mkdirSync(OUT, { recursive: true });
for (const lang of langs) await withInstance(lang, (base) => pictures(base, lang));

/* ------------------------------------------------------------ instance */
async function withInstance(lang, run) {
  const dir = mkdtempSync(join(tmpdir(), "cotrack-shots-"));
  const port = String(8900 + Math.floor(Math.random() * 90));
  const env = { ...process.env, CI: "1" };
  const w = (...args) => execFileSync(wrangler, args, { cwd: root, env, stdio: "pipe" });
  let server;
  try {
    w("d1", "migrations", "apply", "cotrack-db", "--local", "--persist-to", dir);
    w("d1", "execute", "cotrack-db", "--local", "--persist-to", dir, "--command", "CREATE TABLE demo_instance (note TEXT NOT NULL)");
    writeFileSync(join(dir, "seed.sql"), (lang === "en" ? seedSqlEn() : seedSql()).sql);
    w("d1", "execute", "cotrack-db", "--local", "--persist-to", dir, "--file", join(dir, "seed.sql"));
    server = spawn(wrangler, ["dev", "--local", "--port", port, "--persist-to", dir, "--var", `TOKEN_USER:${USER}`, "--var", `TOKEN_AI:${AI}`],
      { cwd: root, env, detached: true, stdio: "ignore" });
    const base = `http://localhost:${port}`;
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      try { ready = (await fetch(base + "/api/health")).ok; } catch {}
      if (!ready) await sleep(500);
    }
    if (!ready) throw new Error("the local worker did not start");
    // One language for the web app and the footer (☰ → Sprache / Language)
    await api(base, "/settings", { method: "PATCH", body: { language: lang } });
    await run(base);
  } finally {
    if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); } }
    await sleep(300);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function api(base, path, { method = "GET", body, token = USER } = {}) {
  const res = await fetch(base + "/api" + path, { method, body: body && JSON.stringify(body),
    headers: { authorization: "Bearer " + token, ...(body ? { "content-type": "application/json" } : {}) } });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function mcp(base, name, args) {
  const res = await fetch(base + "/mcp", { method: "POST",
    headers: { authorization: "Bearer " + AI, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } }) });
  const data = await res.json();
  if (data.result?.isError) throw new Error(`${name}: ${data.result.content[0].text}`);
}

/* ------------------------------------------------------------ pictures */
async function pictures(base, lang) {
  const browser = await chromium.launch();
  try {
    const t = TEXT[lang];
    const file = (name) => join(OUT, `${name}.${lang}.png`);
    await shot(browser, base, t, file("board"));
    await shot(browser, base, t, file("next"), { mode: "next" });
    await shot(browser, base, t, file("chains"), { mode: "deps", vp: { width: 1440, height: 900 }, setup: async (page) => {
      // the long chain of the website relaunch instead of the two short ones above it
      await page.evaluate(() => {
        const long = [...document.querySelectorAll(".dg-chain")].sort((a, b) => b.querySelectorAll(".dg-node").length - a.querySelectorAll(".dg-node").length)[0];
        if (long) window.scrollTo(0, long.getBoundingClientRect().top + window.scrollY - 70);
      });
    } });
    await shot(browser, base, t, file("overview"), { setup: async (page) => { await page.click("#homeBtn"); } });
    // phones: the board (light) and Next (dark), side by side
    const light = await shot(browser, base, t, null, { vp: PHONE, scale: 3 });
    const dark = await shot(browser, base, t, null, { vp: PHONE, scale: 3, mode: "next", theme: "dark" });
    await phones(browser, file("phones"), light, dark);
    for (const name of ["board", "next", "chains", "overview", "phones"]) smaller(file(name));
    await clip(browser, base, lang);
    console.log(`${lang}: docs/img/*.${lang}.*`);
  } finally {
    await browser.close();
  }
}

// A signed-in page of the website relaunch.
async function appContext(browser, t, { vp = DESK, scale = 2, mode = "board", theme = "light", cursor = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, locale: t.locale, colorScheme: theme });
  await ctx.addInitScript(({ token, mode, theme }) => {
    try {
      localStorage.setItem("cotrack.token", token);
      localStorage.setItem("cotrack.mode", mode);
      localStorage.setItem("cotrack.theme", theme);
      localStorage.setItem("cotrack.project", "website");
    } catch {}
  }, { token: USER, mode, theme });
  if (cursor) await ctx.addInitScript(addCursor);
  return ctx;
}

async function shot(browser, base, t, path, { vp, scale, mode, theme, setup } = {}) {
  const ctx = await appContext(browser, t, { vp, scale, mode, theme });
  const page = await ctx.newPage();
  await page.goto(base + "/#website");
  await ready(page);
  if (setup) { await setup(page); await sleep(900); }
  const png = await page.screenshot(path ? { path } : {});
  await ctx.close();
  return png;
}

async function ready(page) {
  await page.waitForSelector("li.item, .next .nx-card, .dg-chain, .next > *", { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(900);
}

// Two phone screenshots in simple frames, in the 16:10 of the other pictures (so they line up in the README's grid).
async function phones(browser, path, ...shots) {
  const ctx = await browser.newContext({ viewport: { width: DESK.width, height: DESK.height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const img = (png) => `<div class="ph"><img src="data:image/png;base64,${png.toString("base64")}"></div>`;
  await page.setContent(`<!doctype html><style>
    html, body { margin: 0; }
    .row { width: ${DESK.width}px; height: ${DESK.height}px; display: flex; gap: 64px; justify-content: center; align-items: center;
      background: linear-gradient(160deg, #dcebe7 0%, #f6f6f3 65%); }
    .ph { padding: 10px; border-radius: 46px; background: #1d1d1b; box-shadow: 0 16px 36px rgb(0 0 0 / .20), inset 0 0 0 2px #3a3a36; }
    .ph img { display: block; width: 330px; height: ${Math.round(330 * PHONE.height / PHONE.width)}px; border-radius: 37px; }
  </style><div class="row">${shots.map(img).join("")}</div>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path });
  await ctx.close();
}

/* ---------------------------------------------------------------- clip */
// The app in a frame with a caption line below it, recorded frame by frame (Chrome's screencast), then a GIF via ffmpeg.
async function clip(browser, base, lang) {
  const t = TEXT[lang];
  const CAP = 64;
  const ctx = await appContext(browser, t, { vp: { width: DESK.width, height: DESK.height + CAP }, scale: 1, cursor: true });
  const page = await ctx.newPage();
  // The frame page, served from the instance's own address (same origin, so the app keeps its token).
  await page.route(base + "/__tour", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html>
    <meta charset="utf-8"><style>
      html, body { margin: 0; background: #151918; overflow: hidden; }
      iframe { display: block; border: 0; width: ${DESK.width}px; height: ${DESK.height}px; background: #f6f6f3; }
      .cap { height: ${CAP}px; display: flex; align-items: center; justify-content: center; gap: 18px; color: #f1f1ec;
        font: 400 22px/1 Inter, "Segoe UI", system-ui, sans-serif; }
      .dots { display: flex; gap: 7px; } .dots i { width: 9px; height: 9px; border-radius: 50%; background: #3b4744; transition: background .3s; }
      .dots i.on { background: #2dd4bf; }
      #t { transition: opacity .25s; } #t b { font-weight: 650; color: #5eead4; margin-right: 10px; }
    </style>
    <iframe src="/#website"></iframe>
    <div class="cap"><span class="dots">${t.steps.map(() => "<i></i>").join("")}</span><span id="t"></span></div>` }));
  // The app forbids framing (frame-ancestors 'none') – allow its own origin, for this recording only.
  await page.route((url) => url.href.startsWith(base) && url.pathname === "/", async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    delete headers["x-frame-options"];
    if (headers["content-security-policy"]) {
      headers["content-security-policy"] = headers["content-security-policy"].replace(/frame-ancestors [^;]*/, "frame-ancestors 'self'");
    }
    await route.fulfill({ response: res, headers });
  });
  await page.goto(base + "/__tour");
  const app = page.frames().find((f) => f !== page.mainFrame());
  await ready(app);

  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  const caption = async (n) => {
    await page.evaluate(async ({ n, step }) => {
      const el = document.getElementById("t");
      el.style.opacity = "0";
      await new Promise((r) => setTimeout(r, 250));
      el.replaceChildren(Object.assign(document.createElement("b"), { textContent: step[0] }), step[1]);
      el.style.opacity = "1";
      document.querySelectorAll(".dots i").forEach((d, i) => d.classList.toggle("on", i === n));
    }, { n, step: t.steps[n] });
  };
  // the mouse glides there (with an eased path) instead of jumping
  let mouse = { x: 1180, y: 700 };
  const glide = async (to, ms = 700) => {
    const from = mouse, t0 = Date.now();
    for (let k = 0; k < 1;) {
      k = Math.min(1, (Date.now() - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      await sleep(15);
    }
    mouse = to;
  };
  const click = async (to, ms) => { await glide(to, ms); await sleep(120); await page.mouse.down(); await sleep(90); await page.mouse.up(); };
  const center = (sel) => app.evaluate((sel) => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, sel);
  const checkOf = (ref) => app.evaluate((ref) => {
    const li = [...document.querySelectorAll("li.item")].find((x) => x.querySelector(".ref")?.textContent === ref);
    const b = li.querySelector(".check").getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, ref);

  await page.mouse.move(mouse.x, mouse.y);
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  // 1 – the board
  await caption(0);
  await sleep(1200);
  await glide({ x: 1010, y: 640 }, 1000);
  await sleep(400);
  // 2 – the AI adds a warning and starts on A9 (as it would through MCP from a chat)
  await caption(1);
  await sleep(700);
  await mcp(base, "cotrack_add", { project: "website", kind: "W", ...t.warn });
  await mcp(base, "cotrack_update", { project: "website", ref: "A9", status: "doing" });
  await app.evaluate(() => poll());
  await sleep(2200);
  // 3 – you tick off A8 (the toast offers undo)
  await caption(2);
  await sleep(300);
  await click(await checkOf("A8"), 800);
  await sleep(2000);
  // 4 – Next
  await caption(3);
  await click(await center('#modeSwitch [data-mode="next"]'), 800);
  await sleep(2400);
  // 5 – Chains, scrolled to the long chain
  await caption(4);
  await click(await center('#modeSwitch [data-mode="deps"]'), 500);
  await sleep(700);
  await glide({ x: 700, y: 520 }, 500);
  await app.evaluate(() => {
    const long = [...document.querySelectorAll(".dg-chain")].sort((a, b) => b.querySelectorAll(".dg-node").length - a.querySelectorAll(".dg-node").length)[0];
    if (long) window.scrollTo({ top: long.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
  });
  await sleep(2100);
  // 6 – the overview
  await caption(5);
  await click(await center("#homeBtn"), 800);
  await glide({ x: 1180, y: 700 }, 700);
  await sleep(2000);
  const end = Date.now() / 1000; // the same clock as the frames' timestamps
  await cdp.send("Page.stopScreencast");
  await ctx.close();
  await toGif(frames, end, join(OUT, `tour.${lang}.gif`));
}

// Screencast frames come only when something changes: each one lasts until the next, the last one until the end.
async function toGif(frames, end, path) {
  if (frames.length < 10) throw new Error(`only ${frames.length} frames recorded`);
  const dir = mkdtempSync(join(tmpdir(), "cotrack-gif-"));
  try {
    const list = ["ffconcat version 1.0"];
    frames.forEach((f, i) => {
      const name = `f${String(i).padStart(5, "0")}.png`;
      writeFileSync(join(dir, name), Buffer.from(f.data, "base64"));
      const next = i + 1 < frames.length ? frames[i + 1].t : end;
      list.push(`file ${name}`, `duration ${Math.max(0.001, next - f.t).toFixed(3)}`);
    });
    list.push(`file f${String(frames.length - 1).padStart(5, "0")}.png`);
    writeFileSync(join(dir, "list.txt"), list.join("\n") + "\n");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
      "-vf", "fps=12,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];" +
        "[b][p]paletteuse=dither=none:diff_mode=rectangle",
      "-loop", "0", path], { stdio: "inherit" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A screenshot with at most 256 colours: a third of the size, the same to the eye (flat colours, no photos).
function smaller(path) {
  const tmp = path.replace(/\.png$/, ".tmp.png");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path, "-vf",
    "split[a][b];[a]palettegen=max_colors=256:reserve_transparent=1[p];[b][p]paletteuse=dither=none:alpha_threshold=128", tmp]);
  renameSync(tmp, path);
}

// In the app's page: a visible mouse pointer (recordings have none) and a ring on each click.
function addCursor() {
  if (location.pathname.startsWith("/__")) return;
  const add = () => {
    const c = document.createElement("div");
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.3-4.1 2.9 6.6 2.7-1.2-2.9-6.5h6.1z" ' +
      'fill="#1d1d1b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "-50px", top: "-50px", zIndex: 2147483647, pointerEvents: "none",
      filter: "drop-shadow(0 1px 2px rgb(0 0 0 / .35))" });
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX - 5 + "px"; c.style.top = e.clientY - 3 + "px"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: e.clientX - 18 + "px", top: e.clientY - 18 + "px", width: "36px", height: "36px",
        borderRadius: "50%", border: "3px solid #0f766e", zIndex: 2147483646, pointerEvents: "none", transition: "transform .45s, opacity .45s" });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.6)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
