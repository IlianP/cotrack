// The demo data (demo/data.mjs, demo/data.en.mjs): both languages side by side in one database (A132).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDemo, DEMO_SLUGS } from "../demo/data.mjs";
import { contentAll, contentEn, DEMO_SLUGS_ALL, SLUGS_EN } from "../demo/data.en.mjs";

describe("demo data", () => {
  const d = buildDemo(Date.now(), contentAll);

  it("holds the German and the English projects, English ones as en-…", () => {
    assert.deepEqual(d.slugs, DEMO_SLUGS_ALL);
    assert.deepEqual(DEMO_SLUGS_ALL, [...DEMO_SLUGS, ...SLUGS_EN]);
    assert.ok(SLUGS_EN.every((s) => s.startsWith("en-")), "the web app tells the languages apart by the prefix");
    assert.ok(DEMO_SLUGS.every((s) => !s.startsWith("en-")));
  });

  it("gives every project its own code", () => {
    const codes = d.projects.map((p) => p.code);
    assert.equal(new Set(codes).size, codes.length, codes.join());
  });

  it("links only within the same language", () => {
    const lang = (slug) => (slug.startsWith("en-") ? "en" : "de");
    for (const i of d.items) {
      for (const w of (i.waiting_on || "").split(",").filter((x) => x.includes(":"))) {
        assert.equal(lang(w.split(":")[0]), lang(i.project_slug), `${i.project_slug}:${i.kind}${i.seq} waits on ${w}`);
        assert.ok(d.slugs.includes(w.split(":")[0]), `unknown project in ${w}`);
      }
      for (const a of (i.also_in || "").split(",").filter(Boolean)) {
        assert.equal(lang(a), lang(i.project_slug), `${i.project_slug}:${i.kind}${i.seq} also in ${a}`);
      }
    }
  });

  it("builds the English projects alone too (the screenshots)", () => {
    assert.deepEqual(buildDemo(Date.now(), contentEn).slugs, SLUGS_EN);
  });
});
