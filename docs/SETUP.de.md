# cotrack einrichten – Schritt für Schritt

[English](SETUP.md) · **Deutsch**

Diese Anleitung bringt cotrack auf **dein eigenes, kostenloses Cloudflare-Konto**, auch wenn du noch nie mit Cloudflare
gearbeitet hast. Am Ende hast du eine eigene Adresse wie `https://cotrack.dein-name.workers.dev` und verbindest deinen
KI-Assistenten damit. Dauer: etwa 20 Minuten.

> **Deine Adresse:** Überall, wo in der Doku `<deine-adresse>` steht, setzt du die Adresse ein, die du in Schritt 7 bekommst
> (ohne Schrägstrich am Ende). Die Adresse `cotrack.ilianos1.workers.dev` in Beispielen gehört dem Autor, nicht dir.

## Abkürzung: Dein KI-Assistent übernimmt Schritt 3 bis 7

Wenn dein KI-Assistent selbst Befehle ausführen kann – z. B. **Claude Code** im Terminal – oder einen
**Cloudflare-Connector (MCP)** hat, kann er Schritt 3 bis 7 für dich erledigen. Du machst nur:

1. **Schritt 1:** Cloudflare-Konto anlegen (das kann keine KI für dich).
2. Beim **Login (Schritt 4)** im Browser auf „Allow“ klicken, wenn sich das Fenster öffnet.
3. **Schritt 6 (Tokens) selbst** erledigen – so landen deine Tokens nicht im Chatverlauf.

Beispiel für den Auftrag an deinen Assistenten:

> Richte cotrack aus https://github.com/IlianP/cotrack auf meinem Cloudflare-Konto ein, genau nach docs/SETUP.de.md,
> Schritt 3, 4, 5 und 7. Lass Schritt 6 (Tokens) aus, den mache ich selbst. Sag mir am Ende meine cotrack-Adresse.

Danach machst du mit Schritt 6 und 8 weiter.

## Was du brauchst

- Ein **Cloudflare-Konto** (kostenlos; Schritt 1). Eine eigene Domain brauchst du nicht.
- **Node.js** in einer aktuellen LTS-Version (20 oder neuer): <https://nodejs.org> → „LTS“ herunterladen und installieren.
- Ein **Terminal**: unter macOS „Terminal“, unter Windows „PowerShell“, unter Linux dein gewohntes Terminal.
- Optional **git**. Ohne git lädst du den Code als ZIP herunter (Schritt 2).

## 1. Cloudflare-Konto anlegen

1. <https://dash.cloudflare.com/sign-up> öffnen, E-Mail und Passwort eingeben.
2. Die Bestätigungs-E-Mail öffnen und den Link anklicken.
3. Fertig. Der kostenlose Tarif reicht für cotrack. Fragt Cloudflare nach einer Domain oder einem Tarif, kannst du das
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

## 6. Zwei Tokens festlegen (selbst machen)

cotrack hat kein Login mit Passwort, sondern zwei geheime Tokens. **Cloudflare erzeugt sie nicht** – du würfelst sie
selbst (Befehl unten) und hinterlegst sie dann in Schritt 7 bei Cloudflare. Es sind zwei verschiedene Werte:

| Token | Wer ihn benutzt |
|---|---|
| `TOKEN_USER` | du: Web-App und Freigabe beim Verbinden von claude.ai/ChatGPT |
| `TOKEN_AI` | KI-Assistenten, die einen festen Token brauchen (Claude Code, Skripte) |

Zwei zufällige Tokens erzeugen (zweimal ausführen, funktioniert unter macOS, Windows und Linux):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Den ersten Wert als `TOKEN_USER`, den zweiten als `TOKEN_AI` in einem **Passwort-Manager** speichern. Wer einen Token
kennt, kann deine Punkte lesen und ändern. Nutzt du nur claude.ai oder ChatGPT, brauchst du im Alltag nur `TOKEN_USER`
(Web-App und Freigabeseite); `TOKEN_AI` trotzdem anlegen, z. B. für Claude Code.

Einen Token austauschen (z. B. weil er irgendwo sichtbar war): neuen Wert würfeln und mit demselben Befehl aus Schritt 7
erneut hinterlegen. Danach den neuen Wert überall eintragen, wo der alte benutzt wurde.

Die Tokens hinterlegst du in Schritt 7, direkt nach dem ersten Deploy.

## 7. Veröffentlichen und Tokens hinterlegen

```bash
npm run deploy
```

Beim allerersten Mal fragt wrangler eventuell nach einem **workers.dev-Namen** (z. B. `dein-name`). Er wird Teil deiner
Adresse. Am Ende steht im Terminal deine Adresse, z. B.:

```
https://cotrack.dein-name.workers.dev
```

**Das ist `<deine-adresse>`.** Notiere sie dir.

Jetzt die Tokens hinterlegen. Jeder Befehl fragt nach dem Wert, dort den jeweiligen Token einfügen:

```bash
npx wrangler secret put TOKEN_USER
npx wrangler secret put TOKEN_AI
```

Ohne Terminal geht das auch im Browser: <https://dash.cloudflare.com> → **Workers & Pages** → **cotrack** → **Settings** →
**Variables and Secrets** → **Add** → Typ „Secret“, Name `TOKEN_USER` bzw. `TOKEN_AI`, Wert einfügen, speichern.

## 8. Ausprobieren und KI verbinden

1. `<deine-adresse>` im Browser öffnen, `TOKEN_USER` eingeben und ein erstes Projekt anlegen.
2. KI-Assistent verbinden (Details in [MCP.md](MCP.md)):
   - **claude.ai / ChatGPT:** Connector mit der URL `<deine-adresse>/mcp` anlegen (ohne Token). Beim Verbinden öffnet sich
     die cotrack-Freigabeseite, dort `TOKEN_USER` eingeben und „Zugriff erlauben“ wählen.
   - **Claude Code:**
     ```bash
     claude mcp add --transport http cotrack <deine-adresse>/mcp --header "Authorization: Bearer <TOKEN_AI>"
     ```
3. Den passenden Prompt einspielen: [PROMPT.md](PROMPT.md) (Teil 1 + Teil 2).

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
| Web-App sagt „unauthorized“ | Token falsch kopiert oder Schritt 7 (Tokens hinterlegen) fehlt. |
| Fehler „no such table“ | `npm run db:migrate` wurde nicht ausgeführt. |
