#!/usr/bin/env node
/*
 * npm test – starts the worker locally (wrangler dev) on a fresh, temporary D1 database, runs test/*.test.mjs against it with
 * node:test and stops it again. No real data is touched: the database lives in a temporary folder, the tokens are test values
 * passed on the command line (they win over a .dev.vars). Needs `npm install` (wrangler); the browser tests in ui.test.mjs
 * also need Playwright and are skipped without it.
 *
 *   npm test                       all tests
 *   npm test -- test/api.test.mjs  only these files
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = join(root, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
if (!existsSync(wrangler)) {
  console.error("wrangler is missing – run `npm install` first.");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "cotrack-test-"));
const port = String(8800 + Math.floor(Math.random() * 100));
const env = {
  ...process.env,
  CI: "1", // no prompts
  COTRACK_TEST_URL: `http://localhost:${port}`,
  COTRACK_TEST_USER: "test-user-" + "u".repeat(32),
  COTRACK_TEST_AI: "test-ai-" + "a".repeat(32),
};

let server;
const stop = () => {
  if (server && server.exitCode === null) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
  }
  rmSync(dir, { recursive: true, force: true });
};
process.on("SIGINT", () => { stop(); process.exit(130); });

try {
  execFileSync(wrangler, ["d1", "migrations", "apply", "cotrack-db", "--local", "--persist-to", dir], { cwd: root, env, stdio: "pipe" });
  let log = "";
  server = spawn(wrangler, ["dev", "--local", "--port", port, "--persist-to", dir,
    "--var", `TOKEN_USER:${env.COTRACK_TEST_USER}`, "--var", `TOKEN_AI:${env.COTRACK_TEST_AI}`],
  { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (d) => { log += d; });
  server.stderr.on("data", (d) => { log += d; });
  // Ready when the page answers (wrangler compiles first).
  let ready = false;
  for (let i = 0; i < 120 && !ready && server.exitCode === null; i++) {
    try { ready = (await fetch(env.COTRACK_TEST_URL + "/api/health")).ok; } catch {}
    if (!ready) await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error("the local worker did not start:\n" + log.slice(-2000));

  const asked = process.argv.slice(2);
  const files = asked.length ? asked : readdirSync(join(root, "test")).filter((f) => f.endsWith(".test.mjs")).sort().map((f) => join("test", f));
  const test = spawn(process.execPath, ["--test", "--test-concurrency=1", ...files], { cwd: root, env, stdio: "inherit" });
  const code = await new Promise((r) => test.on("exit", r));
  stop();
  process.exit(code ?? 1);
} catch (err) {
  console.error(err.message || err);
  stop();
  process.exit(1);
}
