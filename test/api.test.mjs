// API and MCP: session links (D35), several sources (D36), the web app's version check (A124). Run with `npm test`.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { BASE, api, mcp, mcpRaw, freshProject, item, events, refOf } from "./helpers.mjs";

const S1 = "https://claude.ai/code/session_01AAA", S2 = "https://claude.ai/code/session_01BBB";
const S3 = "https://claude.ai/code/session_01CCC", S4 = "https://claude.ai/code/session_01DDD";
const TWO = "https://github.com/IlianP/cotrack/pull/50\nhttps://github.com/IlianP/cotrack/pull/51";

describe("session links (D35)", () => {
  let p;
  before(async () => { p = await freshProject("sess"); });

  it("add sets first and last session, the event notes it", async () => {
    const r = await mcp("cotrack_add", { project: p, kind: "A", title: "Sessions", body: "- [ ] one\n- [ ] two", session: S1 });
    assert.equal(r.error, false, r.text);
    const ref = refOf(r.text);
    const it = await item(p, ref);
    assert.equal(it.first_session, S1);
    assert.equal(it.last_session, S1);
    const [ev] = await events(p, ref);
    assert.equal(ev.action, "created");
    assert.equal(ev.data.session, S1);
  });

  it("an update moves the last session, keeps the first, and notes it without column names", async () => {
    const ref = refOf((await mcp("cotrack_add", { project: p, kind: "A", title: "Move", session: S1 })).text);
    await mcp("cotrack_update", { project: p, ref, status: "doing", session: S2 });
    const it = await item(p, ref);
    assert.deepEqual([it.first_session, it.last_session], [S1, S2]);
    const [ev] = await events(p, ref);
    assert.equal(ev.data.session, S2);
    assert.equal(ev.data.status, "doing");
    assert.ok(!("last_session" in ev.data) && !("first_session" in ev.data));
    // the same session again with nothing changed: no new event
    const n = (await events(p, ref)).length;
    await mcp("cotrack_update", { project: p, ref, status: "doing", session: S2 });
    assert.equal((await events(p, ref)).length, n);
  });

  it("ticking in a new session stays a 'checked' event", async () => {
    const ref = refOf((await mcp("cotrack_add", { project: p, kind: "A", title: "Tick", body: "- [ ] one", session: S1 })).text);
    await mcp("cotrack_update", { project: p, ref, check: "1", session: S3 });
    const [ev] = await events(p, ref);
    assert.equal(ev.action, "checked");
    assert.equal(ev.data.session, S3);
  });

  it("cotrack_get names both sessions", async () => {
    const ref = refOf((await mcp("cotrack_add", { project: p, kind: "A", title: "Get", session: S1 })).text);
    await mcp("cotrack_update", { project: p, ref, session: S3 });
    const { text } = await mcp("cotrack_get", { project: p, ref });
    assert.match(text, new RegExp(`Session: ${S3}`));
    assert.match(text, new RegExp(`Erste Session: ${S1}|First session: ${S1}`));
  });

  it("refuses anything but an https address", async () => {
    const ref = refOf((await mcp("cotrack_add", { project: p, kind: "A", title: "Bad" })).text);
    for (const bad of ["http://example.com/x", "javascript:alert(1)", "nope"]) {
      const r = await mcp("cotrack_update", { project: p, ref, session: bad });
      assert.equal(r.error, true, bad);
    }
    const r = await api(`/projects/${p}/items`, { method: "POST", body: { kind: "W", title: "W", session: 5 } });
    assert.equal(r.status, 400);
  });

  it("a session link in source gets a hint", async () => {
    const r = await mcp("cotrack_add", { project: p, kind: "I", title: "Hint", source: "https://claude.ai/code/session_01XYZ" });
    assert.match(r.text, /Session-Link|session link/);
    const r2 = await mcp("cotrack_add", { project: p, kind: "I", title: "No hint", source: "PR #7" });
    assert.doesNotMatch(r2.text, /Session-Link|session link/);
  });

  it("a conversion keeps the idea's first session, both get the new last one", async () => {
    const iref = refOf((await mcp("cotrack_add", { project: p, kind: "I", title: "Idea", session: S1 })).text);
    const r = await mcp("cotrack_convert", { project: p, ref: iref, kind: "A", session: S4 });
    assert.equal(r.error, false, r.text);
    const aref = r.text.match(/→ (\w+)/)[1];
    const a = await item(p, aref), i = await item(p, iref);
    assert.deepEqual([a.first_session, a.last_session], [S1, S4]);
    assert.deepEqual([i.first_session, i.last_session], [S1, S4]);
  });

  it("a refused conversion does not leave the idea claimed", async () => {
    const iref = refOf((await mcp("cotrack_add", { project: p, kind: "I", title: "Idea 2" })).text);
    const r = await mcp("cotrack_convert", { project: p, ref: iref, kind: "A", session: "nope" });
    assert.equal(r.error, true);
    assert.equal((await item(p, iref)).converted_to, null);
  });

  it("entered by hand, cleared, and kept through delete + restore", async () => {
    const ref = (await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "By hand" } })).body.item.ref;
    // the web app sends an empty field for an item without a link: no change
    await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { title: "By hand", session: "" } });
    assert.equal((await events(p, ref)).length, 1);
    const chat = "https://claude.ai/chat/1234-abcd";
    let it = (await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { session: chat } })).body.item;
    assert.deepEqual([it.first_session, it.last_session], [chat, chat]);
    assert.deepEqual((await events(p, ref))[0].data, { session: chat });
    it = (await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { session: "" } })).body.item;
    assert.deepEqual([it.first_session, it.last_session], [null, null]);
    await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { session: chat } });
    await api(`/projects/${p}/items/${ref}`, { method: "DELETE" });
    it = (await api(`/projects/${p}/items/${ref}/restore`, { method: "POST" })).body.item;
    assert.equal(it.last_session, chat);
  });

  it("undo's expect on last_session refuses a newer session (409)", async () => {
    const ref = refOf((await mcp("cotrack_add", { project: p, kind: "A", title: "Expect", session: S1 })).text);
    const r = await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { session: "", expect: { last_session: S2 } } });
    assert.equal(r.status, 409);
    assert.equal((await item(p, ref)).last_session, S1);
  });
});

describe("several sources (D36)", () => {
  let p;
  before(async () => { p = await freshProject("src", { repo: "ilianp/cotrack" }); });

  it("keeps two sources as two lines – through the API, MCP and cotrack_get", async () => {
    const r = await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "Two", source: TWO } });
    assert.equal(r.status, 201);
    assert.equal(r.body.item.source, TWO);
    const { text } = await mcp("cotrack_get", { project: p, ref: r.body.item.ref });
    assert.match(text, /Quellen:\n- https:\/\/github.com\/IlianP\/cotrack\/pull\/50\n- https:\/\/github.com\/IlianP\/cotrack\/pull\/51|Sources:\n- /);
  });

  it("trims lines, drops blank lines and repeats", async () => {
    const r = await api(`/projects/${p}/items`, { method: "POST",
      body: { kind: "A", title: "Messy", source: "  docs/a.md \n\n PR #7\nPR #7\r\nhttps://example.com/x  " } });
    assert.equal(r.body.item.source, "docs/a.md\nPR #7\nhttps://example.com/x");
    const blank = await api(`/projects/${p}/items`, { method: "POST", body: { kind: "I", title: "Blank", source: "\n \n" } });
    assert.equal(blank.body.item.source, null);
  });

  it("refuses a fourth source and leaves the item as it was", async () => {
    const ref = (await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "Max", source: TWO } })).body.item.ref;
    const r = await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { source: "a\nb\nc\nd" } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "too_many_sources");
    const m = await mcp("cotrack_update", { project: p, ref, source: "a\nb\nc\nd" });
    assert.equal(m.error, true);
    assert.equal((await item(p, ref)).source, TWO);
  });

  it("one source stays a single line in cotrack_get", async () => {
    const ref = refOf((await mcp("cotrack_add", { project: p, kind: "A", title: "One", source: "PR #7" })).text);
    const { text } = await mcp("cotrack_get", { project: p, ref });
    assert.match(text, /(Quelle|Source): PR #7/);
    assert.doesNotMatch(text, /Quellen:|Sources:/);
  });

  it("text outputs stay one line per item or change", async () => {
    const ref = (await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "Lines", source: "PR #7" } })).body.item.ref;
    await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { source: TWO } });
    const md = (await api(`/projects/${p}/status.md`)).body;
    const row = md.split("\n").find((l) => l.startsWith(`| ${ref} `));
    assert.ok(row && row.includes("pull/50 · https://github.com"), row);
    const changes = (await mcp("cotrack_changes", { project: p, after: 0 })).text.split("\n");
    const line = changes.find((l) => l.startsWith(`${ref} updated`) && l.includes("source="));
    assert.ok(line && line.includes("pull/50 · https://github.com"), changes.join("\n"));
    assert.ok(!changes.some((l) => l.startsWith("https://")), "no change spills onto a line of its own");
  });

  it("search finds text in the source", async () => {
    await api(`/projects/${p}/items`, { method: "POST", body: { kind: "I", title: "Findable", source: "docs/only-here-xyz.md" } });
    const { text } = await mcp("cotrack_list", { project: p, q: "only-here-xyz" });
    assert.match(text, /Findable/);
  });
});

describe("web app version (A124)", () => {
  let p, version, ref;
  before(async () => {
    p = await freshProject("ver");
    ref = (await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "Guarded", source: TWO } })).body.item.ref;
    const html = await (await fetch(BASE + "/")).text();
    version = html.match(/const UI_VERSION = "([0-9a-f]{8})"/)?.[1];
  });

  it("the page carries its version, and every API answer names the same", async () => {
    assert.ok(version, "the page has no UI_VERSION – the server did not write it in");
    const r = await api("/projects");
    assert.equal(r.headers.get("x-cotrack-ui"), version);
    const err = await api(`/projects/${p}/items/A999`);
    assert.equal(err.headers.get("x-cotrack-ui"), version, "error answers name it too");
  });

  it("a write from the current page is accepted", async () => {
    const r = await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { short: "ok" },
      headers: { "x-cotrack-ui": version, "sec-fetch-site": "same-origin" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  it("a write from an outdated page is refused and changes nothing", async () => {
    const r = await api(`/projects/${p}/items/${ref}`, { method: "PATCH",
      body: { source: TWO.replace("\n", "") }, headers: { "x-cotrack-ui": "00000000", "sec-fetch-site": "same-origin" } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "client_outdated");
    assert.equal((await item(p, ref)).source, TWO);
  });

  it("a page from before the version check (browser, no version) is refused as well", async () => {
    const r = await api(`/projects/${p}/items/${ref}`, { method: "PATCH",
      body: { source: TWO.replace("\n", "") }, headers: { "sec-fetch-site": "same-origin" } });
    assert.equal(r.status, 409);
    assert.equal((await item(p, ref)).source, TWO);
  });

  it("reads from an outdated page still work (it needs them to notice and reload)", async () => {
    const r = await api(`/projects/${p}/items/${ref}`, { headers: { "x-cotrack-ui": "00000000", "sec-fetch-site": "same-origin" } });
    assert.equal(r.status, 200);
  });

  it("scripts and MCP clients are not affected", async () => {
    const r = await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { short: "script" } });
    assert.equal(r.status, 200);
    const m = await mcp("cotrack_update", { project: p, ref, short: "mcp" });
    assert.equal(m.error, false, m.text);
  });

  it("MCP announces the session and source rules", async () => {
    const init = await mcpRaw("initialize", { protocolVersion: "2025-06-18" });
    assert.match(init.instructions, /Session-Link:|Session link:/);
    assert.match(init.instructions, /bis zu drei, eine pro Zeile|up to three, one per line/);
    const tools = Object.fromEntries((await mcpRaw("tools/list")).tools.map((t) => [t.name, t]));
    for (const n of ["cotrack_add", "cotrack_update", "cotrack_convert"]) assert.ok(tools[n].inputSchema.properties.session, n);
  });
});

describe("statistics limited to some projects (A132)", () => {
  it("projects=a,b counts only those, without it every project", async () => {
    const a = await freshProject("stats"), b = await freshProject("stats");
    await api(`/projects/${a}/items`, { method: "POST", body: { kind: "A", title: "in a" } });
    await api(`/projects/${b}/items`, { method: "POST", body: { kind: "A", title: "in b" } });
    await api(`/projects/${b}/items`, { method: "POST", body: { kind: "I", title: "also in b" } });
    const only = (await api(`/stats?projects=${a}`)).body;
    assert.equal(only.items_total, 1);
    assert.equal((await api(`/stats?projects=${a},${b}`)).body.items_total, 3);
    assert.ok((await api("/stats")).body.items_total >= 3);
  });
});

describe("undo noted on the event (D33)", () => {
  let p;
  before(async () => { p = await freshProject("undo"); });

  it("undo: true lands in the event data as a note, not as a field; anything but a boolean is refused", async () => {
    const ref = (await api(`/projects/${p}/items`, { method: "POST", body: { kind: "A", title: "Undo", body: "Alt" } })).body.item.ref;
    await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { body: "Neu" } });
    const r = await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { body: "Alt", undo: true, expect: { body: "Neu" } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.item.body, "Alt");
    const [ev, before] = await events(p, ref);
    assert.deepEqual(ev.data, { body: "Alt", undo: true });
    assert.equal(before.data.undo, undefined, "an ordinary change carries no note");
    const bad = await api(`/projects/${p}/items/${ref}`, { method: "PATCH", body: { title: "x", undo: "yes" } });
    assert.equal(bad.status, 400);
    assert.equal((await item(p, ref)).title, "Undo");
  });
});
