# cotrack as an MCP server

**English** · [Deutsch](MCP.md)

## What is MCP?

The **Model Context Protocol** is a power socket for AI assistants. An MCP server describes a handful of
**tools** (name, purpose, parameters). Claude, ChatGPT & co. read these descriptions and call the tools on their own
when it fits – nobody has to write `curl` commands.

Technically these are just JSON messages (JSON-RPC 2.0) sent over HTTP to **one** address:

| Step | Message from the AI client | Answer from cotrack |
|---|---|---|
| 1. Handshake | `initialize` | protocol version, name, short usage note (`instructions`) |
| 2. Tool list | `tools/list` | the tools below, with parameters |
| 3. Use | `tools/call` with name + arguments | short text, e.g. `A11 created: …` |

The whole server is in [`src/mcp.js`](../src/mcp.js) (no library, easy to read).

## Tools

| Tool | Purpose | reads/writes |
|---|---|---|
| `cotrack_projects` | projects (slug, code, repository) with the number of open items; with `repo` only the project for that repository, with `archived` archived ones too | reads |
| `cotrack_project_create` | create a project, with your slug and code (only when you ask for it) | writes |
| `cotrack_project_update` | rename a project, set its repository, add a code, archive or restore it (`archived`) | writes |
| `cotrack_status` | session start: footer + open items + version number | reads |
| `cotrack_list` | filtered list (status, category, owner, search) | reads |
| `cotrack_get` | one item with its description | reads |
| `cotrack_add` | add a new item | writes |
| `cotrack_update` | change, close (`done`), drop (`dropped`); `check`/`uncheck` ticks sub-items of an action | writes |
| `cotrack_convert` | accept an idea → A or D | writes |
| `cotrack_footer` | only the footer; several projects (comma) = one block per project, `delta` = only "new/done", `layout` = `multi` (one line per group) or `single`; without `layout` the web app setting applies (☰ → Chat footer → Customize); `lang` = `de` or `en` | reads |
| `cotrack_changes` | only the changes since a version number (saves tokens in follow-up sessions) | reads |

Deliberately **no deleting** by the AI – items are dropped with `status: "dropped"`, projects archived, so nothing is lost.
A project's slug and code are fixed: references like "CT:A4" in chats and documents stay valid.

Wherever `project` is required, the **slug or the code** works (`cotrack` or `CT`). `cotrack_get`, `cotrack_update`
and `cotrack_convert` also take a **qualified reference** (`ref: "CT:A4"`); `project` may then be omitted.

## Language

The server speaks German or English – the usage note (`instructions`), the tool descriptions, the answers and error
messages. MCP itself does not tell the server which language the user speaks, so you choose it once for your
installation: in the web app ☰ → **AI assistants → Language** (`DE` / `EN`). It applies to every connected AI from the
next request on; the default is German. The web app's own language (☰ → This device) is separate and per device.

Exception: `cotrack_footer` has its own `lang` – for a conversation in the other language (`new / done` vs.
`neu / erledigt`). The English prompt ([PROMPT.en.md](PROMPT.en.md)) always sets `lang "en"`.

The same setting is the default for the API's text answers (`format=text`, `status.md`, footer); there, too, `lang=de|en`
in a request wins. Item titles stay as you wrote them.

## Which project belongs to the conversation?

The AI decides that, not the server: the MCP server cannot see which repository the conversation is about.
To make this reliable, three layers work together:

1. **The server's `instructions`** – cotrack sends a usage note when connecting that describes the assignment
   (read `COTRACK.md`, otherwise `cotrack_projects` with `repo`, otherwise ask). Clients that pass it on (Claude Code does)
   need nothing else.
2. **Custom prompt** ([PROMPT.en.md](PROMPT.en.md): part 1 base + part 2 cotrack addendum) – applies in every chat, also where
   a client does not show the server's note (claude.ai, ChatGPT). Why it is needed next to the server and who controls what:
   [PROMPT.en.md → Why a prompt?](PROMPT.en.md#why-a-prompt--who-controls-what)
3. **A note in the repository** (optional) – one line in `CLAUDE.md` or `AGENTS.md`, e.g. "Open points: cotrack project, see COTRACK.md".
   Claude Code loads these files by itself; that way it also works without the prompt.

`COTRACK.md` in the repository root is the mapping (template in the [README](../README.md#linking-a-repository)). If it is
missing, the project's `repo` field is the fallback.

## Connecting

`<your-address>` is the address of your cotrack installation, e.g. `https://cotrack.your-name.workers.dev` – you get it
during setup ([SETUP.md](SETUP.md), step 7). No installation yet? Then go through the guide first.

Address: `<your-address>/mcp`. Every AI assistant signs in via **OAuth**: you confirm once with your token
(`TOKEN_USER`), the assistant gets credentials of its own, and its changes are logged as "AI".

**Claude Code:**
```bash
claude mcp add --transport http cotrack <your-address>/mcp
```
Then type `/mcp` in Claude Code, pick `cotrack` and authenticate; the consent page opens in the browser.

**Special case without a browser** (cloud sessions, scripts, `curl`): signing in via the consent page does not work
there. For that there is a second, fixed token for AI tools:
1. Generate a value as in [SETUP.md](SETUP.md), step 6, and store it with `npx wrangler secret put TOKEN_AI`.
2. Send it in the header, e.g.
   `claude mcp add --transport http cotrack <your-address>/mcp --header "Authorization: Bearer $COTRACK_TOKEN"`
   (with `COTRACK_TOKEN` = your `TOKEN_AI`).

Without `TOKEN_AI` everything else works the same; you can also send `TOKEN_USER` in the header, but then the changes are
logged as "You" instead of "AI".

**claude.ai and ChatGPT** connect via **OAuth** – no secret appears in the URL:

1. Add a connector with the URL `<your-address>/mcp` (without a token).
   - **claude.ai:** Settings → Connectors → "Add custom connector" → name `cotrack`, URL as above.
     Leave the OAuth client ID/secret fields empty – the app registers itself.
   - **ChatGPT:** Settings → Apps & Connectors → Advanced → turn on developer mode → "Create" →
     name `cotrack`, URL as above, authentication **"OAuth"**.
2. When connecting, the cotrack page "Connect cotrack" opens (in your browser's language, German or English). Enter your
   **user token** there (the same as in the web app, not the AI token) and choose "Allow access".
3. Done. The app gets an access token for one hour, which it renews itself (for up to 30 days without use).
   Changes made through the connector are logged as "AI". Disconnecting in the app ends the connection.

(Both apps rename their menus now and then.)

The earlier form with the token in the URL (`<your-address>/mcp/<token>`) no longer exists. An old connector with that
URL gets "not_found": delete it and add it again as above.

### How signing in works (OAuth 2.1)

Implemented without a library in [`src/oauth.js`](../src/oauth.js), as the MCP specification asks for:

| Step | Address | Purpose |
|---|---|---|
| 1 | `POST /mcp` without a token | answer `401` with `WWW-Authenticate`: where the sign-in is described |
| 2 | `/.well-known/oauth-protected-resource/mcp` | which authorization server protects `/mcp` |
| 3 | `/.well-known/oauth-authorization-server` | where apps register, sign in and get tokens |
| 4 | `POST /register` | the app registers itself (Dynamic Client Registration) |
| 5 | `/authorize` | consent page: you confirm with the user token; returns a one-time code (PKCE S256 required) |
| 6 | `POST /token` | code → access token (1 hour) + refresh token (30 days, new on every use) |
| 7 | `POST /revoke` | end the connection |

Only hashes of the tokens and codes are stored (migration `0005_oauth.sql`). OAuth tokens are valid only for `/mcp`,
not for the HTTP API and not in the path. The fixed tokens (`TOKEN_USER`, optional `TOKEN_AI`) in the header
keep working unchanged.

## Try it yourself

```bash
curl -s "<your-address>/mcp" \
  -H "Authorization: Bearer $COTRACK_TOKEN" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cotrack_status","arguments":{"project":"cotrack"}}}'
```
