# cotrack einrichten – Schritt für Schritt

[English](SETUP.md) · **Deutsch**

Diese Anleitung bringt cotrack auf **dein eigenes, kostenloses Cloudflare-Konto**, auch wenn du noch nie mit Cloudflare
gearbeitet hast. Am Ende hast du eine eigene Adresse wie `https://cotrack.dein-name.workers.dev` und verbindest deinen
KI-Assistenten damit. Dauer: etwa 20 Minuten.

> **Deine Adresse:** Überall, wo in der Doku `<deine-adresse>` steht, setzt du die Adresse ein, die du in Schritt 7 bekommst
> (ohne Schrägstrich am Ende). Die Adresse `cotrack.ilianos1.workers.dev` in Beispielen gehört dem Autor, nicht dir.

## Abkürzung: Dein KI-Assistent übernimmt Schritt 3 bis 7

Wenn dein KI-Assistent selbst Befehle ausführen kann – z. B. **Claude Code** im Terminal – oder einen
**[Cloudflare-Connector (MCP)](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)** (`https://mcp.cloudflare.com/mcp`) hat, kann er Schritt 3 bis 7 für dich erledigen. Du machst nur:

1. **Schritt 1:** Cloudflare-Konto anlegen (das kann keine KI für dich).
2. Beim **Login (Schritt 4)** im Browser auf „Allow“ klicken, wenn sich das Fenster öffnet.
3. **Schritt 6 (Token) selbst** erledigen – so landet dein Token nicht im Chatverlauf.

Beispiel für den Auftrag an deinen Assistenten:

> Richte cotrack aus https://github.com/IlianP/cotrack auf meinem Cloudflare-Konto ein, genau nach docs/SETUP.de.md,
> Schritt 3, 4, 5 und 7. Lass Schritt 6 (Token) aus, den mache ich selbst; hinterlege in Schritt 7 nichts. Sag mir am Ende meine cotrack-Adresse.

Danach machst du mit Schritt 6 und 8 weiter.

## Was du brauchst

- Ein **Cloudflare-Konto** (kostenlos; Schritt 1). Eine eigene Domain brauchst du nicht.
- **Node.js** in einer aktuellen LTS-Version (22 oder neuer – das aktuelle `wrangler` braucht sie): <https://nodejs.org> → „LTS“ herunterladen und installieren.
- Ein **Terminal**: unter macOS „Terminal“, unter Windows „PowerShell“, unter Linux dein gewohntes Terminal.
- Optional **git**. Ohne git lädst du den Code als ZIP herunter (Schritt 2).

> **Kein Terminal?** Alles geht auch im Browser mit einem GitHub-Konto – siehe
> [Nur im Browser](#nur-im-browser-github--cloudflare-dashboard).

## 1. Cloudflare-Konto anlegen

1. <https://dash.cloudflare.com/sign-up> öffnen, E-Mail und Passwort eingeben.
2. Die Bestätigungs-E-Mail öffnen und den Link anklicken.
3. Fertig. Der kostenlose Tarif reicht für cotrack (Workers: 100.000 Anfragen pro Tag; D1: 5 GB, 5 Millionen gelesene und
   100.000 geschriebene Zeilen pro Tag – [Workers-Limits](https://developers.cloudflare.com/workers/platform/limits/), [D1-Preise](https://developers.cloudflare.com/d1/platform/pricing/)). Fragt Cloudflare nach einer Domain oder einem Tarif, kannst du das
   überspringen.

## 2. Code holen

Mit git:

```bash
git clone https://github.com/IlianP/cotrack.git
cd cotrack
```

Ohne git: Auf <https://github.com/IlianP/cotrack> auf **Code → Download ZIP** klicken, entpacken und im Terminal in den
entpackten Ordner wechseln (`cd` und dann den Ordner ins Terminalfenster ziehen).

## 3. Werkzeuge installieren

```bash
npm install
```

Das installiert `wrangler`, das Kommandozeilen-Werkzeug von Cloudflare. Alle folgenden Befehle laufen im Ordner `cotrack`.

## 4. Bei Cloudflare anmelden

```bash
npx wrangler login
```

Es öffnet sich ein Browserfenster: mit deinem Cloudflare-Konto anmelden und **Allow** klicken. Danach zeigt das Terminal
„Successfully logged in“.

## 5. Datenbank anlegen

```bash
npx wrangler d1 create cotrack-db
```

Die Ausgabe enthält eine Zeile wie `database_id = "1234abcd-…"`. Öffne die Datei **`wrangler.toml`** im Ordner `cotrack`
mit einem Texteditor und ersetze die vorhandene `database_id` durch deine:

```toml
[[d1_databases]]
binding = "DB"
database_name = "cotrack-db"
database_id = "1234abcd-…"   # ← deine ID aus der Ausgabe
migrations_dir = "migrations"
```

Speichern, dann die Tabellen anlegen (die Rückfrage mit `y` bestätigen):

```bash
npm run db:migrate
```

## 6. Deinen Token festlegen (selbst machen)

cotrack hat kein Login mit Passwort, sondern **einen geheimen Token** – eine lange Zufallszeichenfolge, die du dir wie ein
Passwort aufbewahrst. **Cloudflare erzeugt ihn nicht**: Du würfelst ihn selbst und hinterlegst ihn in Schritt 7 bei Cloudflare.
Du brauchst ihn für die Web-App und einmalig, wenn du einen KI-Assistenten verbindest.

Token erzeugen (funktioniert unter macOS, Windows und Linux):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Den angezeigten Wert in einem **Passwort-Manager** speichern. Wer ihn kennt, kann deine Punkte lesen und ändern.

Token austauschen (z. B. weil er irgendwo sichtbar war): neuen Wert würfeln und wie in Schritt 7 erneut hinterlegen; danach
in der Web-App mit dem neuen Wert anmelden. Verbundene KI-Assistenten bleiben verbunden.

## 7. Veröffentlichen und Token hinterlegen

```bash
npm run deploy
```

Beim allerersten Mal fragt wrangler eventuell nach einem **workers.dev-Namen** (z. B. `dein-name`). Er wird Teil deiner
Adresse. Am Ende steht im Terminal deine Adresse, z. B.:

```
https://cotrack.dein-name.workers.dev
```

**Das ist `<deine-adresse>`.** Notiere sie dir.

Jetzt den Token hinterlegen. Der Befehl fragt nach dem Wert, dort deinen Token aus Schritt 6 einfügen:

```bash
npx wrangler secret put TOKEN_USER
```

Ohne Terminal geht das auch im Browser: <https://dash.cloudflare.com> → **Workers & Pages** → **cotrack** → **Settings** →
**Variables and Secrets** → **Add** → Typ „Secret“, Name `TOKEN_USER`, Wert einfügen, speichern.

## 8. Ausprobieren und KI verbinden

1. `<deine-adresse>` im Browser öffnen, deinen Token eingeben und ein erstes Projekt anlegen.
2. In der Web-App ☰ → **KI-Assistenten → Sprache**: Deutsch ist Standard. Wer mit der KI auf Englisch arbeitet, wählt
   **EN** – dann spricht cotrack Englisch mit den KI-Assistenten (Anweisungen, Werkzeugbeschreibungen, Antworten).
3. KI-Assistent verbinden – überall nur mit der Adresse, ohne Token (Details in [MCP.md](MCP.md)):
   - **claude.ai / ChatGPT:** Connector mit der URL `<deine-adresse>/mcp` anlegen. Beim Verbinden öffnet sich die
     cotrack-Freigabeseite: deinen Token eingeben und „Zugriff erlauben“ wählen.
   - **Claude Code:**
     ```bash
     claude mcp add --transport http cotrack <deine-adresse>/mcp
     ```
     Dann in Claude Code `/mcp` eingeben, `cotrack` wählen und anmelden; im Browser erscheint dieselbe Freigabeseite.

   Der Assistent bekommt dabei eigene, kurzlebige Zugangsdaten. Deinen Token sieht er nicht, und seine Änderungen werden als
   „KI“ protokolliert.
4. Den passenden Prompt einspielen: [PROMPT.md](PROMPT.md) (Teil 1 + Teil 2) –
   [wozu es ihn braucht](PROMPT.md#wozu-der-prompt--wer-regelt-was), obwohl cotrack einen Server hat.
5. Optional: in der Web-App ☰ → **Chat-Fußzeile → Anpassen** – Layout der Fußzeile (eine Zeile je Gruppe oder alles in einer Zeile) und
   die Kennzeichen für deine Punkte und die der KI (Standard 👤 / 🤖).

## Nur im Browser: GitHub + Cloudflare-Dashboard

Ohne Node.js und Terminal – dafür brauchst du zusätzlich ein GitHub-Konto. Cloudflare baut dann direkt aus deiner Kopie des
Repositorys.

1. Cloudflare-Konto anlegen (Schritt 1) und <https://github.com/IlianP/cotrack> auf GitHub **forken**.
2. **Datenbank:** <https://dash.cloudflare.com> → **Storage & databases** → **D1 SQL database** → **Create database**, Name
   `cotrack-db`. Die Datenbank-ID kopieren.
3. In deinem Fork **`wrangler.toml`** öffnen (Stift-Symbol), `database_id` durch deine ID ersetzen und committen.
4. **Worker:** **Workers & Pages** → **Create application** → **Import a repository** (GitHub verbinden) → dein Fork. Den Namen
   `cotrack` lassen (wie in `wrangler.toml`), als Build-Befehl `npm run db:migrate` und als Deploy-Befehl `npx wrangler deploy`
   eintragen → **Save and Deploy**. Der Build legt die Tabellen an; ab jetzt wird jeder Push in deinen Fork veröffentlicht.
5. **Token:** einen langen Zufallswert (32+ Zeichen) vom Passwort-Manager erzeugen lassen und hinterlegen: **cotrack** →
   **Settings** → **Variables and Secrets** → **Add** → Typ „Secret“, Name `TOKEN_USER` → speichern. Secrets bleiben bei
   späteren Deploys erhalten.
6. Deine Adresse steht auf der Übersichtsseite des Workers. Weiter mit Schritt 8.

Updates: **Sync fork** auf GitHub – Cloudflare baut, migriert und veröffentlicht von selbst.

Meldet das Build-Protokoll, dass die Migration gescheitert ist (z. B. fehlende Berechtigung für D1), führe sie einmal aus einem
Terminal aus: `npm install`, `npx wrangler login`, `npm run db:migrate`. Ein Terminal im Browser genügt, z. B. **GitHub
Codespaces** (auf deinem Fork: **Code → Codespaces → Create codespace**; dort mit `npx wrangler login --device` anmelden).
Bitte die Migrationsdateien nicht in die D1-Konsole kopieren: Sie merkt sich nicht, welche Migrationen gelaufen sind, und spätere
Updates würden dann scheitern.

## Updates

```bash
git pull            # oder neue ZIP-Version herunterladen
npm install
npm run db:migrate  # neue Versionen können Tabellen ergänzen
npm run deploy
```

Optional kann Cloudflare bei jedem Push automatisch veröffentlichen: Repository auf GitHub forken, dann im Dashboard
**Workers & Pages → cotrack → Settings → Builds → Connect** und als Build-Befehl `npm run db:migrate`, als Deploy-Befehl
`npx wrangler deploy` eintragen.

## Wenn etwas hakt

| Meldung | Lösung |
|---|---|
| `wrangler: command not found` oder `npx` unbekannt | Node.js ist nicht installiert oder das Terminal wurde vor der Installation geöffnet – Terminal neu öffnen. |
| `Couldn't find a D1 DB with the name or binding` | Die `database_id` in `wrangler.toml` ist noch die des Autors – Schritt 5 wiederholen. |
| Web-App sagt „unauthorized“ | Token falsch kopiert oder Schritt 7 (Token hinterlegen) fehlt. |
| Fehler „no such table“ | `npm run db:migrate` wurde nicht ausgeführt. |
| npm warnt `EBADENGINE`, oder wrangler startet nicht | Node.js ist zu alt – aktuelle LTS-Version installieren (22 oder neuer). |
| „Chat-Fußzeile anpassen“ meldet „Noch nicht verfügbar … Migration“ | Nach dem Update fehlt `npm run db:migrate`. |
