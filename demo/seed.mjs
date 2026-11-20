#!/usr/bin/env node
/**
 * Demo data for a cotrack instance: four invented projects (German content) with a history of several weeks – changes by
 * you and the AI, dependencies (also across projects and one deliberate cycle), sub-items, effort and benefit (estimated
 * and confirmed), converted ideas, items shown in two projects, due dates, blocked and reopened items.
 *
 *   node demo/seed.mjs > /tmp/demo-seed.sql
 *
 * Apply the file to a DEMO database only (see demo/README.md): it starts by touching the table demo_instance, which only a
 * demo database has, so it fails right away anywhere else. Re-running resets these four projects (deletes and recreates
 * them, dates relative to now); every other project in the database stays as it is. At the end all events are renumbered
 * by time, so the change log reads in order even with projects copied in from elsewhere.
 *
 * Rows and events are written exactly as src/worker.js writes them (createItem, updateItem, convertItem): if the event
 * format changes there, change it here as well. Dependency-free, Node 18+.
 */
import { randomUUID } from "node:crypto";

/* ------------------------------------------------------------------ clock */
// A stamp "ai@26 10:05" = the AI, 26 days before today, 10:05 Berlin time. Day 0 = today; times after "now" are pulled
// back to just before now, keeping their order.
const NOW = Date.now();
const TZ = "Europe/Berlin";
const berlin = (ms) => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
const TODAY = berlin(NOW);
const offsetMin = (ms) => {
  const m = berlin(ms).timeZoneName.match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] || 0) : 0;
};
let jitter = 0;
function when(days, hm) {
  const [h, mi] = hm.split(":").map(Number);
  const local = Date.UTC(Number(TODAY.year), Number(TODAY.month) - 1, Number(TODAY.day) - days, h, mi);
  jitter++;
  return local - offsetMin(local) * 60000 + ((jitter * 37) % 60) * 1000 + ((jitter * 131) % 1000);
}
function stamp(s) {
  const m = s.match(/^(user|ai)@(\d+) (\d{1,2}:\d{2})$/);
  if (!m) throw new Error(`bad stamp: ${s}`);
  return { actor: m[1], ms: when(Number(m[2]), m[3]) };
}

/* ------------------------------------------------------------------- DSL */
const PROJECTS = [];
const project = (slug, meta, ...items) => PROJECTS.push({ slug, ...meta, items });
// it(ref, created, fields, ...[stamp, change]) – an item and what happened to it later (change = what a PATCH would send;
// { check: [n] } ticks sub-items, { convert: { ref, kind, ... } } turns an idea into an action/decision).
const it = (ref, created, fields, ...ops) => ({ ref, created, fields, ops });
// later(ref, ...ops) – what happened to an item that came from a conversion
const later = (ref, ...ops) => ({ ref, created: null, fields: null, ops });

/* --------------------------------------------------------------- content */

project("website", { name: "Website-Relaunch", code: "WEB", created: "user@40 08:55" },
  it("A1", "ai@40 09:05", { title: "Bestandsaufnahme: alle Seiten und Texte der alten Website erfassen", short: "Bestandsaufnahme",
    owner: "ai", effort: "M", benefit: "high", source: "docs/bestandsaufnahme.md",
    body: "Ziel: Liste aller Seiten mit URL, Zweck, Aufrufen (letzte 12 Monate) und Zustand der Texte.\nGrundlage für Sitemap und Weiterleitungen." },
    ["ai@40 09:30", { status: "doing" }],
    ["ai@39 15:10", { status: "done", body: "Ziel: Liste aller Seiten mit URL, Zweck, Aufrufen (letzte 12 Monate) und Zustand der Texte.\nStand: 23 Seiten erfasst, 9 davon ohne Aufrufe – Vorschlag: streichen." }]),
  it("D1", "ai@40 09:08", { title: "CMS wählen: WordPress, Astro + Decap oder Webflow?", short: "CMS-Wahl",
    body: "WordPress: vertraut, aber Wartung und Plugins.\nAstro + Decap: schnell, günstig, Texte trotzdem im Browser pflegbar.\nWebflow: schöner Editor, 20 €/Monat, Lock-in.\nEmpfehlung: Astro + Decap." },
    ["user@36 21:30", { status: "done", body: "Ergebnis: Astro + Decap CMS – schnell, günstig, Texte im Browser pflegbar.\nWordPress und Webflow verworfen (Wartung bzw. Kosten)." }]),
  it("D2", "ai@40 09:10", { title: "Hosting: Cloudflare Pages oder Netlify?", short: "Hosting",
    body: "Beide kostenlos für unsere Größe.\nCloudflare Pages: Domain und DNS ohnehin dort geplant.\nEmpfehlung: Cloudflare Pages." },
    ["ai@36 21:40", { status: "done", body: "Ergebnis: Cloudflare Pages (im Chat entschieden, 3.11.)." }]),
  it("A2", "ai@39 15:20", { title: "Sitemap und Seitenstruktur entwerfen", short: "Sitemap", owner: "ai", effort: "S", benefit: "high",
    waiting_on: "A1", source: "docs/sitemap.md",
    body: "- [ ] Hauptnavigation (max. 5 Punkte)\n- [ ] Unterseiten Leistungen\n- [ ] Footer-Seiten" },
    ["ai@38 10:20", { check: [1, 2] }],
    ["ai@38 11:00", { check: [3] }],
    ["ai@38 11:01", { status: "done" }]),
  it("I1", "user@39 20:30", { title: "Dunkelmodus für die Website", short: "Dunkelmodus", effort: "M", benefit: "low" },
    ["user@33 08:40", { status: "dropped", body: "Verworfen: passt nicht zur Marke, kaum Nutzen für Besucher." }]),
  it("I2", "ai@38 11:05", { title: "Online-Terminbuchung direkt auf der Website", short: "Terminbuchung", effort: "M", benefit: "high",
    body: "Erstgespräche (30 Min.) direkt buchbar statt E-Mail-Pingpong.\nKandidaten: Cal.com (Open Source), Calendly." }),
  it("D3", "ai@37 10:00", { title: "Farbwelt: Variante Petrol oder Terrakotta?", short: "Farbwelt", source: "Figma: Moodboard v2",
    body: "Petrol: ruhig, seriös, gut lesbar.\nTerrakotta: warm, auffällig, schwieriger bei Kontrasten.\nEmpfehlung: Petrol, Terrakotta als Akzent." },
    ["user@34 19:00", { status: "done", body: "Ergebnis: Petrol als Grundfarbe, Terrakotta nur für Buttons und Hervorhebungen." }]),
  it("A3", "ai@36 21:45", { title: "Astro-Projekt aufsetzen und auf Cloudflare Pages deployen", short: "Astro aufsetzen", owner: "ai",
    effort: "M", benefit: "high", waiting_on: "D1,D2", source: "PR #3" },
    ["ai@36 22:10", { status: "doing" }],
    ["ai@35 16:20", { status: "done" }]),
  it("A4", "ai@35 16:25", { title: "Startseite nach Figma-Entwurf umsetzen", short: "Startseite", owner: "ai", effort: "L", benefit: "high",
    waiting_on: "A3,D3", source: "Figma: Startseite v3" },
    ["ai@34 19:20", { status: "doing" }],
    ["ai@30 17:45", { status: "done", source: "PR #7" }]),
  it("A5", "ai@35 16:30", { title: "Texte für „Leistungen“ schreiben", short: "Texte Leistungen", owner: "user", effort: "L", benefit: "high",
    body: "Pro Leistung: Nutzen, Ablauf, Preisrahmen – je etwa 150 Wörter.\nDie KI liefert auf Wunsch Entwürfe aus den Stichpunkten.\n- [ ] Beratung\n- [ ] Workshops\n- [ ] Coaching\n- [ ] Preise und Ablauf" },
    ["user@30 18:05", { effort: "XL", benefit: "high", confirmed: true }],
    ["user@20 09:15", { status: "doing" }],
    ["user@15 21:40", { check: [1] }],
    ["user@6 19:30", { check: [2] }]),
  it("A6", "ai@35 16:32", { title: "Fotoshooting: Termin buchen und durchführen", short: "Fotoshooting", owner: "user", effort: "M", benefit: "high",
    body: "Portrait und Arbeitssituationen (Workshop, Beratung).\nStand: Termin am 12.11. mit Fotostudio Lindner bestätigt." },
    ["user@28 12:10", { status: "doing" }],
    ["user@8 18:20", { status: "done" }]),
  it("A7", "ai@30 10:10", { title: "Kontaktformular mit Spam-Schutz", short: "Kontaktformular", owner: "ai", effort: "S", benefit: "medium" },
    ["ai@27 15:00", { status: "done" }],
    ["user@14 08:20", { status: "open", body: "Stand: trotz Turnstile kommen Spam-Mails durch (3 am Wochenende)." }],
    ["ai@13 11:35", { status: "done", body: "Stand: Honeypot-Feld ergänzt, seit 13.11. kein Spam mehr." }]),
  it("W1", "ai@33 08:45", { title: "Alte URLs sind bei Google indexiert – ohne Weiterleitungen droht Ranking-Verlust", short: "Alte URLs",
    body: "Folge: Besucher landen auf 404, Suchtreffer gehen verloren.\nGegenmaßnahme: 301-Weiterleitungen (A10) vor dem Go-Live, danach Search Console prüfen." }),
  it("W2", "ai@33 08:50", { title: "Stockfotos der alten Seite sind nur für die alte Domain lizenziert", short: "Bildrechte",
    body: "Folge: Abmahnrisiko, wenn wir sie übernehmen.\nGegenmaßnahme: eigene Fotos (A6)." },
    ["user@8 18:25", { status: "done", body: "Erledigt durch das eigene Fotoshooting (A6)." }]),
  it("A8", "ai@28 09:00", { title: "Fotos auswählen und fürs Web zuschneiden", short: "Fotos auswählen", owner: "user", effort: "M",
    benefit: "medium", waiting_on: "A6" }),
  it("I3", "ai@29 21:10", { title: "Englische Version der Website", short: "Englisch", effort: "XL", benefit: "low" }),
  it("A9", "ai@27 08:40", { title: "Impressum und Datenschutzerklärung an die neue Adresse anpassen", short: "Impressum", owner: "ai",
    effort: "S", benefit: "high", waiting_on: "umzug:A4" }),
  it("A10", "ai@27 08:45", { title: "301-Weiterleitungen von alten auf neue URLs einrichten", short: "Weiterleitungen", owner: "ai",
    effort: "M", benefit: "high", waiting_on: "A11", source: "docs/bestandsaufnahme.md" }),
  it("A11", "ai@27 08:50", { title: "Inhalte ins neue CMS übertragen", short: "Inhalte übertragen", owner: "ai", effort: "L", benefit: "high",
    waiting_on: "A5,A8" }),
  later("I2",
    ["ai@26 10:00", { convert: { ref: "A12", kind: "A", owner: "ai", title: "Online-Terminbuchung mit Cal.com einbinden", short: "Terminbuchung" } }]),
  later("A12",
    ["ai@3 09:10", { status: "doing" }]),
  it("A13", "ai@22 14:00", { title: "Testimonials von drei Kunden einholen", short: "Testimonials", owner: "user", effort: "M", benefit: "medium",
    body: "Kurzes Zitat plus Foto oder Logo.\nKandidaten: Bäckerei Kornblume, Praxis Seidel, Verein Lichtblick." },
    ["user@21 08:10", { effort: "M", benefit: "high", confirmed: true }]),
  it("A14", "ai@22 14:05", { title: "Domain-Umzug: DNS zu Cloudflare übertragen", short: "Domain-Umzug", owner: "user", effort: "S", benefit: "high" },
    ["user@10 17:30", { status: "blocked", body: "Stand: Auth-Code beim alten Hoster angefordert (10.11.), Antwort steht aus." }]),
  it("I4", "ai@20 11:00", { title: "Kurzes Vorstellungsvideo auf der Startseite", short: "Video", effort: "M", benefit: "medium" }),
  it("A15", "ai@18 16:00", { title: "Lighthouse-Check und Bilder optimieren", short: "Lighthouse", owner: "ai", effort: "S", benefit: "medium",
    waiting_on: "A11" }),
  it("D4", "ai@18 16:05", { title: "Go-Live-Termin festlegen", short: "Go-Live-Termin", waiting_on: "A10,A15",
    body: "Sobald Inhalte, Weiterleitungen und Lighthouse-Check durch sind.\nVorschlag: ein Dienstag, nicht vor Feiertagen." },
    ["user@1 21:15", { waiting_on: "A10,A15,A9,A12,A13",
      body: "Erst wenn Weiterleitungen, Lighthouse-Check, Impressum, Terminbuchung und Testimonials stehen.\nVorschlag: ein Dienstag, nicht vor Feiertagen." }]),
  it("A16", "ai@18 16:10", { title: "Go-Live: Domain umschalten, alte Seite abschalten", short: "Go-Live", owner: "user", effort: "S",
    benefit: "high", waiting_on: "D4,A14" }),
  it("D5", "ai@16 10:30", { title: "Newsletter: Brevo oder Mailchimp?", short: "Newsletter-Tool",
    body: "Brevo: Server in der EU, bis 300 Mails/Tag kostenlos.\nMailchimp: bekannter, US-Anbieter, teurer ab 500 Kontakten.\nEmpfehlung: Brevo (Datenschutz, Kosten)." }),
  it("I5", "user@12 20:15", { title: "Blog-Bereich ausmisten", short: "Blog ausmisten", effort: "M", benefit: "low" }),
  it("I6", "ai@11 09:40", { title: "Fallstudien statt Referenzliste", short: "Fallstudien", effort: "L", benefit: "high",
    body: "Drei Projekte als kurze Geschichte: Ausgangslage, Vorgehen, Ergebnis.\nWirkt stärker als Logos." }),
  it("A17", "ai@9 10:00", { title: "Favicon und Vorschaubild für Social Media", short: "Favicon", owner: "ai", effort: "XS", benefit: "low" },
    ["ai@9 10:20", { status: "done" }]),
  it("I7", "ai@6 15:00", { title: "Barrierefreiheit mit einem Prüftool checken", short: "Barrierefreiheit", effort: "S", benefit: "medium" }),
  later("I5",
    ["ai@5 09:20", { convert: { ref: "D6", kind: "D", title: "Blog weiterführen oder einstellen?", short: "Blog?",
      body: "Weiterführen: 1 Artikel/Monat, gut für Suchmaschinen.\nEinstellen: weniger Pflege, alte Artikel als Archiv.\nEmpfehlung: einstellen, die besten 5 Artikel als Ratgeber übernehmen." } }]),
  it("A18", "ai@5 09:25", { title: "Alte Blogartikel sichten: behalten, überarbeiten, löschen", short: "Blog sichten", owner: "user",
    effort: "M", benefit: "low", waiting_on: "D6" }),
  it("W3", "ai@3 09:30", { title: "Terminbuchungs-Widget setzt Cookies – Einwilligung nötig", short: "Cookies Widget",
    body: "Folge: ohne Einwilligung nicht DSGVO-konform.\nGegenmaßnahme: Widget erst nach Klick laden (Zwei-Klick-Lösung) oder Link statt Einbettung." }),
  it("A19", "ai@0 07:20", { title: "Newsletter-Anmeldung einbauen (Double-Opt-in)", short: "Newsletter-Anmeldung", owner: "ai", effort: "S",
    benefit: "medium", waiting_on: "D5" }),
);

project("umzug", { name: "Umzug nach Leipzig", code: "UZ", created: "user@35 19:02" },
  it("A1", "ai@35 19:12", { title: "Drei Angebote von Umzugsfirmen einholen", short: "Angebote", owner: "ai", effort: "M", benefit: "high" },
    ["ai@34 11:30", { status: "doing" }],
    ["ai@33 17:45", { status: "done", source: "Angebotsvergleich.xlsx", body: "Stand: drei Angebote verglichen (1.480 €, 1.720 €, 2.150 €)." }]),
  it("D1", "ai@35 19:10", { title: "Umzug: Firma beauftragen oder selbst mit Freunden?", short: "Firma oder selbst", waiting_on: "A1",
    body: "Firma: 1.500–2.200 €, ein Tag, versichert.\nSelbst: Transporter 250 €, zwei Wochenenden, Rückenrisiko.\nEmpfehlung: Firma, Freunde nur beim Packen." },
    ["user@31 20:15", { status: "done", body: "Ergebnis: Firma (Angebot B, Kranich Umzüge), Freunde helfen beim Packen." }]),
  it("A2", "ai@35 19:14", { title: "Umzugsfirma beauftragen und Termin fixieren", short: "Firma beauftragen", owner: "user", effort: "S",
    benefit: "high", waiting_on: "D1" },
    ["user@30 09:40", { status: "done", body: "Stand: Kranich Umzüge bestätigt für Sa 14.11., 8 Uhr." }]),
  it("A3", "user@34 21:05", { title: "Kartons und Packmaterial besorgen", short: "Kartons", owner: "user", effort: "S", benefit: "medium" },
    ["user@27 18:30", { status: "done" }]),
  it("A4", "ai@33 18:00", { title: "Adresse ummelden: Bürgeramt, Bank, Versicherungen", short: "Ummelden", owner: "user", effort: "M",
    benefit: "high", also_in: "website",
    body: "Innerhalb von zwei Wochen nach dem Einzug.\n- [ ] Bürgeramt (Termin 18.11.)\n- [ ] Bank\n- [ ] Krankenkasse\n- [ ] Kfz-Versicherung\n- [ ] Arbeitgeber und Finanzamt" },
    ["user@6 08:30", { status: "doing" }],
    ["user@2 08:50", { check: [1] }],
    ["user@2 09:05", { check: [2] }],
    ["user@1 20:10", { check: [3] }]),
  it("A5", "ai@33 18:01", { title: "Nachsendeauftrag bei der Post stellen", short: "Nachsendeauftrag", owner: "user", effort: "XS", benefit: "medium" },
    ["user@20 07:50", { status: "done" }]),
  it("A6", "ai@30 09:45", { title: "Internet für die neue Wohnung bestellen", short: "Internet", owner: "user", effort: "S", benefit: "high" },
    ["user@29 12:30", { status: "done", body: "Stand: Glasfaser bestellt, Techniker-Termin 2.12." }]),
  it("I1", "user@27 19:00", { title: "Möbel über Kleinanzeigen verkaufen statt mitnehmen", short: "Möbel verkaufen" }),
  later("I1",
    ["ai@26 10:30", { convert: { ref: "A7", kind: "A", owner: "user", title: "Sofa und Kleiderschrank über Kleinanzeigen verkaufen",
      short: "Möbel verkaufen", effort: "M", benefit: "low" } }]),
  later("A7",
    ["user@16 21:00", { status: "done", body: "Stand: beides verkauft, zusammen 340 €." }]),
  it("A8", "ai@12 09:00", { title: "Alte Wohnung übergeben: Protokoll und Schlüssel", short: "Übergabe", owner: "user", effort: "M",
    benefit: "high", due: "2026-11-30" },
    ["user@11 21:30", { effort: "M", benefit: "high", confirmed: true }]),
  it("W1", "ai@12 09:05", { title: "Kaution: Rückzahlung kann bis zu sechs Monate dauern", short: "Kaution",
    body: "Folge: 2.400 € fehlen eine Weile in der Kasse.\nGegenmaßnahme: Übergabe sorgfältig protokollieren, Frist im Kalender notieren." }),
  it("A9", "ai@11 18:40", { title: "Techniker-Termin für Glasfaser wahrnehmen", short: "Techniker", owner: "user", effort: "S",
    benefit: "high", waiting_on: "A6", due: "2026-12-02" }),
  it("I2", "ai@4 20:00", { title: "Kleine Einweihungsfeier im Dezember", short: "Einweihung", effort: "S", benefit: "low" }),
);

project("adventskonzert", { name: "Adventskonzert Musikverein", code: "AK", created: "user@26 20:00" },
  it("D1", "ai@26 20:05", { title: "Konzertort: Stadthalle oder Kirche St. Marien?", short: "Konzertort",
    body: "Stadthalle: 400 Plätze, Miete 600 €, Technik vorhanden.\nSt. Marien: 250 Plätze, kostenlos, schöne Akustik, kalt.\nEmpfehlung: St. Marien." },
    ["user@22 19:45", { status: "done", body: "Ergebnis: St. Marien, So 13.12., 17 Uhr – Akustik und Atmosphäre." }]),
  it("D2", "ai@26 20:06", { title: "Eintritt: frei mit Spende oder Ticket für 12 €?", short: "Eintritt",
    body: "Frei mit Spende: mehr Publikum, Einnahmen schwer planbar.\nTicket: planbar, aber Vorverkauf nötig.\nEmpfehlung: frei, Spende für die Jugendarbeit." },
    ["user@19 20:30", { status: "done", body: "Ergebnis: Eintritt frei, Spende für die Jugendarbeit." }]),
  it("A1", "ai@26 20:07", { title: "Termin und Ablauf mit dem Pfarrbüro abstimmen", short: "Pfarrbüro", owner: "user", effort: "S",
    benefit: "high", waiting_on: "D1" },
    ["user@20 10:15", { status: "done", source: "E-Mail Pfarrbüro vom 31.10." }]),
  it("A2", "ai@25 18:00", { title: "Probenplan bis zum Konzert erstellen", short: "Probenplan", owner: "ai", effort: "S", benefit: "high" },
    ["ai@25 18:40", { status: "done", source: "Probenplan.pdf" }]),
  it("A3", "ai@21 19:30", { title: "Programmentwurf: Stücke, Reihenfolge, Moderation", short: "Programmentwurf", owner: "ai",
    effort: "M", benefit: "high" },
    ["ai@17 20:00", { status: "doing" }],
    ["ai@12 21:15", { status: "done", source: "Programm_v2.pdf" }]),
  it("I2", "user@15 22:10", { title: "Konzert auf Instagram ankündigen", short: "Instagram" }),
  it("I3", "ai@14 09:00", { title: "Livestream für Angehörige, die nicht kommen können", short: "Livestream", effort: "M", benefit: "low" }),
  it("I1", "user@18 21:00", { title: "Kinderchor der Grundschule als Gast einladen", short: "Kinderchor" },
    ["user@11 19:00", { status: "dropped", body: "Zu kurzfristig – fürs Frühjahrskonzert merken." }]),
  it("W1", "ai@20 08:30", { title: "Kirche ist nur auf etwa 14 °C beheizt", short: "Kälte",
    body: "Folge: Publikum friert, Instrumente verstimmen sich.\nGegenmaßnahme: Hinweis auf Plakat („warm anziehen“), Stimmpause einplanen." }),
  it("W2", "ai@16 19:10", { title: "Zwei Hornisten sind im Dezember im Urlaub", short: "Hornisten",
    body: "Folge: Stücke 3 und 7 ohne Hornsatz.\nGegenmaßnahme: Aushilfe aus dem Nachbarverein fragen." },
    ["user@6 21:00", { status: "done", body: "Aushilfe aus dem Musikverein Grünau hat zugesagt." }]),
  it("D3", "ai@12 21:20", { title: "Programmfolge freigeben", short: "Programm freigeben", waiting_on: "A3", source: "Programm_v2.pdf",
    body: "Entwurf: 9 Stücke, 75 Minuten, Pause nach Stück 5.\nOffen: Zugabe „Feliz Navidad“ oder „Stille Nacht“ mit Publikum?" }),
  it("A4", "ai@12 21:25", { title: "Plakat und Flyer gestalten", short: "Plakat", owner: "ai", effort: "M", benefit: "high",
    waiting_on: "D3", due: "2026-11-24" }),
  it("A5", "ai@12 21:30", { title: "Flyer (200) und Plakate (30) drucken lassen", short: "Druck", owner: "user", effort: "S",
    benefit: "high", waiting_on: "A4", due: "2026-11-27" }),
  it("A6", "ai@11 08:15", { title: "Pressemitteilung für die Lokalzeitung", short: "Pressemitteilung", owner: "ai", effort: "S",
    benefit: "medium", waiting_on: "D3", due: "2026-11-30" }),
  it("A7", "ai@10 20:00", { title: "Helfer einteilen: Einlass, Garderobe, Glühwein, Abbau", short: "Helfer", owner: "user",
    effort: "M", benefit: "high",
    body: "Liste im Vereinschat, je Station zwei Personen.\n- [ ] Einlass und Programmhefte\n- [ ] Garderobe\n- [ ] Glühweinstand\n- [ ] Spendenkörbe\n- [ ] Abbau" },
    ["user@9 19:30", { status: "doing" }],
    ["user@8 21:10", { check: [1] }],
    ["user@6 20:45", { check: [2] }],
    ["user@1 19:20", { check: [4] }]),
  it("A8", "ai@9 18:00", { title: "Glühweinstand: Menge und Einkauf planen", short: "Glühwein", owner: "user", effort: "S",
    benefit: "medium", waiting_on: "A9" }),
  it("A9", "ai@9 18:05", { title: "Budget aufstellen: Druck, Glühwein, Deko", short: "Budget", owner: "ai", effort: "S", benefit: "high",
    waiting_on: "A8" }),
  it("A10", "ai@8 19:00", { title: "Notenständer und Licht von der Musikschule leihen", short: "Leihen", owner: "user", effort: "S",
    benefit: "medium", due: "2026-12-11" }),
  it("A11", "ai@8 19:05", { title: "Konzert bei der GEMA anmelden", short: "GEMA", owner: "user", effort: "S", benefit: "high",
    due: "2026-12-01" },
    ["user@7 07:45", { effort: "S", benefit: "high", confirmed: true }]),
  later("I2",
    ["ai@5 18:30", { convert: { ref: "A12", kind: "A", owner: "ai", title: "Drei Instagram-Beiträge vorbereiten", short: "Instagram",
      effort: "S", benefit: "medium" } }]),
  later("A12",
    ["ai@2 10:00", { status: "done", body: "Stand: drei Beiträge mit Text und Bild im Ordner „Social Media“, Posting ab 29.11." }]),
  it("A13", "ai@4 21:00", { title: "Generalprobe in der Kirche organisieren", short: "Generalprobe", owner: "user", effort: "S",
    benefit: "high", waiting_on: "A10,A1" }),
  it("I4", "ai@3 19:40", { title: "Spendenbox mit QR-Code für Kartenzahlung", short: "QR-Spende", effort: "XS", benefit: "medium" }),
);

project("workshop", { name: "Workshop „KI im Büro“", code: "WS", created: "user@18 10:00" },
  it("A1", "user@18 10:05", { title: "Zielgruppe und Lernziele festlegen", short: "Lernziele", owner: "user", effort: "S", benefit: "high" },
    ["user@17 08:30", { status: "done", body: "Zielgruppe: Teams in kleinen Büros ohne KI-Erfahrung.\nLernziele: drei Prompt-Muster sicher anwenden, Grenzen und Datenschutz kennen." }]),
  it("D1", "ai@18 10:20", { title: "Format: halbtags vor Ort oder zwei Online-Termine?", short: "Format",
    body: "Vor Ort: mehr Austausch, Raumkosten.\nOnline: bundesweit, aber weniger Übung am eigenen Rechner.\nEmpfehlung: halbtags vor Ort." },
    ["user@16 18:00", { status: "done", body: "Ergebnis: halbtags vor Ort, Sa 16.1., höchstens 12 Personen." }]),
  it("A2", "ai@17 09:00", { title: "Ablauf mit Zeitplan ausarbeiten", short: "Ablauf", owner: "ai", effort: "S", benefit: "high",
    waiting_on: "A1" },
    ["ai@16 18:30", { status: "done", source: "workshop/ablauf.md" }]),
  it("A3", "ai@16 18:40", { title: "Foliensatz erstellen", short: "Folien", owner: "ai", effort: "L", benefit: "high", waiting_on: "A2",
    body: "- [ ] Einstieg und Erwartungen\n- [ ] Wie Sprachmodelle arbeiten\n- [ ] Drei Prompt-Muster\n- [ ] Praxisbeispiele aus dem Büro\n- [ ] Datenschutz und Grenzen" },
    ["ai@14 09:00", { status: "doing" }],
    ["ai@13 16:30", { check: [1] }],
    ["ai@10 11:00", { title: "Folien: Grundlagen, Prompt-Muster, Praxisbeispiele", check: [2] }],
    ["ai@1 17:40", { check: [3] }]),
  it("A4", "ai@16 18:45", { title: "Übungsaufgaben mit Musterlösungen", short: "Übungen", owner: "ai", effort: "M", benefit: "high",
    waiting_on: "A3" }),
  it("W1", "ai@16 18:50", { title: "Datenschutz: keine Kundendaten in KI-Tools eingeben", short: "Datenschutz",
    body: "Folge: Teilnehmende üben mit echten Daten, Verstoß gegen DSGVO möglich.\nGegenmaßnahme: Übungen nur mit Beispieldaten, Hinweis gleich zu Beginn." }),
  it("A5", "ai@15 10:00", { title: "Landingpage mit Anmeldeformular", short: "Landingpage", owner: "ai", effort: "M", benefit: "high",
    waiting_on: "D2", also_in: "website" }),
  it("D2", "ai@15 10:05", { title: "Preis pro Person festlegen", short: "Preis",
    body: "290 €: niedrige Schwelle, knapp kostendeckend bei 6 Personen.\n390 €: üblich für Halbtagsworkshops mit Material.\n490 €: nur mit Nachbetreuung.\nEmpfehlung: 390 €, Frühbucher 340 €." }),
  it("A6", "user@15 12:00", { title: "Seminarraum im Coworking buchen", short: "Raum", owner: "user", effort: "S", benefit: "high" },
    ["user@11 09:30", { status: "done", body: "Stand: Raum „Elbe“ für Sa 16.1. gebucht, 9–14 Uhr." }]),
  it("I1", "ai@14 09:10", { title: "Aufzeichnung später als Online-Kurs anbieten", short: "Online-Kurs", effort: "XL", benefit: "medium" }),
  it("A7", "ai@14 09:15", { title: "Testlauf mit zwei Kolleginnen", short: "Testlauf", owner: "user", effort: "M", benefit: "medium",
    waiting_on: "A3,A4" }),
  it("A8", "ai@13 10:00", { title: "Feedbackbogen für das Ende des Workshops", short: "Feedbackbogen", owner: "ai", effort: "XS",
    benefit: "low" },
    ["ai@12 08:15", { status: "done", source: "workshop/feedback.md" }]),
  it("I2", "user@9 07:40", { title: "Handout zum Mitnehmen", short: "Handout" }),
  later("I2",
    ["ai@6 11:00", { convert: { ref: "A9", kind: "A", owner: "ai", title: "Handout als PDF: Prompt-Muster und Checkliste",
      short: "Handout", effort: "M", benefit: "medium" } }]),
  later("A9",
    ["ai@6 11:05", { waiting_on: "A3" }]),
  it("I3", "ai@5 16:00", { title: "Teilnahmezertifikat", short: "Zertifikat", effort: "S", benefit: "low" }),
  it("W2", "ai@2 12:00", { title: "Termin liegt kurz nach den Ferien – Anmeldungen könnten schleppend laufen", short: "Ferien",
    body: "Folge: Mindestzahl von 6 Personen wird knapp.\nGegenmaßnahme: Frühbucherpreis bis 15.12., Ankündigung im Newsletter." }),
);

/* -------------------------------------------------------- the simulation */
// Mirrors createItem / updateItem / convertItem in src/worker.js.
const SIZED = ["A", "I"];
const CLOSED = ["done", "dropped"];
const CHECK_LINE_RE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*\S)\s*$/;
const KINDS = { D: { default_owner: "user", actionable: true }, A: { default_owner: null, actionable: true },
  I: { default_owner: null, actionable: false }, W: { default_owner: null, actionable: false } };

const projects = [], items = new Map(), counters = new Map(), events = [];
const iso = (ms) => new Date(ms).toISOString();
const key = (slug, ref) => `${slug}:${ref}`;

function createItem(p, ref, f, actor, t, sizedBy = null) {
  const kind = ref.match(/^[A-Z]+/)[0];
  const ck = key(p.slug, kind);
  const seq = (counters.get(ck) || 0) + 1;
  counters.set(ck, seq);
  if (`${kind}${seq}` !== ref) throw new Error(`${p.slug}: expected ${ref}, the creation order gives ${kind}${seq}`);
  const k = KINDS[kind];
  const row = {
    id: randomUUID(), project_slug: p.slug, kind, seq, title: f.title, short: f.short ?? null, body: f.body ?? null,
    owner: "owner" in f ? f.owner : (k.default_owner ?? (k.actionable ? actor : null)), status: "open",
    waiting_on: f.waiting_on ?? null, source: f.source ?? null, due: f.due ?? null, converted_to: null,
    created_by: actor, updated_by: actor, created_at: iso(t), updated_at: iso(t), closed_at: null,
    effort: null, benefit: null, sized_by: null, also_in: null,
  };
  if (f.effort || f.benefit) {
    if (!SIZED.includes(kind)) throw new Error(`${p.slug}:${ref}: effort/benefit only for A and I`);
    Object.assign(row, { effort: f.effort ?? null, benefit: f.benefit ?? null, sized_by: sizedBy || (f.confirmed === true ? "user" : actor) });
  }
  if (f.also_in) row.also_in = f.also_in;
  if (kind === "A" && row.body && row.body.split("\n").filter((l) => CHECK_LINE_RE.test(l)).length > 8) throw new Error(`${ref}: too many checks`);
  items.set(key(p.slug, ref), row);
  event(p, ref, "created", actor, { title: row.title, owner: row.owner, status: row.status,
    ...(row.sized_by ? { effort: row.effort, benefit: row.benefit, sized_by: row.sized_by } : {}),
    ...(row.also_in ? { also_in: row.also_in } : {}) }, t);
  return row;
}

function updateItem(p, item, input, actor, t) {
  const changes = {};
  const set = (col, val) => { if (val !== item[col]) changes[col] = val; };
  let ticks = null;
  if (input.check) {
    ticks = applyChecks(item, input.check);
    set("body", ticks.body);
  }
  for (const col of ["title", "short", "body", "owner", "waiting_on", "also_in", "source", "due"]) if (col in input) set(col, input[col] || null);
  if ("effort" in input || "benefit" in input) {
    const effort = "effort" in input ? input.effort || null : item.effort;
    const benefit = "benefit" in input ? input.benefit || null : item.benefit;
    set("effort", effort);
    set("benefit", benefit);
    set("sized_by", effort || benefit ? (input.confirmed === true ? "user" : actor) : null);
  }
  if ("status" in input) {
    set("status", input.status);
    if (input.status !== item.status && CLOSED.includes(input.status) !== CLOSED.includes(item.status)) {
      set("closed_at", CLOSED.includes(input.status) ? iso(t) : null);
    }
  }
  const cols = Object.keys(changes);
  if (!cols.length) throw new Error(`${p.slug}:${item.kind}${item.seq}: change without effect`);
  let action = "updated";
  if (changes.status === "done") action = "done";
  else if (changes.status === "dropped") action = "dropped";
  else if (changes.status && CLOSED.includes(item.status)) action = "reopened";
  let data = changes;
  if (ticks) {
    const { body, ...rest } = changes;
    data = { ...rest, ...(ticks.checked.length ? { checked: ticks.checked } : {}) };
    if (cols.length === 1) action = "checked";
  }
  if ("also_in" in changes) data = { ...data, also_in_was: item.also_in ?? null };
  if ("waiting_on" in changes) data = { ...data, waiting_on_was: item.waiting_on ?? null };
  Object.assign(item, changes, { updated_at: iso(t), updated_by: actor });
  event(p, `${item.kind}${item.seq}`, action, actor, data, t);
}

function applyChecks(item, sel) {
  const lines = item.body.split("\n");
  const checks = lines.map((l, line) => ({ line, m: l.match(CHECK_LINE_RE) })).filter((c) => c.m);
  const checked = [];
  for (const n of sel) {
    const c = checks[n - 1];
    if (!c) throw new Error(`${item.kind}${item.seq}: no sub-item ${n}`);
    if (c.m[2] !== " ") continue;
    lines[c.line] = lines[c.line].replace(CHECK_LINE_RE, (_, a, _x, b, txt) => `${a}x${b}${txt}`);
    checked.push(c.m[4].trim());
  }
  return { body: lines.join("\n"), checked };
}

function convertItem(p, src, input, actor, t) {
  const { ref, kind, ...over } = input;
  const target = createItem(p, ref, {
    title: over.title ?? src.title, short: over.short ?? src.short, body: over.body ?? src.body, source: src.source,
    waiting_on: src.waiting_on, also_in: src.also_in,
    ...(SIZED.includes(kind) ? { effort: over.effort ?? src.effort, benefit: over.benefit ?? src.benefit } : {}),
    ...("owner" in over ? { owner: over.owner } : {}),
  }, actor, t, src.sized_by);
  const t2 = t + 40;
  Object.assign(src, { status: "done", converted_to: target.kind + target.seq, closed_at: iso(t2), updated_at: iso(t2), updated_by: actor });
  event(p, `${src.kind}${src.seq}`, "converted", actor, { to: target.kind + target.seq }, t2);
}

function event(p, ref, action, actor, data, t) {
  events.push({ project_slug: p.slug, item_ref: ref, action, actor, data: data ? JSON.stringify(data) : null, at: t });
  p.updated_at = Math.max(p.updated_at ?? 0, t);
}

// Every step of every project on one timeline, applied in order (numbers are handed out in creation order).
const steps = [];
for (const p of PROJECTS) {
  const s = stamp(p.created);
  steps.push({ ms: s.ms, run: (ms) => {
    projects.push(p);
    p.created_at = ms;
    event(p, null, "project_created", s.actor, { name: p.name, repo: null, code: p.code }, ms);
  } });
  for (const d of p.items) {
    if (d.created) {
      const c = stamp(d.created);
      steps.push({ ms: c.ms, run: (ms) => createItem(p, d.ref, d.fields, c.actor, ms) });
    }
    for (const [st, input] of d.ops) {
      const o = stamp(st);
      steps.push({ ms: o.ms, run: (ms) => {
        const item = items.get(key(p.slug, d.ref));
        if (!item) throw new Error(`${p.slug}:${d.ref} does not exist at ${st}`);
        if (input.convert) convertItem(p, item, input.convert, o.actor, ms);
        else updateItem(p, item, input, o.actor, ms);
      } });
    }
  }
}
steps.sort((a, b) => a.ms - b.ms);
// nothing in the future: pull late steps back to just before now, in order
const late = steps.filter((s) => s.ms > NOW - 60000);
late.forEach((s, n) => { s.ms = NOW - 60000 * (late.length - n); });
for (const s of steps) s.run(s.ms);

/* -------------------------------------------------------------- SQL out */
const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const insert = (table, row) => `INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).map(lit).join(", ")});`;
const slugs = PROJECTS.map((p) => lit(p.slug)).join(", ");
const out = [
  `-- cotrack demo data, generated ${iso(NOW)} by demo/seed.mjs – for a demo database only.`,
  `-- Resets the projects ${PROJECTS.map((p) => p.slug).join(", ")}; other projects stay.`,
  "-- Guard: only a demo database has this table (CREATE TABLE demo_instance (note TEXT NOT NULL)); anywhere else the import stops here.",
  "DELETE FROM demo_instance WHERE 0;",
  `DELETE FROM events WHERE project_slug IN (${slugs});`,
  `DELETE FROM items WHERE project_slug IN (${slugs});`,
  `DELETE FROM counters WHERE project_slug IN (${slugs});`,
  `DELETE FROM projects WHERE slug IN (${slugs});`,
];
for (const p of projects) {
  out.push(insert("projects", { slug: p.slug, name: p.name, repo: null, archived: 0, created_at: iso(p.created_at),
    updated_at: iso(p.updated_at), code: p.code }));
}
for (const [ck, seq] of counters) {
  const [slug, kind] = ck.split(":");
  out.push(insert("counters", { project_slug: slug, kind, last_seq: seq }));
}
for (const row of items.values()) out.push(insert("items", row));
for (const e of events) out.push(insert("events", { ...e, at: iso(e.at) }));
// Renumber the whole change log by time (ties keep their order), so it reads in order next to copied projects.
out.push(
  "DROP TABLE IF EXISTS demo_event_order;",
  "CREATE TABLE demo_event_order AS SELECT id AS old_id, ROW_NUMBER() OVER (ORDER BY at, id) AS new_id FROM events;",
  "UPDATE events SET id = -(SELECT new_id FROM demo_event_order WHERE old_id = events.id);",
  "UPDATE events SET id = -id;",
  "DROP TABLE demo_event_order;",
  "UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM events) WHERE name = 'events';",
);
process.stdout.write(out.join("\n") + "\n");
process.stderr.write(`demo seed: ${projects.length} projects, ${items.size} items, ${events.length} events\n`);
