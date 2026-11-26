# CE- und Marktcheckliste
<!-- llms-description: Was CE-Kennzeichnung und EU-Marktregeln vom Touch-P4-Leser verlangen: Funk (2,4 und 5 GHz), EMV, Sicherheit, Cybersicherheit, Registrierungen und was noch offen ist. -->

Was die EU- und die deutschen Regeln vom Touch-P4-Leser verlangen, was die Platine dafür schon leistet und was noch offen ist. Für alle, die das Produkt für den Verkauf und das Prüflabor vorbereiten.

## Geltungsbereich

- Die CE-Kennzeichnung gilt für den fertigen Leser (Platine, Display, Gehäuse, Netzteil, Firmware und Unterlagen), nicht für die Leiterplatte allein [RED Art. 2(1), 20(1)].
- Eine Arbeitscheckliste, Stand November 2026. Keine Rechtsberatung.
- Ein Verweis in eckigen Klammern nennt eine Quelle und die herangezogene Klausel, zum Beispiel [RED Art. 10(9)]. Die Schlüssel stehen unter [Quellen](#quellen).
- Kostenpflichtige Normen (EN 18031, EN 55032, EN 55035, EN 50130-4, EN 50419, IEC 61000-4-5 und jede Ausgabe der EN IEC 62368-1) wurden nicht gelesen. Aussagen, die sich auf sie, auf die Laborpraxis oder auf eine Schätzung stützen, sind mit dem Grund als „ungeprüft“ markiert. Für die EN 62368-1 wurden die veröffentlichten Antworten von UL, das frei verfügbare Inhaltsverzeichnis der Ausgabe 2018 und zwei veröffentlichte Prüfberichte genutzt.

## Aufwand auf einen Blick

Funk, EMV und Sicherheit sind gewöhnliche Arbeit für ein Prüflabor, und das zertifizierte WLAN-Modul nimmt einen Teil davon ab. Registrierungen und Papierkram sind klein. Die Cybersicherheit ist der schwierige Teil, und sie hängt nicht von der Platine ab.

1. **Cyber Resilience Act.** Ein Zutrittskontroll-Leser ist ein „important product, class I“ [CRA Art. 7(1), Anhang III Klasse I Nr. 1]. Ab dem 11. Dezember 2027 darf der Hersteller ihn nur dann selbst bewerten, wenn er eine nach der Verordnung zitierte harmonisierte Norm vollständig anwendet (oder gemeinsame Spezifikationen oder ein EU-Cybersicherheitszertifikat der Stufe „substantial“), die alle Risiken der Kernfunktion des Lesers abdeckt [CRA Art. 32(2); CRA-Leitfaden Rn. 149]. Die Norm für diese Klasse (prEN 40000-10) ist ein Entwurf [DIN Media prEN 40000-10]. Ohne sie prüft eine benannte Stelle das Produkt [CRA Art. 32(2)].
2. **Bis dahin EN 18031.** Seit dem 1. August 2025 muss der Leser die Cybersicherheitsanforderungen der RED erfüllen [DR 2023/2444 Art. 1]. Er kann nur dann ohne benannte Stelle erklärt werden, wenn EN 18031-1 und -2 vollständig angewendet werden und ihre Klauseln zu Standardpasswörtern den Benutzer nie davon befreien, ein Passwort zu setzen und zu verwenden [RED Art. 17(3), (4); HS-RED Nr. 164, 165]. Andernfalls ist schon jetzt eine benannte Stelle nötig.
3. **Erster Besuch im Labor.** Der NFC-Sender, die beiden Kabelanschlüsse und Entladungen auf ein Glasdisplay sind die Stellen, an denen ein erster Durchlauf meist scheitert (ungeprüft: Erfahrung, keine Quelle). Vorheriges Messen entscheidet, ob man das Labor einmal oder dreimal besucht.
4. **Was genau verkauft wird.** Gehäusematerial, Netzteil im Karton oder nicht, zulässige Kabellängen, Geschäfts- oder Privatkäufer und die Zahl der Versionen fügen jeweils Prüfungen und Pflichten hinzu oder nehmen sie weg.

## Welche Regeln gelten

| Regel | Gilt | Was der Hersteller tun muss |
|---|---|---|
| Funkanlagenrichtlinie 2014/53/EU (RED) | ja | Funkanlagen: WLAN auf 2,4 und 5 GHz, Bluetooth, NFC auf 13,56 MHz [RED Art. 2(1)]. Sicherheit, EMV, Funk und Cybersicherheit bewerten [RED Art. 3]. Technische Unterlagen und Konformitätserklärung zehn Jahre nach dem Inverkehrbringen aufbewahren [RED Art. 10(4)]. Eine EU-Konformitätserklärung [RED Art. 18(3)]; jedem Gerät liegt eine Kopie bei oder eine vereinfachte Erklärung mit der Internetadresse des vollständigen Textes [RED Art. 10(9); FuAG §20(2)]. CE-Kennzeichnung auf Gerät und Verpackung [RED Art. 20(1)]; Name, Postanschrift, Typ und Seriennummer auf dem Gerät [RED Art. 10(6), (7)]. Anleitung und Sicherheitsinformationen mit Frequenzbändern und maximaler Sendeleistung [RED Art. 10(8); FuAG §20(3)]; für 5 GHz die Beschränkung auf Innenräume auf der Verpackung und in der Anleitung [RED Art. 10(10)]. Auf Deutsch, wenn an nicht gewerbliche Nutzer verkauft wird; beim Verkauf nur an Unternehmen klare, verständliche Texte [FuAG §20(1)]. Deutsch ist in jedem Fall ratsam. |
| Niederspannungs- und EMV-Richtlinie | nicht gesondert | Für Funkanlagen deckt die RED beide ab [RED Art. 1(4), 3(1), 50; EMCD Art. 2(2)(a)]. Die Sicherheit gilt „with no voltage limit applying“ [RED Art. 3(1)(a)], daher muss der Leser mit 12 bis 24 V und PoE, unterhalb des Bereichs der Niederspannungsrichtlinie, trotzdem sicher sein. Die Erklärung nennt die RED. |
| RED-Cybersicherheit, Delegierte Verordnung (EU) 2022/30 | ja, bis 10. Dezember 2027 | Gilt seit dem 1. August 2025 [DR 2023/2444 Art. 1]: Netzschutz, weil der Leser direkt oder über andere Geräte über das Internet kommunizieren kann [DR 2022/30 Art. 1(1)]; Schutz personenbezogener Daten, weil er Kartennummern verarbeitet, die mit Namen verknüpft sind [DR 2022/30 Art. 1(2)]. Ab dem 11. Dezember 2027 durch DR 2026/339 aufgehoben [DR 2026/339 Art. 1, Erwägungsgrund 4]. Leser, die vorher in Verkehr gebracht wurden, bleiben für diese Anforderungen unter der Marktüberwachung nach der RED [DR 2026/339 Erwägungsgrund 5]. |
| Cyber Resilience Act (EU) 2024/2847 | ja | Seit dem 11. September 2026: ausgenutzte Schwachstellen und schwerwiegende Vorfälle melden: Frühwarnung binnen 24 Stunden, Meldung binnen 72 Stunden, später ein Abschlussbericht [CRA Art. 14(2), (4), 71(2)]. Gilt für Leser, die heute verkauft werden [CRA Art. 69(3)]. Ab dem 11. Dezember 2027: volle Konformität für jedes in Verkehr gebrachte Gerät [CRA Art. 69(2), 71(2)], mit einem Supportzeitraum, der zur erwarteten Nutzungsdauer passt, mindestens fünf Jahre, Enddatum beim Kauf genannt [CRA Art. 13(8), (19)]. Siehe [Cybersicherheit](#cybersicherheit). |
| RoHS 2011/65/EU | ja | Lieferantenerklärungen für alle Bauteile und die Leiterplatte in den technischen Unterlagen aufbewahren (der übliche Nachweis; die Richtlinie verlangt technische Unterlagen und eine interne Fertigungskontrolle) [RoHS Art. 7(b), (d)]. In der Konformitätserklärung genannt [RoHS Anhang VI; RED Art. 18(3)]. |
| REACH Artikel 33; SCIP-Datenbank | ja | Kunden mitteilen, wenn ein Bauteil einen Stoff der Kandidatenliste über 0,1 % enthält, Verbrauchern auf Anfrage binnen 45 Tagen [REACH Art. 33(1), (2)]. Dasselbe an die SCIP-Datenbank der ECHA melden (Abfallrahmenrichtlinie; in Deutschland das Chemikaliengesetz) [WFD Art. 9(1)(i); ChemG §16f]. Blei in Bauteilen ist der übliche Fall, seit Juni 2018 auf der Kandidatenliste [Sagentia (secondary)]. |
| WEEE / ElektroG | ja | Marke und Gerätetyp vor dem ersten Verkauf bei der stiftung ear registrieren [ElektroG §6(1)]: meist zwei bis vier Wochen [ear reg], etwa 130 EUR im Jahr zuzüglich Umsatzsteuer, 32,80 EUR im Quartal [GebV Nr. 1.2; ear fees]. Haushaltsgerät: jährlich eine insolvenzsichere Garantie. B2B-Gerät: glaubhafte Darlegung der Nutzung nur oder üblicherweise außerhalb privater Haushalte, Rücknahmekonzept und -angebot, schriftliche Entsorgungsinformationen bei jeder Lieferung [ElektroG §7(1), (3), §7a, §19, §19a]. Ein Gerät, das auch Privatkäufer nutzen können, gilt als Haushaltsgerät [ElektroG §3 Nr. 5]; ein Wandleser, der nur an Werkstätten verkauft wird, kann ein B2B-Gerät sein, wenn das glaubhaft gezeigt wird [ElektroG §7(3)]. Auf dem Gerät, dauerhaft: durchgestrichene Mülltonne, Identität des Herstellers, Kennzeichnung für „nach dem 13. August 2005 in Verkehr gebracht“ [ElektroG §9(1), (2), §3 Nr. 4]; die übliche Kennzeichnung ist ein Balken unter der Tonne (ungeprüft: EN 50419, kostenpflichtig). Registrierungsnummer auf Angeboten und Rechnungen [ElektroG §6(3)]. Der Direktverkauf an Endnutzer in einem anderen EU-Land braucht dort eine Registrierung über einen Bevollmächtigten; bringt ein örtlicher Importeur oder Händler den Leser auf diesem Markt in Verkehr, registriert sich dieses Unternehmen [WEEE Art. 3(1)(f), 16(1), 17(2); ElektroG §8(5)]. |
| Verpackung: Verordnung (EU) 2025/40 (PPWR) und VerpackDG | ja | Vor der ersten Abgabe in LUCID registrieren [VerpackDG §6(1), (6); ZSVR]. Systembeteiligung für Verpackungen, die typischerweise bei privaten Haushalten oder vergleichbaren Anfallstellen anfallen; Werkstätten und Büros mit haushaltsüblichen Tonnen zählen dazu, daher entfällt die Pflicht beim Verkauf nur an Unternehmen nicht von selbst [VerpackDG §3(6), (7), §7]. Material und Masse melden [VerpackDG §9(1)]. Wer Verpackungen oder ein verpacktes Produkt unter eigenem Namen herstellen lässt, ist nach der PPWR Hersteller der Verpackung, mit Konformitätsbewertung, technischen Unterlagen und EU-Erklärung für die Verpackung [PPWR Art. 3, 15(2)]; ausgenommen ist ein Kleinstunternehmen, dessen Verpackungslieferant im selben Land sitzt [PPWR Art. 3]. Verpackungen außerhalb der Systembeteiligung (etwa Versandkartons an Geschäftskunden) werden kostenlos zurückgenommen [VerpackDG §39(1)]; ab 2028 braucht das eine Genehmigung der ZSVR [ZSVR]. PPWR und VerpackDG haben am 12. August 2026 das Verpackungsgesetz abgelöst [PPWR Art. 71; ZSVR; VerpackDG]. |
| Batterieverordnung (EU) 2023/1542 | nein | Keine Batterie auf der Platine. Gilt, sobald eine hinzukommt [Batteries Reg Art. 1(3)]. |
| Allgemeine Produktsicherheitsverordnung (EU) 2023/988 | wenn Verbraucher es kaufen oder voraussichtlich nutzen | Zählt, wenn Verbraucher es voraussichtlich nutzen, auch wenn es nicht für sie gedacht ist [GPSR Art. 3(1), Erwägungsgrund 17]; Mitglieder, die sich in einem Verein oder Makerspace anmelden, können zählen. Unter EU-Harmonisierungsrecht (der RED) bleiben Fernabsatz, Unfallmeldungen und Rückrufe [GPSR Art. 2(1), 19, 20, 36, 37]. |
| Datengesetz (EU) 2023/2854 | im Anwendungsbereich, Hauptpflichten befreit | Ein „connected product“ [Data Act Art. 2(5)]. Die Pflichten zum Datenzugang gelten nicht für ein Kleinst- oder Kleinunternehmen (Empfehlung 2003/361/EG) ohne größeren Partner oder verbundenes Unternehmen, das das Produkt nicht als Unterauftragnehmer baut; ein Unternehmen, das mittelgroß wird, behält die Befreiung ein Jahr lang [Data Act Art. 7(1)]. Erneut prüfen, wenn das Unternehmen wächst. |
| USB-C-Einheitsladegerät | nein | Betrifft nur gelistete Kategorien wiederaufladbarer Geräte [RED Anhang Ia Teil I]. |
| Funkanlagengesetz | ja | Die deutsche Form der RED; die Bundesnetzagentur überwacht [FuAG Fußnote, §23(1)]. |
| Produkthaftung | ja | Die neue Richtlinie gilt für Produkte, die nach dem 9. Dezember 2026 in Verkehr gebracht werden [PLD Art. 2(1)], über nationales Recht (deutsche Umsetzung nicht geprüft). Software ist ein Produkt; Mängel werden an sicherheitsrelevanten Cybersicherheitsanforderungen gemessen; der Hersteller haftet für fehlende Sicherheitsupdates, solange sie in seiner Kontrolle liegen [PLD Art. 4(1), 7(2)(f), 11(2)]. Entsprechend versichern. |

## Normen, die ein Labor anwendet

- „Zitiert“ heißt im Amtsblatt der EU gelistet. Eine zitierte Norm begründet die Konformitätsvermutung für die Anforderungen, die sie abdeckt, im Rahmen eines etwaigen Hinweises, der bei ihr abgedruckt ist [RED Art. 16]. Sie ist kein Beweis.
- Funk und Cybersicherheit: Nur zitierte, vollständig angewendete Normen erlauben eine Erklärung ohne benannte Stelle [RED Art. 17(3), (4)]. Sicherheit und EMV: Der Hersteller darf immer selbst erklären [RED Art. 17(2)].

| Aspekt | Norm | Stand November 2026 |
|---|---|---|
| Funk, 2,4 GHz | EN 300 328 V2.2.2 | zitiert [HS-RED Nr. 16] |
| Funk, 5 GHz | EN 301 893 V2.2.1 | zitiert seit 15. Mai 2025; V2.1.1 bis 15. Mai 2028 [HS-RED Nr. 65, 65a; HS-RED 2025/893 Art. 2] |
| Funk, 13,56 MHz | EN 300 330 V2.1.1 | zitiert [HS-RED Nr. 17] |
| EMV | EN 301 489-1 V2.2.3, -3 V2.3.2 (NFC), -17 V3.3.1 (WLAN, Bluetooth) | Teile 3 und 17 zitiert, jeweils mit zwei Hinweisen: keine Vermutung für Aussendungen unter 9 kHz und keine, „if its clause 6 is applied“ (Klausel 6 enthält die Leistungskriterien) [HS-RED Nr. 168, 169; EN 301 489-17 §6]. Teil 1 ist nicht zitiert; die Teile 3 und 17 wenden ihn an [EN 301 489-3 §2.1; EN 301 489-17 §2.1]. |
| EMV, Ethernet-Anschluss | EN 55032 (Aussendung), EN 55035 (Störfestigkeit) | EN 55035:2017 unter der RED zitiert [HS-RED Nr. 5]; EN 55032 nur unter der EMV-Richtlinie [HS-EMC] |
| Sicherheit | EN IEC 62368-1:2020 + A11 oder die Ausgabe 2024 | unter der RED nicht zitiert [HS-RED]; unter der Niederspannungsrichtlinie nur die Ausgabe 2014 [HS-LVD]. Das Labor fragen, nach welcher Ausgabe es berichtet. |
| Funkfeld-Exposition | EN IEC 62311 mit EN 50665; EN 50364 für NFC | unter der RED nicht zitiert [HS-RED] |
| Cybersicherheit | EN 18031-1 (Netz), EN 18031-2 (personenbezogene Daten) | mit Hinweisen zitiert [HS-RED Nr. 164, 165; ID 2025/138], siehe [Cybersicherheit](#cybersicherheit) |

**EMV ohne Vermutung.** Mit ihren eigenen Leistungskriterien geprüft, geben die Teile 3 und 17 **keine Konformitätsvermutung für RED Art. 3(1)(b)**; die Kommission stellte fest, dass diese Kriterien „lay down performance-based criteria on a subjective basis“ [HS-RED 2025/893 Erwägungsgrund]. Der Hersteller bewertet die EMV dann selbst [RED Art. 17(2), Anhang II], daher legen der Prüfplan und die technischen Unterlagen objektive Bestehenskriterien fest, zum Beispiel: WLAN-Paketfehlerrate höchstens 10 %, NFC-Lesevorgänge gelingen, Display und Touch erholen sich ohne Reset.

### NFC-Grenzwerte

| Punkt | Grenzwert | Hinweis |
|---|---|---|
| Träger, RFID und NFC | 60 dBµA/m in 10 m, unter einer Spektrumsmaske [EN 300 330 §4.3.4 table 2, notes 2, 3] | Eine Schleife dieser Größe bleibt etwa 50 dB darunter (ungeprüft: unsere Schätzung). |
| Oberwellen in 47 bis 74, 87,5 bis 118, 174 bis 230 und 470 bis 790 MHz | 4 nW e.r.p. [EN 300 330 §4.3.9.3 table 6, §6.2.9] | Trifft 54, 68, 95, 108, 176 bis 217 und 475 bis 786 MHz. Der PN532 steuert die Antenne mit einem Rechtecksignal an (Datenblatt des PN532, hier nicht geprüft). |
| Andere Oberwellen, 30 MHz bis 1 GHz | 250 nW [EN 300 330 §4.3.9.3 table 6] | |
| Zweite Oberwelle, 27,12 MHz | unter -3,5 dBµA/m in 10 m [EN 300 330 §4.3.8.3 table 5] | |

Die kleine Schleife strahlt die Oberwellen kaum ab; die DC- und Ethernet-Kabel daneben tun es (technische Einschätzung). Bei der Funkprüfung hält das Labor Netzleitungen aus der Messung heraus, indem es sie wegführt oder mit Ferritperlen belastet [EN 300 330 §5.4.1, annex C.2.3]. Die eigene Vorprüfung sowohl mit als auch ohne solche Belastung messen.

## Was das zertifizierte WLAN-Modul einspart

Das ESP32-C5-MINI-1 hat eine eigene Leiterplattenantenne für 2,4 und 5 GHz [DS-C5 §1].

| Punkt | Wert |
|---|---|
| Zertifikat | EU-Baumusterprüfbescheinigung 44024-05-2026-260268 vom 27. Mai 2026, Eurofins Electrical and Electronic Testing NA, benannte Stelle 0980, für das Modell mit interner Antenne [CE-C5 pp. 1, 2] |
| Deckt ab | Sicherheit (EN IEC 62368-1:2024 + A11), Gesundheit (EN 50665, EN IEC 62311), EMV (EN 55032, EN 301 489-1 V2.2.3, EN 301 489-17 V3.3.1), Funk (EN 300 328 V2.2.2, EN 301 893 V2.2.1) [CE-C5 pp. 2, 3] |
| Deckt nicht ab | Cybersicherheit [CE-C5 pp. 2, 3] |
| EMV | am Modul allein bewertet: „Some data can be reused, but EMC testing is still required for the final product“ [FAQ] |
| Prüfberichte | Espressif veröffentlicht nur das Zertifikat. EFTA26010030-IE-01-E1, -02-R1 bis -R4, -03-M1V1 und -04-L1 (Eurofins TA Technology (Shanghai)) anfordern, bevor man Labore um Angebote bittet [CE-C5 pp. 2, 3; FAQ] |
| Genannte Sendeleistung | WLAN 2,4 GHz 19,85 dBm; Bluetooth LE 16,36 dBm; 5150 bis 5250, 5250 bis 5350 und 5470 bis 5725 MHz 20,58, 20,74 und 20,77 dBm; 5725 bis 5850 MHz 13,97 dBm. Ob leitungsgebunden oder abgestrahlt, ist nicht angegeben [CE-C5 p. 2] |
| Antennengewinn auf Espressifs Testplatine | Spitze 4,44 dBi auf 2,4 GHz, 1,55 bis 2,18 dBi auf 5 GHz [ANT-C5 §3.1] |

**Wiederverwendung der Funkbewertung des Moduls.** ETSI EG 203 367 ist ein Leitfaden, keine harmonisierte Norm. Er erlaubt, die Bewertung des Moduls wiederzuverwenden, wenn das Modul unter gleichwertigen Bedingungen sitzt und seine Einbauanleitung befolgt. Ein anderer Host oder eine Antenne außerhalb der Bewertung des Moduls ist eine Abweichung: Der Leser wird dann gegen die Funknorm neu bewertet, was nicht Prüfen bedeuten muss [EG 203 367 §3.1, §6.1 notes 1, 2]. Labore verwenden üblicherweise antennenunabhängige Ergebnisse wie leitungsgebundene Messungen wieder (ungeprüft: Laborpraxis).

Die Antenne ist hier die eigene des Moduls, aber das Modul sitzt in der oberen linken Ecke der Platine, mit seiner Antenne über einem Ausschnitt im oberen Rand, nicht in der Mitte des Randes, wie Espressifs Designleitfaden es vorsieht (siehe [Bekannte Einschränkungen](hardware/touch-p4/limitations.md)). Im Vollwellenmodell liegt dieser Platz in jedem Kanal innerhalb von 3 dB von Espressifs Position und strahlt in einigen 5-GHz-Kanälen bis zu 5,5 dB mehr ab. Ob das noch „gleichwertig“ ist, beurteilt das Labor. Diese Messungen am Leser einplanen:

- abgestrahlte Leistung (e.i.r.p.) und Nebenaussendungen auf beiden Bändern, während NFC gleichzeitig sendet [EG 203 367 §6.1 note 1, §6.2; EN 300 328 §4.3.2.2.3; EN 301 893 §4.2.3];
- EMV mit allen laufenden Funkanlagen [EG 203 367 §5.1.1.3, §5.2.3];
- Funkfeld-Exposition (RED Art. 3(1)(a), außerhalb des Anwendungsbereichs des Leitfadens [EG 203 367 §1]). Die FCC-Zulassung verlangt 20 cm zwischen Antenne und Personen [FCC-C5]; die EU-Bescheinigung nennt EN 50665 und EN IEC 62311, aber keinen Abstand [CE-C5 p. 2], daher auch den Gesundheitsbericht (EFTA26010030-IE-03-M1V1) anfordern. Ein Leser, der berührt wird, hält keine 20 cm ein und braucht eine eigene Bewertung; eine Berechnung genügt meist (ungeprüft: Laborpraxis).

Zu beachten:

- **VDE.** Eine deutsche benannte Stelle (VDE, 0366) verlangt eine EU-Baumusterprüfung, sobald nur Modulberichte vorliegen („RED Information Radio Modules“, 24. November 2020) [VDE RED modules p. 2]. Jedes Labor vor dem Angebot fragen, wie es das sieht; bei VDE nachfragen, ob die Aussage von 2020 noch gilt.
- **Sendeleistung.** Die Grenzwerte gelten für die e.i.r.p.: 20 dBm auf 2,4 GHz [EN 300 328 §4.3.2.2.3], 5 GHz siehe [5-GHz-WLAN](#_5-ghz-wlan). Wo die Antenne des Lesers mehr Gewinn hat als die von Espressif, sinkt die Leistung um die Differenz. Die maximale Sendeleistung ist also eine Firmware-Einstellung, begrenzt durch das, was das Labor am Leser misst ([firmware-port.md](hardware/touch-p4/firmware-port.md), Regel zur Sendeleistung).
- **Eine Funkkonfiguration.** Die Antenne ist Teil des Moduls: keine Antennenwahl, kein Antennenanschluss. Metall von der oberen linken Ecke fernhalten; im Modell kostet eine Metallwand hinter dem Leser 1,1 bis 1,7 dB auf 2,4 GHz ([design-notes.md](hardware/touch-p4/design-notes.md#antenne)).
- **US-Version (später).** Die FCC-Zulassung ist eine einzelne modulare Zulassung, mit 20 cm zu Personen und gleichzeitig sendenden Sendern, die nach den Verfahren der FCC bewertet werden [FCC-C5]. Diese Seite behandelt nur die EU.

## 5-GHz-WLAN

Die EU harmonisiert 5150 bis 5350 und 5470 bis 5725 MHz für WLAN durch den Durchführungsbeschluss (EU) 2022/179, dessen Anhang durch (EU) 2022/2307 ersetzt wurde; er hob den Beschluss 2005/513/EG auf [WAS Art. 1, 5; WAS-A Art. 1(2)]. EN 301 893 V2.2.1 begründet seit dem 15. Mai 2025 eine Vermutung [HS-RED Nr. 65a; HS-RED 2025/893], V2.1.1 bis zum 15. Mai 2028 [HS-RED 2025/893 Art. 2]. Das Zertifikat des Moduls nennt V2.2.1 [CE-C5 p. 3].

| Band (Kanäle) | Erlaubte Nutzung | Mittlere e.i.r.p. | An diesem Leser |
|---|---|---|---|
| 5150 bis 5250 MHz (36 bis 48) | in Innenräumen, einschließlich Straßenfahrzeugen, Zügen und Flugzeugen; begrenzte Nutzung im Freien, nicht „attached to a fixed outdoor antenna, fixed infrastructure or to the external body of road vehicles“ [WAS Annex table 1, note 1] | 200 mW (23 dBm), 10 mW/MHz [WAS Annex table 1] | genutzt |
| 5250 bis 5350 MHz (52 bis 64) | „Indoor use: inside buildings only“ [WAS Annex table 2] | 200 mW mit Sendeleistungsregelung (TPC), sonst 100 mW (20 dBm); DFS [WAS Annex table 2] | genutzt, als Station unter der DFS des Zugangspunkts |
| 5470 bis 5725 MHz (100 bis 140) | in Innenräumen und im Freien [WAS Annex table 3] | 1 W mit TPC, sonst 500 mW; DFS [WAS Annex table 3]. Ein sekundäres Gerät ohne Radarerkennung hält die Grenzwerte von 5250 bis 5350 MHz ein [EN 301 893 §4.2.3.2.2 table 2, note 1] | genutzt, auf dieselbe Weise |
| 5725 bis 5875 MHz (149 bis 165) | nicht im WLAN-Beschluss; nicht spezifische Kurzstreckengeräte [SRD Annex band 61] | 25 mW | nicht genutzt |

Was das für den Leser bedeutet:

- **Nur Station, ohne eigene Radarerkennung.** Der Zugangspunkt ist das primäre Gerät, der Leser ein sekundäres Gerät [EN 301 893 §3.1]. „A secondary device shall not transmit before receiving an appropriate enabling signal from the primary device“ [EN 301 893 §4.2.6.1.4.2 a)]; ohne Radarerkennung braucht es nur die Kanalabschaltung auf Anordnung des Zugangspunkts [EN 301 893 §4.2.6.2.1 table 5]. Bis zu 23 dBm e.i.r.p. muss ein sekundäres Gerät selbst kein Radar erkennen, es sei denn, es wird in einer festen Punkt-zu-Punkt- oder Punkt-zu-Mehrpunkt-Verbindung im Freien genutzt [EN 301 893 annex D, table D.2 note 2].
- **Die Grenzen des C5.** Er „only supports passive radar detection“, „cannot operate as a DFS AP in SoftAP mode“, und „In SoftAP mode, ESP32-C5 is not allowed to operate on DFS channels“; im Modus Station plus SoftAP folgt sein Zugangspunkt der Station auf einen DFS-Kanal [IDF-WIFI, DFS]. Firmware: ein Provisionierungs-Zugangspunkt nur auf 2,4 GHz oder den Kanälen 36 bis 48, und aus, solange die Station einen DFS-Kanal nutzt ([firmware-port.md](hardware/touch-p4/firmware-port.md), Regel zum Provisionierungs-Zugangspunkt).
- **Leistung.** Ohne TPC: 20 dBm e.i.r.p. von 5250 bis 5725 MHz, 23 dBm von 5150 bis 5250 MHz [EN 301 893 §4.2.3.2.2 table 2]. Die 20,74 und 20,77 dBm des Zertifikats liegen über 20 dBm; den Leser dort bei 20 dBm e.i.r.p. halten, es sei denn, das Labor bestätigt, dass die Firmware TPC beherrscht.
- **Keine Länder- oder Bandeinstellung für den Benutzer.** „DFS settings shall not be accessible to the user“, einschließlich „not allowing the user to change the country of operation and/or the operating frequency band if that results in the equipment no longer being compliant“ [WAS Annex tables 2, 3]. ESP-IDF startet im Weltmodus („01“) mit einer automatischen Richtlinie, die das Land des Zugangspunkts übernimmt; unter `WIFI_COUNTRY_POLICY_MANUAL` gilt „the configured country info is used always“, und erst dann wirkt die 5-GHz-Kanalmaske (`wifi_5g_channel_mask`) [IDF-API, `esp_wifi_set_country`, `wifi_country_t`]. Firmware: manuelle Richtlinie, EU-Regeln, nur die Kanäle 36 bis 64 und 100 bis 140, zur Build-Zeit festgelegt ([firmware-port.md](hardware/touch-p4/firmware-port.md), Regel zum WLAN-Land). Espressifs eigene Tabelle für Deutschland würde die Kanäle 149 bis 165 mit 25 mW erlauben und zitiert noch den aufgehobenen Beschluss 2005/513/EG [IDF-REG]; die Kanalmaske hält sie aus.
- **Betrieb in Innenräumen, auf der Verpackung und im Handbuch.** Die Kanäle 36 bis 64 sind in jedem Mitgliedstaat auf Innenräume beschränkt, eine Beschränkung der Inbetriebnahme. Die Verpackung zeigt entweder das Piktogramm der Durchführungsverordnung (EU) 2017/1354 (ein Ausrufezeichen auf einem Buch, mit den Länderkürzeln der Mitgliedstaaten darunter oder daneben) oder die Worte „Restrictions or Requirements in“, gefolgt von diesen Kürzeln [RED Art. 10(10); IR 2017/1354 Art. 2(1), Anhang I, II]. Die Anleitung listet die Mitgliedstaaten und die Beschränkung auf, „5150 to 5350 MHz: indoor use only“, in allen [IR 2017/1354 Art. 2(2)], und nennt die Bänder und die jeweils maximale Leistung [RED Art. 10(8)]: 2400 bis 2483,5 MHz, 5150 bis 5350 MHz und 5470 bis 5725 MHz, mit der e.i.r.p., die das Labor gemessen hat. Der Leser ist ohnehin ein Gerät für Innenräume ([spec.md](hardware/touch-p4/spec.md)); sein Gehäuse ist nicht für den Außenbereich gemacht ([Gehäuse](hardware/touch-p4/case.md)).

## Cybersicherheit

### Jetzt, unter der RED

- Der Leser muss RED Art. 3(3)(d) und (e) erfüllen: Er kann über das Internet kommunizieren und verarbeitet personenbezogene Daten [DR 2022/30 Art. 1(1), (2)]. Buchstabe (f), Geldübertragung, gilt nicht [DR 2022/30 Art. 1(3)].
- Eine Erklärung ohne benannte Stelle braucht EN 18031-1 und -2, vollständig angewendet [RED Art. 17(3), (4)].
- Die Normen sind mit Hinweisen zitiert: keine Vermutung, wenn der Benutzer nach ihren Klauseln zu Standardpasswörtern (6.2.5.1 und 6.2.5.2) das Setzen und Verwenden eines Passworts überspringen darf. Ihre Abschnitte „rationale“ und „guidance“ zählen nie [HS-RED Nr. 164, 165; ID 2025/138 Erwägungsgrund 6].
- Daher: Jeder Zugriff auf Einstellungen, Kopplung und die Serviceschnittstelle ist authentifiziert, mit Zugangsdaten, die pro Gerät eindeutig sind oder bei der ersten Nutzung gesetzt werden und nicht übersprungen werden können. Jede Anforderung beider Teile wird mit den Entscheidungsbäumen der Norm dokumentiert. (Ungeprüft: EN 18031 wurde nicht gelesen; mit dem Labor bestätigen.)
- Die Firmware des ESP32-C5 ist Teil des Produkts (unsere Lesart: Die RED zählt Software als Bestandteil [RED Art. 10(8)]).

### Ab dem 11. Dezember 2027, unter dem Cyber Resilience Act

- **Klasse I.** Anhang III listet „identity management systems and privileged access management software and hardware, including authentication and access control readers, including biometric readers“ [CRA Annex III class I no. 1]. Die IR 2025/2392 schließt „access management systems that control access ... to digital resources or physical locations“ ein [IR 2025/2392 Annex I class I no. 1].
- **Selbstbewertung** nur, wo zitierte harmonisierte Normen (oder gemeinsame Spezifikationen oder ein EU-Zertifikat der Stufe „substantial“) bestehen, vollständig angewendet werden und alle Risiken der Kernfunktion abdecken [CRA Art. 32(2); CRA-Leitfaden Rn. 149]. Andernfalls prüft eine benannte Stelle.
- **EN 18031 gilt nicht weiter.** Sie ist nur unter der RED zitiert und begründet unter der Verordnung keine Vermutung [CRA Art. 27(1)]. Übertragbar ist das RED-Cybersicherheitszertifikat einer benannten Stelle, für die Risiken, die es abdeckt, und nicht über den 11. Juni 2028 hinaus [CRA Art. 69(1); CRA-Leitfaden Rn. 251 bis 254].
- **Die Norm.** prEN 40000-10, von CEN/TC 224, lag von Ende Mai bis 13. August 2026 zur Kommentierung aus [DIN Media prEN 40000-10; Genorma (secondary)]. Die Frist der Kommission für die Annahme durch CEN ist der 31. Januar 2027 [C(2026) 7861 annex, line 16]; die Zitierung im Amtsblatt folgt später. Für die Verordnung ist noch keine Norm zitiert [CRA std page]. Ob diese vor Dezember 2027 zitiert wird, ist offen: für beide Ausgänge planen und in der ersten Hälfte 2027 erneut nachsehen.
- **Open Source hilft weniger, als es scheint.** Produkte, die in Anhang III „qualifying as free and open-source software“ sind, dürfen sich selbst bewerten, wenn ihre technischen Unterlagen beim Inverkehrbringen öffentlich sind [CRA Art. 32(5); CRA-Leitfaden Rn. 137]. Die Definition umfasst Software [CRA Art. 3(48)]; ob ein Hardware-Leser mit offener Firmware dazu zählt, ist nicht geklärt, und der Leitfaden der Kommission behandelt Hardware und Firmware als ein Produkt [CRA-Leitfaden Rn. 25]. Das BSI fragen, die vorgesehene deutsche Marktüberwachungsbehörde [BT-Drs 21/6134 Art. 1, §65(1) BSIG]; der Bundestag hat dieses Gesetz am 15. Oktober 2026 beschlossen, seine Verkündung wurde noch nicht gefunden [BR-Drs 621/26]. Die Veröffentlichung der Unterlagen kostet dieses Projekt ohnehin nichts.
- **Keine Ausnahme für kleine Unternehmen.** Sie erhalten niedrigere Gebühren der benannten Stellen [CRA Art. 32(6)], eine vereinfachte Form der Unterlagen, die noch nicht veröffentlicht ist [CRA Art. 33(5); MSME page], und keine Geldbuße für die versäumte 24-Stunden-Frühwarnung; die 72-Stunden-Meldung gilt weiterhin [CRA Art. 64(10)(a)].

### Was es inhaltlich braucht

| Von der Verordnung verlangt | Quelle |
|---|---|
| Schriftliche Risikobewertung, aktuell gehalten | [CRA Art. 13(2), (3)] |
| Software-Stückliste | [CRA Annex I Part II (1)] |
| Supportzeitraum, der die erwartete Nutzungsdauer widerspiegelt, mindestens fünf Jahre | [CRA Art. 13(8), (19)] |
| Kontaktadresse für Schwachstellenmeldungen | [CRA Annex I Part II (6), Art. 13(17)] |
| Richtlinie zur koordinierten Offenlegung von Schwachstellen | [CRA Annex I Part II (5)] |
| Kostenlose Sicherheitsupdates | [CRA Annex I Part II (8)] |
| Updates standardmäßig automatisch installiert, einfache Abwahl, wo anwendbar | [CRA Annex I Part I (2)(c)] |
| Jedes Update zehn Jahre oder den Rest des Supportzeitraums verfügbar | [CRA Art. 13(9)] |
| Veröffentlichte Informationen zu behobenen Schwachstellen | [CRA Annex I Part II (4)] |
| Benutzerinformationen nach Anhang II | [CRA Art. 13(18)] |
| Technische Unterlagen und Erklärung zehn Jahre oder den Supportzeitraum aufbewahrt, je nachdem, was länger ist | [CRA Art. 13(13)] |
| Meldepflicht (gilt bereits) | [CRA Art. 69(3), 71(2)] |

Die vom Projekt gewählten Mittel, die die Verordnung nicht nennt:

- Secure Boot und Flash-Verschlüsselung auf dem ESP32-P4 [CRA Annex I Part I (2)(e), (f)]; siehe [firmware-port.md](hardware/touch-p4/firmware-port.md) für einen hier wichtigen Erratum-Eintrag;
- signierte Firmware-Updates für beide Prozessoren [CRA Annex I Part II (7)];
- keine Standard-Zugangsdaten [CRA Annex I Part I (2)(b), (d)];
- ein schriftliches Verfahren für die 24-Stunden-Meldung [CRA Art. 14(2)(a)].

## Sicherheit

- **Kein Schutz gegen elektrischen Schlag an den Eingängen.** Jede Versorgung (PoE, 12 bis 24 V, USB) liegt unter 60 V DC, der ES1-Grenze (Tabelle 4 der EN 62368-1:2018) [ULQA; IEC18 contents]; beide unten genannten veröffentlichten Berichte stufen einen PoE-Eingang als ES1 ein [FLIR p. 8; AIR pp. 8, 9]. Wandler im Inneren können mehr als 60 V DC erzeugen (ES2 oder ES3), was Schutzmaßnahmen braucht; das Labor stuft diese Stellen ein [ULQA]. Der Rest ist Brandschutz, Erwärmung, Mechanik und Kennzeichnung.
- **Die Versorgungen schriftlich begrenzen.** Handbuch und Typenschild sagen, dass der DC-Eingang nur an eine Versorgung angeschlossen werden darf, die auf 100 W begrenzt ist, besser auf 15 W [ULTB] (das Labor kennt den Wortlaut, den seine Ausgabe verlangt). Ohne angegebene Grenze misst das Labor mit einer starken Quelle; im FLIR-Bericht maß ein solcher Eingang über 100 W, wurde zu PS3, und das Gehäuse musste ein Brandschutzgehäuse sein [FLIR pp. 10, 47]. Die Platine hat eine selbstrückstellende Sicherung von 1,1 A am DC-Eingang und 2 A an USB; an USB begrenzt außerdem die eFuse den Strom auf 1,8 bis 2,2 A (Entwurfswerte).
- **Gehäuse.** Ein Kunststoff, dessen Datenblatt mindestens HB angibt [ULQA, zu Klausel 6.3.1 der Ausgabe 2014]; ab der Ausgabe 2018 ist ein Glühdrahtversuch bei 550 °C eine Alternative [TUV item 17 (secondary)]. Flammhemmender Kunststoff nur, wo das Labor ein Teil findet, das sich entzünden könnte; siehe [Gehäusekunststoff](#gehäusekunststoff).
- **Leiterplatte.** FR-4 mit Einstufung V-0 und UL-Kennzeichen. Die Norm verlangt V-1 oder besser (Klausel 6.4.5.2; ungeprüft: kostenpflichtige Norm, aber ein veröffentlichter Bericht vermerkt unter dieser Klausel „PCB: V-0“ [FLIR p. 18]). JLCPCB hat die UL-Akte E479892 und bringt sein UL-Kennzeichen an, wenn die Bestellung es verlangt [JLCPCB UL].
- **Ein Netzteil im Karton** wird Teil des geprüften Produkts (ungeprüft: Laborpraxis). Eines mit eigenem Bericht kaufen.
- **Näherungssensor (U704).** Infrarot 940 nm aus einer LED, nicht aus einem Laser. EN 60825-1 deckt LEDs nicht mehr ab [BSI 60825-1]: kein Laseretikett. Die LED pulst mit höchstens 200 mA, höchstens 1 ms lang und höchstens 1/40 der Zeit, im geschlossenen Gehäuse (Datenblatt des Sensors, hier nicht geprüft). Das Labor fragen, ob Klausel 10.4 (optische Strahlung von LEDs, Risikogruppen der IEC 62471) etwas Dokumentiertes verlangt [IEC18 contents].
- **Die PoE-Isolierung** verlangt die Ethernet-Norm, nicht die Sicherheitsnorm. IEEE 802.3 verlangt von einem versorgten Gerät, alle PoE-Leitungen von allen externen Leitern zu isolieren [IEEEI]. Prüfung: 1500 V RMS für 60 s, 2250 V DC für 60 s oder zehn Impulse von 1500 V mit 10/700 µs, danach ein Isolationswiderstand von mindestens 2 Mohm bei 500 V DC [IEEEW (secondary)]. Die Auslegung 3-07/04 zitiert 802.3af-2003 und bestätigt nur die RMS-Prüfung [IEEEI]; IEEE 802.3-2022 wurde nicht gelesen. Die EN 62368-1 verlangt die Trennung eines Ethernet-Anschlusses nur von geerdeten Schaltungen (Klausel 5.4.11) [ULQA; FLIR p. 15]; der Leser hat keine, also verlangt die Sicherheitsnorm hier keine Isolierung. Ein CE-Labor prüft sie womöglich nicht; Kunden erwarten sie (unsere Einschätzung). Was die Platine dafür tut und wo sie schwach ist: [design-notes.md](hardware/touch-p4/design-notes.md#poe-potenzialtrennung).

### Gehäusekunststoff

Grundlage: Klausel 6 der EN 62368-1 in der Ausgabe 2014, die veröffentlichten Antworten von UL zur Ausgabe 2018 und zwei veröffentlichte Prüfberichte von PoE-Geräten. Punkte, die allein auf dem Text von 2014 beruhen, sind als ungeprüft markiert. Die Ausgaben 2018 und 2023 wurden nicht gelesen, und Labore berichten nach ihnen: Das Labor hat das letzte Wort. Zwei Änderungen der Ausgabe 2018 sind wichtig: Teile unter 4 g oder 1750 mm³ sind von den Regeln für brennbares Material ausgenommen, und ein Glühdrahtversuch bei 550 °C darf HB ersetzen [TUV items 16, 17 (secondary)]. V-1 für das ganze Gehäuse ist strenger, als die Norm für Stromkreise bis 100 W verlangt [ULQA].

Der Gehäusekunststoff hängt von der Leistung ab, die ein Stromkreis aus seiner Versorgung in einen Fehler ziehen kann, nicht davon, was der Leser verbraucht:

| Leistung, die ein Stromkreis ziehen kann | Klasse | Gehäusekunststoff |
|---|---|---|
| bis 15 W, 3 s in den Fehler [ULTB] | PS1 | HB, belegt durch das Datenblatt (Klausel 6.3.1) [ULQA]. HB75 unter 3 mm Wandstärke und HB40 ab 3 mm ist ungeprüft (nur Ausgabe 2014). Kein Teil eines solchen Stromkreises gilt als zündfähig [ULQA; ULTB]. |
| bis 100 W, 5 s in den Fehler [ULTB] | PS2 | HB, kein Brandschutzgehäuse [ULQA]. Kunststoff näher als 13 mm neben oder 50 mm über einer möglichen Zündquelle muss V-1 sein, einen Flammtest bestehen (Anhang S) oder hinter einer Barriere liegen (Klauseln 6.4.5, 6.4.7) [ULQA; FLIR p. 18]. Dass die Barriere aus Metall oder V-1 sein muss, ist ungeprüft. |
| mehr, oder eine Versorgung ohne angegebene Grenze | PS3 | Brandschutzgehäuse um den PS3-Stromkreis (Klauseln 6.4.6, 6.4.8) [FLIR p. 18]; in einem kleinen Gehäuse praktisch das ganze Gehäuse, V-1 oder besser [ULQA] (mit dem Labor bestätigen). |

Eine mögliche Zündquelle ist:

- ein Teil, das nach 30 s Normalbetrieb mehr als 15 W umsetzt; oder, bei einem Einzelfehler, mehr als 100 W unmittelbar nach dem Fehler, wo elektronische Schaltungen, Regler oder PTC-Elemente die Leistung begrenzen, sonst mehr als 15 W 30 s nach dem Fehler (Klausel 6.2.3.2, Wortlaut des Prüfberichtsformulars von 2014) [FLIR p. 48; AIR p. 52]. Die Eingänge der Platine haben PTC-Sicherungen, daher kann das 100-W-Kriterium zutreffen. Die Ausgabe 2014 zählte die Leistung, die dem Teil zur Verfügung steht; die Ausgabe 2018 zählt, was das Teil selbst umsetzt [ULQA; TI 2018 TRF];
- ein Kontakt oder eine Verbindung mit mindestens 50 V Spitze Leerlaufspannung, wenn diese Spannung mal dem normalen effektiven Betriebsstrom mehr als 15 beträgt (Klausel 6.2.3.1) [FLIR p. 48; AIR p. 51].

UL, gefragt, ob das Gehäuse eines leistungsbegrenzten Produkts HB sein könnte: „If the proper PIS separation distances are maintained, an HB rated casing may be fine. If not, a casing material with a V-1 or V-0 rating typically would be required.“ [ULQA]

| Eingang | Leistung, die er ziehen kann | Klasse | Mögliche Zündquelle |
|---|---|---|---|
| USB-C | höchstens 15 W: Die Platine fordert nur 5 V an, ein Anschluss liefert höchstens 3 A, die eFuse begrenzt auf 2,2 A. Eine 125-%-Regel für Sicherungsnennwerte (Klausel 6.2.2.2) würde der 2-A-Sicherung 12,5 W zurechnen; diese Regel ist ungeprüft, und UL beschreibt stattdessen, knapp unter dem Auslösepunkt zu messen [ULTB]. | PS1 | keine |
| PoE (LAN-Version) | Mehr als 15 W; ein Labor maß am Anschluss eines vergleichbaren Geräts 33,6 W [FLIR p. 47]. | PS2 | Über 50 V, aber Volt mal Ampere nutzt den Strom, den der Leser aufnimmt: 3 bis 9 W (Entwurfswerte) gegen 15 [FLIR p. 48; AIR p. 51]. Ob ein Fehler das PoE-Modul oder die Teile davor mehr als 15 W umsetzen lässt, klärt die Fehlerprüfung des Labors. |
| 12-bis-24-V-Klemme | Hinter der 1,1-A-Sicherung 26 W bei 24 V mit dem Nennwert der Sicherung, 33 W nach der ungeprüften 125-%-Regel; vor der Sicherung das, was die Versorgung liefert. | PS2 mit einer auf 100 W begrenzten Versorgung, PS1 mit 15 W, PS3 ohne Grenze [ULTB] | Unter 50 V, daher gilt nur die 15-W-Regel [FLIR p. 48]. Die Fehlerprüfung entscheidet. |

Der Leser nimmt im Normalbetrieb etwa 2,5 W auf (Schätzung), höchstens 4,5 W (0,90 A bei 5 V, die höchsten Angaben der Hersteller, mit der LED-Begrenzung der Firmware) und 8,3 W (1,65 A), wenn jede Last das zöge, was ihr Hersteller von der Versorgung verlangt, alle gleichzeitig ([design-notes.md](hardware/touch-p4/design-notes.md#leistungsbilanz)).

Zwei veröffentlichte Berichte von PoE-Geräten zeigen beide Ausgänge:

| Gerät | PoE-Seite | Gehäuse |
|---|---|---|
| FLIR-A50/A70-Kamera, 8,1 W (CTC advanced, 2021) [FLIR pp. 1, 2, 8] | PS2. Lichtbogenprüfung 56 V x 0,125 A = 7,0 (Anschluss nicht genannt): keine Zündquelle durch Lichtbögen. Fehlerprüfung: keine Zündquelle durch Widerstandserwärmung auf der PoE-Seite, eine auf der Seite der externen Versorgung (R542) [FLIR p. 48]. | Metall, weil der zweite Eingang (externe Versorgung 18 bis 56 V) über 100 W maß: PS3 [FLIR pp. 2, 10, 47] |
| Airtame-PoE-Adapter, Ausgang 5 V 2 A (EKTOS, 2018) [AIR pp. 1, 2] | 57 V x 0,28 A = 15,9 und 16,5 W in drei Teilen: Zündquellen an der Buchse, den Gleichrichtern und den Schutzdioden [AIR pp. 51, 52] | 5VB-Kunststoff, zählt als Brandschutzgehäuse [AIR p. 21] |

Was daraus für den Leser folgt:

1. Ein Datenblatt, das die Entflammbarkeitsklasse bei der Wandstärke angibt, in jedem Fall, auch für HB. Eine Klasse im Datenblatt stammt von Standardprüfstäben und muss für ein gedrucktes Teil nicht gelten (technische Einschätzung). Wo V-1 oder V-0 zählt, entscheidet ein Flammtest am gedruckten Teil (Anhang S) [ULQA].
2. Die Grenze für die DC-Versorgung in Handbuch und Typenschild entscheidet über die Klasse dieses Eingangs [ULTB]. 15 W nimmt den Eingang aus der Frage, und der Leser braucht nicht mehr.
3. Das Labor fragen, wie es Zündquellen klärt: durch Messung und Fehlerprüfung (wie im FLIR-Bericht) oder durch Annahme. Ein Hersteller darf eine erklären, um die Messung zu sparen (UL nennt das gängige Praxis) [ULQA]; hier würde das das HB-Gehäuse kosten.
4. Findet das Labor eine am PoE-Modul oder am DC-Eingang: das Gehäuse oder den Teil nahe dieser Stelle aus einem Filament drucken, das bei der Wandstärke mit V-0 eingestuft ist, oder eine Barriere (Metall oder V-1; Materialregel ungeprüft) zwischen Stelle und Kunststoff setzen. Abstand allein reicht kaum: Die Dockplatte liegt 14 mm hinter der Platine, und die Zone reicht 50 mm nach oben [ULQA].

Nicht auf der Platine umgesetzt: eine Sicherung, klein genug, um den DC-Eingang allein zu PS1 zu machen. Nach der ungeprüften 125-%-Regel sind das 0,5 A bei 24 V. Der Leser nimmt bei 12 V in der Spitze 0,45 A auf, und eine solche Sicherung hält in einem warmen Gehäuse zwei Drittel ihres Nennwerts (die 1,1-A-Sicherung: 0,7 A bei 60 °C; Entwurfswerte), sie würde also nur für 24 V genügen. Ein elektronischer Strombegrenzer würde für beide Spannungen genügen; das ist eine Änderung der Platine.

| Filament | Was sein Hersteller angibt |
|---|---|
| Filament Unger ABS+ | Keine Entflammbarkeitsklasse und keine RoHS- oder REACH-Angabe im Materialleitfaden oder in den Downloads [Unger guide; Unger downloads]; Datenblätter gibt es für PLA+, PETG und PA12 CF15, nicht für ABS+ [Unger downloads]. Das Datenblatt anfordern. ABS ohne Flammschutzmittel ist meist HB (ungeprüft: Allgemeinwissen). |
| FormFutura ABSpro Flame Retardant | „engineered to meet the UL 94 V-0 flammability standards“; PC/ABS-Mischung; RoHS und REACH angegeben; keine Dicke für die Klasse [FormFutura TDS] |
| BASF Ultrafuse PC/ABS FR Black | V-0 bei 1,5 mm und 3,0 mm [BASF TDS] |
| ROSA „ABS FR V0“ | Datenblatt mit „ABS+“ überschrieben, gibt HB bei 1,5 und 3,0 mm an [ROSA TDS]. ROSA um einen Nachweis für V-0 bitten; sich nicht auf den Produktnamen verlassen. |

ABS passt sonst zum Leser: Filament Unger gibt für seines etwa 95 °C an [Unger guide]. Bei typischer Nutzung an PoE in einem Raum von 40 °C erreicht die wärmste Stelle etwa 80 °C und das WLAN-Modul 79 °C (Schätzung). Bei langem Betrieb mit allem eingeschaltet würden die LED-Reihen 70 bis 80 K wärmer als der Raum; die Firmware begrenzt die LEDs ([Simulationen](hardware/touch-p4/simulations.md)).

## Prüfungen an den Anschlüssen

Aus EN 301 489-1 V2.2.3:

| Prüfung | Pegel | An diesem Leser |
|---|---|---|
| Elektrostatische Entladung | 4 kV Kontakt, 8 kV Luft, alle zugänglichen Flächen [EN 301 489-1 §9.3.2] | Displayglas und -kanten, LED-Fenster, Summeröffnung, Schrauben, Gehäusefugen |
| Gestrahlte Störfestigkeit | 3 V/m, 80 MHz bis 6 GHz [EN 301 489-1 §9.2.2] | immer |
| Schnelle Transienten; HF Gleichtakt | 0,5 kV; 3 V [EN 301 489-1 §9.4.2, §9.5.2] | Ethernet-Anschluss und DC-Eingang, jeweils wenn ihr Kabel länger als 3 m sein darf [EN 301 489-1 §9.4.1, §9.5.1] |
| Stoßspannung (Surge) | 0,5 kV Leitung gegen Erde [EN 301 489-1 §9.8.2.2] | Ethernet-Anschluss mit Innenraumkabeln über 30 m. Außenkabel: 1 kV, 10/700 µs [EN 301 489-1 §9.8.2.1]; Außenverkabelung im Handbuch ausschließen. Wo das Koppelnetzwerk einen Hochgeschwindigkeitsanschluss stören würde, darf 1,2/50 µs statt 10/700 µs verwendet werden [EN 301 489-17 table 6]. |
| Leitungsgebundene Aussendung, 150 kHz bis 30 MHz | Ethernet: Klasse B der EN 55032, Tabelle A.12 [EN 301 489-1 §8.7.3]. DC: Tabelle 5 der EN 301 489-1, 79/66 dBµV (QP/AV) bis 0,5 MHz, 73/60 dBµV darüber [EN 301 489-1 §8.3.3] | Ethernet-Anschluss; DC-Eingang, wenn sein Kabel länger als 3 m sein darf. Bei einem DC-Kabel von höchstens 3 m zu einem eigenen AC/DC-Netzteil stattdessen der AC-Anschluss des Netzteils, Klasse B [EN 301 489-1 §8.3.1, §8.4.3.2]. Im Sendebetrieb gilt das NFC-Ausschlussband [EN 301 489-1 §8.3.2]. |

Ein Anschluss wird geprüft, wenn sein Kabel länger als 3 m sein darf [EN 301 489-1 §9.4.1, §9.5.1, annex C.1]. Die DC-Klemme nimmt blanke Adern aus einer bestehenden Installation auf, die kein kürzeres Kabel zusagen kann: die Prüfungen am DC-Anschluss einplanen.

### Surge am DC-Eingang

- EN 301 489-1, angewendet durch die zitierten Teile 3 und 17, verlangt keine Surge-Prüfung an DC-Stromanschlüssen [EN 301 489-1 §9.8.1]. Nur der Ethernet-Anschluss bekommt eine, 0,5 kV Leitung gegen Erde bei Innenraumkabeln über 30 m [EN 301 489-1 §9.8.2.2]; PoE kommt an diesem Anschluss an, einem drahtgebundenen Netzanschluss [EN 301 489-1 §3.1].
- EN 50130-4, die EMV-Produktfamiliennorm für die Störfestigkeit von Zutrittskontrollsystemen für Sicherheitsanwendungen [EVS 50130-4; iTeh 50130-4 preview §1], ist unter der EMV-Richtlinie in ihrer Grundausgabe EN 50130-4:2011 (nicht mit A1) zitiert [OJ C 173 2016; EMC summary list 2022], nicht unter der RED [HS-RED]: keine Vermutung für dieses Funkprodukt. Ihre Anwendung ist freiwillig, von Kunden der Zutrittskontrolle verlangt.
- Sie verlangt auch Surges Leitung gegen Erde über 42 Ohm auf DC-Leitungen mit Kleinspannung (ungeprüft: Die freie Vorschau zeigt nur, dass Klausel 13, „Slow high energy voltage surge“, existiert [iTeh 50130-4 preview]; mit dem Labor bestätigen). Der DC-Eingang ist für diese Prüfung geschützt und simuliert ([design-notes.md](hardware/touch-p4/design-notes.md#stromversorgung)).
- Bezug: EN 50130-4:2011+A1:2014, konsolidierter englischer Text, 24,80 EUR inkl. Steuer bei EVS [EVS 50130-4]; deutsche Ausgabe 79,96 EUR bei DIN Media [DIN Media 50130-4]. prEN 50130-4:2026 liegt als Entwurf vor [EVS 50130-4].
- IEC 61000-4-5 beschreibt nur die Surge-Prüfung; Produktnormen entscheiden, ob und mit welchem Pegel sie gilt [IEC 61000-4-5 preview §1]. Einen Surge Leitung gegen Leitung von 0,5 kV hinter 2 Ohm am DC-Anschluss verlangt keine der obigen Normen, soweit sie sich lesen ließen (Pegel und 2 Ohm ungeprüft: kostenpflichtige Norm). Ihn zu erfüllen, bräuchte einen Wandler für 60 V und eine größere TVS.

## Was die Platine leistet

Platinenfakten aus Schaltplan und Layout; die Gründe stehen in [design-notes.md](hardware/touch-p4/design-notes.md). Nicht Teil der Quellenprüfung.

| Thema | Maßnahme auf der Platine |
|---|---|
| WLAN-Antenne | Die eigene Leiterplattenantenne des Moduls (2,4 und 5 GHz) in der oberen linken Ecke über einem Ausschnitt im oberen Rand, kein Kupfer auf irgendeiner Lage darunter, 15 mm frei zu jeder Seite; Massefüllung am Rand der Sperrfläche, alle 2,5 mm gestitcht. |
| Rückstrompfade | Sechs Lagen. Masseflächen auf In1 und In4, 3,3-V-Fläche auf In3, jeweils in einem Stück ohne Leiterbahnen. Signale auf den äußeren Lagen und In2, dazwischen mit Masse gefüllt: Jede Signallage liegt neben einer ungeteilten Fläche. |
| Schaltregler | AP63205 am DC-Eingang, mit Spread Spectrum. Zwei TLV62569 für 3,3 V und den Kern, 1,5 MHz, ohne Spread Spectrum. Kleine Schleifen, Eingangs- und Ausgangskondensatoren direkt neben den ICs. |
| DC-Eingang | Selbstrückstellende Sicherung; dahinter am Stecker eine bidirektionale TVS; Verpolschutzdiode; Pi-Filter (2,2 uF, 2,2 uH, 2 x 2,2 uF; 100-V-Kondensatoren, die bei 24 V je 1,5 uF behalten); 47-uF-Elektrolytkondensator, der das Einstecken unter Spannung dämpft; TVS vor dem Wandler. Wandler entfernt von der NFC-Antenne; die DC-Leitung führt nicht um die NFC-Schleife herum. |
| Display-Bus | 33-Ohm-Vorwiderstände an allen RGB- und Sync-Leitungen; GPIO-Treiberstärke in der Firmware verringerbar. |
| Displaykanten und Flexkabel (ESD) | ESD-Arrays (U603, U604) an den vier Touch-Leitungen am Panel-Stecker; Metallrückseite des Displays über leitfähige Dichtungen auf vier blanken Pads mit Masse verbunden; Klebeband über dem Flexkabel ([Installationsanleitung](hardware/touch-p4/installation-manual.md)). Tabelle je Anschluss in [design-notes.md](hardware/touch-p4/design-notes.md#esd-je-anschluss). |
| Takte | Vorwiderstände am 50-MHz-RMII-Takt, am SDIO-Takt und am Flash-Takt. |
| USB | TVS und ESD-Array am Stecker, Sicherung, Ferritperle in der Versorgung. |
| Ethernet / PoE | Isoliertes PD-Modul; 48-V-Seite in einem eigenen Bereich mit 2 mm Abstand, kein Kupfer unter der Isolationsbarriere des Moduls; Ferritperlen und TVS am PoE-Eingang; Kondensator über der Barriere; RC von der Buchsenabschirmung zu Masse. Die Ethernet-Paare laufen unter dem Mantel der Buchse auf der Rückseitenlage, die 48-V-Netze auf der Innenlage. |
| NFC | Tiefpass (560 nH / 220 pF) zwischen Sender und Antenne, Dämpfungswiderstände, kein geschlossener Kupferring um die Schleife. |
| Versorgungsfehler | USB speist die 5-V-Schiene über eine eFuse (Sanftanlauf, Strombegrenzung, Abschaltung über 5,53 bis 5,74 V), DC und PoE über ideale Dioden. Alle drei sperren Rückstrom, daher speist keine Quelle eine andere; Entladewiderstände halten unversorgte Eingänge auf 0 V. |
| LEDs | Kondensator an jeder LED, Vorwiderstand und Pull-down in der Datenleitung. |
| Befestigung | Keine Leiterbahnen unter Schraubenköpfen auf den äußeren Lagen. |

## Wo die Platine im Labor durchfallen kann

Diese Punkte messen, bevor es das Labor tut, das Wichtigste zuerst. Technische Einschätzung, außer wo eine Quelle genannt ist. Die Simulationen in `sim/` decken nichts davon ab: Sie prüfen Signale, Versorgungen, Wärme und die beiden Antennen, nicht Aussendungen oder Entladungen.

| # | Risiko | Was zu tun ist |
|---|---|---|
| 1 | **NFC-Oberwellen auf den Kabeln.** Eine Filterstufe, ungeschirmte Spulen, beide Kabel verlassen das Gehäuse neben der Schleife. | Die Oberwellen mit angeschlossenen Kabeln messen, mit dem PN532, der verkauft wird (zweite Bezugsquelle oder der von NXP), und dabei bleiben. |
| 2 | **Entladungen auf der Benutzerseite.** Display oder Touch-Controller verliert seine Einstellungen, der PN532 hängt, der MCU setzt sich zurück. Nicht bestanden, wenn sich der Leser nicht selbst erholt [EN 301 489-17 §6.4, table 2; Klausel 6 von Teil 1 „shall not apply“, EN 301 489-17 §6.1], und nach den objektiven Kriterien des Prüfplans (siehe [Normen, die ein Labor anwendet](#normen-die-ein-labor-anwendet)), darunter kein Verlust von Einstellungen, die er als kritisch nennt. | Gehäuse: LED-Fenster mit einem Diffusor schließen, der das Gehäuse überlappt; Metallschrauben abdecken oder erden (die Befestigungslöcher sind nicht mit Masse verbunden); Metallrückseite des Displays über die vier blanken Massepads auf der Displayseite erden (leitfähiges Band oder leitfähiger Schaumstoff). Firmware: Watchdog und eine regelmäßige Prüfung, die Display, Touch und NFC neu startet. |
| 3 | **Das Display-Flexkabel.** Etwa zwanzig schnelle Leitungen in einem ungeschirmten Flexkabel. | Niedrigste Treiberstärke und niedrigster Pixeltakt, die funktionieren. |
| 4 | **Gleichtaktstörungen auf den Kabeln.** Das DC-Filter wirkt nur zwischen den beiden Adern; der PoE-Eingang hat Perlen, aber keine Gleichtaktdrossel. | Zuerst ein aufklappbarer Ferrit am Kabel; eine Drossel braucht eine neue Platine. |
| 5 | **Abgestrahlte WLAN-Leistung.** Die 19,85 dBm des Zertifikats auf 2,4 GHz liegen 0,15 dB unter dem Grenzwert, auf Espressifs Platine; das Modul steht hier an einer anderen Stelle. | Die e.i.r.p. auf beiden Bändern im geschlossenen Gehäuse messen und daraus die Obergrenze der Firmware festlegen. |

Nützlich vor dem Labor: eine Netznachbildung und ein Spektrumanalysator für den DC-Eingang, Nahfeldsonden, eine ESD-Pistole, ein halber Tag in einer Vorprüfkammer.

Testmodi der Firmware, die das Labor braucht:

- NFC-Träger dauerhaft an;
- WLAN und Bluetooth auf einem festen Kanal mit fester Leistung: Espressifs EspRFTestTool mit seiner Testfirmware oder das ESP-IDF-Beispiel `examples/phy/cert_test`, in die Firmware des Lesers eingebaut [RFT; FAQ];
- ein Worst-Case-Modus mit allem aktiv, der auf dem Display zeigt, ob der Leser noch funktioniert.

Die Messungen vor dem Labor sind Schritte im [Inbetriebnahmeplan](hardware/touch-p4/bring-up.md).

## Offene Punkte

### Für das Produkt

- Gehäusematerial, mit einem Datenblatt, das bei der Wandstärke mindestens HB angibt. Ob es flammhemmend sein muss, klärt die Fehlerprüfung des Labors ([Gehäusekunststoff](#gehäusekunststoff)).
- Grenze für die DC-Versorgung im Handbuch und auf dem Typenschild: 15 W oder 100 W.
- WLAN-Sendeleistung pro Band, aus der e.i.r.p.-Messung des Labors, als Obergrenze der Firmware.
- Verpackung und Handbuch: 5-GHz-Beschränkung auf Innenräume mit den Länderkürzeln der Mitgliedstaaten; Frequenzbänder mit maximaler Leistung ([5-GHz-WLAN](#_5-ghz-wlan)).
- Netzteil im Karton oder nicht. Wenn ja, ist es Teil des geprüften Produkts.
- Zulässige Kabellängen für DC und Ethernet, und keine Außenverkabelung. Sie entscheiden, welche Anschlussprüfungen gelten.
- Nur Geschäftskunden oder auch Privatkäufer. Entscheidet über die ElektroG-Registrierung, ob die Anleitung auf Deutsch vorliegen muss und ob die GPSR gilt. Die Verpackungspflichten gelten in den meisten Fällen so oder so.
- Eine PN532-Bezugsquelle, ein PoE-Modul, ein Displaytyp. Der Prüfbericht deckt ab, was geprüft wurde.
- Typenschild: CE-Kennzeichnung, Modell, Seriennummer, Name und Postanschrift des Herstellers [RED Art. 10(6), (7), 20(1)]; durchgestrichene Mülltonne, Identität des Herstellers, Kennzeichnung „nach dem 13. August 2005 in Verkehr gebracht“ [ElektroG §9]. CE-Kennzeichnung auch auf der Verpackung [RED Art. 20(1)].
- Im Karton: eine Kopie der Konformitätserklärung oder eine vereinfachte mit der Internetadresse des vollständigen Textes [RED Art. 10(9)].
- Technische Unterlagen: Schaltpläne, Layout, Stückliste, Prüfberichte, Risikobewertungen, Software-Stückliste. Sie und die Erklärung zehn Jahre nach dem Inverkehrbringen aufbewahren [RED Art. 10(4)]; unter dem CRA zehn Jahre oder den Supportzeitraum, je nachdem, was länger ist [CRA Art. 13(13)].

### Für Revision B

- Bei VDE (benannte Stelle 0366) bestätigen lassen, ob ihre Aussage von 2020 zu Lesern mit vorzertifizierten Modulen noch gilt.

## Prüflabor

- Zwei oder drei akkreditierte Labore um ein Angebot bitten. Die genaue Konfiguration nennen: ESP32-C5-MINI-1 mit seiner Leiterplattenantenne, WLAN auf 2,4 und 5 GHz (Kanäle 36 bis 64 und 100 bis 140) und Bluetooth LE, NFC-Leser mit Leiterplattenantenne, Ethernet mit PoE, DC-Versorgung, beide Bestückungsvarianten.
- Wo eine benannte Stelle nötig ist ([Aufwand auf einen Blick](#aufwand-auf-einen-blick)), benannte Stellen für die RED anfragen und ab Dezember 2027 auch für den CRA; ein akkreditiertes Labor allein genügt dort nicht [RED Art. 17(4); CRA Art. 32(2)].
- Die Prüfung der Version lan mit eingebautem WLAN deckt die Version wifi meist als einfacheren Fall ab; das Labor entscheidet (ungeprüft: Laborpraxis; EG 203 367 erlaubt, eine Bewertung für eine gleichwertige Kombination wiederzuverwenden [EG 203 367 §6.1 note 3]).
- Mit der Anfrage senden: Blockschaltbild, Liste der Anschlüsse mit Kabeltyp und -länge, Betriebsmodi, die Modulzertifikate und -berichte und eine Liste der sicherheitsrelevanten Teile (PoE-Modul, Sicherungen, Gehäusematerial, Leiterplatte).

## Quellen

Ein Verweis in eckigen Klammern wie [RED Art. 10(9)] ist ein Schlüssel aus dieser Liste (RED) und die herangezogene Klausel (Art. 10(9)). Als „secondary“ gekennzeichnete Quellen sind nicht der Primärtext. Kostenpflichtige Normen wurden nicht gelesen, nur kostenlose Vorschauen, veröffentlichte Prüfberichte und Material von UL oder TÜV.

### EU-Recht und Dokumente der Kommission

| Schlüssel | Titel, Version | Link |
|---|---|---|
| RED | Directive 2014/53/EU (Radio Equipment Directive), konsolidierte Fassung vom 30. Mai 2026 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014L0053-20260530> |
| DR 2022/30 | Commission Delegated Regulation (EU) 2022/30 (RED Art. 3(3)(d), (e), (f)) | <https://eur-lex.europa.eu/eli/reg_del/2022/30/oj> |
| DR 2023/2444 | Commission Delegated Regulation (EU) 2023/2444 amending 2022/30 | <https://eur-lex.europa.eu/eli/reg_del/2023/2444/oj> |
| DR 2026/339 | Commission Delegated Regulation (EU) 2026/339 repealing 2022/30, ABl. L vom 29. April 2026 | <https://eur-lex.europa.eu/eli/reg_del/2026/339/oj> |
| HS-RED | Commission Implementing Decision (EU) 2022/2191, harmonised standards for radio equipment, konsolidierte Fassung vom 15. November 2026 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02022D2191-20261115> |
| HS-RED 2025/893 | Commission Implementing Decision (EU) 2025/893, amending 2022/2191 | <https://eur-lex.europa.eu/eli/dec_impl/2025/893/oj> |
| ID 2025/138 | Commission Implementing Decision (EU) 2025/138 (citation of EN 18031) | <https://eur-lex.europa.eu/eli/dec_impl/2025/138/oj> |
| EMCD | Directive 2014/30/EU (EMC Directive) | <https://eur-lex.europa.eu/eli/dir/2014/30/oj> |
| HS-EMC | Commission Implementing Decision (EU) 2019/1326, harmonised standards for EMC, konsolidierte Fassung vom 10. Juni 2022 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02019D1326-20220610> |
| OJ C 173 2016 | Commission communication 2016/C 173/01, harmonised standards under 2014/30/EU, 13. Mai 2016 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52016XC0513(01)> |
| EMC summary list 2022 | European Commission, summary list of harmonised standards for the EMC Directive, 19. September 2022 | <https://single-market-economy.ec.europa.eu/single-market/european-standards/harmonised-standards/electromagnetic-compatibility-emc_en> |
| HS-LVD | Commission Implementing Decision (EU) 2023/2723, harmonised standards for low-voltage equipment, konsolidierte Fassung vom 30. April 2026 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02023D2723-20260430> |
| WAS | Commission Implementing Decision (EU) 2022/179, 5 GHz WAS/RLAN, konsolidierte Fassung vom 25. November 2022 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022D0179> |
| WAS-A | Commission Implementing Decision (EU) 2022/2307, amending 2022/179 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022D2307> |
| SRD | Commission Decision 2006/771/EC (short-range devices), Anhang ersetzt durch (EU) 2025/105, konsolidierte Fassung vom 23. Januar 2025 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025D0105> |
| IR 2017/1354 | Commission Implementing Regulation (EU) 2017/1354, information under RED Art. 10(10) | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32017R1354> |
| CRA | Regulation (EU) 2024/2847 (Cyber Resilience Act), Text des Amtsblatts vom 20. November 2024 | <https://eur-lex.europa.eu/eli/reg/2024/2847/oj> |
| CRA guidance | Commission guidance on the CRA, C/2026/6013, ABl. C vom 17. November 2026 | <https://eur-lex.europa.eu/eli/C/2026/6013/oj> |
| IR 2025/2392 | Commission Implementing Regulation (EU) 2025/2392, important and critical product categories | <https://eur-lex.europa.eu/eli/reg_impl/2025/2392/oj> |
| C(2026) 7861 | Commission Implementing Decision C(2026) 7861 amending the CRA standardisation request, 10. November 2026 | <https://ec.europa.eu/transparency/documents-register/detail?ref=C(2026)7861&lang=en> |
| CRA std page | European Commission, "Cyber Resilience Act - Standardisation", aktualisiert am 23. November 2026 | <https://digital-strategy.ec.europa.eu/en/policies/cra-standardisation> |
| MSME page | European Commission, "Cyber Resilience Act - MSMEs" | <https://digital-strategy.ec.europa.eu/en/policies/cra-msmes> |
| RoHS | Directive 2011/65/EU (RoHS) | <https://eur-lex.europa.eu/eli/dir/2011/65/oj> |
| REACH | Regulation (EC) No 1907/2006 (REACH), konsolidierte Fassung vom 23. Juni 2025 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006R1907-20250623> |
| WFD | Directive (EU) 2018/851 amending the Waste Framework Directive 2008/98/EC | <https://eur-lex.europa.eu/eli/dir/2018/851/oj> |
| WEEE | Directive 2012/19/EU (WEEE) | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32012L0019> |
| PPWR | Regulation (EU) 2025/40 (Packaging and Packaging Waste Regulation) | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R0040> |
| Batteries Reg | Regulation (EU) 2023/1542 (Batteries Regulation) | <https://eur-lex.europa.eu/eli/reg/2023/1542/oj> |
| GPSR | Regulation (EU) 2023/988 (General Product Safety Regulation) | <https://eur-lex.europa.eu/eli/reg/2023/988/oj> |
| Data Act | Regulation (EU) 2023/2854 (Data Act) | <https://eur-lex.europa.eu/eli/reg/2023/2854/oj> |
| PLD | Directive (EU) 2024/2853 (Product Liability Directive) | <https://eur-lex.europa.eu/eli/dir/2024/2853/oj> |

### Deutsches Recht und Behörden

| Schlüssel | Titel, Version | Link |
|---|---|---|
| FuAG | Funkanlagengesetz, zuletzt geändert am 20. Juli 2026 (BGBl. 2026 I Nr. 214) | <https://www.gesetze-im-internet.de/fuag/BJNR194710017.html> |
| ElektroG | Elektro- und Elektronikgerätegesetz, zuletzt geändert am 25. November 2025 (BGBl. 2025 I Nr. 286) | <https://www.gesetze-im-internet.de/elektrog_2015/BJNR173910015.html> |
| GebV | ElektroG-, BattDG-Gebührenverordnung, zuletzt geändert am 30. September 2025 (BGBl. 2025 I Nr. 233) | <https://www.gesetze-im-internet.de/elektroggebv/BJNR177600015.html> |
| VerpackDG | Verpackungsrecht-Durchführungsgesetz vom 13. Juli 2026 (BGBl. 2026 I Nr. 207) | <https://www.gesetze-im-internet.de/verpackdg/BJNR0CF0B0026.html> |
| ChemG | Chemikaliengesetz, §16f | <https://www.gesetze-im-internet.de/chemg/__16f.html> |
| BT-Drs 21/6134 | Regierungsentwurf zur Umsetzung des CRA in Deutschland (Änderung des BSIG) | <https://dserver.bundestag.de/btd/21/061/2106134.pdf> |
| BR-Drs 621/26 | Vom Bundestag am 15. Oktober 2026 beschlossener Text, an den Bundesrat übersandt | <https://dserver.bundestag.de/brd/2026/0621-26.pdf> |
| ear reg | stiftung ear, "WEEE-Registrierung beantragen" | <https://www.stiftung-ear.de/anleitungen/weee-registrierung-beantragen/> |
| ear fees | stiftung ear, "Kosten & Gebühren" (Beträge netto) | <https://www.stiftung-ear.de/anleitungen/kosten-und-gebuehren/> |
| ZSVR | Zentrale Stelle Verpackungsregister, "PPWR & VerpackDG: Das gilt seit dem 12. August 2026" | <https://www.verpackungsregister.org/ich-moechte-wissen-was-seit-dem-12-august-2026-gilt> |
| VDE RED modules | VDE Prüf- und Zertifizierungsinstitut (benannte Stelle 0366), "RED Information Radio Modules", 24. November 2020 | <https://vde.com/resource/blob/2257746/305090fb24a3738e51dbe4a523c4be35/red-kundeninformation-en-data.pdf> |

### Normen, Leitfäden und ihre Vorschauen

| Schlüssel | Titel, Version | Link |
|---|---|---|
| EN 300 328 | ETSI EN 300 328, 2.4 GHz wideband transmission, V2.2.2 (2019-07) | <https://www.etsi.org/deliver/etsi_en/300300_300399/300328/02.02.02_60/en_300328v020202p.pdf> |
| EN 301 893 | ETSI EN 301 893, 5 GHz RLAN, V2.2.1 (2024-11) | <https://www.etsi.org/deliver/etsi_en/301800_301899/301893/02.02.01_60/en_301893v020201p.pdf> |
| EN 300 330 | ETSI EN 300 330, short range devices 9 kHz to 25 MHz, V2.1.1 (2017-02) | <https://www.etsi.org/deliver/etsi_en/300300_300399/300330/02.01.01_60/en_300330v020101p.pdf> |
| EN 301 489-1 | ETSI EN 301 489-1, EMC common technical requirements, V2.2.3 (2019-11) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148901/02.02.03_60/en_30148901v020203p.pdf> |
| EN 301 489-3 | ETSI EN 301 489-3, short range devices, V2.3.2 (2023-01) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148903/02.03.02_60/en_30148903v020302p.pdf> |
| EN 301 489-17 | ETSI EN 301 489-17, broadband data transmission, V3.3.1 (2024-09) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148917/03.03.01_60/en_30148917v030301p.pdf> |
| EG 203 367 | ETSI EG 203 367, multi-radio and combined equipment, V1.1.1 (2016-06) | <https://www.etsi.org/deliver/etsi_eg/203300_203399/203367/01.01.01_60/eg_203367v010101p.pdf> |
| IEC18 | IEC 62368-1:2018 Ausgabe 3.0, Inhaltsverzeichnis (Vorschau des VDE Verlags) | <https://www.vde-verlag.de/iec-normen/preview-pdf/info_iec62368-1%7Bed3.0%7Db.pdf> |
| EVS 50130-4 | Produktseite der EVS, EVS-EN 50130-4:2011+A1:2014 (konsolidiert) | <https://www.evs.ee/en/evs-en-50130-4-2011-a1-2014-consolidated> |
| DIN Media 50130-4 | DIN Media, DIN EN 50130-4:2015-04; VDE 0830-1-4:2015-04 | <https://www.dinmedia.de/en/standard/din-en-50130-4/228662474> |
| iTeh 50130-4 preview | SIST EN 50130-4:2011, kostenlose Leseprobe | <https://cdn.standards.iteh.ai/samples/22803/7e22d3a729bd42438ee0562acbfd0d9b/SIST-EN-50130-4-2011.pdf> |
| IEC 61000-4-5 preview | IEC 61000-4-5 Ausgabe 3.0 (2014), Störfestigkeit gegen Stoßspannungen (Vorschau des VDE Verlags) | <https://www.vde-verlag.de/iec-normen/preview-pdf/info_iec61000-4-5%7Bed3.0%7Db.pdf> |
| DIN Media prEN 40000-10 | DIN Media, Entwurf DIN EN 40000-10 (prEN 40000-10:2026), Entwürfe vom 22. Mai und 6. November 2026 | <https://www.dinmedia.de/en/draft-standard/din-en-40000-10/402331001>, <https://www.dinmedia.de/en/draft-standard/din-en-40000-10/407570821> |
| Genorma | Genorma, Eintrag zu prEN 40000-10 (secondary) | <https://genorma.com/en/standards/pren-40000-10> |
| BSI 60825-1 | BSI, Anwendungsbereich der BS EN 60825-1:2014+A11:2021 | <https://knowledge.bsigroup.com/products/safety-of-laser-products-equipment-classification-and-requirements-3?version=standard> |
| SIQ | SIQ, "Update on EN IEC 62368-1:2024 + A11:2024 and OJEU harmonization status", 16. Dezember 2025 (secondary) | <https://www.siq.si/en/news/update-on-en-iec-62368-12024-a112024-and-ojeu-harmonization-status/> |

### Espressif und FCC

| Schlüssel | Titel, Version | Link |
|---|---|---|
| DS-C5 | ESP32-C5-MINI-1 & MINI-1U Datasheet v1.4 | <https://documentation.espressif.com/esp32-c5-mini-1_mini-1u_datasheet_en.pdf> |
| CE-C5 | EU-Baumusterprüfbescheinigung 44024-05-2026-260268, ESP32-C5-MINI-1, Eurofins (benannte Stelle 0980), 27. Mai 2026 | <https://documentation.espressif.com/ESP32-C5-MINI-1%20CE%20Certification.pdf> |
| FCC-C5 | FCC-Zulassung, FCC ID 2AC7Z-ESPC5MINI1, part 15E, 28. Mai 2026 | <https://documentation.espressif.com/ESP32-C5-MINI-1%20FCC-5G%20Certification.pdf> |
| ANT-C5 | Sporton, "OTA Antenna Performance Data Summary", ESP-DUAL BAND-ANT C, FCC-Anlage 9339346 | <https://fccid.io/2AC7Z-ESPC5MINI1> |
| FAQ | ESP-FAQ, Hardware related, RF related | <https://docs.espressif.com/projects/esp-faq/en/latest/hardware-related/RF-related.html> |
| RFT | ESP Test Tools, "EspRFTestTool Toolkit" (ESP32-C5) | <https://docs.espressif.com/projects/esp-test-tools/en/latest/esp32c5/development_stage/rf_test_guide/rf_test_guide.html> |
| IDF-WIFI | ESP-IDF Programming Guide, ESP32-C5, Wi-Fi driver overview (v6.0.2 und v6.1.1) | <https://docs.espressif.com/projects/esp-idf/en/latest/esp32c5/api-guides/wifi-driver/overview.html> |
| IDF-API | ESP-IDF API reference, ESP32-C5, Wi-Fi (`esp_wifi.h`, `esp_wifi_types.h`) | <https://docs.espressif.com/projects/esp-idf/en/latest/esp32c5/api-reference/network/esp_wifi.html> |
| IDF-REG | ESP-IDF `components/esp_wifi/regulatory/esp_wifi_regulatory.txt`, Commit 34ff741b vom 8. Mai 2026 | <https://raw.githubusercontent.com/espressif/esp-idf/master/components/esp_wifi/regulatory/esp_wifi_regulatory.txt> |

### Prüfberichte, UL, IEEE und andere Sekundärquellen

| Schlüssel | Titel, Version | Link |
|---|---|---|
| FLIR | CTC advanced, Prüfbericht 60429496-001, FLIR A50/A70, IEC 62368-1:2014, 30. April 2021 | <https://support.flir.com/CertDownload/Assets/FLIR%20A50%20and%20A70%20series/IEC%2062368-1%20TEST%20REPORT.pdf> |
| AIR | EKTOS, Prüfbericht P18-0060-1, Airtame AT-PoE, IEC 62368-1:2014, 21. November 2018 | <https://www.northamber.com/storage/uploads/Product%20Safety/Airtame/EU%20Safety%20Test%20Report%20(LVD)%20PoE%20_P18-0060-1_IEC62368-1.pdf> |
| TI 2018 TRF | Prüfbericht US-2558-MET EN 126343 M0A0, IEC 62368-1:2018 (bei TI abgelegt) | <https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/US_2D00_2558_2D00_MET-EN-126343-M0A0.pdf> |
| ULQA | UL Solutions, "IEC 62368-1 Ask the Engineers" (secondary) | <https://www.ul.com/resources/iec-62368-1-ask-engineers-question-and-answer-page> |
| ULTB | UL Technical Brief zur Einstufung und Messung von Leistungsquellen, 2011 (secondary) | <https://japan.ul.com/wp-content/uploads/sites/27/2014/06/1_techbrief_classandele_measurement.pdf> |
| TUV | TÜV Rheinland, IEC 62368-1 third edition technical product sheet, 20. September 2019 (secondary) | <https://media.go.tuv.com/Web/TUVRheinlandAG/%7B73d23bd3-a64c-4168-b067-832362b95455%7D_62368-1_Technical_Product_Sheet_AV-IT_9.20.19.pdf> |
| IEEEI | IEEE 802.3 interpretation 3-07/04 zu Klausel 33.4.1 | <https://www.ieee802.org/3/interp/interp-3-0704.pdf> |
| IEEEW | IEEE 802.3 isolation ad hoc, Zusammenfassung der Isolationsprüfungen, 17. August 2017 (secondary) | <https://www.ieee802.org/3/ad_hoc/isolation/public/Walker_1_08172017_rev_1.pdf> |
| Sagentia | Sagentia, "Lead is now on the REACH candidate list" (secondary) | <https://sagentia.com/news/lead-is-now-on-the-reach-candidate-list/> |
| JLCPCB UL | JLCPCB help, "UL Certification" | <https://jlcpcb.com/help/article/UL-Certification> |

### Filamenthersteller

| Schlüssel | Titel, Version | Link |
|---|---|---|
| Unger guide | Filament Unger, Materialleitfaden | <https://filament-unger.de/pages/material-guide> |
| Unger downloads | Filament Unger, Downloads | <https://filament-unger.de/pages/downloads> |
| FormFutura TDS | FormFutura, ABSpro Flame Retardant technical data sheet v3 | <https://cdn.shopify.com/s/files/1/0622/4181/files/ABSpro_Flame_Retardant_-_TDS_-_Formfutura.pdf> |
| BASF TDS | BASF Ultrafuse PC/ABS FR Black, technisches Datenblatt (deutsch) v1.1, 9. Februar 2021 | <https://cdn.shopify.com/s/files/1/0264/8791/4555/files/Ultrafuse_PC-ABS_FR_Black_TDS_DE_v1.1.pdf> |
| ROSA TDS | ROSA 3D, technisches Datenblatt "3D FILAMENT ABS+" (Produktname ABS FR V0) | <https://www.lemona.lt/Files/Instrukcijos/TI/En/Pdf/TDS-ROSA-ABS-EN.pdf> |
