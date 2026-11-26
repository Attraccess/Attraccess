# CE- und Marktcheckliste
<!-- llms-description: Was CE-Kennzeichnung und EU-Marktregeln vom Touch-P4-Leser verlangen: Funk (2,4 und 5 GHz), EMV, Sicherheit, Cybersicherheit, Registrierungen und was noch offen ist. -->

Eine Platine kann nicht für sich allein „CE-konform“ sein: Die CE-Kennzeichnung
gilt für den fertigen Leser (Platine, Display, Gehäuse, Netzteil, Firmware und
Unterlagen) [RED Art. 2(1), 20(1)]. Diese Seite listet, was in Deutschland und
der EU gilt, was das Platinendesign dafür schon leistet und was noch offen ist.

Sie ist eine Arbeitscheckliste mit dem Stand vom 26. November 2026 und keine
Rechtsberatung. Jede Aussage wurde am 25. November 2026 an ihrer Quelle
geprüft, die Aussagen zum ESP32-C5-Modul und zum 5-GHz-WLAN am
26. November 2026. Ein Verweis in eckigen Klammern nennt eine Quelle und die
herangezogene Klausel, zum Beispiel [RED Art. 10(9)].
[compliance-sources.md](hardware/touch-p4/compliance-sources.md) listet jede
Quelle mit Version und Link auf, dazu das Ergebnis der Prüfung für jede Aussage.

Normen, die nicht frei lesbar sind (EN 18031, EN 55032, EN 55035,
EN 50130-4, IEC 61000-4-5 und jede Ausgabe der EN IEC 62368-1), konnten nicht
geprüft werden. Aussagen, die sich auf sie, auf die Laborpraxis oder auf eine
Schätzung stützen, sind mit dem Grund als „ungeprüft“ markiert. Für die
EN 62368-1 stützte sich die Prüfung auf die veröffentlichten Antworten von UL,
das frei verfügbare Inhaltsverzeichnis der Ausgabe 2018 und zwei
veröffentlichte Prüfberichte. Eine frühere Fassung dieser Seite las die
Brandschutzklauseln außerdem in einer Kopie der Ausgabe 2014 (siehe
„Gehäusekunststoff“).

## Wird es einfach?

Funk, EMV und Sicherheit sind gewöhnliche Arbeit für ein Prüflabor, und das
zertifizierte WLAN-Modul nimmt einen Teil davon ab. Registrierungen und
Papierkram sind klein. Die Cybersicherheit ist der schwierige Teil, und sie
hängt nicht von der Platine ab:

1. **Cyber Resilience Act.** Ein Zutrittskontroll-Leser ist ein „important
   product, class I“ [CRA Art. 7(1), Anhang III Klasse I Nr. 1]. Ab dem
   11. Dezember 2027 darf der Hersteller ihn nur dann selbst bewerten, wenn er
   eine nach der Verordnung zitierte harmonisierte Norm vollständig anwendet
   (oder gemeinsame Spezifikationen oder ein EU-Cybersicherheitszertifikat der
   Vertrauenswürdigkeitsstufe „substantial“) und die Norm alle Risiken der
   Kernfunktion des Lesers abdeckt [CRA Art. 32(2); CRA-Leitfaden Rn. 149]. Die
   Norm für diese Produktklasse (prEN 40000-10) ist ein Entwurf
   [DIN Media prEN 40000-10]. Ohne sie muss eine benannte Stelle das Produkt
   prüfen [CRA Art. 32(2)].
2. **Bis dahin EN 18031.** Seit dem 1. August 2025 muss der Leser die
   Cybersicherheitsanforderungen der RED erfüllen [DR 2023/2444 Art. 1]. Er
   kann nur dann ohne benannte Stelle erklärt werden, wenn EN 18031-1 und -2
   vollständig angewendet werden und ihre Klauseln zu Standardpasswörtern den
   Benutzer nie davon befreien, ein Passwort zu setzen und zu verwenden
   [RED Art. 17(3), (4); HS-RED Nr. 164, 165]. Andernfalls ist schon jetzt eine
   benannte Stelle nötig.
3. **Erster Besuch im Labor.** Der eigene NFC-Sender des Lesers, zwei
   Kabelanschlüsse und Entladungen auf ein Glasdisplay sind die Stellen, an
   denen ein erster Durchlauf meist scheitert (ungeprüft: Erfahrung, keine
   Quelle). Vorheriges Messen entscheidet, ob man das Labor einmal oder
   dreimal besucht.
4. **Was genau verkauft wird.** Gehäusematerial, ein Netzteil im Karton oder
   nicht, zulässige Kabellängen, nur Geschäftskunden oder auch Privatkäufer
   und die Zahl der Versionen fügen jeweils Prüfungen und Pflichten hinzu oder
   nehmen sie weg (siehe „Prüfungen an den Anschlüssen“ und „Welche Regeln
   gelten“).

## Welche Regeln gelten

| Regel | Gilt | Was der Hersteller tun muss |
|---|---|---|
| Funkanlagenrichtlinie 2014/53/EU (RED) | ja | Der Leser enthält Funkanlagen: WLAN auf 2,4 und 5 GHz und Bluetooth sowie den 13,56-MHz-NFC-Leser [RED Art. 2(1)]. Sicherheit, EMV, Funk und Cybersicherheit bewerten [RED Art. 3]. Die technischen Unterlagen und die Konformitätserklärung zehn Jahre lang aufbewahren, nachdem der Leser in Verkehr gebracht wurde [RED Art. 10(4)]. Eine EU-Konformitätserklärung ausstellen [RED Art. 18(3)] und jedem Gerät eine Kopie davon beilegen oder eine vereinfachte Erklärung, die die Internetadresse des vollständigen Textes angibt [RED Art. 10(9); FuAG §20(2)]. Die CE-Kennzeichnung auf dem Gerät und seiner Verpackung anbringen [RED Art. 20(1)] sowie Name, Postanschrift, Typ und Seriennummer auf dem Gerät [RED Art. 10(6), (7)]. Anleitung und Sicherheitsinformationen mit den Frequenzbändern und der maximalen Sendeleistung [RED Art. 10(8); FuAG §20(3)] und für 5 GHz die Beschränkung auf Innenräume auf der Verpackung und in der Anleitung [RED Art. 10(10)] (siehe „5-GHz-WLAN“). Sie müssen auf Deutsch vorliegen, wenn der Leser an nicht gewerbliche Nutzer verkauft wird; beim Verkauf nur an Unternehmen verlangt das Gesetz klare, verständliche Texte [FuAG §20(1)]. Deutsch ist in jedem Fall ratsam. |
| Niederspannungs- und EMV-Richtlinie | nicht gesondert | Für Funkanlagen deckt die RED beide ab [RED Art. 1(4), 3(1), 50; EMCD Art. 2(2)(a)]. Die Sicherheit gilt über RED Art. 3(1)(a) „with no voltage limit applying“ [RED Art. 3(1)(a)]: Der Leser läuft mit 12 bis 24 V und PoE, also unterhalb des eigenen Bereichs der Niederspannungsrichtlinie, und muss nach der RED trotzdem sicher sein. Die Erklärung nennt die RED. |
| RED-Cybersicherheit, Delegierte Verordnung (EU) 2022/30 | ja, bis 10. Dezember 2027 | Gilt seit dem 1. August 2025 [DR 2023/2444 Art. 1]: Netzschutz, weil der Leser direkt oder über andere Geräte über das Internet kommunizieren kann [DR 2022/30 Art. 1(1)], und Schutz personenbezogener Daten, weil er Kartennummern verarbeitet, die mit Namen verknüpft sind [DR 2022/30 Art. 1(2)]. Ab dem 11. Dezember 2027 durch die Delegierte Verordnung (EU) 2026/339 aufgehoben, wenn der Cyber Resilience Act vollständig gilt [DR 2026/339 Art. 1, Erwägungsgrund 4]. Leser, die vorher in Verkehr gebracht wurden, bleiben für diese Anforderungen unter der Marktüberwachung nach der RED [DR 2026/339 Erwägungsgrund 5]. |
| Cyber Resilience Act (EU) 2024/2847 | ja | Seit dem 11. September 2026: ausgenutzte Schwachstellen und schwerwiegende Vorfälle melden, mit einer Frühwarnung binnen 24 Stunden, einer Meldung binnen 72 Stunden und einem späteren Abschlussbericht [CRA Art. 14(2), (4), 71(2)]. Das gilt schon für Leser, die heute verkauft werden [CRA Art. 69(3)]. Ab dem 11. Dezember 2027: volle Konformität für jedes in Verkehr gebrachte Gerät [CRA Art. 69(2), 71(2)], mit einem Supportzeitraum, der zur erwarteten Nutzungsdauer des Lesers passt, mindestens fünf Jahre, und dessen Ende beim Kauf genannt wird [CRA Art. 13(8), (19)]. Siehe „Cybersicherheit“. |
| RoHS 2011/65/EU | ja | Lieferantenerklärungen für alle Bauteile und die Leiterplatte in den technischen Unterlagen aufbewahren. Sie sind der übliche Nachweis; die Richtlinie verlangt technische Unterlagen und eine interne Fertigungskontrolle, nicht diese Form [RoHS Art. 7(b), (d)]. RoHS wird in der Konformitätserklärung genannt [RoHS Anhang VI; RED Art. 18(3)]. |
| REACH Artikel 33; SCIP-Datenbank | ja | Kunden mitteilen, wenn ein Bauteil einen Stoff der Kandidatenliste über 0,1 % enthält, Verbrauchern auf Anfrage binnen 45 Tagen [REACH Art. 33(1), (2)]. Dieselbe Information an die SCIP-Datenbank der ECHA melden; diese Pflicht stammt aus der Abfallrahmenrichtlinie, in Deutschland aus dem Chemikaliengesetz [WFD Art. 9(1)(i); ChemG §16f]. Blei in einigen Bauteilen ist der übliche Fall: Es steht seit Juni 2018 auf der Kandidatenliste [Sagentia (secondary)]. |
| WEEE / ElektroG | ja | Marke und Gerätetyp vor dem ersten Verkauf bei der stiftung ear registrieren [ElektroG §6(1)]: meist zwei bis vier Wochen für einen vollständigen Antrag [ear reg] und etwa 130 EUR im Jahr zuzüglich Umsatzsteuer an Gebühren, 32,80 EUR im Quartal [GebV Nr. 1.2; ear fees]. Ein Haushaltsgerät braucht jährlich eine insolvenzsichere Garantie. Ein B2B-Gerät braucht eine glaubhafte Darlegung, dass es nur oder üblicherweise außerhalb privater Haushalte genutzt wird, ein Rücknahmekonzept, ein Rücknahmeangebot und schriftliche Entsorgungsinformationen bei jeder Lieferung [ElektroG §7(1), (3), §7a, §19, §19a]. Ein Gerät, das auch Privatkäufer nutzen können, gilt als Haushaltsgerät [ElektroG §3 Nr. 5]: Der Verkauf an Privatkäufer schließt die B2B-Registrierung aus. Ein Wandleser, der nur an Werkstätten verkauft wird, kann ein B2B-Gerät sein, wenn das glaubhaft gezeigt wird [ElektroG §7(3)]. Auf dem Gerät, dauerhaft: durchgestrichene Mülltonne, die Identität des Herstellers und eine Kennzeichnung, dass es nach dem 13. August 2005 in Verkehr gebracht wurde [ElektroG §9(1), (2), §3 Nr. 4]; die übliche Kennzeichnung ist ein Balken unter der Tonne (ungeprüft: EN 50419, eine kostenpflichtige Norm). Registrierungsnummer auf Angeboten und Rechnungen [ElektroG §6(3)]. Der Direktverkauf an Endnutzer in einem anderen EU-Land braucht dort eine Registrierung über einen Bevollmächtigten in diesem Land. Bringt ein örtlicher Importeur oder Händler den Leser auf diesem Markt in Verkehr, registriert sich dieses Unternehmen [WEEE Art. 3(1)(f), 16(1), 17(2); ElektroG §8(5)]. |
| Verpackung: Verordnung (EU) 2025/40 (PPWR) und das deutsche VerpackDG | ja | Vor der ersten Abgabe in LUCID registrieren [VerpackDG §6(1), (6); ZSVR]. An einem System für Verpackungen teilnehmen, die typischerweise bei privaten Haushalten oder vergleichbaren Anfallstellen anfallen. Werkstätten und Büros mit haushaltsüblichen Tonnen zählen dazu, daher entfällt die Pflicht beim Verkauf nur an Unternehmen nicht von selbst [VerpackDG §3(6), (7), §7]. Material und Masse melden [VerpackDG §9(1)]. Wer Verpackungen oder ein verpacktes Produkt unter eigenem Namen oder eigener Marke herstellen lässt, ist nach der PPWR Hersteller der Verpackung, mit Konformitätsbewertung, technischen Unterlagen und einer EU-Konformitätserklärung für die Verpackung [PPWR Art. 3, 15(2)]. Ausgenommen ist ein Kleinstunternehmen, dessen Verpackungslieferant im selben Land sitzt [PPWR Art. 3]. Verpackungen außerhalb der Systembeteiligung, etwa Versandkartons an Geschäftskunden, müssen kostenlos zurückgenommen werden [VerpackDG §39(1)]; ab 2028 braucht das eine Genehmigung der ZSVR [ZSVR]. Die PPWR und das VerpackDG haben am 12. August 2026 das Verpackungsgesetz abgelöst [PPWR Art. 71; ZSVR; VerpackDG]. |
| Batterieverordnung (EU) 2023/1542 | nein | Die Platine hat keine Batterie. Sie gilt, sobald eine hinzugefügt wird [Batteries Reg Art. 1(3)]. |
| Allgemeine Produktsicherheitsverordnung (EU) 2023/988 | wenn Verbraucher es kaufen oder voraussichtlich nutzen | Ein Produkt zählt, wenn Verbraucher es voraussichtlich nutzen, auch wenn es nicht für sie gedacht ist [GPSR Art. 3(1), Erwägungsgrund 17]. Mitglieder, die sich in einem Verein oder Makerspace anmelden, können zählen: den Anwendungsfall prüfen. Für ein Produkt unter EU-Harmonisierungsrecht, etwa die RED, bleiben die Regeln für den Fernabsatz, Unfallmeldungen und Rückrufe [GPSR Art. 2(1), 19, 20, 36, 37]. |
| Datengesetz (EU) 2023/2854 | im Anwendungsbereich, Hauptpflichten befreit | Der Leser ist ein „connected product“ [Data Act Art. 2(5)]. Die Pflichten zur Datenzugangsgewährung gelten nicht für ein Kleinst- oder Kleinunternehmen (nach der Definition der Empfehlung 2003/361/EG), sofern es keinen größeren Partner oder verbundenen Unternehmen hat und das Produkt nicht als Unterauftragnehmer entwirft oder baut. Ein Unternehmen, das mittelgroß wird, behält die Befreiung ein Jahr lang [Data Act Art. 7(1)]. Erneut prüfen, wenn das Unternehmen wächst. |
| USB-C-Einheitsladegerät | nein | Betrifft nur gelistete Kategorien wiederaufladbarer Geräte [RED Anhang Ia Teil I]. |
| Funkanlagengesetz | ja | Die deutsche Form der RED. Die Bundesnetzagentur überwacht [FuAG Fußnote, §23(1)]. |
| Produkthaftung | ja | Die neue Richtlinie gilt für Produkte, die nach dem 9. Dezember 2026 in Verkehr gebracht werden [PLD Art. 2(1)], über nationales Recht (die deutsche Umsetzung wurde nicht geprüft). Sie zählt Software als Produkt, beurteilt Mängel an sicherheitsrelevanten Cybersicherheitsanforderungen und lässt den Hersteller für fehlende Software-Updates haften, die für die Sicherheit nötig sind, solange sie in seiner Kontrolle liegen [PLD Art. 4(1), 7(2)(f), 11(2)]. Entsprechend versichern. |

## Normen, die ein Labor anwendet

„Zitiert“ heißt im Amtsblatt der EU gelistet. Die Anwendung einer zitierten Norm
begründet die Konformitätsvermutung für die wesentlichen Anforderungen, die sie
abdeckt, im Rahmen eines etwaigen Hinweises, der bei der Zitierung abgedruckt
ist [RED Art. 16]. Sie ist kein Beweis. Für Funk und Cybersicherheit erlauben
nur zitierte, vollständig angewendete Normen eine Erklärung ohne benannte
Stelle [RED Art. 17(3), (4)]. Für Sicherheit und EMV darf der Hersteller immer
selbst erklären [RED Art. 17(2)].

| Aspekt | Norm | Stand am 25. November 2026 |
|---|---|---|
| Funk, 2,4 GHz | EN 300 328 V2.2.2 | zitiert [HS-RED Nr. 16] |
| Funk, 5 GHz | EN 301 893 V2.2.1 | zitiert seit 15. Mai 2025; V2.1.1 bis 15. Mai 2028 [HS-RED Nr. 65, 65a; HS-RED 2025/893 Art. 2] |
| Funk, 13,56 MHz | EN 300 330 V2.1.1 | zitiert [HS-RED Nr. 17] |
| EMV | EN 301 489-1 V2.2.3, -3 V2.3.2 (NFC), -17 V3.3.1 (WLAN, Bluetooth) | Teile 3 und 17 zitiert, jeweils mit zwei Hinweisen: keine Vermutung für Aussendungen unter 9 kHz und keine, „if its clause 6 is applied“ (Klausel 6 enthält die Leistungskriterien) [HS-RED Nr. 168, 169; EN 301 489-17 §6]. Klar gesagt: Werden die Prüfungen mit ihren Leistungskriterien wie geschrieben durchgeführt, erhält der Leser **keine Konformitätsvermutung für RED Art. 3(1)(b)**; die Kommission stellte fest, dass diese Kriterien „lay down performance-based criteria on a subjective basis“ [HS-RED 2025/893 Erwägungsgrund]. Die EMV wird dann vom Hersteller ohne diese Vermutung bewertet [RED Art. 17(2), Anhang II], sodass der Prüfplan und die technischen Unterlagen objektive Bestehenskriterien festlegen müssen, zum Beispiel eine WLAN-Paketfehlerrate von höchstens 10 %, erfolgreiche NFC-Lesevorgänge, Display und Touch, die sich ohne Reset erholen. Teil 1 ist nicht zitiert; die Teile 3 und 17 wenden ihn an [EN 301 489-3 §2.1; EN 301 489-17 §2.1]. |
| EMV, Ethernet-Anschluss | EN 55032 (Aussendung), EN 55035 (Störfestigkeit) | EN 55035:2017 unter der RED zitiert [HS-RED Nr. 5]; EN 55032 nur unter der EMV-Richtlinie zitiert [HS-EMC] |
| Sicherheit | EN IEC 62368-1:2020 + A11 oder die Ausgabe 2024 | unter der RED nicht zitiert [HS-RED]; unter der Niederspannungsrichtlinie ist nur die Ausgabe 2014 zitiert [HS-LVD]. Das Labor fragen, nach welcher Ausgabe es berichtet. |
| Funkfeld-Exposition | EN IEC 62311 mit EN 50665; EN 50364 für den NFC-Leser | unter der RED nicht zitiert [HS-RED] |
| Cybersicherheit | EN 18031-1 (Netz) und EN 18031-2 (personenbezogene Daten) | mit Hinweisen zitiert, siehe „Cybersicherheit“ [HS-RED Nr. 164, 165; ID 2025/138] |

Für NFC liegt der Grenzwert des Trägers bei 60 dBµA/m in 10 m für RFID und NFC,
unter einer Spektrumsmaske [EN 300 330 §4.3.4 table 2, notes 2 and 3]. Das ist
kein Problem: Eine Schleife dieser Größe bleibt etwa 50 dB darunter (ungeprüft:
unsere Schätzung). Die Oberwellen sind es. Der PN532 steuert die Antenne mit
einem Rechtecksignal an (Datenblatt des PN532, hier nicht geprüft). Mehrere
Oberwellen fallen in Bänder, in denen nur 4 nW e.r.p. abgestrahlt werden
dürfen: 47 bis 74, 87,5 bis 118, 174 bis 230 und 470 bis 790 MHz. Das trifft die
Oberwellen bei 54, 68, 95, 108, 176 bis 217 und 475 bis 786 MHz
[EN 300 330 §4.3.9.3 table 6, §6.2.9]. Sonst gilt von 30 MHz bis 1 GHz ein
Grenzwert von 250 nW. Unterhalb von 30 MHz muss die zweite Oberwelle, 27,12 MHz,
unter -3,5 dBµA/m in 10 m bleiben [EN 300 330 §4.3.8.3 table 5]. Die kleine
Schleife strahlt sie kaum ab; die Gleichstrom- und Ethernet-Kabel daneben tun
es (technische Einschätzung). Bei der Funkprüfung hält das Labor Netzleitungen
aus der Messung heraus, zum Beispiel indem es sie wegführt oder mit
Ferritperlen belastet [EN 300 330 §5.4.1, annex C.2.3]. Die eigene Vorprüfung
sowohl mit als auch ohne solche Belastung messen.

## Was das zertifizierte WLAN-Modul einspart

Der Leser nutzt das ESP32-C5-MINI-1, ein Modul mit eigener Leiterplattenantenne
für 2,4 und 5 GHz [DS-C5 §1]. Es hat eine EU-Baumusterprüfbescheinigung für das
Modell mit seiner internen Antenne (Eurofins Electrical and Electronic Testing
NA, benannte Stelle 0980, 44024-05-2026-260268 vom 27. Mai 2026)
[CE-C5 pp. 1, 2]. Sie deckt Sicherheit (EN IEC 62368-1:2024 + A11), Gesundheit
(EN 50665, EN IEC 62311), EMV (EN 55032, EN 301 489-1 V2.2.3,
EN 301 489-17 V3.3.1) und Funk (EN 300 328 V2.2.2, EN 301 893 V2.2.1) ab, nicht
die Cybersicherheit [CE-C5 pp. 2, 3]. Ihr EMV-Teil wurde am Modul allein
bewertet; Espressif sagt „Some data can be reused, but EMC testing is still
required for the final product“ [FAQ]. Espressif veröffentlicht nur das
Zertifikat: Die Prüfberichte, die es nennt (EFTA26010030-IE-01-E1, -02-R1 bis
-R4, -03-M1V1 und -04-L1, Eurofins TA Technology (Shanghai)), anfordern, bevor
man Labore um Angebote bittet [CE-C5 pp. 2, 3; FAQ].

ETSI EG 203 367 ist ein Leitfaden für den Hersteller, keine harmonisierte Norm.
Er erlaubt, die Funkbewertung des Moduls wiederzuverwenden, wenn das Modul unter
gleichwertigen Bewertungsbedingungen sitzt und seine Einbauanleitung befolgt.
Ein anderer Host oder eine Antenne, die nicht Teil der Bewertung des Moduls war,
ist eine Abweichung: Der Leser wird dann gegen die Funknorm neu bewertet, was
nicht Prüfen bedeuten muss [EG 203 367 §3.1, §6.1 notes 1 and 2]. Labore
verwenden üblicherweise Ergebnisse wieder, die nicht von der Antenne abhängen,
etwa die leitungsgebundenen Messungen des Moduls (ungeprüft: Laborpraxis, im
Leitfaden nicht genannt).

Hier ist die Antenne die eigene des Moduls, aber das Modul sitzt nicht dort, wo
Espressifs Designleitfaden es platziert: Es steht in der oberen linken Ecke der
Platine, mit seiner Antenne über einem Ausschnitt im oberen Rand, nicht in der
Mitte des Randes (Designnotizen, „Wi-Fi antenna“ und „Accepted deviations“). Im
Vollwellenmodell liegt dieser Platz in jedem Kanal innerhalb von 3 dB von
Espressifs Position und strahlt in einigen 5-GHz-Kanälen bis zu 5,5 dB mehr ab.
Ob das noch als gleichwertige Bedingungen gilt, beurteilt das Labor; diese
Messungen am Leser einplanen:

- abgestrahlte Leistung (e.i.r.p.) und Nebenaussendungen auf beiden Bändern,
  während NFC gleichzeitig sendet [EG 203 367 §6.1 note 1, §6.2;
  EN 300 328 §4.3.2.2.3; EN 301 893 §4.2.3],
- EMV mit allen laufenden Funkanlagen [EG 203 367 §5.1.1.3, §5.2.3].

Gesondert die Funkfeld-Exposition (RED Art. 3(1)(a), außerhalb des
Anwendungsbereichs des Leitfadens [EG 203 367 §1]). Die FCC-Zulassung verlangt
20 cm zwischen Antenne und Personen [FCC-C5]; die EU-Bescheinigung nennt
EN 50665 und EN IEC 62311, aber auf ihrer Vorderseite keinen Abstand
[CE-C5 p. 2], daher auch den Gesundheitsbericht (EFTA26010030-IE-03-M1V1)
anfordern. Ein Leser, der berührt wird, hält keine 20 cm ein und braucht daher
eine eigene Bewertung; eine Berechnung genügt meist (ungeprüft: Laborpraxis).

Zu beachten:

- Eine deutsche benannte Stelle (VDE, 0366) liest die Regeln strenger und
  verlangt eine EU-Baumusterprüfung, sobald nur Modulberichte vorliegen (ihre
  Kundeninformation „RED Information Radio Modules“ vom 24. November 2020)
  [VDE RED modules p. 2]. Jedes Labor vor dem Angebot fragen, wie es das sieht,
  und bei VDE nachfragen, ob die Aussage von 2020 noch gilt (offener Punkt
  unten).
- Sendeleistung. Das Zertifikat nennt 19,85 dBm für WLAN auf 2,4 GHz,
  16,36 dBm für Bluetooth LE, 20,58, 20,74 und 20,77 dBm in den Bändern 5150 bis
  5250, 5250 bis 5350 und 5470 bis 5725 MHz sowie 13,97 dBm von 5725 bis
  5850 MHz [CE-C5 p. 2]; es sagt nicht, ob es sich um leitungsgebundene oder
  abgestrahlte Werte handelt. Die Grenzwerte gelten für die e.i.r.p.: 20 dBm auf
  2,4 GHz [EN 300 328 §4.3.2.2.3] und auf 5 GHz die aus „5-GHz-WLAN“ unten.
  Espressifs Antenne erreicht auf ihrer Testplatine 4,44 dBi auf 2,4 GHz und
  1,55 bis 2,18 dBi auf 5 GHz [ANT-C5 §3.1]. Hat die Antenne des Lesers mehr
  Gewinn, muss die Sendeleistung um die Differenz sinken. Die maximale
  Sendeleistung ist also eine Firmware-Einstellung, begrenzt durch das, was das
  Labor am Leser misst ([firmware-port.md](hardware/touch-p4/firmware-port.md),
  Regel 24).
- Die Antenne ist Teil des Moduls und lässt sich nicht ändern: Der Leser hat
  eine Funkkonfiguration, keine Antennenwahl und keinen Antennenanschluss.
  Metall von der oberen linken Ecke fernhalten: Im Modell kostet eine
  Metallwand hinter dem Leser 1,1 bis 1,7 dB auf 2,4 GHz (Designnotizen,
  „Wi-Fi module“).
- Für eine spätere US-Version: Die FCC-Zulassung ist eine einzelne modulare
  Zulassung, mit 20 cm zu Personen und gleichzeitig sendenden Sendern, die nach
  den Verfahren der FCC bewertet werden [FCC-C5]. Diese Seite behandelt nur die
  EU.

## 5-GHz-WLAN

Die EU harmonisiert die Bänder 5150 bis 5350 und 5470 bis 5725 MHz für WLAN
durch den Durchführungsbeschluss (EU) 2022/179, dessen Anhang durch den
Durchführungsbeschluss (EU) 2022/2307 ersetzt wurde; er hob den Beschluss
2005/513/EG auf [WAS Art. 1, 5; WAS-A Art. 1(2)]. EN 301 893 V2.2.1 begründet
seit dem 15. Mai 2025 eine Konformitätsvermutung [HS-RED Nr. 65a;
HS-RED 2025/893]; V2.1.1 behält sie bis zum 15. Mai 2028
[HS-RED 2025/893 Art. 2]. Das Zertifikat des Moduls nennt V2.2.1
[CE-C5 p. 3].

| Band (Kanäle) | Erlaubte Nutzung | Mittlere e.i.r.p. | An diesem Leser |
|---|---|---|---|
| 5150 bis 5250 MHz (36 bis 48) | in Innenräumen, einschließlich Straßenfahrzeugen, Zügen und Flugzeugen; begrenzte Nutzung im Freien, nicht „attached to a fixed outdoor antenna, fixed infrastructure or to the external body of road vehicles“ [WAS Annex table 1, note 1] | 200 mW (23 dBm), 10 mW/MHz [WAS Annex table 1] | genutzt |
| 5250 bis 5350 MHz (52 bis 64) | „Indoor use: inside buildings only“ [WAS Annex table 2] | 200 mW mit Sendeleistungsregelung (TPC), sonst 3 dB weniger, 100 mW (20 dBm); DFS [WAS Annex table 2] | genutzt, als Station unter der DFS des Zugangspunkts |
| 5470 bis 5725 MHz (100 bis 140) | in Innenräumen und im Freien [WAS Annex table 3] | 1 W mit TPC, sonst 500 mW; DFS [WAS Annex table 3]. Ein sekundäres Gerät ohne Radarerkennung hält die Grenzwerte von 5250 bis 5350 MHz ein [EN 301 893 §4.2.3.2.2 table 2, note 1] | genutzt, auf dieselbe Weise |
| 5725 bis 5875 MHz (149 bis 165) | nicht im WLAN-Beschluss: ein Band für nicht spezifische Kurzstreckengeräte mit 25 mW e.i.r.p. [SRD Annex band 61] | 25 mW | nicht genutzt |

Was das für den Leser bedeutet:

- **Eine Station, ohne eigene Radarerkennung.** EN 301 893 V2.2.1 nennt den
  Zugangspunkt das primäre Gerät und den Leser ein sekundäres Gerät
  [EN 301 893 §3.1]. „A secondary device shall not transmit before receiving
  an appropriate enabling signal from the primary device“
  [EN 301 893 §4.2.6.1.4.2 a)]; ohne Radarerkennung braucht es nur die
  Kanalabschaltung, wenn der Zugangspunkt sie anordnet
  [EN 301 893 §4.2.6.2.1 table 5]. Bis zu 23 dBm e.i.r.p. muss ein sekundäres
  Gerät selbst kein Radar erkennen, es sei denn, es wird in einer festen
  Punkt-zu-Punkt- oder Punkt-zu-Mehrpunkt-Verbindung im Freien genutzt
  [EN 301 893 annex D, table D.2 note 2]. Der C5 „only supports passive radar
  detection“, „cannot operate as a DFS AP in SoftAP mode“ und „In SoftAP
  mode, ESP32-C5 is not allowed to operate on DFS channels“ [IDF-WIFI, DFS].
  Im Modus Station plus SoftAP folgt sein Zugangspunkt der Station auf einen
  DFS-Kanal [IDF-WIFI, DFS]. Firmware: ein Provisionierungs-Zugangspunkt nur
  auf 2,4 GHz oder den Kanälen 36 bis 48 und aus, solange die Station einen
  DFS-Kanal nutzt (firmware-port.md, Regel 23).
- **Leistung.** Ohne TPC: 20 dBm e.i.r.p. von 5250 bis 5725 MHz, 23 dBm von
  5150 bis 5250 MHz [EN 301 893 §4.2.3.2.2 table 2]. Die 20,74 und 20,77 dBm
  des Zertifikats liegen über 20 dBm (siehe „Was das zertifizierte WLAN-Modul
  einspart“); den Leser dort bei 20 dBm e.i.r.p. halten, es sei denn, das Labor
  bestätigt, dass die Firmware TPC beherrscht (firmware-port.md, Regel 24).
- **Keine Länder- oder Bandeinstellung für den Benutzer.** „DFS settings shall
  not be accessible to the user“, was einschließt „not allowing the user to
  change the country of operation and/or the operating frequency band if that
  results in the equipment no longer being compliant“ [WAS Annex tables 2, 3].
  ESP-IDF startet im Weltmodus („01“) mit einer automatischen Richtlinie, die
  das Land des verbundenen Zugangspunkts übernimmt; unter
  `WIFI_COUNTRY_POLICY_MANUAL` gilt „the configured country info is used
  always“, und erst dann wirkt die 5-GHz-Kanalmaske (`wifi_5g_channel_mask`)
  [IDF-API, `esp_wifi_set_country`, `wifi_country_t`]. Firmware: die manuelle
  Richtlinie mit den EU-Regeln und nur den Kanälen 36 bis 64 und 100 bis 140,
  zur Build-Zeit festgelegt (firmware-port.md, Regel 22). Espressifs eigene
  Tabelle für Deutschland würde die Kanäle 149 bis 165 mit 25 mW erlauben und
  zitiert noch den aufgehobenen Beschluss 2005/513/EG [IDF-REG]; die
  Kanalmaske hält sie aus.
- **Betrieb in Innenräumen, auf der Verpackung und im Handbuch.** Die Kanäle 36
  bis 64 sind in jedem Mitgliedstaat auf den Betrieb in Innenräumen beschränkt
  (siehe oben), eine Beschränkung der Inbetriebnahme. Die Verpackung zeigt dann
  entweder das Piktogramm der Durchführungsverordnung (EU) 2017/1354, eine
  Tabelle mit einem Ausrufezeichen auf einem Buch und den Länderkürzeln der
  Mitgliedstaaten darunter oder daneben, oder die Worte „Restrictions or
  Requirements in“ gefolgt von diesen Kürzeln [RED Art. 10(10);
  IR 2017/1354 Art. 2(1), Anhang I, II]. Die Anleitung listet die
  Mitgliedstaaten und die Art der Beschränkung auf: „5150 to 5350 MHz: indoor
  use only“, in allen [IR 2017/1354 Art. 2(2)]. Sie nennt auch die
  Frequenzbänder und die jeweils maximale Leistung [RED Art. 10(8)]: 2400 bis
  2483,5 MHz, 5150 bis 5350 MHz und 5470 bis 5725 MHz, mit der e.i.r.p., die das
  Labor gemessen hat. Der Leser ist ohnehin ein Gerät für Innenräume
  ([spec.md](hardware/touch-p4/spec.md)), und sein Gehäuse ist nicht für den
  Außenbereich gemacht ([Gehäuse](hardware/touch-p4/case.md)).

## Cybersicherheit

**Jetzt, unter der RED.** Der Leser muss RED Art. 3(3)(d) und (e) erfüllen, weil
er über das Internet kommunizieren kann und personenbezogene Daten verarbeitet
[DR 2022/30 Art. 1(1), (2)]. Buchstabe (f) für Geräte, die Geld übertragen,
gilt nicht [DR 2022/30 Art. 1(3)]. Eine Erklärung ohne benannte Stelle braucht
EN 18031-1 und -2, vollständig angewendet [RED Art. 17(3), (4)]. Die Normen sind
mit Hinweisen zitiert. Sie begründen keine Vermutung, wenn der Benutzer nach
ihren Klauseln zu Standardpasswörtern (6.2.5.1 und 6.2.5.2) kein Passwort
setzen und verwenden muss. Ihre Abschnitte „rationale“ und „guidance“ zählen nie
[HS-RED Nr. 164, 165; ID 2025/138 Erwägungsgrund 6]. Daher muss jeder Zugriff
auf Einstellungen, Kopplung und die Serviceschnittstelle authentifiziert sein,
mit Zugangsdaten, die pro Gerät eindeutig sind oder bei der ersten Nutzung
gesetzt werden und nicht übersprungen werden können. Dann wird jede Anforderung
beider Teile mit den Entscheidungsbäumen der Norm dokumentiert. (Ungeprüft:
EN 18031 ist eine kostenpflichtige Norm und wurde nicht gelesen; mit dem Labor
bestätigen.) Die Firmware des ESP32-C5 ist Teil des Produkts (unsere Lesart:
Die RED zählt Software als Bestandteil [RED Art. 10(8)]).

**Ab dem 11. Dezember 2027, unter dem Cyber Resilience Act.**

- Der Leser gehört zur Klasse I. Anhang III der Verordnung listet „identity
  management systems and privileged access management software and hardware,
  including authentication and access control readers, including biometric
  readers“ [CRA Annex III class I no. 1]. Die Durchführungsverordnung
  (EU) 2025/2392 beschreibt die Kategorie, einschließlich „access management
  systems that control access ... to digital resources or physical locations“
  [IR 2025/2392 Annex I class I no. 1].
- Ein Produkt der Klasse I darf nur dann vom Hersteller selbst bewertet werden,
  wenn zitierte harmonisierte Normen (oder gemeinsame Spezifikationen oder ein
  EU-Cybersicherheitszertifikat der Stufe „substantial“) bestehen, vollständig
  angewendet werden und alle Risiken der Kernfunktion des Lesers abdecken
  [CRA Art. 32(2); CRA-Leitfaden Rn. 149]. Andernfalls prüft es eine benannte
  Stelle.
- EN 18031 begründet unter der Verordnung keine Vermutung: Sie ist nur unter der
  RED zitiert [CRA Art. 27(1)]. Übertragbar ist das RED-Zertifikat einer
  benannten Stelle für die Cybersicherheit, für die Risiken, die es abdeckt, und
  nicht über den 11. Juni 2028 hinaus [CRA Art. 69(1); CRA-Leitfaden
  Rn. 251 bis 254].
- Die Norm für diese Kategorie, prEN 40000-10, wird von CEN/TC 224 erarbeitet
  und lag von Ende Mai bis 13. August 2026 zur Kommentierung aus [DIN Media
  prEN 40000-10; Genorma (secondary)]. Die Frist der Kommission für die
  Annahme durch CEN ist der 31. Januar 2027 [C(2026) 7861 annex, line 16]; die
  Zitierung im Amtsblatt der EU folgt später. Für die Verordnung ist noch keine
  Norm zitiert [CRA std page]. Ob diese vor Dezember 2027 zitiert wird, ist
  offen: für beide Ausgänge planen und in der ersten Hälfte 2027 erneut
  nachsehen.
- Open Source hilft weniger, als es scheint. Die Verordnung lässt Produkte, die
  „qualifying as free and open-source software“ in Anhang III (Klasse I oder II)
  sind, die Selbstbewertung nutzen, wenn ihre technischen Unterlagen öffentlich
  sind, sobald sie in Verkehr gebracht werden [CRA Art. 32(5); CRA-Leitfaden
  Rn. 137]. Die Definition umfasst Software [CRA Art. 3(48)]. Ob ein
  Hardware-Leser mit offener Firmware dazu zählt, ist nicht geklärt. Der
  Leitfaden der Kommission behandelt Hardware und ihre Firmware als ein
  Produkt, was dagegen spricht [CRA-Leitfaden Rn. 25]. Das BSI soll die deutsche
  Marktüberwachungsbehörde sein und die Stelle, die man fragt
  [BT-Drs 21/6134 Art. 1, §65(1) BSIG]; der Bundestag hat dieses Gesetz am
  15. Oktober 2026 beschlossen, und seine Verkündung wurde am
  25. November 2026 nicht gefunden [BR-Drs 621/26]. Die Veröffentlichung der
  Unterlagen kostet dieses Projekt in jedem Fall nichts.
- Für kleine Unternehmen gibt es keine Ausnahme von den Anforderungen. Sie
  erhalten niedrigere Gebühren der benannten Stellen [CRA Art. 32(6)], eine
  vereinfachte Form der Unterlagen, die noch nicht veröffentlicht ist
  [CRA Art. 33(5); MSME page], und keine Geldbuße für die versäumte
  24-Stunden-Frühwarnung; die 72-Stunden-Meldung gilt weiterhin
  [CRA Art. 64(10)(a)].

Was es inhaltlich braucht. Von der Verordnung verlangt: eine schriftliche
Risikobewertung, aktuell gehalten [CRA Art. 13(2), (3)]; eine
Software-Stückliste [CRA Annex I Part II (1)]; ein genannter Supportzeitraum,
der die erwartete Nutzungsdauer widerspiegelt, mindestens fünf Jahre
[CRA Art. 13(8), (19)]; eine Kontaktadresse für Schwachstellenmeldungen
[CRA Annex I Part II (6), Art. 13(17)] und eine Richtlinie zur koordinierten
Offenlegung von Schwachstellen [CRA Annex I Part II (5)]; kostenlose
Sicherheitsupdates [CRA Annex I Part II (8)], standardmäßig automatisch
installiert mit einfacher Abwahlmöglichkeit, wo anwendbar
[CRA Annex I Part I (2)(c)], und jedes mindestens zehn Jahre oder für den Rest
des Supportzeitraums verfügbar gehalten [CRA Art. 13(9)]; veröffentlichte
Informationen zu behobenen Schwachstellen [CRA Annex I Part II (4)]; die
Benutzerinformationen nach Anhang II [CRA Art. 13(18)]; und die technischen
Unterlagen und die Erklärung, zehn Jahre oder den Supportzeitraum aufbewahrt,
je nachdem, was länger ist [CRA Art. 13(13)]. Die vom Projekt gewählten Mittel,
die die Verordnung nicht nennt: Secure Boot und Flash-Verschlüsselung auf dem
ESP32-P4 (siehe [firmware-port.md](hardware/touch-p4/firmware-port.md) für
einen hier wichtigen Erratum-Eintrag) [CRA Annex I Part I (2)(e), (f)],
signierte Firmware-Updates für beide Prozessoren [CRA Annex I Part II (7)],
keine Standard-Zugangsdaten [CRA Annex I Part I (2)(b), (d)] und ein
schriftliches Verfahren für die 24-Stunden-Meldung [CRA Art. 14(2)(a)]. Die
Meldepflicht gilt bereits [CRA Art. 69(3), 71(2)].

## Sicherheit

- Jede Spannungsversorgung des Lesers liegt unter 60 V DC: PoE, der
  12-bis-24-V-Eingang, USB. Das ist die ES1-Grenze, unterhalb der eine Spannung
  berührt werden darf (Tabelle 4 der EN 62368-1 in der Ausgabe 2018)
  [ULQA; IEC18 contents], und beide unten genannten veröffentlichten
  Prüfberichte stufen einen PoE-Eingang als ES1 ein [FLIR p. 8; AIR pp. 8, 9].
  An den Eingängen ist keine Isolierung gegen elektrischen Schlag nötig. Wandler
  im Inneren können mehr als 60 V DC erzeugen (ES2 oder ES3), was Schutzmaßnahmen
  braucht; das Labor stuft diese Stellen ein [ULQA]. Der Rest der Arbeit ist
  Brandschutz, Erwärmung, Mechanik und Kennzeichnung.
- Die Versorgungen schriftlich begrenzen. Das Handbuch und das Typenschild
  müssen angeben, dass der DC-Eingang nur an eine Versorgung angeschlossen
  werden darf, die auf 100 W begrenzt ist, besser auf 15 W [ULTB] (das Labor
  kennt den Wortlaut, den seine Ausgabe der Norm verlangt). Ohne angegebene
  Grenze misst das Labor den Eingang mit einer starken Quelle. Im unten
  genannten FLIR-Bericht maß ein solcher Eingang über 100 W und wurde zu PS3, und
  das Gehäuse darum musste ein Brandschutzgehäuse sein [FLIR pp. 10, 47]. Die
  Platine hat am DC-Eingang eine selbstrückstellende Sicherung von 1,1 A und an
  USB eine von 2 A; an USB begrenzt außerdem die eFuse den Strom auf 1,8 bis
  2,2 A (Entwurfswerte).
- Gehäuse: ein Kunststoff, dessen Datenblatt mindestens HB angibt [ULQA, zu
  Klausel 6.3.1 der Ausgabe 2014]. Ab der Ausgabe 2018 ist ein
  Glühdrahtversuch bei 550 °C eine Alternative zu HB [TUV item 17 (secondary)].
  Flammhemmender Kunststoff ist nur nötig, wo das Labor ein Teil findet, das sich
  entzünden könnte. Siehe „Gehäusekunststoff“ unten.
- Leiterplatte: FR-4 mit Einstufung V-0 und UL-Kennzeichen; die Norm verlangt
  V-1 oder besser (Klausel 6.4.5.2; ungeprüft: kostenpflichtige Norm, aber ein
  veröffentlichter Bericht vermerkt unter dieser Klausel „PCB: V-0“ [FLIR p. 18]).
  JLCPCB hat die UL-Akte E479892 und bringt sein UL-Kennzeichen an, wenn die
  Bestellung es verlangt [JLCPCB UL].
- Ein Netzteil, das mit dem Leser verkauft wird, wird Teil des geprüften Produkts
  (ungeprüft: Laborpraxis). Eines mit eigenem Bericht kaufen.
- Der Näherungssensor (U704) sendet Infrarotlicht von 940 nm aus einer LED, nicht
  aus einem Laser. EN 60825-1 deckt LEDs nicht mehr ab [BSI 60825-1]: Sie gilt
  nicht, und der Leser braucht kein Laseretikett. Die LED pulst mit höchstens
  200 mA, höchstens eine Millisekunde lang und höchstens 1/40 der Zeit, im
  geschlossenen Gehäuse (Datenblatt des Sensors, hier nicht geprüft). Das Labor
  fragen, ob Klausel 10.4 der Sicherheitsnorm (optische Strahlung von LEDs,
  bewertet nach den Risikogruppen der IEC 62471) etwas Dokumentiertes dazu
  verlangt [IEC18 contents].
- Die PoE-Isolierung verlangt die Ethernet-Norm, nicht die Sicherheitsnorm.
  IEEE 802.3 verlangt von einem versorgten Gerät, alle seine PoE-Leitungen von
  allen externen Leitern zu isolieren [IEEEI]. Die Prüfung besteht aus 1500 V
  RMS für 60 s, 2250 V DC für 60 s oder zehn Impulsen von 1500 V mit 10/700 µs,
  gefolgt von einem Isolationswiderstand von mindestens 2 Mohm, gemessen bei
  500 V DC [IEEEW (secondary)]. Die Auslegung 3-07/04 zitiert den Text von
  802.3af-2003 und bestätigt nur die RMS-Prüfung [IEEEI]; der aktuelle Text,
  IEEE 802.3-2022, wurde nicht gelesen. Die EN 62368-1 verlangt die Trennung
  eines Ethernet-Anschlusses nur von geerdeten Schaltungen (Klausel 5.4.11)
  [ULQA; FLIR p. 15]; der Leser hat keine, also verlangt die Sicherheitsnorm
  hier keine Isolierung. Ein Labor, das für die CE-Kennzeichnung prüft, prüft sie
  womöglich nicht; Kunden erwarten sie (unsere Einschätzung). Was die Platine
  dafür tut und wo sie schwach ist, steht in
  [design-notes.md](hardware/touch-p4/design-notes.md#poe-potenzialtrennung).

### Gehäusekunststoff

Die erste Fassung dieser Seite verlangte „UL 94 V-1 oder besser“ für das ganze
Gehäuse. Das ist strenger als die Norm für Stromkreise bis 100 W [ULQA].
Dieser Teil wurde am 24. November 2026 aus Klausel 6 der EN 62368-1 in einer
Kopie der Ausgabe 2014, den veröffentlichten Antworten von UL zur Ausgabe 2018
und zwei veröffentlichten Prüfberichten von PoE-Geräten erarbeitet. Die Prüfung
vom 25. November 2026 konnte den Text von 2014 nicht aus einer freien Quelle
erneut lesen, daher sind Punkte, die allein darauf beruhen, als ungeprüft
markiert. Die Ausgaben 2018 und 2023 selbst wurden nicht gelesen, und Labore
berichten nach ihnen: Das Labor hat das letzte Wort. Zwei Änderungen der
Ausgabe 2018 sind hier wichtig: Teile unter 4 g oder 1750 mm³ sind von den
Regeln für brennbares Material ausgenommen, und ein Glühdrahtversuch bei 550 °C
darf HB ersetzen [TUV items 16, 17 (secondary)].

Welcher Kunststoff für das Gehäuse nötig ist, hängt von der Leistung ab, die ein
Stromkreis aus seiner Versorgung in einen Fehler ziehen kann, nicht davon, was
der Leser verbraucht:

| Leistung, die ein Stromkreis ziehen kann | Klasse | Gehäusekunststoff |
|---|---|---|
| bis 15 W, drei Sekunden in den Fehler [ULTB] | PS1 | HB, die niedrigste Entflammbarkeitsklasse, belegt durch das Datenblatt des Materials (Klausel 6.3.1) [ULQA]. Die Unterteilung in HB75 unter 3 mm Wandstärke und HB40 ab 3 mm ist ungeprüft (nur in der Ausgabe 2014 gelesen). Nichts weiter: Kein Teil eines solchen Stromkreises gilt als zündfähig [ULQA; ULTB]. |
| bis 100 W, fünf Sekunden in den Fehler [ULTB] | PS2 | HB, und kein Brandschutzgehäuse [ULQA]. Gilt ein Teil des Stromkreises als mögliche Zündquelle, muss Kunststoff näher als 13 mm daneben oder 50 mm darüber V-1 sein oder einen Flammtest bestehen (Anhang S) oder hinter einer Barriere liegen (Klauseln 6.4.5 und 6.4.7) [ULQA; FLIR p. 18]. Dass die Barriere aus Metall oder V-1-Material sein muss, ist ungeprüft. |
| mehr, oder eine Versorgung ohne angegebene Grenze | PS3 | Ein Brandschutzgehäuse um den PS3-Stromkreis (Klauseln 6.4.6 und 6.4.8) [FLIR p. 18]. In einem kleinen Gehäuse ist das praktisch das ganze Gehäuse, V-1 oder besser [ULQA] (mit dem Labor bestätigen). |

Eine mögliche Zündquelle ist

- ein Teil, das nach 30 Sekunden Normalbetrieb mehr als 15 W umsetzt; oder, bei
  einem Einzelfehler, eines mit mehr als 100 W unmittelbar nach dem Fehler, wo
  elektronische Schaltungen, Regler oder PTC-Elemente die Leistung begrenzen,
  oder sonst mehr als 15 W 30 Sekunden nach dem Fehler (Klausel 6.2.3.2,
  Wortlaut des Prüfberichtsformulars von 2014) [FLIR p. 48; AIR p. 52]. Die
  Eingänge der Platine haben PTC-Sicherungen, daher kann das 100-W-Kriterium
  zutreffen. Die Ausgabe 2014 zählte die Leistung, die dem Teil zur Verfügung
  steht, wodurch fast jedes Teil eines PS2-Stromkreises eine war. Die Ausgabe
  2018 zählt, was das Teil selbst umsetzt [ULQA; TI 2018 TRF].
- ein Kontakt oder eine Verbindung mit einer Leerlaufspannung von mindestens
  50 V Spitze, wenn diese Spannung mal dem normalen effektiven Betriebsstrom
  mehr als 15 beträgt (Klausel 6.2.3.1) [FLIR p. 48; AIR p. 51].

Die Antwort von UL auf „could the product's polymeric enclosure be flame rated
HB“, wenn seine Versorgung leistungsbegrenzt ist: "If the proper PIS separation
distances are maintained, an HB rated casing may be fine. If not, a casing
material with a V-1 or V-0 rating typically would be required." [ULQA]

Die drei Eingänge des Lesers:

| Eingang | Leistung, die er ziehen kann | Klasse | Mögliche Zündquelle |
|---|---|---|---|
| USB-C | höchstens 15 W: Die Platine fordert nur 5 V an, und ein Anschluss liefert höchstens 3 A; die eFuse begrenzt den Strom auf 2,2 A. Eine frühere Fassung rechnete der 2-A-Sicherung 12,5 W nach einer Regel von 125 % des Nennwerts einer Sicherung zu (Klausel 6.2.2.2). Diese Regel ist ungeprüft; UL beschreibt stattdessen, knapp unter dem Auslösepunkt zu messen [ULTB]. | PS1 | keine |
| PoE (LAN-Version) | Mehr als 15 W. Ein Labor maß am Anschluss eines vergleichbaren Geräts 33,6 W [FLIR p. 47]. | PS2 | Die Spannung liegt über 50 V, aber Volt mal Ampere nutzt den Strom, den der Leser aus dem Anschluss zieht: 3 bis 9 W gegen die Schwelle von 15 [FLIR p. 48; AIR p. 51] (die 3 bis 9 W sind Entwurfswerte). Ob ein Fehler dazu führt, dass das PoE-Modul oder die Teile davor mehr als 15 W umsetzen, klärt die Fehlerprüfung des Labors. |
| 12-bis-24-V-Klemme | Hinter der 1,1-A-Sicherung 26 W bei 24 V mit dem Nennwert der Sicherung, 33 W nach der ungeprüften 125-%-Regel. Vor der Sicherung das, was die Versorgung liefert. | PS2 mit einer auf 100 W begrenzten Versorgung, PS1 mit einer auf 15 W begrenzten, PS3 ohne Grenze [ULTB] | Unter 50 V, daher gilt nur die 15-W-Regel [FLIR p. 48]. Die Fehlerprüfung entscheidet. |

Der Leser nimmt im Normalbetrieb etwa 2,5 W auf (Schätzung), höchstens 4,5 W
(0,90 A bei 5 V: die höchsten Verbrauchsangaben der Hersteller, mit der
Begrenzung der LEDs in der Firmware) und 8,3 W, wenn jede Last das zöge, was
ihr Hersteller von der Versorgung verlangt, alle gleichzeitig (1,65 A;
[design-notes.md](hardware/touch-p4/design-notes.md#leistungsbilanz)). Zwei
veröffentlichte Berichte zeigen beide Ausgänge für ein PoE-Gerät:

- FLIR-A50/A70-Kamera, PoE, 8,1 W (CTC advanced, Saarbrücken, 2021): Der
  PoE-Anschluss ist PS2 [FLIR pp. 1, 2, 8]. Eine Lichtbogenprüfung, 56 V x
  0,125 A = 7,0 an R542, D1, Q3, Q4 und D4, fand keine Zündquelle durch
  Lichtbögen; der Bericht nennt den Anschluss nicht. Die Fehlerprüfung fand auf
  der PoE-Seite keine Zündquelle durch Widerstandserwärmung, aber eine auf der
  Seite der externen Versorgung (R542) [FLIR p. 48]. Sein Gehäuse ist aus Metall,
  weil dieser zweite Eingang, eine externe Versorgung von 18 bis 56 V, über 100 W
  maß: PS3 [FLIR pp. 2, 10, 47].
- Airtame-PoE-Adapter mit einem Ausgang von 5 V, 2 A (EKTOS, Kopenhagen, 2018)
  [AIR pp. 1, 2]: 57 V x 0,28 A = 15,9 und 16,5 W in drei Teilen. Das Labor fand
  Zündquellen an der Buchse, an den Gleichrichtern und an den Schutzdioden
  [AIR pp. 51, 52]. Sein Gehäuse ist 5VB-Kunststoff und zählt als
  Brandschutzgehäuse [AIR p. 21].

Was daraus für den Leser folgt:

1. Ein Datenblatt, das die Entflammbarkeitsklasse bei der Wandstärke angibt, ist
   in jedem Fall nötig, auch für HB. Eine Klasse im Datenblatt stammt von
   Standardprüfstäben und muss für ein gedrucktes Teil nicht gelten (technische
   Einschätzung). Wo die Klasse zählt (V-1 oder V-0), entscheidet ein Flammtest
   am gedruckten Teil (Anhang S) [ULQA].
2. Die Grenze für die DC-Versorgung im Handbuch und auf dem Typenschild
   entscheidet über die Klasse dieses Eingangs [ULTB]. Eine Grenze von 15 W nimmt
   den Eingang aus der Frage, und der Leser braucht nicht mehr.
3. Das Labor vor der Prüfung fragen, wie es Zündquellen klärt: durch Messung und
   Fehlerprüfung wie im FLIR-Bericht oder durch Annahme. Ein Hersteller darf auch
   eine erklären, um die Messung zu sparen (UL nennt das gängige Praxis)
   [ULQA]; für diesen Leser würde das das HB-Gehäuse kosten.
4. Findet das Labor eine am PoE-Modul oder am DC-Eingang: das Gehäuse oder den
   Teil davon nahe dieser Stelle aus einem für die Wandstärke mit V-0
   eingestuften Filament drucken oder eine Barriere zwischen die Stelle und den
   Kunststoff setzen (ein Blech oder V-1-Material; die Materialregel ist
   ungeprüft). Abstand allein reicht in einem flachen Gehäuse kaum: Die
   Dockplatte liegt 14 mm hinter der Platine, und die Zone reicht 50 mm nach
   oben [ULQA].

Nicht auf der Platine umgesetzt: eine Sicherung, klein genug, um den DC-Eingang
allein zu PS1 zu machen. Nach der ungeprüften 125-%-Regel sind das 0,5 A bei
24 V. Der Leser nimmt bei 12 V in der Spitze 0,45 A auf, und eine Sicherung
dieser Art hält in einem warmen Gehäuse zwei Drittel ihres Nennwerts (die 1,1-A-
Sicherung: 0,7 A bei 60 °C; Entwurfswerte). Sie würde also nur für 24 V
genügen. Ein elektronischer Strombegrenzer würde für beide Spannungen genügen;
das ist eine Änderung der Platine.

Am 24. November 2026 betrachtete und am 25. November erneut geprüfte Filamente:

| Filament | Was sein Hersteller angibt |
|---|---|
| Filament Unger ABS+ | Keine Entflammbarkeitsklasse und keine RoHS- oder REACH-Angabe im Materialleitfaden oder auf der Download-Seite [Unger guide; Unger downloads]. Datenblätter sind für PLA+, PETG und PA12 CF15 veröffentlicht, keines für ABS+ [Unger downloads]. Die Produktseiten und die FAQ konnten nicht gelesen werden. Das Datenblatt anfordern. ABS ohne Flammschutzmittel ist meist HB (ungeprüft: Allgemeinwissen, nicht aus deren Daten). |
| FormFutura ABSpro Flame Retardant | "engineered to meet the UL 94 V-0 flammability standards"; eine Mischung aus Polycarbonat und ABS, RoHS und REACH angegeben. Das Datenblatt nennt keine Dicke für die Klasse [FormFutura TDS]. |
| BASF Ultrafuse PC/ABS FR Black | V-0 bei 1,5 mm und 3,0 mm [BASF TDS] |
| ROSA "ABS FR V0" | Das Datenblatt ist mit „ABS+“ überschrieben und gibt HB bei 1,5 mm und 3,0 mm an [ROSA TDS]. Entweder ist das Produkt HB, oder der Hersteller hat das ABS+-Datenblatt wiederverwendet. ROSA um einen Nachweis für V-0 bitten; sich nicht auf den Produktnamen verlassen. |

ABS passt sonst zum Leser: Filament Unger gibt für seines etwa 95 °C an
[Unger guide]. Bei typischer Nutzung an PoE in einem Raum von 40 °C erreicht die
wärmste Stelle etwa 80 °C und das WLAN-Modul 79 °C (Schätzung). Bei langem
Betrieb mit allem eingeschaltet würden die LED-Reihen 70 bis 80 K wärmer als der
Raum; die Firmware begrenzt die LEDs
([design-notes.md](hardware/touch-p4/design-notes.md#simulation)).

## Prüfungen an den Anschlüssen

Aus EN 301 489-1 V2.2.3, die gelesen wurde:

| Prüfung | Pegel | An diesem Leser |
|---|---|---|
| Elektrostatische Entladung | 4 kV Kontakt, 8 kV Luft, an alle zugänglichen Flächen [EN 301 489-1 §9.3.2] | Displayglas und seine Kanten, LED-Fenster, Summeröffnung, Schrauben, Gehäusefugen |
| Gestrahlte Störfestigkeit | 3 V/m, 80 MHz bis 6 GHz [EN 301 489-1 §9.2.2] | immer |
| Schnelle Transienten, HF Gleichtakt | 0,5 kV; 3 V [EN 301 489-1 §9.4.2, §9.5.2] | Ethernet-Anschluss und DC-Eingang, jeweils wenn ihr Kabel länger als 3 m sein darf [EN 301 489-1 §9.4.1, §9.5.1] |
| Stoßspannung (Surge) | 0,5 kV Leitung gegen Erde [EN 301 489-1 §9.8.2.2] | Ethernet-Anschluss mit Innenraumkabeln über 30 m. Mit Außenkabeln 1 kV mit einem 10/700-µs-Impuls [EN 301 489-1 §9.8.2.1]: Außenverkabelung im Handbuch ausschließen. Wo das Koppelnetzwerk einen Hochgeschwindigkeitsanschluss stören würde, darf statt 10/700 µs die 1.2/50-µs-Welle verwendet werden [EN 301 489-17 table 6]. |
| Leitungsgebundene Aussendung, 150 kHz bis 30 MHz | Ethernet: Klasse B der EN 55032, Tabelle A.12 [EN 301 489-1 §8.7.3]. DC-Eingang: Tabelle 5 der EN 301 489-1, 79/66 dBµV (Quasi-Spitzenwert/Mittelwert) bis 0,5 MHz und 73/60 dBµV darüber [EN 301 489-1 §8.3.3] | Ethernet-Anschluss; der DC-Eingang, wenn sein Kabel länger als 3 m sein darf. Bei einem DC-Kabel von höchstens 3 m zu einem eigenen AC/DC-Netzteil stattdessen der AC-Anschluss des Netzteils, in Klasse B [EN 301 489-1 §8.3.1, §8.4.3.2]. Im Sendebetrieb gilt das NFC-Ausschlussband [EN 301 489-1 §8.3.2]. |

EN 301 489-1 prüft einen Anschluss, dessen Kabel länger als 3 m sein darf
[EN 301 489-1 §9.4.1, §9.5.1, annex C.1]. Die DC-Klemme nimmt blanke Adern aus
einer bestehenden Installation auf ([design-notes.md](hardware/touch-p4/design-notes.md)),
die kein kürzeres Kabel zusagen kann: die Prüfungen am DC-Anschluss einplanen.

Surge am DC-Eingang. EN 301 489-1, die die zitierten Teile 3 und 17 anwenden,
verlangt keine Surge-Prüfung an DC-Stromanschlüssen [EN 301 489-1 §9.8.1]. An
diesem Leser bekommt nur der Ethernet-Anschluss eine, 0,5 kV Leitung gegen
Erde, wenn sein Kabel im Innenraum länger als 30 m sein darf
[EN 301 489-1 §9.8.2.2]. Die PoE-Versorgung kommt an diesem Anschluss an, der als
drahtgebundener Netzanschluss zählt [EN 301 489-1 §3.1]. Die Zutrittskontrolle
hat eine eigene EMV-Produktfamiliennorm für die Störfestigkeit, EN 50130-4, die
Zutrittskontrollsysteme für Sicherheitsanwendungen abdeckt
[EVS 50130-4; iTeh 50130-4 preview §1]. Sie ist unter der EMV-Richtlinie
2014/30/EU zitiert, in ihrer Grundausgabe EN 50130-4:2011 (nicht mit A1)
[OJ C 173 2016; EMC summary list 2022], und nicht unter der RED [HS-RED]: Für
dieses Funkprodukt begründet sie keine Konformitätsvermutung. Ihre Anwendung
ist freiwillig, von Kunden der Zutrittskontrolle verlangt. Sie verlangt auch
Surges Leitung gegen Erde über 42 Ohm auf DC-Leitungen mit Kleinspannung
(ungeprüft: Die freie Vorschau zeigt nur, dass Klausel 13, "Slow high energy
voltage surge", existiert [iTeh 50130-4 preview]; mit dem Labor bestätigen).
Der DC-Eingang ist für diese Prüfung geschützt und simuliert; die Einzelheiten
stehen in [design-notes.md](hardware/touch-p4/design-notes.md#stromversorgung), „Power“.
Optionale Kosten vor dem Labor: die Norm selbst, EN 50130-4:2011+A1:2014,
konsolidierter englischer Text, 24,80 EUR inkl. Steuer bei der estnischen
Normungsstelle EVS [EVS 50130-4] (DIN Media verkauft die deutsche Ausgabe für
79,96 EUR [DIN Media 50130-4]). Eine neue Ausgabe, prEN 50130-4:2026, liegt als
Entwurf vor [EVS 50130-4]. IEC 61000-4-5 beschreibt nur die Surge-Prüfung;
Produktnormen entscheiden, ob und mit welchem Pegel sie gilt
[IEC 61000-4-5 preview §1]. Ein Surge Leitung gegen Leitung von 0,5 kV hinter
2 Ohm an diesem DC-Anschluss wird von keiner der obigen Normen verlangt, soweit
sie sich lesen ließen (der Pegel und die 2 Ohm der IEC 61000-4-5 sind ungeprüft:
kostenpflichtige Norm). Ihn zu erfüllen, brauchte einen Wandler für 60 V und
eine größere TVS (Designnotizen, „Power“).

## Was das Platinendesign leistet

Platinenfakten aus Schaltplan und Layout; die Gründe stehen in
[design-notes.md](hardware/touch-p4/design-notes.md). Sie waren nicht Teil der
Quellenprüfung.

| Thema | Maßnahme auf der Platine |
|---|---|
| WLAN-Antenne | Die eigene Leiterplattenantenne des Moduls für 2,4 und 5 GHz, in der oberen linken Ecke der Platine über einem Ausschnitt im oberen Rand, ohne Kupfer auf irgendeiner Lage darunter und mit 15 mm zu jeder Seite; Massefüllung am Rand der Sperrfläche, alle 2,5 mm gestitcht ([design-notes.md](hardware/touch-p4/design-notes.md#wlan-antenne)). |
| Rückstrompfade | Sechs Lagen. Masseflächen auf In1 und In4 und eine 3,3-V-Fläche auf In3, jeweils in einem Stück und ohne Leiterbahnen. Signale laufen auf den beiden äußeren Lagen und auf In2, dazwischen mit Masse gefüllt: Jede Signallage liegt neben einer Fläche, die keine Leiterbahn zerschneidet. |
| Schaltregler | AP63205 am DC-Eingang, mit Spread Spectrum. Zwei TLV62569 für 3,3 V und den Kern, mit 1,5 MHz ohne Spread Spectrum. Kleine Schleifen, Eingangs- und Ausgangskondensatoren direkt neben den ICs. |
| DC-Eingang | Selbstrückstellende Sicherung, dahinter am Stecker eine bidirektionale TVS, Verpolschutzdiode, Pi-Filter (2,2 uF, 2,2 uH, 2 x 2,2 uF; 100-V-Kondensatoren, die bei 24 V je 1,5 uF behalten), ein 47-uF-Elektrolytkondensator, der das Filter dämpft, wenn eine Versorgung unter Spannung eingesteckt wird, und eine TVS vor dem Wandler. Der Wandler sitzt entfernt von der NFC-Antenne, und die DC-Leitung führt nicht um die NFC-Schleife herum. |
| Display-Bus | 33-Ohm-Vorwiderstände an allen RGB- und Sync-Leitungen; bei Bedarf die GPIO-Treiberstärke in der Firmware verringern. |
| Displaykanten und Flexkabel (ESD) | ESD-Arrays (U603, U604) an den vier Touch-Leitungen am Panel-Stecker; die Metallrückseite des Displays über leitfähige Dichtungen auf vier blanken Pads mit Masse verbunden, und Klebeband über dem Flexkabel (Installationsanleitung). Tabelle pro Anschluss: [design-notes.md](hardware/touch-p4/design-notes.md#esd-je-anschluss). |
| Takte | Vorwiderstände am 50-MHz-RMII-Takt, am SDIO-Takt und am Flash-Takt. |
| USB | TVS und ESD-Array am Stecker, Sicherung, Ferritperle in der Versorgung. |
| Ethernet / PoE | Isoliertes PD-Modul, 48-V-Seite in einem eigenen Bereich mit 2 mm Abstand und ohne Kupfer unter der Isolationsbarriere des Moduls, Ferritperlen und TVS am PoE-Eingang, Kondensator über der Barriere, RC von der Buchsenabschirmung zu Masse. Die Ethernet-Paare laufen unter dem Mantel der Buchse auf der Rückseitenlage, die 48-V-Netze auf der Innenlage. |
| NFC | Tiefpass (560 nH / 220 pF) zwischen Sender und Antenne, Dämpfungswiderstände, kein geschlossener Kupferring um die Schleife. |
| Versorgungsfehler | USB speist die 5-V-Schiene über eine eFuse (Sanftanlauf, Strombegrenzung, Abschaltung über 5,53 bis 5,74 V), DC und PoE über ideale Dioden. Alle drei sperren Rückstrom, daher speist keine Quelle eine andere; Entladewiderstände halten unversorgte Eingänge auf 0 V. |
| LEDs | Kondensator an jeder LED, Vorwiderstand und Pull-down in der Datenleitung. |
| Befestigung | Keine Leiterbahnen unter Schraubenköpfen auf den äußeren Lagen. |

## Wo die Platine im Labor noch durchfallen kann

Diese Punkte vor dem Labor messen. Das Wichtigste zuerst. Diese Liste ist
technische Einschätzung, außer wo eine Quelle genannt ist. Die Simulationen in
`sim/` decken nichts davon ab: Sie prüfen Signale, Versorgungen, Wärme und die
beiden Antennen, nicht Aussendungen und nicht Entladungen.

1. **NFC-Oberwellen auf den Kabeln.** Eine Filterstufe, ungeschirmte Spulen, und
   beide Kabel verlassen das Gehäuse neben der Schleife. Die Oberwellen mit
   angeschlossenen Kabeln messen. Mit dem PN532 messen, der verkauft wird (die
   zweite Bezugsquelle oder der von NXP), und dabei bleiben.
2. **Entladungen auf der Benutzerseite.** Die üblichen Ausfälle: Das Display oder
   der Touch-Controller verliert seine Einstellungen, der PN532 hängt, der MCU
   setzt sich zurück. Die Prüfung ist nicht bestanden, wenn sich der Leser nicht
   selbst erholt [EN 301 489-17 §6.4, table 2; Klausel 6 von Teil 1 „shall not
   apply“, EN 301 489-17 §6.1] und, mit dem Hinweis zu Klausel 6 oben, nach den
   objektiven Bestehenskriterien des Prüfplans, darunter kein Verlust von
   Einstellungen, die er als kritisch nennt. Im Gehäuse: die LED-Fenster mit
   einem Diffusor schließen, der das Gehäuse überlappt, Metallschrauben
   abdecken oder erden (die Befestigungslöcher der Platine sind nicht mit Masse
   verbunden) und die Metallrückseite des Displays mit Masse verbinden: Die
   Platine hat auf der Displayseite vier blanke Massepads für leitfähiges Band
   oder leitfähigen Schaumstoff. In der Firmware: ein Watchdog und eine
   regelmäßige Prüfung, die Display, Touch und NFC neu startet.
3. **Das Display-Flexkabel.** Etwa zwanzig schnelle Leitungen in einem
   ungeschirmten Flexkabel. Niedrigste Treiberstärke und Pixeltakt, die
   funktionieren.
4. **Gleichtaktstörungen auf den Kabeln.** Das DC-Filter wirkt nur zwischen den
   beiden Adern, und der PoE-Eingang hat Perlen, aber keine
   Gleichtaktdrossel. Ein aufklappbarer Ferrit am Kabel ist das erste Mittel;
   eine Drossel braucht eine neue Platine.
5. **Abgestrahlte Leistung des WLAN-Moduls.** Die 19,85 dBm des Zertifikats auf
   2,4 GHz liegen 0,15 dB unter dem Grenzwert, auf Espressifs Platine, und das
   Modul steht hier an einer anderen Stelle (siehe „Was das zertifizierte
   WLAN-Modul einspart“). Die e.i.r.p. auf beiden Bändern im geschlossenen
   Gehäuse messen, bevor es das Labor tut, und daraus die Obergrenze der
   Firmware festlegen.

Nützlich vor dem Labor: eine Netznachbildung und ein Spektrumanalysator für den
DC-Eingang, Nahfeldsonden, eine ESD-Pistole und ein halber Tag in einer
Vorprüfkammer. Für das Labor braucht die Firmware Testmodi: NFC-Träger
dauerhaft an, WLAN und Bluetooth auf einem festen Kanal mit fester Leistung
(Espressifs EspRFTestTool und seine Testfirmware oder das ESP-IDF-Beispiel
`examples/phy/cert_test`, in die eigene Firmware des Lesers eingebaut
[RFT; FAQ]) und ein Worst-Case-Modus mit allem aktiv, der auf dem Display
zeigt, ob der Leser noch funktioniert.

## Offene Punkte für das Produkt

- Gehäusematerial, mit einem Datenblatt, das mindestens bei der Wandstärke HB
  angibt. Ob es flammhemmend sein muss, klärt die Fehlerprüfung des Labors
  (siehe „Gehäusekunststoff“).
- Die Grenze für die DC-Versorgung im Handbuch und auf dem Typenschild: 15 W oder
  100 W.
- Die WLAN-Sendeleistung pro Band, aus der e.i.r.p.-Messung des Labors am
  Leser, als Obergrenze der Firmware (siehe „Was das zertifizierte WLAN-Modul
  einspart“).
- Verpackung und Handbuch: die 5-GHz-Beschränkung auf Innenräume mit den
  Länderkürzeln der Mitgliedstaaten und die Frequenzbänder mit ihrer maximalen
  Leistung (siehe „5-GHz-WLAN“).
- Netzteil im Karton oder nicht. Wenn ja, ist es Teil des geprüften Produkts.
- Zulässige Kabellängen für den DC-Eingang und für Ethernet, und keine
  Außenverkabelung. Sie entscheiden, welche Anschlussprüfungen gelten.
- Nur Geschäftskunden oder auch Privatkäufer. Das entscheidet über die
  ElektroG-Registrierung, ob die Anleitung auf Deutsch vorliegen muss und ob die
  Produktsicherheitsverordnung gilt. Die Verpackungspflichten gelten in den
  meisten Fällen so oder so (siehe „Welche Regeln gelten“).
- Eine PN532-Bezugsquelle, ein PoE-Modul, ein Displaytyp. Der Prüfbericht deckt
  ab, was geprüft wurde.
- Typenschild: CE-Kennzeichnung, Modell, Seriennummer, Name und Postanschrift des
  Herstellers [RED Art. 10(6), (7), 20(1)]; durchgestrichene Mülltonne, die
  Identität des Herstellers und die Kennzeichnung für „nach dem 13. August 2005
  in Verkehr gebracht“ [ElektroG §9]. CE-Kennzeichnung auch auf der
  Verpackung [RED Art. 20(1)].
- Im Karton: eine Kopie der Konformitätserklärung oder eine vereinfachte mit der
  Internetadresse des vollständigen Textes [RED Art. 10(9)].
- Technische Unterlagen: Schaltpläne, Layout, Stückliste, Prüfberichte,
  Risikobewertungen, Software-Stückliste. Sie und die Konformitätserklärung
  zehn Jahre aufbewahren, nachdem der Leser in Verkehr gebracht wurde
  [RED Art. 10(4)]; unter dem Cyber Resilience Act zehn Jahre oder den
  Supportzeitraum, je nachdem, was länger ist [CRA Art. 13(13)].

## Offene Punkte für Revision B

- Bei VDE (benannte Stelle 0366) bestätigen lassen, ob ihre Aussage von 2020 zu
  Lesern mit vorzertifizierten Modulen noch gilt.

## Prüflabor

Zwei oder drei akkreditierte Labore um ein Angebot bitten und die genaue
Konfiguration nennen: ESP32-C5-MINI-1-Modul mit seiner Leiterplattenantenne,
WLAN auf 2,4 und 5 GHz (Kanäle 36 bis 64 und 100 bis 140) und Bluetooth LE,
NFC-Leser mit Leiterplattenantenne, Ethernet mit PoE, DC-Versorgung, beide
Bestückungsvarianten. Wo eine benannte Stelle nötig ist (siehe „Wird es
einfach?“), benannte Stellen für die RED anfragen und ab Dezember 2027 auch
für den Cyber Resilience Act: Ein akkreditiertes Labor allein genügt dort nicht
[RED Art. 17(4); CRA Art. 32(2)]. Die Prüfung der Ethernet-Version mit
eingebautem WLAN deckt die WLAN-Version meist als einfacheren Fall ab; das
Labor entscheidet (ungeprüft: Laborpraxis; ETSI EG 203 367 erlaubt, eine
Bewertung für eine gleichwertige Kombination wiederzuverwenden
[EG 203 367 §6.1 note 3]). Mit der Anfrage senden: Blockschaltbild, Liste der
Anschlüsse mit Kabeltyp und -länge, Betriebsmodi, die Modulzertifikate und
-berichte und eine Liste der sicherheitsrelevanten Teile (PoE-Modul,
Sicherungen, Gehäusematerial, Leiterplatte).

## Quellen

Jede Quelle, mit Version, Link und den herangezogenen Klauseln, und das
Ergebnis der Prüfung für jede Aussage auf dieser Seite steht in
[compliance-sources.md](hardware/touch-p4/compliance-sources.md).
