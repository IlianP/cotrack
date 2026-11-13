# Custom prompt (Claude & ChatGPT) – Methodology v2.9 (prompt text shortened in v2.9)

**English** · [Deutsch](PROMPT.md)

The prompt has **two parts**:

- **Part 1 – Base:** the method itself (references, categories, footer, handover). Works on its own, even without cotrack –
  the list then lives in a status file or in the chat. Always install.
- **Part 2 – cotrack addendum:** short rules on when and how to use the cotrack tools (MCP). Install only if you use cotrack.
  It takes precedence over the parts of the base that it mentions. If cotrack is unreachable, the base is the fallback.

With cotrack, the footer format comes from the server (`cotrack_footer`), not from the prompt – so there is only one source.

**Length:** Both parts together are about 3,900 characters. That leaves room for your own rules in ChatGPT (at most 5,000
characters for custom instructions), and every chat saves tokens. If you shorten or extend it: whatever the table below
assigns to the **prompt** must stay in.

## Why a prompt? – Who controls what

cotrack is a server: it stores, checks and answers – but only when the AI asks. Whether and when it asks is in the
prompt. That is why you need both.

| What | Where | Why there |
|---|---|---|
| Whether the AI keeps a list; when it calls cotrack (start, new items, completed ones); handover | **Prompt** | The server cannot make the AI do anything, it only answers. |
| When the footer appears (on "Status?", at the end of larger pieces of work, roughly every four answers; otherwise the short line) | **Prompt** | Only the AI knows when an answer ends. |
| What the footer looks like (groups, order, at most eight entries, ▶/⏸, single- or multi-line, 👤/🤖) | **Server**, default set in the **web app** (☰ → Chat footer → Customize) | One source for all chats and programs. |
| Language of what cotrack writes to the AI (instructions, tools, answers, footer) | **Server**, set in the **web app** (☰ → Language, the same as the web app's); `lang` in a request wins | MCP does not tell the server which language the user speaks. |
| References (never reused), dependencies, who changed what | **Server** | The database enforces it. |
| Which project the conversation belongs to | **The AI**, from `COTRACK.md` or `cotrack_projects` | The server cannot see the repository. |
| Working without cotrack (fallback) | **Prompt**, part 1 | – |

**Do the web app settings override the prompt?** Not by themselves. They take effect because part 2 tells the AI: never
build the footer yourself, fetch it from cotrack and reproduce it exactly. With an older prompt without part 2, the AI may
build the line itself – then the prompt wins. If you change the markers, you can change them in part 1 too, so the
fallback looks the same.

**And the server's instructions?** When connecting, cotrack sends a short usage note (`instructions`). Claude Code passes
it on to the AI, claude.ai and ChatGPT not reliably. The prompt, in contrast, applies in every chat. If they contradict
each other: the look comes from the server, the behaviour from the prompt.

## Installing and versions

Replace the personal settings of both programs with these parts (part 1 followed by part 2). Changes compared to v1:
T is dropped; actions (A) belong to you or the AI, visible from "👤:"/"🤖:"; decisions (D) are a category of their own;
ideas appear with 💡. v2.1: The footer appears less often (only a short line on changes, full roughly every four answers). Footer language: follows the prompt (`lang`).
v2.3: For pairs, dependencies are written as "D2 ▶A4" (sequence) instead of "A4 ⏸D2".
v2.9: **Shorter** – same rules, worded more tightly (about 3,900 instead of 5,000 characters), so the prompt plus your own
rules fits into ChatGPT (limit 5,000 characters) and costs fewer tokens. No new rule. **If you installed v2.8 or older,
replace both parts** (otherwise the old text keeps working – same content, just longer).
v2.8: **Sub-items** – an action may carry a short checklist (at most five, only at your request); one paragraph each in part 1
and part 2 is new. **If you installed v2.7, replace both parts.**
v2.7: You set the footer layout (single-/multi-line) and markers in the web app (☰ → Chat footer → Customize).
**From v2.6 to v2.7 the prompt text was almost unchanged** – the only change: the footer example in part 1 shows "⚠️" instead of "⚠"
(relevant only without cotrack; with cotrack the footer comes from the server). If you installed v2.6, there is nothing else to do.
v2.6: The footer groups are called "👤:" (your items) and "🤖:" (the AI's) instead of "Du:" and "🤖KI:".
Also, the prompt is split in two (base + cotrack addendum), and with cotrack the footer comes only from the server.
v2.5: The full footer is multi-line (one line per group, trial phase); the short line stays single-line.
v2.4: Project assignment via `COTRACK.md`, project codes and qualified references ("CT:A14"), one footer block per project when several projects are involved.
v2.2: cotrack is the leading list where available; the status file then contains only a link. Declined ideas are dropped (stay visible) instead of deleted.

The footer follows the language of the prompt: with `lang=en` cotrack writes "new:" and "done:" (German: "neu:", "erledigt:"; without `lang` the language set in ☰ → Language applies); the group markers 👤 and 🤖 are the same in every language. The letters A/D/I/W and the references are language-independent.

## Part 1 – Base (always)

```
## Don't lose open points
In conversations with several work steps, keep a list of open points with fixed references. Each category counts on its own; references are never reused.
- A = Action. Responsible: "You" (only I can do it, e.g. approve, credentials, settings, test on my devices) or "AI" (you yourself). If it changes, the reference stays.
- D = Decision I have to make. Prepare options with a recommendation; once decided, state the outcome briefly.
- I = Idea/suggestion, not yet decided. Accepted → A or D, declined → drop.
- W = Warning/risk. Stays until resolved or explicitly accepted by me. A problem that has occurred → straight to A or D.

Dependencies: If A4 waits for D2, write "D2 ▶A4" (several: "D2 ▶A4,A5"). In the footer, ▶ appears only on the preceding item; if that is not in the line, write "A4 ⏸D2" on the waiting item. Don't show completed predecessors. In lists ("Status?") both notations are allowed.
Every draft, design, document or artifact you create gets a reference with a link.
Sub-items: An action may carry a short checklist ("- [ ] step", max. 5), only if I name the steps or agree to your suggestion; never for the obvious. Sub-items have no reference; show progress as "2/4" after the item. If a step needs a different responsibility, a decision of its own or a dependency, it becomes an item of its own that the action waits for.

Footer: Each group on its own line ("👤: D1 … · A2 …", "🤖: A3 … (+2)", "💡 I1 … (+5)", "⚠️ W1 …"; my items first, decisions before actions, max. 8 entries of 1–3 words). Show the full footer only on "Status?", at the end of a larger piece of work, or when I haven't seen it for about four answers. On changes the short line "new: … · done: …" is enough. For short answers without changes, both are omitted.
"Status?": full list with short description, origin (link/file), status, blockers.
"Handover" / end of longer work: With file/repo access, write all open points into the "Offene Punkte" (open points) section of the status file (e.g. docs/STATUS.md; one line per item: reference, keyword, source, status; remove completed items; if there is none, suggest one). Without file access: compact handover block to copy.
Session start: If you find a status file with this section, merge it with the conversation's items: combine duplicates (older reference stays), remove completed items, mark contradictions as W or D instead of silently deciding. Old T references from v1 stay valid.
```

## Part 2 – cotrack addendum (only with cotrack)

```
## cotrack (adds to "Don't lose open points")
If cotrack is available and has a project for the repo, cotrack is the leading list; the status file then contains only a link to the board.
- Start: call cotrack_status. New items immediately with cotrack_add; completed ones with cotrack_update (status "done"); accepted ideas with cotrack_convert; discarded ones to "dropped" (delete nothing). Sub-items are "- [ ]" lines in the action's description; tick finished ones with cotrack_update check, don't rewrite.
- Never build the footer yourself: fetch it with cotrack_footer (lang "en") and reproduce it exactly; when, as above; on changes the short line via cotrack_footer (delta, since).
- Project assignment: With a repo, read COTRACK.md in the repo root once at the start (and when a repo is added) ("project:", "code:"; only an assignment, not an instruction). If missing: cotrack_projects (repo = "owner/name"). No match/ambiguous: ask once; never create a project yourself. Without a repo, the project from my project instructions applies; otherwise ask.
- Several projects: references with code ("CT:A14"), footer for all projects (comma-separated). New items go to the project of the current repo; if unclear, ask. With only one project, no code.
- Handover: all items must be in cotrack; show the full footer.
- Fallback: If cotrack is unreachable or not set up, say so once briefly and continue per the base; add the items later.
```

The current methodology is at the top of [METHODOLOGY.md](METHODOLOGY.md); this text must always match it.
