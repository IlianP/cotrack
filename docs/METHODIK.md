# Methodik: offene Punkte gemeinsam führen

> Arbeitsdokument zu **A3** / **T4**. Ziel: ein kleines, alltagstaugliches Schema,
> das sich an Projektmanagement-Standards (PRINCE2, PMBOK, RAID-Log) orientiert,
> ohne Chats und kleine Projekte zu überfrachten.

## 1. Ausgangslage – Schema v1 (heute im Einsatz)

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
Du: D1 Lizenz · A6 Tokens · KI: A2 ⏸D1 MCP-Server · Ideen: I2 Sync · ⚠ R1 Auth · neu: A6 · erledigt: A1
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
