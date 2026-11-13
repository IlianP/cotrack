# Methodik: offene Punkte gemeinsam führen

[English](METHODOLOGY.md) · **Deutsch**

## Gültig: Methodik v2.9 (Stand 13. November 2026)

| Kürzel | Bedeutung | Fußzeile |
|---|---|---|
| **A** | Aufgabe – für dich (Du) oder die KI; Zuständigkeit kann wechseln, Kennung bleibt | unter „👤:“ bzw. „🤖:“ |
| **D** | Entscheidung – triffst du, die KI bereitet Optionen vor; Ergebnis wird festgehalten | unter „👤:“, vor den Aufgaben |
| **I** | Idee – bei Zusage wird daraus A oder D, bei Absage „verworfen“ | 💡 |
| **W** | Warnung/Risiko – bleibt bis erledigt oder ausdrücklich akzeptiert; eingetretene Probleme werden zu A/D | ⚠️ |

- **Nummerierung:** je Kategorie, nie neu vergeben.
- **Abhängigkeiten:** gespeichert wird nur „A4 wartet auf D2“. Angezeigt wird die Reihenfolge: **„D2 ▶A4“** (D2 zuerst, dann A4),
  bei mehreren „D2 ▶A4,A5“. In der Fußzeile steht ▶ bei Paaren nur am vorausgehenden Punkt; **„A4 ⏸D2“** nur, wenn D2 nicht
  in der Zeile steht. Erledigte Vorgänger verschwinden aus der Anzeige. Der Nachfolger wird berechnet, nicht gepflegt.
- **Teilpunkte (v2.8, Entscheidung D16):** Eine Aufgabe (A) darf eine kurze Checkliste haben – Zeilen `- [ ] Schritt` /
  `- [x] Schritt` in der Beschreibung. Teilpunkte bekommen **keine eigene Kennung**, keinen eigenen Status, keine Zuständigkeit
  und keine Abhängigkeit; angezeigt wird nur der Stand („A17 Post 2/4“ in der Fußzeile, ohne Klammern – „(+7)“ bleibt den
  ausgeblendeten Punkten vorbehalten). Leitplanken gegen Überzerlegung:
  - Sinnvoll nur bei **2–5 nicht offensichtlichen Schritten** derselben Zuständigkeit, wenn die Aufgabe über mehrere Sessions
    läuft und der Zwischenstand interessant ist. Nie für Selbstverständliches („Code, Test, PR“), nie bei I, D oder W.
  - **Höchstens fünf**; der Server lehnt mehr als acht ab.
  - Die KI legt Teilpunkte **nicht von sich aus** an: nur, wenn du die Schritte nennst oder ihrem Vorschlag zustimmst. Abhaken
    darf sie selbst (`cotrack_update` mit `check`), sobald ein Schritt erledigt ist.
  - **Eigener Punkt statt Teilpunkt**, wenn ein Schritt eine andere Zuständigkeit hat, eine eigene Entscheidung ist, einen
    anderen Punkt blockiert oder auf einen wartet oder einzeln zitiert werden muss: dann A/D mit „wartet auf“; in der
    Checkliste bleibt höchstens ein Verweis („→A60“).
  - Das letzte Häkchen schließt die Aufgabe nicht automatisch, und eine Aufgabe darf mit offenen Häkchen abgeschlossen werden.
    Ein Häkchen gilt nicht als „erledigt“ in der Kurzzeile. Bei `/convert` (I → A) wandert die Liste mit.
- **Fußzeile:** voll nur bei „Stand?“, am Ende größerer Arbeiten oder etwa alle vier Antworten;
  bei Änderungen nur die Kurzzeile „neu: … · erledigt: …“; sonst gar nichts.
- **Gruppenzeichen (v2.6):** In der Fußzeile steht `👤:` für deine Punkte und `🤖:` für die der KI (statt „Du:“ und „🤖KI:“) –
  sprachunabhängig, kürzer. Die Zuständigkeit heißt im Text weiter „Du“ und „KI“. Seit v2.7 lassen sich die Kennzeichen in
  der Web-App ändern (☰ → Chat-Fußzeile → Anpassen, z. B. zurück auf „Du“/„KI“); 👤/🤖 bleibt der Standard.
- **Fußzeile mehrzeilig (v2.5, Probephase):** Die volle Fußzeile hat je Gruppe eine eigene Zeile (`👤:`, `🤖:`, `💡`, `⚠️`),
  danach bei Bedarf die Zeile „neu: … · erledigt: …“. Das ist vorerst der Standard, um die Übersicht auszuprobieren;
  einzeilig gibt es weiter mit `layout=single`. Die Kurzzeile bleibt immer einzeilig. Seit v2.7 wählst du den Standard
  selbst in der Web-App (☰ → Chat-Fußzeile → Anpassen, gespeichert in cotrack); ein `layout` im einzelnen Aufruf geht vor.
  Eine neue Installation startet mehrzeilig.
- **Wer regelt was (v2.7):** Der **Prompt** regelt das Verhalten der KI (ob und wann sie cotrack nutzt, wann die Fußzeile
  erscheint, Rückfall ohne cotrack). Der **Server** regelt, was er selbst durchsetzen kann (Kennungen, Protokoll, Aussehen
  der Fußzeile). Die **Einstellungen der Web-App** geben den Standard für dieses Aussehen vor. Sie überschreiben den Prompt
  nicht, sondern wirken, weil der cotrack-Zusatz im Prompt die Fußzeile an den Server übergibt. Übersicht:
  [PROMPT.md → Wozu der Prompt?](PROMPT.md#wozu-der-prompt--wer-regelt-was)
- **Führende Liste:** cotrack (Web-App + MCP-Connector). Die `docs/STATUS.md` eines Repositorys enthält nur einen Link
  zum Board, damit niemand bei jeder Änderung eine Datei pushen muss. Ohne cotrack gilt weiter die Liste in `STATUS.md`.
- **Projekt-Kürzel (v2.4):** Jedes Projekt hat einen eindeutigen Slug (Identität) und optional ein **Kürzel** aus 2–4 Zeichen
  (zwei Buchstaben, dann Buchstaben oder Ziffern), das du selbst wählst; ohne Wunsch wird eines aus dem Slug vorgeschlagen.
  Es wird nur einmal festgelegt und nie geändert. Damit gibt es die **qualifizierte Kennung `CT:A14`**; `A14` allein bleibt gültig,
  solange nur ein Projekt im Gespräch ist.
- **Zuordnung Unterhaltung → Projekt (v2.4):** Die KI bestimmt sie, nicht der Server. Reihenfolge: (1) `COTRACK.md` im Repo-Root
  (`project:`/`code:`), einmal beim Start und wenn ein Repository hinzukommt; (2) `cotrack_projects` mit dem Repository
  (`owner/name`); (3) ohne Repository das Projekt aus den Projektanweisungen; (4) sonst einmal nachfragen. Nie selbst ein Projekt anlegen.
- **Mehrere Projekte in einem Gespräch (v2.4):** Kennungen im Text mit Kürzel (`CT:A14`); die Fußzeile bekommt je Projekt einen Block:
  einzeilig `CT ▸ 👤: … · 🤖: …`, mehrzeilig eine Zeile `CT ▸` und darunter die Gruppenzeilen. Bei Änderungen nur Projekte mit Änderungen. Neue Punkte gehören zum Projekt des Repos,
  an dem gerade gearbeitet wird; bei Unklarheit fragen. Abhängigkeiten über Projektgrenzen gibt es vorerst nicht.
- **PrioFlow (optional, Skill):** Statt selbst aus der Liste auszuwählen, rufst du den Skill `prioflow` auf. Das Modell
  bewertet die offenen Punkte (macht andere frei, schnell erledigt, Frist und Alter, Wirkung aufs Projektziel; Warnungen
  als Gewicht), schlägt die drei nächsten vor und führt dich der Reihe nach durch, bis du „Stopp“ sagst. Die Bewertung
  macht das Modell, nicht der Server – so lassen sich Modell und Denkaufwand frei wählen. Kein Teil des Prompts:
  [skills/de/prioflow/SKILL.md](../skills/de/prioflow/SKILL.md).
- **Nicht übernommen:** P (Problem), L (Erkenntnis) in der Fußzeile, fortlaufende Projektnummer.
- Der Prompt-Text dazu: [PROMPT.md](PROMPT.md) – zweiteilig: Basis (ohne cotrack nutzbar) und cotrack-Zusatz (nur mit MCP). Beide Dateien müssen immer zueinander passen – ebenso mit den englischen Fassungen
  ([METHODOLOGY.md](METHODOLOGY.md), [PROMPT.en.md](PROMPT.en.md)).
  v2.9 hat keine neue Regel: Der Prompt-Text ist nur kürzer (rund 4.100 Zeichen, passt mit eigenen Regeln unter das
  ChatGPT-Limit von 5.000 Zeichen).

---

*Die folgenden Abschnitte dokumentieren, wie es zu dieser Methodik kam (Herleitung und Diskussion).*

## 1. Ausgangslage – Schema v1 (bis 3. November)

| Kürzel | Bedeutung | Wer |
|---|---|---|
| **T** | To-do – nur der Mensch kann es tun (entscheiden, freigeben, Zugänge, Tests). Entscheidungen beginnen mit „entscheiden:“ | Du |
| **A** | Aufgabe – die KI kann sie selbst erledigen | KI |
| **I** | Idee – noch nicht beschlossen; bei Zusage → A oder T, bei Absage entfernt | – |
| **W** | Warnung/Risiko – bleibt, bis erledigt oder ausdrücklich akzeptiert | – |

Regeln: Kennungen werden nie neu vergeben · Abhängigkeiten als „A4 ⏸T2“ ·
Fußzeile am Ende jeder Antwort · Übergabe in `docs/STATUS.md` → „Offene Punkte“.

**Was gut funktioniert:** feste Kennungen, die Fußzeile als ständiger Überblick, ⏸ für Abhängigkeiten,
die klare Trennung „das musst du tun“ vs. „das mache ich“.

## 2. Schwachstellen

1. **T und A vermischen zwei Fragen.** Der Buchstabe sagt gleichzeitig *was* es ist (Aufgabe) und *wer*
   es tut (Du/KI). Folgen:
   - Wandert eine Aufgabe von der KI zu dir (z. B. weil ein Zugang fehlt), muss sie eine neue Kennung bekommen.
   - Entscheidungen verstecken sich als T mit dem Präfix „entscheiden:“; das Ergebnis der Entscheidung wird nirgends festgehalten.
2. **W mischt Risiko und Problem.** „Könnte passieren“ (Risiko) und „ist bereits passiert“ (Problem/Issue)
   werden in allen PM-Standards getrennt behandelt – unterschiedliche Reaktion, unterschiedliche Dringlichkeit.
3. **Kein Lernen über Projekte hinweg.** Erkenntnisse („Das nächste Mal früher X klären“) gehen verloren.
4. **Keine Termine/Prioritäten.** In PM-Standards hat jede Aufgabe genau *einen Verantwortlichen* und
   idealerweise *ein Fälligkeitsdatum*.
5. **Abgesagte Ideen werden gelöscht.** Damit geht verloren, *dass* und *warum* etwas verworfen wurde.

## 3. Was die Standards sagen (kurz)

- **PRINCE2** führt neben dem Plan mehrere Register/Logs: *Daily Log* (informelle Aufgaben/Notizen),
  *Issue Register* (Änderungswünsche, Abweichungen, Probleme), *Risk Register*, *Lessons Log*, *Quality Register*.
  Entscheidungen trifft die Projektleitung bzw. der Lenkungsausschuss („Manage by Exception“) –
  Prinzip „Definierte Rollen und Verantwortlichkeiten“ und „Aus Erfahrung lernen“.
- **PMBOK (PMI)** kennt *Issue Log*, *Risk Register*, *Change Log*, *Decision Log*, *Lessons Learned Register*.
- **RAID-Log** (in der Praxis am weitesten verbreitet): **R**isks, **A**ctions (oder Assumptions),
  **I**ssues, **D**ecisions (oder Dependencies) – also genau eine „leichte“ Version der obigen Register.
- **Agile/Kanban:** Ideen gehören in ein *Backlog*; Status-Spalten statt Listen; „Definition of Done“.

Gemeinsamer Nenner: **Art** (Aktion, Entscheidung, Risiko, Problem …) und **Verantwortung** (wer)
sind zwei getrennte Eigenschaften.

## 4. Vorschlag: zwei Achsen – Art × Verantwortung

### Option 1 – Minimal (v1 behalten, nur schärfen)
T/A/I/W bleiben. Nur Ergänzungen: abgesagte Ideen werden „verworfen“ statt gelöscht, optional Fälligkeit.
*Pro:* keine Umstellung. *Contra:* Schwachstellen 1–3 bleiben.

### Option 2 – Art × Verantwortung (Empfehlung)

| Kürzel | Art | Englisch | Typische Verantwortung | Entspricht |
|---|---|---|---|---|
| **A** | Aufgabe | Action | Du **oder** KI (oder eine andere Person) | RAID „Action“, PRINCE2 Daily Log |
| **D** | Entscheidung | Decision | meist Du – KI bereitet Optionen vor | RAID „Decision“, Decision Log |
| **I** | Idee | Idea | – | Backlog |
| **R** | Risiko (könnte passieren) | Risk | – | Risk Register |
| **P** | Problem (ist passiert) | Problem/Issue | – | Issue Register |
| **L** | Erkenntnis *(optional)* | Lesson | – | Lessons Log |

Die Fußzeile bleibt fast gleich – gruppiert wird weiterhin nach **Du / KI**:

```
Du: D1 Lizenz · A6 Tokens · 🤖KI: A2 ⏸D1 MCP-Server · 💡 I2 Sync · ⚠ R1 Auth · neu: A6 · erledigt: A1
```

Vorteile:
- Eine Aufgabe behält ihre Kennung, auch wenn sie den Besitzer wechselt.
- Entscheidungen bekommen beim Abschließen ein **Ergebnis** → automatisch ein Entscheidungsprotokoll.
- A, I, R, P funktionieren auf Deutsch und Englisch; offen ist nur D (Decision) vs. E (Entscheidung).

### Option 3 – Voller RAID-/PRINCE2-Umfang
Zusätzlich Annahmen (Assumptions), Abhängigkeiten (Dependencies), Änderungsanträge, Qualitätsprüfungen.
*Für Chats zu schwer* – eher etwas für ein späteres „Profi-Profil“ pro Projekt.

### Statusmodell (für alle Optionen)

`offen` → `in Arbeit` → `erledigt` · Seitenwege: `blockiert` (mit ⏸ auf andere Kennung) und
`verworfen` (statt löschen, damit die Historie erhalten bleibt). Ideen werden bei Zusage **umgewandelt**
(I3 → A7); die Idee bleibt mit Verweis „→ A7“ erhalten.

## 5. Umsetzung in cotrack

Kategorien sind im Tool **konfigurierbar** (Tabelle `kinds`, API `POST /api/kinds`). Verantwortung ist bereits
ein eigenes Feld (`owner`). Damit lassen sich alle drei Optionen ohne Code-Änderung abbilden; v1 ist
voreingestellt. Ein Wechsel auf Option 2 wäre: Arten D, R, P (L) anlegen, A auf „Verantwortung frei“ stellen,
T/W für neue Einträge deaktivieren. Bestehende Kennungen bleiben gültig.

## 6. Offene Fragen an dich (T4)

1. **Schema:** Option 1, 2 oder 3?
2. **Entscheidungen:** Eigene Art (D) mit festgehaltenem Ergebnis – oder bleiben sie To-dos?
3. **Warnungen:** Risiko und Problem trennen (R/P) – oder bleibt ein gemeinsames W?
4. **Erkenntnisse (L):** gewünscht? Pro Projekt oder projektübergreifend?
5. **Fälligkeit/Priorität:** Pflicht, optional oder gar nicht?
6. **Buchstaben:** Englisch (A/D/I/R/P/L) oder Deutsch (A/E/I/R/P/L)?
7. **Abgesagte Ideen:** löschen (wie bisher) oder als „verworfen“ behalten?
8. **Verantwortliche:** Reichen „Du“ und „KI“ – oder sollen weitere Personen bzw. Claude und ChatGPT getrennt auftauchen?

## 7. Stand der Diskussion (4. November)

**Entschieden**
- Ideen werden in der Fußzeile mit 💡 statt „Ideen:“ angezeigt (umgesetzt).
- „Du:“ und „KI:“ bleiben als Gruppen in der Fußzeile. Keine Emojis für Verantwortliche: zwei Buchstaben sind eindeutiger.
- Entscheidungen bekommen eine eigene Kategorie, getrennt von Aufgaben.
- Die Kategorien sollen geschärft werden (also nicht Option 1). Wie genau, ist noch offen.

**Empfehlung nach Rückfragen**
- **Kein eigenes P (Problem).** Ein Problem, das schon eingetreten ist, wird im Chat praktisch immer sofort
  zu einer Aufgabe („Deployment schlägt fehl“ → A „Deployment reparieren“) oder zu einer Entscheidung.
  Die Trennung lohnt sich nur in großen Projekten mit eigenem Issue-Register. Deshalb bleibt **⚠ W** für alles,
  was *noch nicht* Aufgabe ist, aber beobachtet oder bewusst akzeptiert werden muss.
  - Typisches W/Risiko: „Token steht im Chatverlauf – könnte missbraucht werden“, „Free-Tarif reicht evtl. nicht“.
  - Typisches Problem: „Codex hat einen Fehler gefunden“, „Build ist rot“. Daraus wird direkt eine A.
- **Erkenntnisse (L) nicht in der Fußzeile.** Sie sind am Ende einer Arbeit (Übergabe) nützlich, nicht in jedem
  Schritt. Mögliche Umsetzung: cotrack fragt bei der Übergabe nach „Was nehmen wir mit?“ und speichert es
  projektübergreifend, zeigt es aber im Chat nicht an.

**Nummerierung** (entschieden: bleibt je Kategorie)
- Heute zählt jede Kategorie für sich: T4, A4 und I4 können gleichzeitig existieren.
- Beim Wechsel der Kategorie (Idee wird zugesagt, Aufgabe wandert von der KI zu dir) entsteht eine neue Nummer.
- Alternative: **eine fortlaufende Nummer pro Projekt** für alle Kategorien. Der Buchstabe zeigt nur den aktuellen Zustand:
  Aus 💡 I7 wird bei Zusage A7, die Nummer bleibt. „7“ meint dann immer denselben Punkt.
  Nachteil: Die Nummern wachsen schneller und haben je Kategorie Lücken (A1, I2, W3, A4 …).

## 8. Anforderung: mehrere Sessions, wenige Tokens

Mehrere Unterhaltungen arbeiten am selben Projekt. Jede Session muss den Stand kennen, ohne viel Kontext zu verbrauchen.
Grundsätze:
1. **Session-Start:** nur die Fußzeile laden (eine Zeile, ca. 100 Tokens), bei Bedarf die Kurzliste
   (`?format=text`, eine Zeile pro Punkt, ohne Beschreibungen).
2. **Details nur auf Anfrage:** Beschreibung eines einzelnen Punkts gezielt abrufen.
3. **Nur Änderungen nachladen:** seit dem letzten bekannten Stand (`/events?after=<id>`).
4. **Schreiben ist billig:** Eine Änderung ist ein kurzer Aufruf mit Kennung, z. B. „A4 erledigt“.
5. Der spätere MCP-Server (A2) gibt standardmäßig dieselben kompakten Textformate zurück, kein ausführliches JSON.

## 9. Entscheidung: Methodik v2 (4. November)

| Kürzel | Bedeutung | Fußzeile |
|---|---|---|
| **A** | Aufgabe – für dich oder die KI | unter „Du:“ bzw. „KI:“ |
| **D** | Entscheidung – triffst du, die KI bereitet vor | unter „Du:“, vor den Aufgaben |
| **I** | Idee | 💡 |
| **W** | Warnung/Risiko | ⚠ |

- Jede Kategorie zählt für sich (keine fortlaufende Projektnummer).
- Kein eigenes P (Problem) und kein L (Erkenntnis) in der Fußzeile.
- Bestehende T-Kennungen bleiben gültig; offene T-Punkte wurden in cotrack zu A/D umgewandelt.
- Neuer Prompt-Text: [PROMPT.md](PROMPT.md).
