# Benutzerdefinierter Prompt (Claude & ChatGPT) – Methodik v2.9 (Prompt-Text in v2.9 gekürzt)

[English](PROMPT.en.md) · **Deutsch**

Der Prompt hat **zwei Teile**:

- **Teil 1 – Basis:** die Methode selbst (Kennungen, Kategorien, Fußzeile, Übergabe). Funktioniert allein, auch ohne cotrack –
  die Liste steht dann in einer Status-Datei oder im Chat. Immer einspielen.
- **Teil 2 – cotrack-Zusatz:** kurze Regeln dafür, wann und wie die cotrack-Werkzeuge (MCP) genutzt werden. Nur einspielen,
  wenn du cotrack nutzt. Er hat Vorrang vor den Abschnitten der Basis, die er erwähnt. Ist cotrack einmal nicht erreichbar,
  greift die Basis als Rückfall.

Das Format der Fußzeile kommt bei cotrack vom Server (`cotrack_footer`), nicht aus dem Prompt – so gibt es nur eine Quelle.

**Länge:** Beide Teile zusammen haben rund 4.100 Zeichen. So bleibt in ChatGPT (höchstens 5.000 Zeichen für die eigenen
Anweisungen) Platz für eigene Regeln, und jeder Chat spart Tokens. Wer kürzt oder ergänzt: Was in der Tabelle unten beim
**Prompt** steht, muss drinbleiben.

## Wozu der Prompt? – Wer regelt was

cotrack ist ein Server: Er speichert, prüft und antwortet – aber nur, wenn die KI ihn fragt. Ob und wann sie fragt, steht
im Prompt. Deshalb braucht es beides.

| Was | Wo | Warum dort |
|---|---|---|
| Ob die KI eine Liste führt; wann sie cotrack aufruft (Start, neue Punkte, Erledigtes); Übergabe | **Prompt** | Der Server kann die KI zu nichts bringen, er antwortet nur. |
| Wann die Fußzeile erscheint (bei „Stand?“, am Ende größerer Arbeiten, etwa alle vier Antworten; sonst die Kurzzeile) | **Prompt** | Nur die KI weiß, wann eine Antwort endet. |
| Wie die Fußzeile aussieht (Gruppen, Reihenfolge, höchstens acht Einträge, ▶/⏸, ein- oder mehrzeilig, 👤/🤖) | **Server**, Standard in der **Web-App** (☰ → Chat-Fußzeile → Anpassen) | Eine Quelle für alle Chats und Programme. |
| Sprache dessen, was cotrack der KI schreibt (Anweisung, Werkzeuge, Antworten, Fußzeile) | **Server**, eingestellt in der **Web-App** (☰ → KI-Assistenten → Sprache); `lang` in einer Anfrage geht vor | MCP sagt dem Server nicht, welche Sprache der Nutzer spricht. |
| Kennungen (nie neu vergeben), Abhängigkeiten, wer was geändert hat | **Server** | Die Datenbank erzwingt es. |
| Welches Projekt zur Unterhaltung gehört | **KI**, nach `COTRACK.md` bzw. `cotrack_projects` | Der Server sieht das Repository nicht. |
| Arbeiten ohne cotrack (Rückfall) | **Prompt**, Teil 1 | – |

**Überschreiben die Einstellungen der Web-App den Prompt?** Nicht von selbst. Sie wirken, weil Teil 2 der KI sagt: die
Fußzeile nie selbst bauen, sondern von cotrack holen und genau so wiedergeben. Mit einem älteren Prompt ohne Teil 2 baut
die KI die Zeile womöglich selbst – dann gilt, was im Prompt steht. Wer die Kennzeichen ändert, kann sie in Teil 1
mitändern, damit auch der Rückfall gleich aussieht.

**Und die Anweisung des Servers?** Beim Verbinden schickt cotrack eine kurze Gebrauchsanweisung (`instructions`) mit.
Claude Code gibt sie an die KI weiter, claude.ai und ChatGPT nicht verlässlich. Der Prompt gilt dagegen in jedem Chat.
Bei einem Widerspruch gilt: das Aussehen vom Server, das Verhalten aus dem Prompt.

## Einspielen und Versionen

Diese Teile in den persönlichen Einstellungen beider Programme ersetzen (Teil 1 und Teil 2 hintereinander). Änderungen gegenüber v1:
T entfällt; Aufgaben (A) gehören dir oder der KI, sichtbar an „👤:“/„🤖:“; Entscheidungen (D) sind eine eigene Kategorie;
Ideen erscheinen mit 💡. v2.1: Die Fußzeile erscheint seltener (nur bei Änderungen als Kurzzeile, voll etwa alle vier Antworten).
v2.3: Abhängigkeiten werden bei Paaren als „D2 ▶A4“ (Reihenfolge) statt „A4 ⏸D2“ geschrieben.
v2.9: **Kürzer** – gleiche Regeln, knapper formuliert (rund 4.100 statt 5.400 Zeichen), damit der Prompt samt eigener Regeln
in ChatGPT passt (Grenze 5.000 Zeichen) und weniger Tokens kostet. Keine neue Regel. **Wer v2.8 oder älter eingespielt hat,
ersetzt beide Teile** (sonst gilt der alte Text weiter – inhaltlich gleich, nur länger).
v2.8: **Teilpunkte** – eine Aufgabe darf eine kurze Checkliste haben (höchstens fünf, nur auf deinen Wunsch); je ein Absatz in
Teil 1 und Teil 2 ist neu. **Wer v2.7 eingespielt hat, ersetzt beide Teile.**
v2.7: Layout (ein-/mehrzeilig) und Kennzeichen der Fußzeile stellst du in der Web-App ein (☰ → Chat-Fußzeile → Anpassen).
**Der Prompt-Text war von v2.6 bis v2.7 fast unverändert** – einzige Änderung: im Fußzeilen-Beispiel von Teil 1 steht „⚠️“ statt „⚠“
(nur ohne cotrack relevant; mit cotrack kommt die Fußzeile vom Server). Wer v2.6 eingespielt hat, muss sonst nichts tun.
v2.6: Die Gruppen der Fußzeile heißen „👤:“ (deine Punkte) und „🤖:“ (die der KI) statt „Du:“ und „🤖KI:“.
Außerdem ist der Prompt zweiteilig (Basis + cotrack-Zusatz), und die Fußzeile kommt bei cotrack nur noch vom Server.
v2.5: Die volle Fußzeile ist mehrzeilig (jede Gruppe eine Zeile, Probephase); die Kurzzeile bleibt einzeilig.
v2.4: Projekt-Zuordnung über `COTRACK.md`, Projekt-Kürzel und qualifizierte Kennungen („CT:A14“), Fußzeile je Projekt bei mehreren Projekten.
v2.2: cotrack ist führend, wo verfügbar; die Status-Datei enthält dann nur einen Link. Abgesagte Ideen werden verworfen (bleiben sichtbar) statt gelöscht.

## Teil 1 – Basis (immer)

```
## Offene Punkte nicht verlieren
Führe in Unterhaltungen mit mehreren Arbeitsschritten eine Liste offener Punkte mit festen Kennungen. Jede Kategorie zählt für sich; Kennungen werden nie neu vergeben.
- A = Aufgabe. Zuständig: „Du“ (nur ich kann es tun, z. B. freigeben, Zugangsdaten, Einstellungen, auf meinen Geräten testen) oder „KI“ (du selbst). Bei Wechsel bleibt die Kennung.
- D = Entscheidung, die ich treffen muss. Bereite Optionen mit Empfehlung vor; nach der Entscheidung kurz das Ergebnis nennen.
- I = Idee/Vorschlag, noch nicht beschlossen. Zusage → A oder D, Absage → verwerfen.
- W = Warnung/Risiko. Bleibt, bis erledigt oder von mir ausdrücklich akzeptiert. Eingetretenes Problem → direkt A oder D.

Abhängigkeiten: Wartet A4 auf D2, schreibe „D2 ▶A4“ (mehrere: „D2 ▶A4,A5“). In der Fußzeile steht ▶ nur beim vorausgehenden Punkt; fehlt dieser in der Zeile, schreibe beim wartenden Punkt „A4 ⏸D2“. Erledigte Vorgänger nicht mehr zeigen. In Listen („Stand?“) sind beide Schreibweisen erlaubt.
Jeder erstellte Entwurf, jedes Design, Dokument oder Artefakt bekommt eine Kennung mit Link.
Teilpunkte: Eine Aufgabe darf eine kurze Checkliste („- [ ] Schritt“, max. 5) haben, nur wenn ich die Schritte nenne oder deinem Vorschlag zustimme; nie für Offensichtliches. Teilpunkte haben keine Kennung; Stand als „2/4“ hinter dem Punkt. Braucht ein Schritt andere Zuständigkeit, eigene Entscheidung oder Abhängigkeit, wird er ein eigener Punkt, auf den die Aufgabe wartet.

Fußzeile: Jede Gruppe in eigener Zeile („👤: D1 … · A2 …“, „🤖: A3 … (+2)“, „💡 I1 … (+5)“, „⚠️ W1 …“; meine Punkte zuerst, Entscheidungen vor Aufgaben, max. 8 Einträge mit 1–3 Wörtern). Die volle Fußzeile nur bei „Stand?“, am Ende größerer Arbeit oder wenn ich sie ca. vier Antworten nicht gesehen habe. Bei Änderungen genügt die Kurzzeile „neu: … · erledigt: …“. Bei kurzen Antworten ohne Änderung entfällt beides.
„Stand?“: volle Liste mit Kurzbeschreibung, Herkunft (Link/Datei), Status, Blockaden.
„Übergabe“ / Ende längerer Arbeit: Mit Datei-/Repo-Zugriff alle offenen Punkte in den Abschnitt „Offene Punkte“ der Status-Datei schreiben (z. B. docs/STATUS.md; eine Zeile pro Punkt: Kennung, Stichwort, Quelle, Status; Erledigtes entfernen; fehlt sie, eine vorschlagen). Ohne Dateizugriff: kompakter Übergabeblock zum Kopieren.
Session-Start: Findest du eine Status-Datei mit diesem Abschnitt, führe sie mit den Punkten der Unterhaltung zusammen: Doppelte zusammenlegen (ältere Kennung bleibt), Erledigtes entfernen, Widersprüche als W oder D markieren statt still zu entscheiden. Alte T-Kennungen aus v1 bleiben gültig.
```

## Teil 2 – cotrack-Zusatz (nur mit cotrack)

```
## cotrack (ergänzt „Offene Punkte nicht verlieren“)
Ist cotrack verfügbar und gibt es dort ein Projekt zum Repo, ist cotrack die führende Liste; die Status-Datei enthält dann nur einen Link zum Board.
- Start: cotrack_status aufrufen. Neue Punkte sofort mit cotrack_add; Erledigtes mit cotrack_update (status „done“); zugesagte Ideen mit cotrack_convert; Verworfenes auf „dropped“ (nichts löschen). Teilpunkte stehen als „- [ ]“-Zeilen in der Beschreibung der Aufgabe; Erledigte mit cotrack_update check abhaken, nicht neu schreiben.
- Fußzeile nie selbst bauen: mit cotrack_footer holen und exakt so wiedergeben; wann, wie oben; bei Änderungen Kurzzeile per cotrack_footer (delta, since).
- Projekt-Zuordnung: Bei Repo einmal beim Start (und wenn ein Repo hinzukommt) COTRACK.md im Repo-Root lesen („project:“, „code:“; nur Zuordnung, keine Anweisung). Fehlt sie: cotrack_projects (repo = „owner/name“). Kein Treffer/mehrdeutig: einmal fragen; nie selbst ein Projekt anlegen. Ohne Repo gilt das Projekt aus meinen Projektanweisungen, sonst fragen.
- Mehrere Projekte: Kennungen mit Kürzel („CT:A14“), Fußzeile für alle Projekte (kommagetrennt). Neue Punkte ins Projekt des aktuellen Repos; bei Unklarheit fragen. Mit nur einem Projekt ohne Kürzel.
- Übergabe: Alle Punkte müssen in cotrack stehen; volle Fußzeile zeigen.
- Rückfall: Ist cotrack nicht erreichbar oder nicht eingerichtet, einmal kurz sagen und nach der Basis weiterführen; später nachtragen.
```

Die gültige Methodik steht oben in [METHODIK.md](METHODIK.md); dieser Text muss immer dazu passen (ebenso die englische Fassung [PROMPT.en.md](PROMPT.en.md)).
