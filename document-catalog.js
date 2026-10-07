const DOCUMENT_PROCESS_MATRIX = {
  D1: ['Meldeformular', 'Eingangs- und Vollständigkeitsprüfung', 'Neutraler Sachverhaltsvermerk', 'Unterlagenübersicht und offene Fragen', 'Weiterleitungs- oder Einstellungsvermerk'],
  D2: ['Sicherungsauftrag', 'Herkunfts- und Übernahmevermerk', 'Beweismittelverzeichnis', 'Prüfung von Kontext und Vollständigkeit', 'Sicherungsabschluss und Übergabe'],
  D3: ['Anhörungsauftrag und Fragenkatalog', 'Anhörungsschreiben', 'Zustell- und Fristvermerk', 'Stellungnahme oder dokumentierter Nichteingang', 'Auswertung und Übergabe'],
  '35': ['Eröffnungsvermerk', 'Sachverhaltsbericht', 'Beweis- und Stellungnahmenübersicht', 'Analyse und freigegebene Entscheidung', 'Zustellung, Umsetzung und Abschluss'],
  D4: ['Einspruchsformular', 'Voraussetzungen- und Fristprüfung', 'Prüfauftrag und Unabhängigkeitsvermerk', 'Überprüfungsbericht und Entscheidung', 'Zustellung und Folgemaßnahmen'],
  D5: ['Maßnahmenauftrag', 'Prüfung der Entscheidungsgrundlage', 'Umsetzungsplan', 'Ausführungs- und Kontrollnachweis', 'Mitteilung und Abschluss'],
  D6: ['Beschwerdeformular', 'Sachverhalts- und Kontextbericht', 'Kommunikations- und Beweisübersicht', 'Stellungnahmen und Analyse', 'Weiterleitungs- oder Abschlussentscheidung'],
  D7: ['Befangenheitsmeldung', 'Beschreibung des Interessenkonflikts', 'Unabhängiger Prüfbericht', 'Zuständigkeitsentscheidung', 'Übergabe- und Berechtigungsnachweis'],
  D8: ['Wiederaufnahmeantrag', 'Relevanz- und Voraussetzungenprüfung', 'Freigabe und Prüfauftrag', 'Ergänzende Untersuchung und Entscheidung', 'Änderungs-, Zustellungs- und Abschlussbericht'],
  D9: ['Erweiterungsantrag', 'Freigegebener Erweiterungsbeschluss', 'Untersuchungsplan', 'Gesamtuntersuchungsbericht', 'Freigegebene Abschlussentscheidung und Umsetzungsauftrag'],
  '07b': ['Eskalierungsantrag', 'Sachstands- und Übergabebericht', 'Unterlagen- und Aufgabenübersicht', 'Tier-3-Prüfung und Ergebnis', 'Rückübermittlung und Erledigungsvermerk'],
  R1: ['Teilnahme- oder Abmeldeformular', 'Startberechtigungsprüfung', 'Teilnehmer- und Ersatzfahrerübersicht', 'Bestätigungs- und Änderungsprotokoll', 'Abschließende Startliste oder Abmeldebestätigung'],
  R2: ['Lobbyauftrag', 'Einstellungscheckliste', 'Einladungs- und Anwesenheitsliste', 'Bereitschaft und Startfreigabe', 'Lobbyabschlussprotokoll'],
  R3: ['Briefingauftrag', 'Regel- und Veranstaltungsprüfung', 'Freigegebenes Fahrerbriefing', 'Veröffentlichungsnachweis', 'Rückfragen-, Änderungs- und Abschlussvermerk'],
  R4: ['Veranstaltungs- und Zuständigkeitsblatt', 'Ereignisprotokoll', 'Regel- und Lagebewertung', 'Entscheidungs- und Kommunikationsprotokoll', 'Nachbereitungsbericht'],
  R5: ['Rennvorfallmeldung', 'Sachverhaltsrekonstruktion', 'Beweis- und Stellungnahmenübersicht', 'Analyse und freigegebene Steward-Entscheidung', 'Zustellung und Ergebnisübergabe'],
  R6: ['Ergebnis-Eingangsblatt', 'Rohdaten- und Quellenübersicht', 'Punkte- und Maßnahmenberechnung', 'Prüf- und Freigabevermerk', 'Veröffentlichte Ergebnisse und Wertung'],
  R7: ['Lizenzantrag oder Änderungsauftrag', 'Voraussetzungenprüfung', 'Lizenzstatusblatt', 'Entscheidungs- und Änderungsnachweis', 'Mitteilung und Abschluss'],
  R8: ['Störungsmeldung', 'Technischer Sachverhaltsbericht', 'Nachweis- und Rückmeldungsübersicht', 'Auswirkungsanalyse und Maßnahmenplan', 'Lösungs- und Abschlussbericht'],
  V1: ['Aufnahme- oder Änderungsformular', 'Stammdatenprüfung', 'Teilnahme- und Zuordnungsprüfung', 'Freigegebenes Profil- oder Änderungsblatt', 'Bestätigung und Abschluss'],
  V2: ['Rollen- und Rechteantrag', 'Bedarfs- und Konfliktprüfung', 'Berechtigungsfreigabe', 'Einrichtungs- und Kontrollnachweis', 'Einweisungs- oder Entzugsvermerk'],
  V3: ['Änderungsantrag', 'Auswirkungsanalyse', 'Abstimmungs- und Rückmeldungsbericht', 'Änderungsversion mit CEO-Freigabe', 'Veröffentlichung und Einführung'],
  V4: ['Wechselantrag', 'Voraussetzungenprüfung', 'Bestätigungs- und Auswirkungsübersicht', 'Wechselentscheidung', 'Änderung und Mitteilungsnachweis'],
  F1: ['Finanzantrag', 'Beleg- und Empfängerprüfung', 'Budget- und Befugnisprüfung', 'Finanzentscheidung', 'Zahlungs- oder Buchungsnachweis und Abschluss'],
  F2: ['Buchungsauftrag', 'Grundlagenprüfung', 'Buchungs- oder Korrekturbeleg', 'Salden- und Kontrollbericht', 'Freigabe und Abschluss'],
  A1: ['Abschlussantrag', 'Vollständigkeitscheckliste', 'Aufgaben- und Maßnahmenabschlussübersicht', 'Abschlussfreigabe', 'Archivierungsvermerk und Dokumentenverzeichnis'],
  A2: ['Veröffentlichungsauftrag', 'Inhalts- und Vertraulichkeitsprüfung', 'Öffentliche Entscheidungsfassung', 'Veröffentlichungsfreigabe', 'Veröffentlichungs- und Abschlussnachweis'],
  E1: ['Bewerbungsformular', 'Voraussetzungen und Testplan', 'Leistungsbewertung', 'Auswahlgesprächsvermerk', 'Aufnahmeentscheidung und nächste Schritte'],
  E2: ['Trainingsauftrag und Zielsetzung', 'Trainingsplan', 'Anmelde- und Anwesenheitsliste', 'Trainings- und Beobachtungsprotokoll', 'Nachbereitung und Aufgabenbericht'],
  E3: ['Bewertungsauftrag und Kriterien', 'Beobachtungs- und Datenauswertung', 'Bewertungsbericht', 'Entwicklungsgespräch und Zielplan', 'Fortschritts- und Abschlussbericht']
};

const DOCUMENT_GROUPS = [
  'Aufnahme und Sachverhalt',
  'Beweise und Analyse',
  'Gespräche und Anhörungen',
  'Prüfung und Freigabe',
  'Eskalierung und CEO',
  'Umsetzung und Abschluss',
  'Prozessspezifische Unterlagen'
];

function documentCatalogSlug(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function documentNeedsIndependentApproval(title, template) {
  return ['approval', 'decision'].includes(template)
    || /(entscheidung|freigabe|beschluss|unabhängig|prüfauftrag|freigegeben|freigegebene)/i.test(title);
}

const BASE_DOCUMENT_TYPES = [
  ['Eingangs- oder Meldeformular', 'Aufnahme und Sachverhalt', 'Erfasst Anlass, Zeitpunkt, Ort und meldende Person.', ['Anlass', 'Ereigniszeitpunkt und Ort', 'Meldende Person', 'Beteiligte']],
  ['Eröffnungsvermerk', 'Aufnahme und Sachverhalt', 'Dokumentiert Zuständigkeit, Eröffnung und den konkreten Prüfauftrag.', ['Anlass', 'Zuständigkeit', 'Prüfauftrag']],
  ['Sachverhaltsbericht', 'Aufnahme und Sachverhalt', 'Trennt festgestellte Tatsachen, Aussagen und Bewertungen nachvollziehbar.', ['Anlass', 'Ereigniszeitpunkt und Ort', 'Beteiligte', 'Chronologischer Ablauf', 'Informationsquelle je Aussage', 'Festgestellte Tatsachen', 'Aussagen der Beteiligten', 'Bewertung / Einordnung', 'Offene Fragen und Widersprüche', 'Verknüpfte Beweismittel'], 'facts'],
  ['Beweismittelverzeichnis', 'Beweise und Analyse', 'Listet Beweismittel mit Herkunft, Zeitbezug und Aktenverknüpfung.', ['Beweismittel', 'Herkunft', 'Zeitbezug', 'Prüfstatus']],
  ['Beweismittelprüfbericht', 'Beweise und Analyse', 'Hält Kontext, Vollständigkeit und Aussagekraft der Beweise fest.', ['Geprüfte Beweismittel', 'Prüfmethode', 'Kontext', 'Ergebnis']],
  ['Gesprächsvermerk', 'Gespräche und Anhörungen', 'Dokumentiert ein entscheidungsrelevantes Gespräch und ermöglicht Nachträge.', ['Gesprächsdatum', 'Teilnehmer', 'Gesprächsart', 'Anlass', 'Fragen und wesentliche Antworten', 'Aussagen je Person', 'Vereinbarte Aufgaben', 'Offene Punkte', 'Verfasser'], 'conversation'],
  ['Anhörungsschreiben', 'Gespräche und Anhörungen', 'Fordert eine Stellungnahme mit konkreter Frist und Zustellweg an.', ['Adressat', 'Anhörungsgegenstand', 'Frist', 'Zustellweg']],
  ['Stellungnahme', 'Gespräche und Anhörungen', 'Dokumentiert die tatsächlich eingegangene Stellungnahme und ihren Eingang.', ['Absender', 'Eingangsdatum', 'Stellungnahme', 'Bezug']],
  ['Frist- und Zustellvermerk', 'Gespräche und Anhörungen', 'Hält Zustellung, Fristbeginn, Fristende und Eingang nachvollziehbar fest.', ['Adressat', 'Zustellweg', 'Zustellzeitpunkt', 'Fristende']],
  ['Analysebericht', 'Beweise und Analyse', 'Bewertet konkrete Prüffragen einschließlich belastender und entlastender Aspekte.', ['Konkrete Prüffragen', 'Relevante Artikel und Versionen', 'Geprüfte Unterlagen', 'Belastende Gesichtspunkte', 'Entlastende Gesichtspunkte', 'Bewertung je Prüffrage', 'Nicht geklärte Punkte', 'Schlussfolgerung', 'Empfohlener nächster Schritt'], 'analysis'],
  ['Prüfauftrag', 'Prüfung und Freigabe', 'Legt Prüffragen, Umfang, Verantwortlichkeit und Frist fest.', ['Prüffragen', 'Umfang', 'Bearbeiter', 'Frist']],
  ['Entscheidungsentwurf', 'Prüfung und Freigabe', 'Bereitet eine Entscheidung zur unabhängigen Prüfung vor; ist selbst keine Freigabe.', ['Sachverhalt', 'Entscheidungsgrundlage', 'Beweiswürdigung', 'Angewandte Artikel', 'Ergebnis und Begründung'], 'decision'],
  ['Freigabevermerk', 'Prüfung und Freigabe', 'Dokumentiert eine tatsächlich erteilte Freigabe samt unabhängiger Prüfstufe.', ['Prüfgegenstand', 'Prüfstufe', 'Prüfer', 'Freigabeentscheidung', 'Begründung'], 'approval'],
  ['Verbindliche Entscheidung', 'Prüfung und Freigabe', 'Hält Sachverhalt, Beweiswürdigung, Ergebnis, Maßnahme und Rechtsbehelf fest.', ['Festgestellter Sachverhalt', 'Entscheidungsgrundlage', 'Beweiswürdigung', 'Angewandte Artikel', 'Ergebnis und Begründung', 'Maßnahme, Beginn und Ende', 'Zuständige Freigabestufe', 'Freigebende Person', 'Zustellung und Überprüfungsmöglichkeiten'], 'decision'],
  ['07b-Eskalierungsbericht', 'Eskalierung und CEO', 'Bereitet eine begründete Tier-3-Übergabe mit Unterlagen- und Aufgabenübersicht vor.', ['Eskalierungsgrund', 'Sachstand', 'Pflichtunterlagen', 'Offene Aufgaben']],
  ['D9-Erweiterungsantrag', 'Eskalierung und CEO', 'Begründet den Umfang und Bedarf einer Erweiterung auf D9.', ['Erweiterungsgrund', 'Zusätzlicher Prüfbedarf', 'Betroffene Akte']],
  ['D9-Eröffnungsbeschluss', 'Eskalierung und CEO', 'Dokumentiert die unabhängige Freigabe zur erweiterten Untersuchung.', ['Prüfgrundlage', 'Beschluss', 'Freigabestufe', 'Freigebende Person'], 'approval'],
  ['CEO-Entscheidungsvorlage', 'Eskalierung und CEO', 'Fasst Entscheidungsgrundlage und offene Fragen für eine CEO-Entscheidung zusammen.', ['Sachverhalt', 'Entscheidungsoptionen', 'Empfehlung', 'Offene Punkte']],
  ['CEO-Entscheidungsvermerk', 'Eskalierung und CEO', 'Dokumentiert eine unabhängige Entscheidung durch ein als CEO gekennzeichnetes Konto.', ['Entscheidung', 'Begründung', 'Freigebende Person', 'Zeitpunkt'], 'approval'],
  ['Maßnahmen- und Umsetzungsbericht', 'Umsetzung und Abschluss', 'Dokumentiert eine freigegebene Maßnahme und ihre tatsächliche Umsetzung.', ['Freigegebene Maßnahme', 'Umsetzungsverantwortung', 'Beginn und Ende', 'Kontrollnachweis']],
  ['Abschlussbericht', 'Umsetzung und Abschluss', 'Fasst tatsächlichen Verlauf, offene Punkte, Ergebnis und Abschlussweg zusammen.', ['Verfahrensverlauf', 'Ergebnis', 'Offene Punkte', 'Abschlussgrund']],
  ['Archivierungsvermerk', 'Umsetzung und Abschluss', 'Hält Vollständigkeit, Freigaben, Aufbewahrung und Archivierung fest.', ['Vollständigkeitsprüfung', 'Freigabestatus', 'Aufbewahrung', 'Archivierungsdatum']],
  ['Öffentliche Entscheidungsfassung', 'Prüfung und Freigabe', 'Enthält ausschließlich ausdrücklich zur Veröffentlichung freigegebene Inhalte.', ['Freigegebener Entscheidungstext', 'Veröffentlichungsfreigabe'], 'approval'],
  ['Ergänzender Aktenvermerk', 'Prozessspezifische Unterlagen', 'Hält einen zusätzlichen tatsächlichen Vorgang oder eine Ergänzung nachvollziehbar fest.', ['Anlass', 'Tatsächliche Information', 'Quelle', 'Verfasser']],
  ['Einstellungs- oder Zusammenführungsentscheidung', 'Prüfung und Freigabe', 'Dokumentiert begründet eine frühe Einstellung, Ablehnung oder Zusammenführung.', ['Abschlussweg', 'Begründung', 'Verknüpfte Akte', 'Freigabestufe'], 'approval']
];

const ADDITIONAL_DOCUMENT_TYPES = [
  ['Eingangsformular beziehungsweise Antrag', 'Aufnahme und Sachverhalt', 'Erfasst den tatsächlich eingegangenen Anlass oder Antrag für einen frühen Abschlussweg.', ['Anlass oder Antrag', 'Eingangsdatum', 'Beteiligte', 'Quelle']],
  ['Voraussetzungen- und Vollständigkeitsprüfung', 'Prüfung und Freigabe', 'Prüft die Voraussetzungen und dokumentiert fehlende oder erfüllte Angaben.', ['Prüfmaßstab', 'Geprüfte Angaben', 'Fehlende Unterlagen', 'Ergebnis']],
  ['Sachstands- und Unterlagenvermerk', 'Aufnahme und Sachverhalt', 'Dokumentiert den tatsächlichen Sachstand ohne nicht erfolgte Untersuchungsschritte vorzutäuschen.', ['Sachstand', 'Vorhandene Unterlagen', 'Offene Fragen', 'Quelle']],
  ['Freigegebene Einstellungs-, Ablehnungs- oder Zusammenführungsentscheidung', 'Prüfung und Freigabe', 'Begründet den frühen Abschlussweg und dokumentiert die unabhängige Freigabe.', ['Ausgewählter Abschlussweg', 'Begründung', 'Verknüpfte Akte', 'Freigabestufe'], 'approval'],
  ['Mitteilungs- und Abschlussvermerk', 'Umsetzung und Abschluss', 'Dokumentiert Mitteilung, Zustellung und den tatsächlichen Abschluss des frühen Abschlusswegs.', ['Empfänger', 'Mitteilungsweg', 'Zeitpunkt', 'Abschlussdatum']],
  ['Beweismittelblatt', 'Beweise und Analyse', 'Registriert ein neu aufgenommenes Beweismittel und verknüpft das Original.', ['Bezeichnung', 'Herkunft', 'Eingangszeitpunkt', 'Originalformat / Ablageort']],
  ['Aktualisiertes Beweismittelverzeichnis', 'Beweise und Analyse', 'Ergänzt das bestehende Verzeichnis um tatsächlich neu aufgenommene Beweise.', ['Neue Beweismittel', 'Herkunft', 'Verknüpfte Originale']],
  ['Übernahmevermerk', 'Eskalierung und CEO', 'Dokumentiert die tatsächliche Übernahme einer übergebenen Akte.', ['Übergebende Stelle', 'Übernehmende Stelle', 'Zeitpunkt', 'Offene Aufgaben']],
  ['Freigegebener D9-Beschluss', 'Eskalierung und CEO', 'Hält die unabhängige Freigabe und den Umfang der D9-Erweiterung fest.', ['Prüfgrundlage', 'Beschluss', 'Umfang', 'Freigabestufe'], 'approval'],
  ['Befangenheitsmeldung und Prüfentscheidung', 'Prüfung und Freigabe', 'Dokumentiert einen Interessenkonflikt und dessen unabhängige Prüfung.', ['Betroffene Person', 'Interessenkonflikt', 'Prüfer', 'Zuständigkeitsentscheidung'], 'approval'],
  ['Umsetzungsauftrag', 'Umsetzung und Abschluss', 'Beauftragt die Umsetzung einer tatsächlich freigegebenen Maßnahme.', ['Freigegebene Maßnahme', 'Verantwortliche Stelle', 'Beginn', 'Frist']],
  ['Abschlussbericht und Vollständigkeitsprüfung', 'Umsetzung und Abschluss', 'Dokumentiert den beantragten Abschluss und prüft alle Pflichtunterlagen.', ['Abschlussgrund', 'Dokumentenprüfung', 'Offene Aufgaben', 'Freigabestatus']],
  ['Ergänzender Prüfauftrag und Ergebnisbericht', 'Beweise und Analyse', 'Dokumentiert zusätzliche Prüffragen und deren tatsächliche Ergebnisse.', ['Zusätzliche Prüffragen', 'Bearbeiter', 'Geprüfte Unterlagen', 'Ergebnis']],
  ['Fristverlängerungsentscheidung', 'Prüfung und Freigabe', 'Dokumentiert Antrag, neue Frist und die erforderliche Freigabe.', ['Bisherige Frist', 'Beantragte Änderung', 'Begründung', 'Entscheidung'], 'approval'],
  ['Neue Entscheidungsfassung und Änderungsvermerk', 'Prüfung und Freigabe', 'Verknüpft eine neue Entscheidungsfassung mit der ersetzten Fassung.', ['Vorherige Fassung', 'Änderungsgrund', 'Neue Entscheidung', 'Freigabestufe'], 'approval'],
  ['Aktennachtrag', 'Umsetzung und Abschluss', 'Ergänzt nachträglich tatsächlich eingegangene Informationen ohne Überschreiben.', ['Eingangsdatum', 'Nachträgliche Information', 'Quelle', 'Auswirkung']]
].map(([title, group, description, fields, template]) => ({
  key: `additional-${documentCatalogSlug(title)}`,
  title, group, description, fields, template: template || 'standard',
  requiresApproval: documentNeedsIndependentApproval(title, template)
}));

function documentGroupFor(title) {
  if (/CEO|Eskalier|Tier-3|Übergabe|Erweiterungsbeschluss/i.test(title)) return 'Eskalierung und CEO';
  if (/Gespräch|Anhör|Stellungnahme|Frist|Zustell|Auswahlgespräch/i.test(title)) return 'Gespräche und Anhörungen';
  if (/Beweis|Quelle|Rohdaten|Sicherung|Sachverhalt|Rekonstruktion|Kontext|Auswertung|Analyse|Prüfung|Bewertung|Bericht/i.test(title)) return 'Beweise und Analyse';
  if (/Freigabe|Entscheidung|Beschluss|Unabhängig|Voraussetzungen|Berechtigung|Kontroll|Startberechtigung/i.test(title)) return 'Prüfung und Freigabe';
  if (/Abschluss|Archiv|Mitteilung|Umsetzung|Veröffentlich|Übergabe|Nachbereitung|Erledig|Rückübermittlung/i.test(title)) return 'Umsetzung und Abschluss';
  if (/Formular|Antrag|Meldung|Auftrag|Anmeldung|Bewerbung|Eingang/i.test(title)) return 'Aufnahme und Sachverhalt';
  return 'Prozessspezifische Unterlagen';
}

function documentFieldsFor(title) {
  if (/Sachverhalt|Rekonstruktion|Ereignisprotokoll|Störungsmeldung/i.test(title)) return BASE_DOCUMENT_TYPES.find(item => item[4] === 'facts')[3];
  if (/Analyse|Bewertung|Prüfbericht|Auswirkungsanalyse/i.test(title)) return BASE_DOCUMENT_TYPES.find(item => item[4] === 'analysis')[3];
  if (/Gespräch|Anhörung|Stellungnahme|Auswahlgespräch/i.test(title)) return BASE_DOCUMENT_TYPES.find(item => item[4] === 'conversation')[3];
  if (/Entscheidung|Beschluss|Freigabe|Veröffentlichung|Berechtigung/i.test(title)) return BASE_DOCUMENT_TYPES.find(item => item[4] === 'decision')[3];
  return ['Anlass und Zweck', 'Beteiligte / zuständige Stelle', 'Sachstand und erforderliche Angaben', 'Ergebnis oder offene Punkte', 'Quelle / Verknüpfung'];
}

const PROCESS_DOCUMENT_TYPES = Object.entries(DOCUMENT_PROCESS_MATRIX).flatMap(([processCode, titles]) =>
  titles.map((title, index) => ({
    key: `process-${processCode}-${index + 1}-${documentCatalogSlug(title)}`,
    title,
    group: documentGroupFor(title),
    description: `Pflichtunterlage ${index + 1} von 5 für Prozess ${processCode}. ${title} nur nach dem tatsächlichen Arbeitsschritt dokumentieren.`,
    fields: documentFieldsFor(title),
    processCode,
    requirementIndex: index + 1,
    template: /Sachverhalt|Rekonstruktion/i.test(title) ? 'facts' : /Analyse|Bewertung/i.test(title) ? 'analysis' : /Gespräch|Anhörung/i.test(title) ? 'conversation' : /Entscheidung|Beschluss|Freigabe/i.test(title) ? 'decision' : 'standard',
    requiresApproval: documentNeedsIndependentApproval(title, /Unabhängigkeitsvermerk|Prüfauftrag/i.test(title) ? 'approval' : '')
  }))
);

const ADDITIONAL_DOCUMENT_EVENTS = [
  {event:'Wesentliches Gespräch', document:'Gesprächsvermerk'},
  {event:'Anhörung angeordnet', document:'Anhörungsschreiben'},
  {event:'Stellungnahme eingegangen', document:'Stellungnahme'},
  {event:'Neue Beweise aufgenommen', document:'Beweismittelblatt'},
  {event:'Neue Beweise aufgenommen', document:'Aktualisiertes Beweismittelverzeichnis'},
  {event:'Weitere Untersuchung beauftragt', document:'Ergänzender Prüfauftrag und Ergebnisbericht'},
  {event:'Frist verlängert', document:'Fristverlängerungsentscheidung'},
  {event:'Übergabe an Tier 3', document:'07b-Eskalierungsbericht'},
  {event:'Übergabe an Tier 3', document:'Übernahmevermerk'},
  {event:'D9 beantragt', document:'D9-Erweiterungsantrag'},
  {event:'D9 beantragt', document:'Freigegebener D9-Beschluss'},
  {event:'CEO-Entscheidung erforderlich', document:'CEO-Entscheidungsvorlage'},
  {event:'CEO-Entscheidung erforderlich', document:'CEO-Entscheidungsvermerk'},
  {event:'Mögliche Befangenheit gemeldet', document:'Befangenheitsmeldung und Prüfentscheidung'},
  {event:'Maßnahme freigegeben', document:'Umsetzungsauftrag'},
  {event:'Öffentliche Veröffentlichung beantragt', document:'Öffentliche Entscheidungsfassung'},
  {event:'Abschluss beantragt', document:'Abschlussbericht und Vollständigkeitsprüfung'},
  {event:'Entscheidung geändert', document:'Neue Entscheidungsfassung und Änderungsvermerk'},
  {event:'Nachträgliche Ergänzung', document:'Aktennachtrag'}
];

const EARLY_CLOSURE_REQUIREMENTS = [
  'Eingangsformular beziehungsweise Antrag',
  'Voraussetzungen- und Vollständigkeitsprüfung',
  'Sachstands- und Unterlagenvermerk',
  'Freigegebene Einstellungs-, Ablehnungs- oder Zusammenführungsentscheidung',
  'Mitteilungs- und Abschlussvermerk'
];

const ALL_DOCUMENT_TYPES = [
  ...BASE_DOCUMENT_TYPES.map(([title, group, description, fields, template]) => ({
    key: `general-${documentCatalogSlug(title)}`,
    title, group, description, fields, template: template || 'standard',
    requiresApproval: documentNeedsIndependentApproval(title, template)
  })),
  ...ADDITIONAL_DOCUMENT_TYPES,
  ...PROCESS_DOCUMENT_TYPES
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ADDITIONAL_DOCUMENT_EVENTS,
    ADDITIONAL_DOCUMENT_TYPES,
    ALL_DOCUMENT_TYPES,
    BASE_DOCUMENT_TYPES,
    DOCUMENT_GROUPS,
    DOCUMENT_PROCESS_MATRIX,
    EARLY_CLOSURE_REQUIREMENTS,
    PROCESS_DOCUMENT_TYPES
  };
}
