// Shared by the tests: the local worker started by test/run.mjs, both tokens, and small clients for the API and MCP.
import assert from "node:assert/strict";

export const BASE = process.env.COTRACK_TEST_URL;
export const USER = process.env.COTRACK_TEST_USER;
export const AI = process.env.COTRACK_TEST_AI;
if (!BASE || !USER || !AI) throw new Error("start the tests with `npm test` (test/run.mjs starts the local worker)");

// API call as the user (or with another token / extra headers). Returns { status, headers, body }.
export async function api(path, { method = "GET", body, token = USER, headers = {} } = {}) {
  const res = await fetch(BASE + "/api" + path, {
    method,
    headers: { authorization: "Bearer " + token, ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, body: data };
}

let rpc = 0;
// One MCP tool call as the AI. Returns { text, error }.
export async function mcp(name, args) {
  const res = await fetch(BASE + "/mcp", {
    method: "POST",
    headers: { authorization: "Bearer " + AI, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } }),
  });
  const data = await res.json();
  return { text: data.result.content[0].text, error: !!data.result.isError };
}

export async function mcpRaw(method, params = {}) {
  const res = await fetch(BASE + "/mcp", {
    method: "POST",
    headers: { authorization: "Bearer " + AI, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method, params }),
  });
  return (await res.json()).result;
}

// A project of its own for each test file, so files never see each other's items.
export async function freshProject(prefix, extra = {}) {
  const slug = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  const r = await api("/projects", { method: "POST", body: { slug, name: slug, ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return slug;
}

export const item = async (slug, ref) => (await api(`/projects/${slug}/items/${ref}`)).body.item;
export const events = async (slug, ref) => (await api(`/projects/${slug}/items/${ref}/events`)).body.events;
export const refOf = (text) => text.split(" ")[0];
