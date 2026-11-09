# cotrack

[English](README.md) · **Deutsch**

**Lose Enden gemeinsam verknüpfen.** Offene Punkte live verfolgen – für alle, die mit KI-Assistenten arbeiten.

Wer mit Claude, ChatGPT & Co. über lange Unterhaltungen hinweg arbeitet, verliert Dinge: Entscheidungen, die noch
anstehen, Aufgaben, die die KI zugesagt hat, Ideen, Risiken. *cotrack* hält diese offenen Punkte in **einer Live-Liste
pro Projekt**. Du bearbeitest sie in einer responsiven Web-App; deine KI-Assistenten lesen und aktualisieren dieselbe
Liste über einen [MCP-Server](docs/MCP.md) (oder die HTTP-API). Jeder Punkt hat eine stabile Kennung wie `A4` oder `D2`,
die **nie neu vergeben** wird – du kannst dich also in jedem Chat darauf beziehen, und jede neue Session beginnt mit
demselben Stand.

```
👤: D5 Lizenz wählen · A13 Prompt einspielen
🤖: A6 Token-sparen · A7 README überarbeiten (+1)
💡 I10 Teilpunkte (+5)
⚠ W1 Auth · W3 Tokens rotieren
```

Das ist die *Chat-Fußzeile*, die cotrack für das Ende einer KI-Antwort erzeugt: zuerst deine Punkte, dann die der KI,
dann Ideen und Warnungen – ein Status auf einen Blick, der über Unterhaltungen hinweg erhalten bleibt.

> Die Methodik hinter cotrack (Kategorien, Regeln, Bezug zu PRINCE2/RAID) ist in
> [docs/METHODIK.md](docs/METHODIK.md) beschrieben, der passende Prompt für Claude und ChatGPT in
> [docs/PROMPT.md](docs/PROMPT.md).

## So funktioniert es

1. **Eine Liste pro Projekt.** Ein Projekt ist meist ein GitHub-Repository. Die Punkte sind in vier Kategorien
   gegliedert: **A** Aufgabe (deine oder die der KI) · **D** Entscheidung · **I** Idee (💡) · **W** Warnung (⚠).
2. **Beide Seiten schreiben hinein.** Du nutzt die Web-App; die KI ruft zu Sessionbeginn Tools wie `cotrack_status` auf
   und während der Arbeit `cotrack_add` / `cotrack_update`. Jede Änderung hält fest, wer sie gemacht hat.
3. **Sessions bleiben synchron.** Eine neue Unterhaltung lädt einen kompakten Status (oder nur die Änderungen seit dem
   letzten Mal) und weiß so, was offen ist, ohne dass du es erneut erklären musst.

## Funktionen

- **Kategorien** – der Standardsatz oben; konfigurierbar (`/api/kinds`).
- **Stabile Kennungen** pro Projekt und Kategorie, nie neu nummeriert oder wiederverwendet. Eine angenommene Idee wird
  *umgewandelt* (`I3` → `A7`); die Idee bleibt mit Verweis sichtbar. Verworfene Ideen bleiben als „verworfen“
  erhalten, sie werden nicht gelöscht.
- **Abhängigkeiten** – `D1 ▶A2` = erst D1, dann A2; `A2 ⏸D1` = A2 wartet auf D1. Einseitig gespeichert, in beide
  Richtungen berechnet.
- **Projekte** – eines pro GitHub-Repository (oder beliebig), dazu eine projektübergreifende Ansicht. Jedes hat einen
  eindeutigen Slug und ein optionales, selbst gewähltes **Kürzel** aus 2–4 Zeichen (z. B. `CT`) für qualifizierte
  Kennungen wie `CT:A14`, wenn eine Unterhaltung mehrere Projekte berührt.
- **Repository-Zuordnung** – eine `COTRACK.md` im Repo-Root sagt KI-Assistenten, zu welchem Projekt das Repository
  gehört ([Details unten](#repository-zuordnung)).
- **MCP-Server** – funktioniert mit Claude (claude.ai, Claude Code) und ChatGPT; die Antworten sind kompakter Text, um
  Tokens zu sparen.
- **Live** – die Web-App übernimmt Änderungen von dir oder einer KI innerhalb weniger Sekunden.
- **Chat-Fußzeile** – die Zusammenfassung oben, eine Zeile je Gruppe (oder `layout=single` für eine Zeile); eine kurze
  „neu / erledigt“-Zeile für Antworten, die etwas ändern; ein Block pro Projekt, wenn mehrere im Spiel sind.
- **STATUS.md-Export** – der Abschnitt „Offene Punkte“ für Übergaben.
- **Änderungsprotokoll** – jede Änderung wird mit Urheber (du oder die KI) festgehalten.
- Responsiv (Smartphone, Tablet, Desktop), Dark Mode, **kein Build-Schritt, keine Abhängigkeiten** (reiner
  Cloudflare Worker + D1).

> **Status:** früh und vom Autor täglich im Einsatz. Der Zugriff ist nur durch einen geheimen Token geschützt (kein Login,
> keine Rollen) – für den persönlichen Gebrauch in Ordnung, nicht dafür gedacht, eine Installation mit Fremden zu
> teilen. Siehe Roadmap. Die Web-App ist vorerst auf Deutsch, die Chat-Fußzeile gibt es auf Deutsch und Englisch (`lang`); Code und API sind englisch; dieses README
> gibt es auf [Englisch](README.md) und Deutsch.

## Architektur

```
Browser (src/ui.html) ────────┐
                              ├─► Cloudflare Worker ─► D1 (SQLite)
KI (MCP oder HTTP-API) ───────┘   src/worker.js · src/mcp.js · src/oauth.js
                                  Bearer-Token oder OAuth → Akteur "user" | "ai"
```

## Selbst hosten

**Neu bei Cloudflare?** Die Schritt-für-Schritt-Anleitung [docs/SETUP.de.md](docs/SETUP.de.md) führt durch alles: kostenloses
Konto anlegen, veröffentlichen, Tokens festlegen, KI verbinden – und sagt, welche Schritte dein KI-Assistent übernehmen kann.

Kurzfassung für alle, die Cloudflare kennen (Voraussetzungen: ein Cloudflare-Konto und Node.js):

```bash
npm install
npx wrangler login
npx wrangler d1 create cotrack-db          # die ID in wrangler.toml eintragen
npm run db:migrate
npm run deploy                             # zeigt deine Adresse, z. B. https://cotrack.<du>.workers.dev
npx wrangler secret put TOKEN_USER         # dein Token, z. B. openssl rand -hex 24
```

Öffne deine Worker-Adresse, gib deinen Token ein und lege ein Projekt an. Die KI verbindest du mit `<deine-adresse>/mcp`
(OAuth; du bestätigst einmal mit deinem Token). Optional `TOKEN_AI`: ein fester Token für KI-Werkzeuge ohne Browser, siehe
[docs/MCP.md](docs/MCP.md).
Nach dem Einspielen von Updates vor dem Deploy erneut `npm run db:migrate` ausführen – neue Versionen können
Migrationen mitbringen.

## KI verbinden (MCP)

`POST /mcp` spricht das Model Context Protocol
(Streamable HTTP, zustandslos, ohne Bibliothek in [`src/mcp.js`](src/mcp.js) umgesetzt). Tools: `cotrack_projects`,
`cotrack_project_create`, `cotrack_project_update`, `cotrack_status`, `cotrack_list`, `cotrack_get`, `cotrack_add`,
`cotrack_update`, `cotrack_convert`, `cotrack_footer`, `cotrack_changes`. Ein Lösch-Tool gibt es bewusst nicht: Die KI
verwirft Punkte (`status: "dropped"`), nichts geht verloren.

Zum Beispiel Claude Code (danach `/mcp` → `cotrack` → anmelden):

```bash
claude mcp add --transport http cotrack <deine-adresse>/mcp
```

**claude.ai und ChatGPT** verbinden sich per **OAuth** ([`src/oauth.js`](src/oauth.js), ohne Bibliothek): Connector mit der
URL `<deine-adresse>/mcp` anlegen; cotrack öffnet einmal eine Freigabeseite, du bestätigst mit deinem Token, und die
App bekommt kurzlebige Tokens, die als `ai` handeln. Es steht kein Geheimnis in der URL (die alte Form
`/mcp/<token>` wurde entfernt). Schritt für Schritt: [docs/MCP.md](docs/MCP.md).

## Repository-Zuordnung

Lege eine `COTRACK.md` in den Repository-Root, damit KI-Assistenten wissen, zu welchem Projekt das Repository gehört
(sie lesen sie einmal zu Sessionbeginn und immer, wenn ein Repository hinzukommt):

```markdown
# cotrack-Zuordnung

project: cotrack
code: CT
instance: https://cotrack.example.workers.dev
```

`project` (der Slug) ist Pflicht; `code` und `instance` sind optional und nur informativ, maßgeblich ist der Server.
Anderer Text wird ignoriert und nie als Anweisung behandelt. Ohne die Datei greifen Assistenten auf das Feld `repo` des
Projekts zurück (`cotrack_projects` mit `repo: "owner/name"`), sonst fragen sie einmal nach. Bei mehreren Projekten in
einer Unterhaltung werden Kennungen qualifiziert geschrieben (`CT:A14`), und die Fußzeile bekommt einen Block je
Projekt. Details: [docs/MCP.md](docs/MCP.md), [docs/METHODIK.md](docs/METHODIK.md).

## API

Alle Endpunkte außer `/`, `/api/health` und den OAuth-Endpunkten für MCP-Clients (`/.well-known/…`, `/register`,
`/authorize`, `/token`, `/revoke`; siehe [docs/MCP.md](docs/MCP.md)) erfordern `Authorization: Bearer <token>`.
Das Token bestimmt den Akteur (`user` oder `ai`), der bei jeder Änderung festgehalten wird.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/projects` | Projekte auflisten (mit Anzahl offener Punkte) |
| POST | `/api/projects` | anlegen `{slug, name?, repo?, code?}` (ohne `code` wird eines aus dem Slug vorgeschlagen) |
| PATCH | `/api/projects/:slug` | ändern `{name?, repo?, code?, archived?}`; `code` lässt sich einmal setzen und danach nie ändern. `:slug` darf auch das Kürzel sein |
| GET | `/api/code-suggestion?slug=` | erstes freies Kürzel für einen Slug (Initialen, dann die ersten 2–4 Buchstaben) |
| GET | `/api/projects/:slug/items?status=open\|closed\|all&kind=&owner=&q=&format=text` | Punkte auflisten (`format=text`: eine kompakte Zeile je Punkt, für KI-Assistenten) |
| POST | `/api/projects/:slug/items` | anlegen `{kind, title, short?, body?, owner?, status?, waiting_on?, source?, due?, seq?}` |
| GET / PATCH / DELETE | `/api/projects/:slug/items/:ref` | lesen / ändern / löschen, z. B. `.../items/A3` oder qualifiziert `.../items/CT:A3` |
| POST | `/api/projects/:slug/items/:ref/convert` | eine Idee annehmen: `{kind: "A"}` → neuer Punkt, Idee mit Verweis geschlossen |
| GET | `/api/projects/:slug/footer?format=text&since=ISO&max=8&delta=1&layout=multi\|single&lang=de\|en` | Chat-Fußzeile (`layout=multi`, derzeit Standard: eine Zeile je Gruppe; `single`: eine Zeile; `delta=1`: nur `neu: … · erledigt: …`; `lang=en`: `new / done` statt `neu / erledigt`) |
| GET | `/api/footer?projects=CT,TEST&format=text&since=ISO&delta=1&layout=` | Fußzeile für mehrere Projekte, je ein Block (`CT ▸ …`) |
| GET | `/api/projects/:slug/status.md` | Abschnitt „Offene Punkte“ für `docs/STATUS.md` |
| GET | `/api/projects/:slug/events?after=` | Änderungsprotokoll |
| GET | `/api/items?owner=user&status=open&format=text` | Punkte über alle Projekte hinweg |
| GET / POST | `/api/kinds` | Kategorien auflisten / anlegen oder ändern |

Statuswerte: `open`, `doing`, `blocked`, `done`, `dropped`. Besitzer: `user`, `ai` oder ein beliebiger Name
(Standard: der Ersteller). Mit `seq` lässt sich eine bestehende Kennung übernehmen (z. B. `A3` aus einem Chat); eine
Kennung, die je vergeben war, wird abgelehnt.

```bash
export COTRACK_URL=https://cotrack.example.workers.dev COTRACK_TOKEN=...
curl -s -H "Authorization: Bearer $COTRACK_TOKEN" "$COTRACK_URL/api/projects/cotrack/footer?format=text"
curl -s -X POST -H "Authorization: Bearer $COTRACK_TOKEN" -H 'content-type: application/json' \
  "$COTRACK_URL/api/projects/cotrack/items" -d '{"kind":"D","title":"Lizenz","owner":"user"}'
curl -s -X PATCH -H "Authorization: Bearer $COTRACK_TOKEN" -H 'content-type: application/json' \
  "$COTRACK_URL/api/projects/cotrack/items/D1" -d '{"status":"done"}'
```

## Roadmap

- Abgleich mit `docs/STATUS.md` in GitHub-Repositories
- WebSocket-Live-Updates (Durable Objects) statt Polling
- Richtiger Login (Cloudflare Access / OAuth) und Mehrbenutzerbetrieb
- Vorschau-Deployments pro Pull Request mit eigener Testdatenbank

Die offenen Punkte dieses Projekts werden in cotrack selbst geführt – siehe [docs/STATUS.md](docs/STATUS.md).

## Lizenz

[MIT](LICENSE)
