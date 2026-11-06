# cotrack als MCP-Server

## Was ist MCP?

Das **Model Context Protocol** ist eine Steckdose für KI-Assistenten. Ein MCP-Server beschreibt eine Handvoll
**Werkzeuge** (Name, Zweck, Parameter). Claude, ChatGPT & Co. lesen diese Beschreibungen und rufen die Werkzeuge
selbstständig auf, wenn es passt – ohne dass jemand `curl`-Befehle schreiben muss.

Technisch sind das nur JSON-Nachrichten (JSON-RPC 2.0), die per HTTP an **eine** Adresse geschickt werden:

| Schritt | Nachricht des KI-Clients | Antwort von cotrack |
|---|---|---|
| 1. Handschlag | `initialize` | Protokollversion, Name, kurze Gebrauchsanweisung (`instructions`) |
| 2. Werkzeugliste | `tools/list` | die 9 Werkzeuge unten, mit Parametern |
| 3. Benutzung | `tools/call` mit Name + Argumenten | kurzer Text, z. B. `A11 angelegt: …` |

Der ganze Server steht in [`src/mcp.js`](../src/mcp.js) (ohne Bibliothek, gut lesbar).

## Werkzeuge

| Werkzeug | Zweck | liest/schreibt |
|---|---|---|
| `cotrack_projects` | Projekte (Slug, Kürzel, Repository) mit Anzahl offener Punkte; mit `repo` nur das Projekt zu diesem Repository | liest |
| `cotrack_status` | Session-Start: Fußzeile + offene Punkte + Stand-Nummer | liest |
| `cotrack_list` | gefilterte Liste (Status, Kategorie, Zuständigkeit, Suche) | liest |
| `cotrack_get` | ein Punkt mit Beschreibung | liest |
| `cotrack_add` | neuen Punkt anlegen | schreibt |
| `cotrack_update` | ändern, abschließen (`done`), verwerfen (`dropped`) | schreibt |
| `cotrack_convert` | Idee zusagen → A oder D | schreibt |
| `cotrack_footer` | nur die Fußzeile; mehrere Projekte (Komma) = ein Block je Projekt, `delta` = nur „neu/erledigt“, `layout` = `multi` (Standard: je Gruppe eine Zeile) oder `single` | liest |
| `cotrack_changes` | nur Änderungen seit einer Stand-Nummer (spart Tokens in Folge-Sessions) | liest |

Bewusst **kein Löschen** per KI – verworfen wird mit `status: "dropped"`, damit nichts verloren geht.

Überall, wo `project` verlangt wird, geht der **Slug oder das Kürzel** (`cotrack` oder `CT`). `cotrack_get`, `cotrack_update`
und `cotrack_convert` nehmen auch eine **qualifizierte Kennung** (`ref: "CT:A4"`); `project` darf dann fehlen.

## Welches Projekt gehört zur Unterhaltung?

Das entscheidet die KI, nicht der Server: Der MCP-Server sieht nicht, welches Repository an der Unterhaltung hängt.
Damit das zuverlässig klappt, greifen drei Ebenen ineinander:

1. **`instructions` des Servers** – cotrack schickt beim Verbinden eine Gebrauchsanweisung mit, die die Zuordnung beschreibt
   (`COTRACK.md` lesen, sonst `cotrack_projects` mit `repo`, sonst nachfragen). Clients, die sie weiterreichen (Claude Code tut das),
   brauchen nichts weiter.
2. **Benutzerdefinierter Prompt** ([PROMPT.md](PROMPT.md), v2.4) – gilt in allen Chats, auch wo ein Client die Server-Anweisung
   nicht anzeigt (claude.ai, ChatGPT).
3. **Hinweis im Repository** (optional) – eine Zeile in `CLAUDE.md` bzw. `AGENTS.md`, z. B. „Offene Punkte: cotrack-Projekt siehe COTRACK.md“.
   Claude Code lädt diese Dateien von selbst; so klappt es auch ohne Prompt.

`COTRACK.md` im Repo-Root ist die Zuordnung (Vorlage im [README](../README.md#linking-a-repository)). Fehlt sie, ist das Feld `repo`
des Projekts die Rückfalllösung.

## Verbinden

Adresse: `https://cotrack.ilianos1.workers.dev/mcp`. Anmeldung mit dem **KI-Token** (`cta_…`), damit Änderungen
als „KI“ protokolliert werden.

**Claude Code** (Terminal / Cloud-Sessions, Token aus der Umgebungsvariable):
```bash
claude mcp add --transport http cotrack https://cotrack.ilianos1.workers.dev/mcp --header "Authorization: Bearer $COTRACK_TOKEN"
```

**claude.ai und ChatGPT** können in ihren Connector-Dialogen (noch) keine eigenen Header senden. Deshalb nimmt
cotrack den Token übergangsweise auch im Pfad an:
`https://cotrack.ilianos1.workers.dev/mcp/<KI-Token>`

- **claude.ai:** Einstellungen → Connectors → „Benutzerdefinierten Connector hinzufügen“ → Name `cotrack`, URL wie oben.
- **ChatGPT:** Einstellungen → Apps & Connectors → Erweitert → Entwicklermodus einschalten → „Erstellen“ →
  Name `cotrack`, URL wie oben, Authentifizierung „Keine“.

(Die Menünamen ändern sich bei beiden Apps gelegentlich.)

⚠ Die URL mit Token ist ein Passwort: nicht teilen, nicht in Screenshots zeigen. Der saubere Weg ist OAuth –
dann meldest du dich beim Verbinden einmal an, und es steht kein Geheimnis in der URL (offener Punkt W1).

## Selbst ausprobieren

```bash
curl -s https://cotrack.ilianos1.workers.dev/mcp \
  -H "Authorization: Bearer $COTRACK_TOKEN" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cotrack_status","arguments":{"project":"cotrack"}}}'
```
