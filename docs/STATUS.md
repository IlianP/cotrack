# Status

Live-Instanz: https://cotrack.ilianos1.workers.dev · Methodik: [METHODIK.md](METHODIK.md) · Prompt: [PROMPT.md](PROMPT.md) · Deployment: automatisch bei Push auf `main` (Cloudflare Workers Builds)

## Offene Punkte

_Stand: 2026-11-04 00:31 UTC · Live: https://cotrack.ilianos1.workers.dev/#cotrack_

| Kennung | Stichwort | Art | Verantwortlich | Quelle | Status |
|---|---|---|---|---|---|
| D1 | Lizenz wählen (Empfehlung: MIT) | Entscheidung | Du | https://claude.ai/code/session_01HfCCPn6UxGjGiYL4kaFeCa | offen |
| A2 | MCP-Server gemeinsam bauen (Lernprojekt) | Aufgabe | KI |  | offen |
| A6 | Schlanker Zugriff über mehrere Sessions: Kurzformat, Delta seit letztem Stand, MCP mit kompakten Antworten | Aufgabe | KI | docs/METHODIK.md#8 | in Arbeit |
| A7 | README final überarbeiten, sobald Methodik v2 steht | Aufgabe | KI |  | offen |
| A8 | Zugangstokens im Passwortmanager ablegen; KI-Token als Secret in der Claude-Umgebung hinterlegen | Aufgabe | Du |  | offen |
| A9 | Pull Request prüfen und mergen | Aufgabe | Du | https://github.com/IlianP/cotrack/pull/1 | offen |
| A10 | Benutzerdefinierten Prompt (Claude & ChatGPT) auf Methodik v2 umstellen | Aufgabe | Du | https://github.com/IlianP/cotrack/blob/claude/vibrant-archimedes-0soxxj/docs/PROMPT.md | offen |
| I2 | Sync STATUS.md ↔ cotrack und Import der offenen Punkte aus festival-workshop-planner und inklusion-durch-sprache | Idee |  |  | offen |
| I3 | Echte Live-Updates per Durable Objects + WebSocket statt 4-Sekunden-Polling | Idee |  |  | offen |
| I4 | UI-Varianten mit Claude Design entwerfen | Idee |  |  | offen |
| I5 | Benutzerdefinierten Prompt (Claude & ChatGPT) um cotrack-Anbindung ergänzen | Idee |  |  | offen |
| I6 | Vorschau-Deploys pro Pull Request (Workers Builds Previews), eigene Test-Datenbank | Idee |  |  | offen |
| W1 | Zugriffsschutz: nur Token-Auth, kein Login/Rollen | Warnung |  |  | offen |
| W3 | Tokens stehen im Chatverlauf – nach der Testphase rotieren | Warnung |  |  | offen |

_Die Liste wird in cotrack gepflegt; dieser Abschnitt ist ein Export (Menü → „Offene Punkte“ kopieren)._
