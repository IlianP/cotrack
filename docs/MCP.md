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
| `cotrack_projects` | Projekte (Slug, Kürzel, Repository) mit Anzahl offener Punkte; mit `repo` nur das Projekt zu diesem Repository, mit `archived` auch archivierte | liest |
| `cotrack_project_create` | Projekt anlegen, mit deinem Slug und Kürzel (nur auf deinen Wunsch) | schreibt |
| `cotrack_project_update` | Projekt umbenennen, Repository setzen, Kürzel nachtragen, archivieren oder zurückholen (`archived`) | schreibt |
| `cotrack_status` | Session-Start: Fußzeile + offene Punkte + Stand-Nummer | liest |
| `cotrack_list` | gefilterte Liste (Status, Kategorie, Zuständigkeit, Suche) | liest |
| `cotrack_get` | ein Punkt mit Beschreibung | liest |
| `cotrack_add` | neuen Punkt anlegen | schreibt |
| `cotrack_update` | ändern, abschließen (`done`), verwerfen (`dropped`) | schreibt |
| `cotrack_convert` | Idee zusagen → A oder D | schreibt |
| `cotrack_footer` | nur die Fußzeile; mehrere Projekte (Komma) = ein Block je Projekt, `delta` = nur „neu/erledigt“, `layout` = `multi` (Standard: je Gruppe eine Zeile) oder `single` | liest |
| `cotrack_changes` | nur Änderungen seit einer Stand-Nummer (spart Tokens in Folge-Sessions) | liest |

Bewusst **kein Löschen** per KI – Punkte werden mit `status: "dropped"` verworfen, Projekte archiviert, damit nichts verloren geht.
Slug und Kürzel eines Projekts sind fest: Kennungen wie „CT:A4“ in Chats und Dokumenten bleiben so gültig.

Überall, wo `project` verlangt wird, geht der **Slug oder das Kürzel** (`cotrack` oder `CT`). `cotrack_get`, `cotrack_update`
und `cotrack_convert` nehmen auch eine **qualifizierte Kennung** (`ref: "CT:A4"`); `project` darf dann fehlen.

## Welches Projekt gehört zur Unterhaltung?

Das entscheidet die KI, nicht der Server: Der MCP-Server sieht nicht, welches Repository an der Unterhaltung hängt.
Damit das zuverlässig klappt, greifen drei Ebenen ineinander:

1. **`instructions` des Servers** – cotrack schickt beim Verbinden eine Gebrauchsanweisung mit, die die Zuordnung beschreibt
   (`COTRACK.md` lesen, sonst `cotrack_projects` mit `repo`, sonst nachfragen). Clients, die sie weiterreichen (Claude Code tut das),
   brauchen nichts weiter.
2. **Benutzerdefinierter Prompt** ([PROMPT.md](PROMPT.md), v2.6: Teil 1 Basis + Teil 2 cotrack-Zusatz) – gilt in allen Chats, auch wo ein Client die Server-Anweisung
   nicht anzeigt (claude.ai, ChatGPT).
3. **Hinweis im Repository** (optional) – eine Zeile in `CLAUDE.md` bzw. `AGENTS.md`, z. B. „Offene Punkte: cotrack-Projekt siehe COTRACK.md“.
   Claude Code lädt diese Dateien von selbst; so klappt es auch ohne Prompt.

`COTRACK.md` im Repo-Root ist die Zuordnung (Vorlage im [README](../README.de.md#repository-zuordnung)). Fehlt sie, ist das Feld `repo`
des Projekts die Rückfalllösung.

## Verbinden

Adresse: `https://cotrack.ilianos1.workers.dev/mcp`. Claude Code und Skripte melden sich mit dem **KI-Token** (`cta_…`)
im Header an, claude.ai und ChatGPT per **OAuth** (siehe unten). In beiden Fällen werden Änderungen als „KI“ protokolliert.

**Claude Code** (Terminal / Cloud-Sessions, Token aus der Umgebungsvariable):
```bash
claude mcp add --transport http cotrack https://cotrack.ilianos1.workers.dev/mcp --header "Authorization: Bearer $COTRACK_TOKEN"
```

**claude.ai und ChatGPT** verbinden sich per **OAuth** – es steht kein Geheimnis in der URL:

1. Connector anlegen mit der URL `https://cotrack.ilianos1.workers.dev/mcp` (ohne Token).
   - **claude.ai:** Einstellungen → Connectors → „Benutzerdefinierten Connector hinzufügen“ → Name `cotrack`, URL wie oben.
     Felder für OAuth-Client-ID/-Secret leer lassen – die App registriert sich selbst.
   - **ChatGPT:** Einstellungen → Apps & Connectors → Erweitert → Entwicklermodus einschalten → „Erstellen“ →
     Name `cotrack`, URL wie oben, Authentifizierung **„OAuth“**.
2. Beim Verbinden öffnet sich die cotrack-Seite „cotrack verbinden“. Dort deinen **Nutzer-Token** eingeben (derselbe wie in
   der Web-App, nicht der KI-Token) und „Zugriff erlauben“ wählen.
3. Fertig. Die App bekommt einen Zugangstoken für eine Stunde, den sie selbst erneuert (bis zu 30 Tage ohne Nutzung).
   Änderungen über den Connector werden als „KI“ protokolliert. Trennen in der App beendet die Verbindung.

(Die Menünamen ändern sich bei beiden Apps gelegentlich.)

**Übergangsweise** nimmt cotrack den KI-Token weiter auch im Pfad an: `https://cotrack.ilianos1.workers.dev/mcp/<KI-Token>`.
Diese Form wird entfernt, sobald beide Apps per OAuth verbunden sind. ⚠ Eine URL mit Token ist ein Passwort: nicht teilen,
nicht in Screenshots zeigen.

### So funktioniert die Anmeldung (OAuth 2.1)

Umgesetzt ohne Bibliothek in [`src/oauth.js`](../src/oauth.js), wie es die MCP-Spezifikation vorsieht:

| Schritt | Adresse | Zweck |
|---|---|---|
| 1 | `POST /mcp` ohne Token | Antwort `401` mit `WWW-Authenticate`: Hinweis, wo die Anmeldung beschrieben ist |
| 2 | `/.well-known/oauth-protected-resource/mcp` | welcher Anmeldedienst `/mcp` schützt |
| 3 | `/.well-known/oauth-authorization-server` | wo sich Apps registrieren, anmelden und Tokens holen |
| 4 | `POST /register` | die App registriert sich selbst (Dynamic Client Registration) |
| 5 | `/authorize` | Freigabeseite: du bestätigst mit dem Nutzer-Token; Rückgabe eines Einmal-Codes (PKCE S256 Pflicht) |
| 6 | `POST /token` | Code → Zugangstoken (1 Stunde) + Erneuerungstoken (30 Tage, bei jeder Nutzung neu) |
| 7 | `POST /revoke` | Verbindung beenden |

Gespeichert werden nur Hashes der Tokens und Codes (Migration `0005_oauth.sql`). OAuth-Tokens gelten nur für `/mcp`,
nicht für die HTTP-API und nicht im Pfad. Die festen Tokens (`TOKEN_USER`, `TOKEN_AI`) funktionieren für Claude Code und
Skripte unverändert.

## Selbst ausprobieren

```bash
curl -s https://cotrack.ilianos1.workers.dev/mcp \
  -H "Authorization: Bearer $COTRACK_TOKEN" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cotrack_status","arguments":{"project":"cotrack"}}}'
```
