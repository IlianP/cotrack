# Methodology: managing open points together

**English** · [Deutsch](METHODIK.md)

> The group markers `👤:` and `🤖:` are the same in every language. Only the short line differs: `neu: … · erledigt: …`
> (German, default) or `new: … · done: …` (`lang=en`). The letters A/D/I/W and the references are language-independent.
> The history sections below still show the earlier labels ("Du:", "KI:").

## Current: Methodology v2.7 (as of 8 November 2026)

| Letter | Meaning | Footer |
|---|---|---|
| **A** | Action – for you ("Du") or the AI; responsibility can change, the reference stays | under "👤:" or "🤖:" |
| **D** | Decision – yours to make, the AI prepares options; the outcome is recorded | under "👤:", before the actions |
| **I** | Idea – if accepted it becomes A or D, if declined it is "dropped" | 💡 |
| **W** | Warning/risk – stays until resolved or explicitly accepted; problems that have occurred become A/D | ⚠ |

- **Numbering:** per category, never reused.
- **Dependencies:** only "A4 waits for D2" is stored. What is displayed is the sequence: **"D2 ▶A4"** (D2 first, then A4),
  with several successors "D2 ▶A4,A5". In the footer, ▶ appears only on the preceding item of a pair; **"A4 ⏸D2"** only if D2
  is not in the line. Completed predecessors disappear from the display. The successor is computed, not maintained.
- **Footer:** full only on "Status?", at the end of larger pieces of work, or roughly every four answers;
  when items change just the short line "neu: … · erledigt: …"; otherwise nothing at all.
- **Group markers (v2.6):** The footer shows `👤:` for your items and `🤖:` for the AI's (instead of "Du:" and "🤖KI:") –
  language-independent and shorter. In the text, responsibility is still called "Du" (you) and "KI" (AI). Since v2.7 the
  markers can be changed in the web app (☰ → Einstellungen, e.g. back to "Du"/"KI"); 👤/🤖 remains the default.
- **Multi-line footer (v2.5, trial phase):** The full footer has one line per group (`👤:`, `🤖:`, `💡`, `⚠`),
  followed if needed by the line "neu: … · erledigt: …". This is the default for now, to try out the overview;
  single-line output is still available with `layout=single`. The short line is always one line. Since v2.7 you choose the
  default yourself in the web app (☰ → Einstellungen, stored in cotrack); a `layout` in a single request wins.
  A new installation starts multi-line.
- **Who controls what (v2.7):** The **prompt** controls the AI's behaviour (whether and when it uses cotrack, when the footer
  appears, fallback without cotrack). The **server** controls what it can enforce itself (references, audit trail, the look of
  the footer). The **web app settings** set the default for that look. They do not override the prompt; they take effect
  because the cotrack addendum in the prompt hands the footer over to the server. Overview:
  [PROMPT.en.md → Why a prompt?](PROMPT.en.md#why-a-prompt--who-controls-what)
- **Leading list:** cotrack (web app + MCP connector). A repository's `docs/STATUS.md` contains only a link to the board, so
  nobody has to push a file on every change. Without cotrack, the list in `STATUS.md` remains authoritative.
- **Project code (v2.4):** Every project has a unique slug (identity) and optionally a **code** of 2–4 characters (two letters,
  then letters or digits) that you choose yourself; if you have no preference, one is suggested from the slug. It is set once
  and never changed. This gives the **qualified reference `CT:A14`**; `A14` alone stays valid as long as only one project is
  in the conversation.
- **Assigning a conversation to a project (v2.4):** The AI decides, not the server. Order: (1) `COTRACK.md` in the repo root
  (`project:`/`code:`), read once at the start and whenever a repository is added; (2) `cotrack_projects` with the repository
  (`owner/name`); (3) without a repository, the project from the project instructions; (4) otherwise ask once. Never create a
  project on your own.
- **Several projects in one conversation (v2.4):** References in the text carry the code (`CT:A14`); the footer gets one block per
  project: single-line `CT ▸ 👤: … · 🤖: …`, multi-line a `CT ▸` line with the group lines below. On changes, only projects
  with changes. New items belong to the project of the repo being worked on; if unclear, ask. Dependencies across project
  boundaries do not exist for now.
- **Not adopted:** P (problem), L (lesson) in the footer, a running project-wide number.
- The corresponding prompt text: [PROMPT.en.md](PROMPT.en.md) – in two parts: base (usable without cotrack) and cotrack addendum (MCP only). Both files must always match.

---

*The following sections document how this methodology came about (derivation and discussion). Note: they were written in
German first and refer to the situation at the time, including the old T references.*

## 1. Starting point – schema v1 (until 3 November)

| Letter | Meaning | Who |
|---|---|---|
| **T** | To-do – only the human can do it (decide, approve, credentials, tests). Decisions begin with "entscheiden:" (decide:) | You |
| **A** | Action – the AI can do it itself | AI |
| **I** | Idea – not yet decided; if accepted → A or T, if declined removed | – |
| **W** | Warning/risk – stays until resolved or explicitly accepted | – |

Rules: references are never reused · dependencies written as "A4 ⏸T2" ·
footer at the end of every answer · handover in `docs/STATUS.md` → "Offene Punkte" (open points).

**What works well:** fixed references, the footer as a constant overview, ⏸ for dependencies,
the clear separation of "you have to do this" vs. "I do this".

## 2. Weaknesses

1. **T and A mix two questions.** The letter says *what* it is (a task) and *who* does it (you/AI) at the same time.
   Consequences:
   - If a task moves from the AI to you (e.g. because access is missing), it needs a new reference.
   - Decisions hide as T with the prefix "entscheiden:"; the outcome of the decision is recorded nowhere.
2. **W mixes risk and problem.** "Might happen" (risk) and "has already happened" (problem/issue)
   are treated separately in all PM standards – different reaction, different urgency.
3. **No learning across projects.** Lessons ("next time clarify X earlier") are lost.
4. **No due dates/priorities.** In PM standards every task has exactly *one owner* and
   ideally *a due date*.
5. **Declined ideas are deleted.** That loses *that* and *why* something was dropped.

## 3. What the standards say (briefly)

- **PRINCE2** keeps several registers/logs next to the plan: *Daily Log* (informal tasks/notes),
  *Issue Register* (change requests, deviations, problems), *Risk Register*, *Lessons Log*, *Quality Register*.
  Decisions are made by project management or the steering committee ("manage by exception") –
  principles "defined roles and responsibilities" and "learn from experience".
- **PMBOK (PMI)** knows *Issue Log*, *Risk Register*, *Change Log*, *Decision Log*, *Lessons Learned Register*.
- **RAID log** (the most widespread in practice): **R**isks, **A**ctions (or Assumptions),
  **I**ssues, **D**ecisions (or Dependencies) – in effect a "light" version of the registers above.
- **Agile/Kanban:** ideas belong in a *backlog*; status columns instead of lists; "definition of done".

Common denominator: **type** (action, decision, risk, problem …) and **responsibility** (who)
are two separate properties.

## 4. Proposal: two axes – type × responsibility

### Option 1 – Minimal (keep v1, just sharpen)
T/A/I/W stay. Only additions: declined ideas become "dropped" instead of deleted, optional due date.
*Pro:* no change needed. *Con:* weaknesses 1–3 remain.

### Option 2 – Type × responsibility (recommended)

| Letter | Type | German | Typical responsibility | Corresponds to |
|---|---|---|---|---|
| **A** | Action | Aufgabe | You **or** AI (or another person) | RAID "Action", PRINCE2 Daily Log |
| **D** | Decision | Entscheidung | usually you – the AI prepares options | RAID "Decision", Decision Log |
| **I** | Idea | Idee | – | Backlog |
| **R** | Risk (might happen) | Risiko | – | Risk Register |
| **P** | Problem (has happened) | Problem/Issue | – | Issue Register |
| **L** | Lesson *(optional)* | Erkenntnis | – | Lessons Log |

The footer stays almost the same – grouping is still by **You / AI**:

```
Du: D1 Lizenz · A6 Tokens · 🤖KI: A2 ⏸D1 MCP-Server · 💡 I2 Sync · ⚠ R1 Auth · neu: A6 · erledigt: A1
```

Advantages:
- An action keeps its reference even when the owner changes.
- Decisions get an **outcome** when closed → automatically a decision log.
- A, I, R, P work in German and English; the only open question is D (Decision) vs. E (Entscheidung).

### Option 3 – Full RAID/PRINCE2 scope
Additionally assumptions, dependencies, change requests, quality checks.
*Too heavy for chats* – more something for a later "professional profile" per project.

### Status model (for all options)

`open` → `in progress` → `done` · side paths: `blocked` (with ⏸ pointing to another reference) and
`dropped` (instead of deleting, so the history is kept). Ideas are **converted** when accepted
(I3 → A7); the idea remains with the pointer "→ A7".

## 5. Implementation in cotrack

Categories are **configurable** in the tool (table `kinds`, API `POST /api/kinds`). Responsibility is already
a field of its own (`owner`). All three options can therefore be modelled without code changes; v1 is
the preset. Switching to option 2 would mean: create kinds D, R, P (L), set A to "responsibility free",
deactivate T/W for new entries. Existing references stay valid.

## 6. Open questions to you (T4)

1. **Schema:** option 1, 2 or 3?
2. **Decisions:** a kind of their own (D) with a recorded outcome – or do they stay to-dos?
3. **Warnings:** separate risk and problem (R/P) – or keep a common W?
4. **Lessons (L):** wanted? Per project or across projects?
5. **Due date/priority:** mandatory, optional or not at all?
6. **Letters:** English (A/D/I/R/P/L) or German (A/E/I/R/P/L)?
7. **Declined ideas:** delete (as before) or keep as "dropped"?
8. **Owners:** are "You" and "AI" enough – or should further people, or Claude and ChatGPT separately, appear?

## 7. State of the discussion (4 November)

**Decided**
- Ideas are shown in the footer with 💡 instead of "Ideen:" (implemented).
- "Du:" and "KI:" stay as groups in the footer. No emojis for owners: two letters are clearer.
- Decisions get a category of their own, separate from actions.
- The categories are to be sharpened (so not option 1). How exactly is still open.

**Recommendation after follow-up questions**
- **No separate P (problem).** A problem that has already occurred almost always turns immediately into an
  action in a chat ("deployment fails" → A "fix deployment") or into a decision.
  The separation only pays off in large projects with their own issue register. Therefore **⚠ W** stays for everything
  that is *not yet* an action but has to be watched or knowingly accepted.
  - Typical W/risk: "token is in the chat history – could be misused", "free tier may not be enough".
  - Typical problem: "Codex found an error", "build is red". That becomes an A directly.
- **Lessons (L) not in the footer.** They are useful at the end of a piece of work (handover), not at every
  step. Possible implementation: at handover cotrack asks "what do we take with us?" and stores it
  across projects, but does not show it in the chat.

**Numbering** (decided: stays per category)
- Today every category counts on its own: T4, A4 and I4 can exist at the same time.
- When the category changes (an idea is accepted, an action moves from the AI to you) a new number is created.
- Alternative: **one running number per project** for all categories. The letter only shows the current state:
  💡 I7 becomes A7 when accepted, the number stays. "7" then always means the same item.
  Drawback: numbers grow faster and have gaps per category (A1, I2, W3, A4 …).

## 8. Requirement: several sessions, few tokens

Several conversations work on the same project. Each session has to know the state without using much context.
Principles:
1. **Session start:** load only the footer (one line, about 100 tokens), if needed the short list
   (`?format=text`, one line per item, without descriptions).
2. **Details only on request:** fetch the description of a single item on demand.
3. **Reload only changes:** since the last known state (`/events?after=<id>`).
4. **Writing is cheap:** a change is a short call with a reference, e.g. "A4 done".
5. The MCP server (A2) returns the same compact text formats by default, not verbose JSON.

## 9. Decision: Methodology v2 (4 November)

| Letter | Meaning | Footer |
|---|---|---|
| **A** | Action – for you or the AI | under "Du:" or "KI:" |
| **D** | Decision – yours to make, the AI prepares | under "Du:", before the actions |
| **I** | Idea | 💡 |
| **W** | Warning/risk | ⚠ |

- Every category counts on its own (no running project number).
- No separate P (problem) and no L (lesson) in the footer.
- Existing T references stay valid; open T items were converted to A/D in cotrack.
- New prompt text: [PROMPT.en.md](PROMPT.en.md).
