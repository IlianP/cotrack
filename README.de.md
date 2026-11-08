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
- **Chat-Fußzeile** – die Zusammenfassung oben, eine Zeile je Gruppe oder alles in einer Zeile – das stellst du in der
  Web-App ein (☰ → Einstellungen), ebenso die Kennzeichen 👤 / 🤖; eine kurze „neu / erledigt“-Zeile für Antworten, die
  etwas ändern; ein Block pro Projekt, wenn mehrere im Spiel sind.
- **STATUS.md-Export** – der Abschnitt „Offene Punkte“ für Übergaben.
- **Änderungsprotokoll** – jede Änderung wird mit Urheber (du oder die KI) festgehalten.
- Responsiv (Smartphone, Tablet, Desktop), Dark Mode, **kein Build-Schritt, keine Abhängigkeiten** (reiner
  Cloudflare Worker + D1).

> **Status:** früh und vom Autor täglich im Einsatz. Der Zugriff ist nur durch zwei Bearer-Tokens geschützt (kein Login,
> keine Rollen) – für den persönlichen Gebrauch in Ordnung, nicht dafür gedacht, eine Installation mit Fremden zu
> teilen. Siehe Roadmap. Die Web-App ist vorerst auf Deutsch, die Chat-Fußzeile gibt es auf Deutsch und Englisch (`lang`); Code und API sind englisch; dieses README
> gibt es auf [Englisch](README.md) und Deutsch.

## Architektur

```
Browser (src/ui.html) ────────┐
                              ├─► Cloudflare Worker ─► D1 (SQLite)
KI (MCP oder HTTP-API) ───────┘   src/worker.js · src/mcp.js
                                  Bearer-Token → Akteur "user" | "ai"
```

## Selbst hosten

cotrack läuft in **deinem eigenen Cloudflare-Konto** – einen gemeinsamen, gehosteten Dienst gibt es nicht. Der
**kostenlose Plan reicht** für den persönlichen Gebrauch: Workers Free erlaubt 100.000 Anfragen pro Tag, D1 Free 5 GB
Speicher sowie 5 Millionen gelesene und 100.000 geschriebene Zeilen pro Tag
([Workers-Limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1-Preise](https://developers.cloudflare.com/d1/platform/pricing/)). Deine Instanz bekommt eine kostenlose Adresse wie
`https://cotrack.<deine-subdomain>.workers.dev`.

Du brauchst:

- ein [Cloudflare-Konto](https://dash.cloudflare.com/sign-up),
- entweder **Node.js 22+** auf deinem Rechner (Weg A) oder nur ein **GitHub-Konto** (Weg B, alles im Browser),
- zwei **Tokens**, die du dir selbst ausdenkst: `TOKEN_USER` für dich (Web-App) und `TOKEN_AI` für deine KI-Assistenten
  (ihre Änderungen werden als „KI“ protokolliert). Nimm lange Zufallsfolgen (32+ Zeichen), z. B. `openssl rand -hex 24`
  oder einen Passwort-Manager.

### Weg A – Terminal

```bash
git clone https://github.com/IlianP/cotrack.git && cd cotrack
npm install
npx wrangler login                    # im Browser bei Cloudflare anmelden
npx wrangler d1 create cotrack-db     # gibt eine database_id aus …
#   … die in wrangler.toml eintragen: [[d1_databases]] → database_id
npm run db:migrate                    # legt die Tabellen in deiner Datenbank an
npx wrangler secret put TOKEN_USER    # deinen Token einfügen
npx wrangler secret put TOKEN_AI      # den Token der KI einfügen
npm run deploy                        # gibt deine URL aus
```

### Weg B – nur im Browser (GitHub + Cloudflare-Dashboard)

1. Dieses Repository auf GitHub **forken**.
2. **Datenbank:** Cloudflare-Dashboard → *Storage & databases* → *D1 SQL database* → *Create database*, Name `cotrack-db`.
   Die Datenbank-ID kopieren.
3. In deinem Fork **`wrangler.toml`** bearbeiten (Stift-Symbol auf GitHub): `database_id` durch deine ersetzen und
   committen.
4. **Worker:** *Workers & Pages* → *Create application* → *Import a repository* (GitHub verbinden) → deinen Fork wählen →
   Voreinstellungen lassen (der Name muss `cotrack` bleiben, wie in `wrangler.toml`) → *Save and Deploy*. Ab jetzt wird
   jeder Push in deinen Fork automatisch veröffentlicht.
5. **Tokens:** dein Worker → *Settings* → *Variables and Secrets* → *Add* → Typ *Secret*: `TOKEN_USER`, dann `TOKEN_AI`
   → *Deploy*. Secrets bleiben bei späteren Deploys erhalten.
6. **Tabellen** (einmal, und wieder, wenn ein Update eine neue Migration mitbringt): wrangler spielt die Dateien aus
   `migrations/` ein. Ohne eigenes Terminal öffnest du deinen Fork in **GitHub Codespaces** (*Code* → *Codespaces* →
   *Create codespace* – ein Terminal im Browser) und führst aus:
   ```bash
   npm install
   npx wrangler login --device         # Anmeldung per Code (kein lokaler Browser nötig)
   npm run db:migrate
   ```
   Bitte die Migrationsdateien nicht stattdessen in die D1-Konsole kopieren: wrangler merkt sich, welche Migrationen
   gelaufen sind, die Konsole nicht – spätere Updates würden sie dann erneut ausführen und scheitern.
7. `https://cotrack.<deine-subdomain>.workers.dev` öffnen.

> **Tipp – lass die KI den Cloudflare-Teil machen.** Ist bei deinem Assistenten der
> [Cloudflare-MCP-Server](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)
> verbunden (`https://mcp.cloudflare.com/mcp`), kann er die Datenbank anlegen, die Secrets setzen und das Deployment
> prüfen. Die Schritte oben bleiben die Referenz dafür, was er tun soll (auch Schritt 6: Migrationen per wrangler).

### Erste Schritte

1. Deine URL öffnen, mit `TOKEN_USER` anmelden, ein Projekt anlegen (☰ → *Neues Projekt*).
2. Deine KI mit `TOKEN_AI` verbinden – siehe [KI verbinden](#ki-verbinden-mcp).
3. Den benutzerdefinierten Prompt in Claude / ChatGPT einspielen: [docs/PROMPT.md](docs/PROMPT.md) –
   [wozu es ihn braucht](docs/PROMPT.md#wozu-der-prompt--wer-regelt-was), obwohl cotrack einen Server hat.
4. Optional: ☰ → *Einstellungen* – Layout der Fußzeile (eine Zeile je Gruppe oder alles in einer Zeile) und die
   Kennzeichen für deine Punkte und die der KI (Standard 👤 / 🤖).
5. Optional: eine `COTRACK.md` in deinen Repositories ([siehe unten](#repository-zuordnung)).

### Updates

Neue Version holen (Weg A: `git pull`; Weg B: *Sync fork* auf GitHub – Cloudflare veröffentlicht von selbst), danach
gleich `npm run db:migrate` ausführen (Weg B: im Codespace) und bei Weg A `npm run deploy`. Neue Versionen können
Migrationen mitbringen; ist nichts Neues dabei, schadet der Aufruf nicht.

## KI verbinden (MCP)

`POST /mcp` (oder `/mcp/<token>` für Clients, die keine Header senden können) spricht das Model Context Protocol
(Streamable HTTP, zustandslos, ohne Bibliothek in [`src/mcp.js`](src/mcp.js) umgesetzt). Tools: `cotrack_projects`,
`cotrack_project_create`, `cotrack_project_update`, `cotrack_status`, `cotrack_list`, `cotrack_get`, `cotrack_add`,
`cotrack_update`, `cotrack_convert`, `cotrack_footer`, `cotrack_changes`. Ein Lösch-Tool gibt es bewusst nicht: Die KI
verwirft Punkte (`status: "dropped"`), nichts geht verloren.

Zum Beispiel Claude Code:

```bash
claude mcp add --transport http cotrack https://<dein-worker>/mcp --header "Authorization: Bearer $COTRACK_TOKEN"
```

Einrichtung für claude.ai und ChatGPT: [docs/MCP.md](docs/MCP.md). Eine URL mit Token darin ist ein Passwort –
OAuth-Anmeldung steht auf der Roadmap.

Danach den **benutzerdefinierten Prompt** einspielen ([docs/PROMPT.md](docs/PROMPT.md)). Der Server antwortet nur, wenn
er gefragt wird; der Prompt sorgt dafür, dass die KI fragt – zu Beginn einer Session, bei neuen Punkten, für die
Fußzeile. Wer was regelt (Prompt, Server, Einstellungen der Web-App): [Übersicht](docs/PROMPT.md#wozu-der-prompt--wer-regelt-was).

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

Alle Endpunkte außer `/` und `/api/health` erfordern `Authorization: Bearer <token>`.
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
| GET | `/api/projects/:slug/footer?format=text&since=ISO&max=8&delta=1&layout=multi\|single&lang=de\|en` | Chat-Fußzeile (`layout=multi`: eine Zeile je Gruppe, `single`: eine Zeile – ohne `layout` gilt die Einstellung der Web-App; `delta=1`: nur `neu: … · erledigt: …`; `lang=en`: `new / done` statt `neu / erledigt`) |
| GET | `/api/footer?projects=CT,TEST&format=text&since=ISO&delta=1&layout=` | Fußzeile für mehrere Projekte, je ein Block (`CT ▸ …`) |
| GET | `/api/projects/:slug/status.md` | Abschnitt „Offene Punkte“ für `docs/STATUS.md` |
| GET | `/api/projects/:slug/events?after=` | Änderungsprotokoll |
| GET | `/api/items?owner=user&status=open&format=text` | Punkte über alle Projekte hinweg |
| GET / POST | `/api/kinds` | Kategorien auflisten / anlegen oder ändern |
| GET / PATCH | `/api/settings` | Einstellungen der Instanz `{footer_layout: "multi"\|"single", footer_label_user, footer_label_ai}` (Standard `multi`, `👤`, `🤖`); `null` oder `""` stellt den Standard wieder her; `PATCH` nur mit `TOKEN_USER` |

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

- OAuth für den MCP-Server (kein Token in der URL)
- Abgleich mit `docs/STATUS.md` in GitHub-Repositories
- WebSocket-Live-Updates (Durable Objects) statt Polling
- Richtiger Login (Cloudflare Access / OAuth) und Mehrbenutzerbetrieb
- Vorschau-Deployments pro Pull Request mit eigener Testdatenbank

Die offenen Punkte dieses Projekts werden in cotrack selbst geführt – siehe [docs/STATUS.md](docs/STATUS.md).

## Lizenz

[MIT](LICENSE)
