# Quellen der CE- und Marktcheckliste
<!-- llms-description: Die Primärquelle, die Version und das Ergebnis der Prüfung zu jeder Aussage der CE- und Marktcheckliste des Touch P4. -->

Diese Seite hält für jede Aussage in [compliance.md](hardware/touch-p4/compliance.md) das
Ergebnis der Prüfung gegen ihre Primärquelle fest und listet diese Quellen auf.

Geprüft am 25. November 2026; das ESP32-C5-Modul und 5-GHz-Wi-Fi am 26. November 2026. EU-Rechtsakte wurden im amtlichen Wortlaut gelesen. EUR-Lex
beantwortet automatisierte Anfragen mit einer leeren Antwort. Deshalb wurden die Texte
anhand der CELEX-Nummer aus dem Dokumentenspeicher des Amts für Veröffentlichungen der EU
geladen (`https://publications.europa.eu/resource/celex/<CELEX>`), der
dieselben Dokumente bereithält. Die Liste nennt die übliche EUR-Lex-Adresse. ETSI-Normen,
deutsches Bundesrecht (gesetze-im-internet.de), die Dokumente von Espressif
und die übrigen Webseiten wurden unter den angegebenen Adressen gelesen. Kostenpflichtige Normen
(EN 18031, EN 55032, EN 55035, EN 50130-4, EN 50419, IEC 61000-4-5 und jede
Ausgabe der EN IEC 62368-1) wurden nicht gelesen; gelesen wurden nur kostenlose Vorschauen, veröffentlichte Prüfberichte
und Material von UL oder TÜV. Als „sekundär“ gekennzeichnete Quellen sind nicht
der Primärtext.

So lesen Sie compliance.md: Ein Verweis wie [RED Art. 10(9)] nennt einen
Quellenschlüssel aus der folgenden Liste (RED) und die herangezogene Klausel (Art. 10(9)).

Ergebnisse nach den Änderungen vom 25. und 26. November 2026:

- **korrekt**: Die Quelle bestätigt die Aussage in ihrer jetzigen Fassung.
- **korrigiert**: Die Aussage war falsch, nur teilweise richtig oder unvollständig, und der
  Text folgt jetzt der Quelle. „korrigiert (ergänzt)“ kennzeichnet eine Pflicht, die
  fehlte und ergänzt wurde.
- **aus freien Quellen nicht prüfbar**: Die Aussage beruht auf einer kostenpflichtigen Norm,
  der Laborpraxis, einer Schätzung oder fachlicher Einschätzung; compliance.md kennzeichnet sie
  als „ungeprüft“.
- **modulspezifisch**: eine Aussage zum ESP32-C5-MINI-1 und seiner Antenne,
  geprüft an den eigenen Dokumenten des Moduls. Das Modul bleibt bei Revision A
  (ein ESP32-C5 wurde betrachtet und für Revision B beibehalten, design-notes.md,
  „Entscheidungen“); die Antennenaussagen wurden mit der Antennenentscheidung neu geschrieben.
- **nicht geprüft (Designwert)**: Platinen-, Bauteil- oder Simulationswerte
  aus den Designdateien, außerhalb dieser Prüfung.

## Aussagen nach Abschnitt

### Introduction

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Das CE-Zeichen gilt für den fertigen Leser, nicht für eine bloße Platine | korrekt | RED Art. 2(1), 20(1) |
| Kostenpflichtige Normen (EN 18031, EN 55032, EN 55035, EN 62368-1) wurden nicht gelesen | korrekt | Angabe zu dieser Prüfung |

### Will it be easy?

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Ein Zutrittskontrollleser ist ein wichtiges Produkt, Klasse I | korrekt | CRA Art. 7(1), Anhang III Klasse I Nr. 1 |
| Die Selbstbewertung ab dem 11. Dezember 2027 braucht eine zitierte harmonisierte Norm (vorher: nur eine Norm; jetzt auch gemeinsame Spezifikationen oder ein EU-Zertifikat auf Stufe „substantial“, und die Norm muss alle Risiken der Kernfunktion abdecken) | korrigiert | CRA Art. 32(2); CRA guidance Abs. 149 |
| prEN 40000-10 ist ein Entwurf | korrekt | DIN Media prEN 40000-10; Genorma (sekundär) |
| Ohne eine solche Norm prüft eine benannte Stelle das Produkt | korrekt | CRA Art. 32(2) |
| Seit dem 1. August 2025 gilt EN 18031 „ohne Möglichkeit, es ohne Passwort oder PIN zu nutzen“ (jetzt: die Mitteilungen im Amtsblatt zu den Klauseln 6.2.5.1 und 6.2.5.2 zu Standardpasswörtern; PINs werden nicht erwähnt) | korrigiert | DR 2023/2444 Art. 1; RED Art. 17(3), (4); HS-RED Nr. 164, 165 |
| Ein erster Durchlauf scheitert meist am NFC-Sender, an den Kabelanschlüssen und an Entladungen auf das Glas | aus freien Quellen nicht prüfbar (Laborerfahrung) | keine; stimmt überein mit VDE RED modules S. 2 |
| Was verkauft wird, fügt Prüfungen und Pflichten hinzu oder nimmt sie weg | korrekt | EN 301 489-1 §9.4.1, §9.8.2.2; ElektroG §3 Nr. 5; GPSR Art. 3(1) |

### Which rules apply

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Die RED gilt: Wi-Fi, Bluetooth und NFC sind Funkanwendungen | korrekt | RED Art. 2(1) |
| Sicherheit, EMV, Funk und Cybersicherheit bewerten | korrekt | RED Art. 3 |
| Die technischen Unterlagen (jetzt: und die Erklärung) zehn Jahre aufbewahren | korrekt | RED Art. 10(4); FuAG §9(3) |
| Eine EU-Konformitätserklärung | korrekt | RED Art. 18(3) |
| Eine Kopie der Erklärung oder eine vereinfachte mit der Internetadresse bei jedem Gerät (fehlte) | korrigiert (ergänzt) | RED Art. 10(9); FuAG §20(2) |
| CE-Zeichen auf dem Gerät und seiner Verpackung | korrekt | RED Art. 20(1) |
| Name, Postanschrift, Typ- und Seriennummer auf dem Gerät (eine Chargennummer genügt ebenfalls) | korrekt | RED Art. 10(6), (7) |
| Anleitung mit Frequenzbändern und maximaler Leistung | korrekt | RED Art. 10(8); FuAG §20(3) |
| Anleitung auf Deutsch (vorher: immer; jetzt: nur für nicht gewerbliche Nutzer vorgeschrieben) | korrigiert | FuAG §20(1); RED Art. 10(8) |
| Niederspannungsrichtlinie und EMV-Richtlinie nicht getrennt; die RED deckt beide ab; die Sicherheit gilt „with no voltage limit applying“, auch unterhalb des Bereichs der Niederspannungsrichtlinie | korrekt; ergänzt (Review-Stufe 4) | RED Art. 1(4), 3(1), 3(1)(a), 50; EMCD Art. 2(2)(a) |
| Die Cybersicherheit der RED gilt seit dem 1. August 2025 | korrekt | DR 2023/2444 Art. 1; DR 2022/30 Art. 3 |
| Netzschutz: Der Leser kann direkt oder über andere Geräte über das Internet kommunizieren | korrekt | DR 2022/30 Art. 1(1) |
| Schutz personenbezogener Daten: Kartennummern, die mit Namen verknüpft sind (personenbezogene Daten im Sinne der DSGVO sind unser Schluss) | korrekt | DR 2022/30 Art. 1(2) in der Fassung von DR 2023/2444 |
| Ab dem 11. Dezember 2027 durch DR 2026/339 aufgehoben | korrekt | DR 2026/339 Art. 1, Erwägungsgrund 4 |
| Leser, die vorher in Verkehr gebracht wurden, bleiben unter der Marktüberwachung nach der RED (ergänzt) | korrekt | DR 2026/339 Erwägungsgrund 5 |
| CRA-Meldepflicht seit dem 11. September 2026: 24 Stunden und 72 Stunden (Abschlussbericht ergänzt) | korrekt | CRA Art. 14(2), (4), 71(2) |
| Die Meldepflicht betrifft bereits verkaufte Leser | korrekt | CRA Art. 69(3) |
| Volle Konformität für jedes Gerät, das ab dem 11. Dezember 2027 in Verkehr gebracht wird | korrekt | CRA Art. 69(2), 71(2) |
| „Mindestens fünf Jahre Sicherheitsupdates“ (jetzt: ein Unterstützungszeitraum, der der erwarteten Nutzung entspricht, mindestens fünf Jahre, Enddatum beim Kauf angegeben) | korrigiert | CRA Art. 13(8), (19); CRA guidance Abs. 126 |
| RoHS: Lieferantenerklärungen für alle Teile und die Platine (übliche Nachweise, nicht der Wortlaut der Richtlinie) | korrekt | RoHS Art. 7(b), (d) |
| RoHS auf der Konformitätserklärung genannt | korrekt | RoHS Anhang VI; RED Art. 18(3) |
| REACH: Kunden ab 0,1 % informieren (Verbraucher auf Anfrage innerhalb von 45 Tagen ergänzt) | korrekt | REACH Art. 33(1), (2) |
| Meldung an die ECHA (vorher: unter REACH; jetzt: die SCIP-Pflicht der Abfallrahmenrichtlinie und ChemG §16f) | korrigiert | WFD Art. 9(1)(i); ChemG §16f(1) |
| Blei in einigen Bauteilen ist der übliche Fall | korrekt (sekundäre Quelle) | Sagentia (sekundär) |
| Marke und Gerätetyp vor dem ersten Verkauf bei der stiftung ear registrieren | korrekt | ElektroG §6(1) |
| Die Registrierung dauert zwei bis vier Wochen (bei vollständigem Antrag) | korrekt | ear reg |
| Etwa 130 EUR im Jahr (jetzt: zuzüglich Umsatzsteuer, 32,80 EUR im Quartal) | korrekt | GebV Nr. 1.2; ear fees |
| Gewerbliches Gerät: Rücknahmekonzept; Haushaltsgerät: Garantie (Rücknahmeangebot und Entsorgungshinweise ergänzt) | korrekt | ElektroG §6(1), §7(1), (3), §7a, §19, §19a |
| Der Verkauf an Privatkäufer „schwächt“ den Business Case (jetzt: er schließt die gewerbliche Registrierung aus) | korrigiert | ElektroG §3 Nr. 5, §7(3); WEEE Art. 3(1)(h) |
| Durchgestrichene Mülltonne auf dem Gerät (war unvollständig; jetzt auch die Identität des Herstellers und das Zeichen für „nach dem 13. August 2005“) | korrigiert | ElektroG §9(1), (2), §3 Nr. 4 |
| Das übliche Zeichen für „nach dem 13. August 2005“ ist ein Balken unter der Tonne | aus freien Quellen nicht prüfbar (EN 50419, kostenpflichtig) | keine |
| Registrierungsnummer auf Angeboten und Rechnungen | korrekt | ElektroG §6(3) |
| „Jedes andere EU-Land braucht eine eigene Registrierung“ (jetzt: Direktverkäufe an Endnutzer brauchen dort eine Registrierung über einen Bevollmächtigten; andernfalls registriert ein lokaler Importeur) | korrigiert | WEEE Art. 3(1)(f), 16(1), 17(2); ElektroG §8(5) |
| Die PPWR gilt ab dem 12. August 2026 | korrekt | PPWR Art. 71 |
| PPWR und VerpackDG haben das Verpackungsgesetz am 12. August 2026 abgelöst | korrekt | ZSVR; VerpackDG |
| In LUCID registrieren | korrekt | VerpackDG §6(1), (6); ZSVR |
| Systembeteiligung für Verpackungen, die bei privaten Endverbrauchern anfallen (jetzt: auch vergleichbare Anfallstellen wie Werkstätten und Büros) | korrigiert | VerpackDG §3(6), (7), §7 |
| Mengen melden | korrekt | VerpackDG §9(1), §10 |
| PPWR-Herstellerpflichten für Verpackungen, die unter dem eigenen Namen hergestellt werden (fehlte) | korrigiert (ergänzt) | PPWR Art. 3, 15(1), (2) |
| Rücknahme von Verpackungen außerhalb der Systembeteiligung, Zulassung durch die ZSVR ab 2028 (fehlte) | korrigiert (ergänzt) | VerpackDG §39(1); ZSVR |
| Batterieverordnung: keine Batterie; gilt, sobald eine hinzukommt | korrekt | Batteries Reg Art. 1(3) |
| GPSR „nur, wenn Verbraucher es kaufen“ (jetzt: auch, wenn Verbraucher es voraussichtlich nutzen) | korrigiert | GPSR Art. 3(1), Erwägungsgrund 17 |
| Für ein CE-Produkt verbleibende GPSR-Regeln: Fernabsatz, Unfälle, Rückrufe | korrekt | GPSR Art. 2(1), 19, 20, 36, 37, 52 |
| Der Leser ist ein „vernetztes Produkt“ | korrekt | Data Act Art. 2(5) |
| Data-Act-Ausnahme für Kleinst- und Kleinunternehmen (jetzt mit ihren Bedingungen und der Ein-Jahres-Regel) | korrigiert | Data Act Art. 7(1) |
| Die Regel zum gemeinsamen USB-C-Ladegerät betrifft nur gelistete Kategorien | korrekt | RED Anhang Ia Teil I |
| Das Funkanlagengesetz ist die deutsche RED; die Bundesnetzagentur beaufsichtigt | korrekt | FuAG Fußnote, §23(1) |
| Neue Produkthaftungsrichtlinie für Produkte, die nach dem 9. Dezember 2026 in Verkehr gebracht werden | korrekt | PLD Art. 2(1), 22(1) |
| Sie „nennt Software und fehlende Sicherheitsupdates als Fehler“ (jetzt: die eigenen Begriffe der Richtlinie) | korrigiert | PLD Art. 4(1), 7(2)(f), 11(2) |

### Standards a lab applies

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Eine zitierte Norm „gilt als Nachweis“ (jetzt: Konformitätsvermutung, innerhalb einer etwaigen Einschränkung) | korrigiert | RED Art. 16 |
| Funk und Cybersicherheit brauchen für die Selbsterklärung zitierte Normen; Sicherheit und EMV brauchen nie eine benannte Stelle | korrekt | RED Art. 17(2), (3), (4) |
| EN 300 328 V2.2.2 zitiert | korrekt | HS-RED Nr. 16; EN 300 328 |
| EN 300 330 V2.1.1 zitiert | korrekt | HS-RED Nr. 17; EN 300 330 |
| EN 301 489-3 und -17 zitiert, Teil 1 ihre gemeinsame Grundlage (die beiden Mitteilungen fehlten); bei Anwendung ihrer Klausel 6 keine Vermutung für Art. 3(1)(b), daher objektive Bestehenskriterien im Prüfplan | korrigiert (Bedeutung der Mitteilung in Review-Stufe 4 ergänzt) | HS-RED Nr. 168, 169; HS-RED 2025/893 Erwägungsgrund; RED Art. 17(2), Anhang II; EN 301 489-3 §2.1; EN 301 489-17 §2.1, §6 |
| Versionen und Anwendungsbereiche von EN 301 489-1, -3 (NFC) und -17 (Wi-Fi, Bluetooth) | korrekt | EN 301 489-3 §3.1; EN 301 489-17 §1, Tabelle 1 |
| EN 55035:2017 zitiert (EN 55032 nur unter der EMV-Richtlinie ergänzt) | korrekt | HS-RED Nr. 5; HS-EMC |
| EN 62368-1 unter der RED nicht zitiert (die Niederspannungsrichtlinie zitiert nur die Ausgabe von 2014, ergänzt); eine Ausgabe von 2024 existiert | korrekt | HS-RED; HS-LVD; SIQ (sekundär) |
| EN 62311, EN 50665 und EN 50364 unter der RED nicht zitiert | korrekt | HS-RED |
| EN 18031-1 und -2 mit Einschränkungen zitiert | korrekt | HS-RED Nr. 164, 165; ID 2025/138 |
| NFC-Trägergrenzwert (jetzt angegeben: 60 dBµA/m in 10 m, Spektrumsmaske) | korrekt | EN 300 330 §4.3.4, Tabelle 2 |
| Eine Schleife dieser Größe bleibt etwa 50 dB unter dem Trägergrenzwert | aus freien Quellen nicht prüfbar (Schätzung) | keine |
| Der PN532 steuert die Antenne mit einem Rechtecksignal an | nicht geprüft (Designwert) | PN532-Datenblatt, für diese Prüfung nicht gelesen |
| Oberwellen in den 4-nW-Bändern (es fehlten 470 bis 790 MHz und „e.r.p.“; die Grenzwerte von 250 nW und 27,12 MHz ergänzt) | korrigiert | EN 300 330 §4.3.8.3 Tabelle 5, §4.3.9.3 Tabelle 6, §6.2.9 |
| Die Kabel, nicht die Schleife, strahlen die Oberwellen ab | aus freien Quellen nicht prüfbar (fachliche Einschätzung) | EN 300 330 §5.4.1, Anhang C.2.3 für den Messaufbau |

### What the certified Wi-Fi module saves

Am 26. November 2026 für den ESP32-C5-MINI-1 neu geschrieben; die Aussagen zum
ESP32-C6-MINI-1U und seinen externen Antennen sind mit diesem Modul entfallen.

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Der Leser nutzt den ESP32-C5-MINI-1 mit einer Platinenantenne für 2,4 und 5 GHz | modulspezifisch | DS-C5 §1 |
| EU-Baumusterprüfbescheinigung 44024-05-2026-260268, Eurofins Electrical and Electronic Testing NA, benannte Stelle 0980, 27. Mai 2026, Modell ESP32-C5-MINI-1 mit interner Antenne | modulspezifisch | CE-C5 S. 1, 2 |
| Sie deckt Sicherheit (EN IEC 62368-1:2024 + A11), Gesundheit (EN 50665, EN IEC 62311), EMV (EN 55032, EN 301 489-1 V2.2.3, -17 V3.3.1) und Funk (EN 300 328 V2.2.2, EN 301 893 V2.2.1) ab, nicht die Cybersicherheit | modulspezifisch | CE-C5 S. 2, 3 |
| „Some data can be reused, but EMC testing is still required for the final product“ | korrekt | FAQ |
| Espressif veröffentlicht nur die Bescheinigung; die Berichte, die sie nennt, sind EFTA26010030-IE-01-E1, -02-R1 bis -R4, -03-M1V1, -04-L1 | modulspezifisch | CE-C5 S. 2, 3; FAQ |
| Was EG 203 367 zu Wiederverwendung, gleichwertigen Bedingungen und Abweichungen sagt | korrekt | EG 203 367 §3.1, §6.1 Anmerkungen 1 und 2 |
| Labore verwenden die leitungsgebundenen Ergebnisse des Moduls typischerweise wieder | aus freien Quellen nicht prüfbar (Laborpraxis) | keine |
| Das Modul sitzt nicht dort, wo Espressifs Leitfaden es platziert; das Modell legt den Platz auf 3 dB an Espressifs heran, in einigen 5-GHz-Kanälen bis zu 5,5 dB darüber | aus freien Quellen nicht prüfbar (unsere Simulation) | design-notes.md, „WLAN-Antenne“ und „Akzeptierte Abweichungen“ |
| Am Leser: abgestrahlte Leistung und Störaussendungen in beiden Bändern bei sendendem NFC | korrekt | EG 203 367 §6.1 Anmerkung 1, §6.2; EN 300 328 §4.3.2.2.3; EN 301 893 §4.2.3 |
| Am Leser: EMV bei laufenden Funkanwendungen | korrekt | EG 203 367 §5.1.1.3, §5.2.3 |
| Die Exposition gegenüber Hochfrequenz ist gesondert zu betrachten, RED Art. 3(1)(a), außerhalb des Anwendungsbereichs des Leitfadens | korrekt | EG 203 367 §1 |
| Die FCC-Zulassung verlangt 20 cm Abstand zu Personen; die EU-Bescheinigung nennt EN 50665 und EN IEC 62311, aber keinen Abstand | modulspezifisch | FCC-C5; CE-C5 S. 2 |
| Ein Leser, der berührt wird, braucht eine eigene Bewertung der Hochfrequenz-Exposition; eine Berechnung genügt meist | aus freien Quellen nicht prüfbar (Laborpraxis; folgt aus der 20-cm-Bedingung) | FCC-C5 |
| Die VDE (0366) verlangt eine EU-Baumusterprüfung, wenn nur Modulberichte vorliegen (Stellungnahme vom 24. November 2020; erneut bestätigen lassen) | korrekt (angegebene Position der VDE) | VDE RED modules S. 2 |
| Sendeleistung laut Bescheinigung: 19,85 dBm Wi-Fi 2,4 GHz, 16,36 dBm Bluetooth LE, 20,58 / 20,74 / 20,77 dBm bei 5150 bis 5250 / 5250 bis 5350 / 5470 bis 5725 MHz, 13,97 dBm bei 5725 bis 5850 MHz; leitungsgebunden oder abgestrahlt nicht angegeben | modulspezifisch | CE-C5 S. 2 |
| Der Grenzwert bei 2,4 GHz beträgt 20 dBm e.i.r.p. | korrekt | EN 300 328 §4.3.2.2.2, §4.3.2.2.3 |
| Espressifs Antenne erreicht auf ihrer Testplatine Spitzenwerte von 4,44 dBi bei 2,4 GHz und 1,55 bis 2,18 dBi bei 5 GHz | modulspezifisch | ANT-C5 §3.1 |
| Die Antenne ist Teil des Moduls: eine Funkkonfiguration | modulspezifisch | DS-C5 §1; CE-C5 S. 2 |
| Eine Metallwand hinter dem Leser kostet 1,1 bis 1,7 dB bei 2,4 GHz | aus freien Quellen nicht prüfbar (unsere Simulation) | design-notes.md, „Wi-Fi module“ |
| Die FCC-Zulassung ist eine einzelne modulare Zulassung mit 20 cm und Co-Location nach den Verfahren der FCC | modulspezifisch | FCC-C5 |

### 5 GHz Wi-Fi

Am 26. November 2026 ergänzt.

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| 2022/179 harmonisiert 5150 bis 5350 und 5470 bis 5725 MHz, der Anhang wurde durch 2022/2307 ersetzt, hebt 2005/513/EG auf | korrekt | WAS Art. 1, 5; WAS-A Art. 1(2) |
| EN 301 893 V2.2.1 seit dem 15. Mai 2025 zitiert; V2.1.1 bis zum 15. Mai 2028 | korrekt | HS-RED Nr. 65, 65a; HS-RED 2025/893 Anhang, Art. 2 |
| Bandtabelle: Nutzung, Grenzwerte, TPC und DFS (5150 bis 5250 MHz 200 mW, innen plus begrenzt außen; 5250 bis 5350 MHz nur innerhalb von Gebäuden, 200 mW oder 3 dB weniger ohne TPC, DFS; 5470 bis 5725 MHz 1 W oder 3 dB weniger, DFS) | korrekt | WAS Anhang Tabellen 1 bis 3, Anmerkungen |
| Ein sekundäres Gerät ohne Radarerkennung hält in 5470 bis 5725 MHz die Grenzwerte von 5250 bis 5350 MHz ein; ohne TPC 20 dBm, 23 dBm bei 5150 bis 5250 MHz | korrekt | EN 301 893 §4.2.3.2.2 Tabelle 2, Anmerkung 1 |
| 5725 bis 5875 MHz ist das Band 61 für Geräte mit geringer Reichweite mit 25 mW e.i.r.p. (Beschluss 2006/771/EG, Anhang ersetzt durch 2025/105) | korrekt | SRD Anhang Band 61 |
| Primäres und sekundäres Gerät; ein sekundäres Gerät sendet nicht vor dem Freigabesignal; ohne Radarerkennung nur Kanalabschaltung | korrekt | EN 301 893 §3.1, §4.2.6.1.4.2 a), §4.2.6.2.1 Tabelle 5 |
| Bis zu 23 dBm e.i.r.p. ohne Radarerkennung für ein sekundäres Gerät, außer festen Punkt-zu-Punkt- oder Punkt-zu-Mehrpunkt-Verbindungen im Freien | korrekt | EN 301 893 Anhang D, Tabelle D.2 Anmerkung 2 |
| Der C5 erkennt Radar nur passiv, kann kein DFS-Access-Point sein, sein SoftAP darf keine DFS-Kanäle nutzen, und im Modus STA plus SoftAP folgt der Access Point der Station | korrekt (ESP-IDF latest, v6.1.1 und v6.0.2 gleichermaßen) | IDF-WIFI, „Dynamic Frequency Selection“, „Home Channel“ |
| DFS-Einstellungen für den Nutzer nicht zugänglich, einschließlich Land und Band | korrekt | WAS Anhang Tabellen 2, 3 |
| ESP-IDF Standard ist der Weltmodus mit automatischer Richtlinie; die manuelle Richtlinie nutzt immer das konfigurierte Land; die 5-GHz-Maske wirkt nur unter der manuellen Richtlinie | korrekt | IDF-API, `esp_wifi_set_country`, `wifi_country_t` |
| Espressifs Regulierungstabelle für DE erlaubt 5725 bis 5875 MHz bei 25 mW und zitiert 2005/513/EG | korrekt (master, Commit 34ff741b vom 8. Mai 2026) | IDF-REG |
| Beschränkung der Inbetriebnahme: Piktogramm oder „Restrictions or Requirements in“ mit Codes der Mitgliedstaaten auf der Verpackung; die Anleitung listet Staaten und Art der Beschränkung | korrekt | RED Art. 10(10); IR 2017/1354 Art. 2(1), (2), Anhang I, II |
| Die Anleitung nennt die Frequenzbänder und die maximale Leistung in jedem | korrekt | RED Art. 10(8) |

### Cybersecurity, under the RED

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Der Leser muss RED Art. 3(3)(d) und (e) erfüllen; Buchstabe (f) gilt nicht (ergänzt) | korrekt | DR 2022/30 Art. 1(1), (2), (3) |
| Eine Erklärung ohne benannte Stelle braucht EN 18031-1 und -2 vollständig | korrekt | RED Art. 17(3), (4) |
| Die Normen „gelten nicht, wenn der Nutzer kein Passwort setzen und verwenden muss“ (jetzt: an die Klauseln 6.2.5.1 und 6.2.5.2 gebunden; „rationale“ und „guidance“ gelten nie) | korrigiert | HS-RED Nr. 164, 165; ID 2025/138 Erwägungsgrund 6 |
| Authentifizierung überall; Zugangsdaten pro Gerät eindeutig oder bei der ersten Nutzung gesetzt; Entscheidungsbäume | aus freien Quellen nicht prüfbar (EN 18031, kostenpflichtig) | keine |
| Die Firmware des ESP32-C5 ist Teil des Produkts | korrekt (unsere Lesart; kein ausdrücklicher Text) | RED Art. 10(8) |

### Cybersecurity, under the Cyber Resilience Act

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Der Leser ist Klasse I; Wortlaut von Anhang III | korrekt | CRA Anhang III Klasse I Nr. 1 |
| Die Durchführungsverordnung (EU) 2025/2392 beschreibt die Kategorie | korrekt | IR 2025/2392 Anhang I Klasse I Nr. 1 |
| Selbstbewertung nur mit angewandten harmonisierten Normen (jetzt auch gemeinsame Spezifikationen oder ein EU-Zertifikat auf Stufe „substantial“; die Norm muss alle Risiken der Kernfunktion abdecken) | korrigiert | CRA Art. 32(2); CRA guidance Abs. 148, 149 |
| EN 18031 gilt unter dem CRA nicht (die Übernahme von Bescheinigungen benannter Stellen bis zum 11. Juni 2028 ergänzt) | korrigiert | CRA Art. 27(1), 69(1); CRA guidance Abs. 251 bis 254 |
| prEN 40000-10 lag im Sommer 2026 zur Kommentierung aus | korrekt | DIN Media prEN 40000-10; Genorma (sekundär) |
| Für das Gesetz ist noch keine Norm zitiert | korrekt (am 25. November 2026) | CRA std page |
| Die Zitierung vor Dezember 2027 ist offen (Frist des CEN vom 31. Januar 2027 ergänzt) | korrigiert | C(2026) 7861 Anhang, Zeile 16 |
| FOSS-Weg „in Klasse I“ (jetzt: Klasse I oder II, Dokumentation öffentlich, wenn in Verkehr gebracht) | korrigiert | CRA Art. 32(5); CRA guidance Abs. 137 |
| Die FOSS-Definition umfasst Software; offene Hardware ungeklärt (Leitlinie Abs. 25 ergänzt) | korrekt | CRA Art. 3(48); CRA guidance Abs. 25 |
| Das BSI ist die Behörde, die man fragt (Stand des deutschen Gesetzes ergänzt) | korrekt | BT-Drs 21/6134 Art. 1, §65(1) BSIG; BR-Drs 621/26 |
| „Keine Ausnahme für kleine Unternehmen“ (jetzt: niedrigere Gebühren, ein noch nicht veröffentlichtes vereinfachtes Formular und keine Geldbuße für eine versäumte 24-Stunden-Frühwarnung) | korrigiert | CRA Art. 32(6), 33(5), 64(10)(a); MSME page |
| Secure Boot und Flash-Verschlüsselung | korrekt (ein Mittel; das Gesetz nennt es nicht) | CRA Anhang I Teil I (2)(e), (f) |
| Signierte Firmware-Updates (automatische Updates als Standard und kostenlose Updates ergänzt) | korrigiert | CRA Anhang I Teil I (2)(c), Teil II (7), (8) |
| Keine Standard-Zugangsdaten | korrekt (ein Mittel) | CRA Anhang I Teil I (2)(b), (d) |
| Eine schriftliche Risikobewertung | korrekt | CRA Art. 13(2), (3) |
| Eine Software-Stückliste | korrekt | CRA Anhang I Teil II (1) |
| Ein angegebener Unterstützungszeitraum von mindestens fünf Jahren | korrekt | CRA Art. 13(8), (19) |
| Eine Kontaktadresse für Schwachstellenmeldungen | korrekt | CRA Anhang I Teil II (6), Art. 13(17) |
| Ein schriftliches Verfahren für die 24-Stunden-Meldung (CVD-Richtlinie, veröffentlichte Korrekturen, zehn Jahre aufbewahrte Updates, Dokumentationszeitraum und Informationen nach Anhang II ergänzt) | korrigiert | CRA Art. 13(9), (13), (18), 14(2)(a); CRA Anhang I Teil II (4), (5) |
| Die Meldepflicht gilt bereits | korrekt | CRA Art. 69(3), 71(2) |

### Safety

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Jede Versorgung liegt unter 60 V DC, dem Berührgrenzwert ES1 (Tabelle 4 für die Ausgabe 2018 bestätigt) | korrekt | ULQA; IEC18 contents |
| Beide Prüfberichte stufen einen PoE-Eingang als ES1 ein | korrekt | FLIR S. 8; AIR S. 8, 9 |
| „Nirgends ist eine Isolierung nötig“ (jetzt: an den Eingängen; interne Wandler dürfen über 60 V liegen) | korrigiert | ULQA |
| DC-Versorgung auf 100 W begrenzt, besser auf 15 W | korrekt | ULTB |
| „Ohne angegebene Grenze zählt das Labor den Eingang als unbegrenzt“ (jetzt: Laborpraxis, gezeigt durch den FLIR-Bericht) | korrigiert | FLIR S. 10, 47 |
| Sicherungen mit 1,1 A und 2 A; eFuse 1,8 bis 2,2 A | nicht geprüft (Designwert) | Schaltplan |
| Gehäuse mindestens HB (die Glühdraht-Alternative der Ausgabe 2018 ergänzt) | korrigiert | ULQA; TUV Punkt 17 (sekundär) |
| Platine V-1 oder besser nach Klausel 6.4.5.2 | aus freien Quellen nicht prüfbar (EN 62368-1, kostenpflichtig) | FLIR S. 18 verzeichnet „PCB: V-0“; JLCPCB UL |
| Ein mit dem Leser verkauftes Netzteil wird Teil des geprüften Produkts | aus freien Quellen nicht prüfbar (Laborpraxis) | keine |
| EN 60825-1 gilt nicht für die LED; kein Laser-Etikett | korrekt | BSI 60825-1; IEC18 contents (Klausel 10.4) |
| LED-Impulswerte (200 mA, 1 ms, 1/40) | nicht geprüft (Designwert) | Datenblatt des Sensors |
| PoE-Isolation: eine von drei alternativen Prüfungen, danach mindestens 2 MOhm bei 500 V DC; die Auslegung bestätigt nur die Effektivwertprüfung; 802.3-2022 nicht gelesen | korrigiert (Review-Stufe 4) | IEEEW (sekundär); IEEEI |
| Von der Sicherheitsnorm nicht verlangt, „weil beide Seiten berührt werden können“ (jetzt: Klausel 5.4.11 gilt nur gegenüber geerdeten Stromkreisen) | korrigiert | ULQA; FLIR S. 15 |
| Ein CE-Labor darf die PoE-Isolation nicht prüfen; Kunden erwarten sie | aus freien Quellen nicht prüfbar (Meinung) | keine |

### Enclosure plastic

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| V-1 für das ganze Gehäuse ist strenger als die Norm | korrekt | ULQA |
| PS1: bis 15 W, drei Sekunden nach Fehlereintritt | korrekt | ULTB |
| PS1: HB (Klausel 6.3.1) | korrekt | ULQA |
| HB75 unter 3 mm Wandstärke, HB40 ab 3 mm | aus freien Quellen nicht prüfbar (EN 62368-1, kostenpflichtig) | keine |
| PS1: kein Teil gilt als entzündungsfähig | korrekt | ULQA; ULTB |
| PS2: bis 100 W (nach 5 s ergänzt) | korrekt | ULTB |
| PS2: 13 mm / 50 mm, V-1, Anhang S oder eine Barriere | korrekt | ULQA; FLIR S. 18 |
| Die Barriere muss aus Metall oder V-1-Material sein | aus freien Quellen nicht prüfbar (EN 62368-1, kostenpflichtig) | keine |
| PS3: „das ganze Gehäuse V-1 oder besser“ (jetzt: ein Brandschutzgehäuse um den PS3-Stromkreis, in der Praxis das ganze Gehäuse) | korrigiert | FLIR S. 18; ULQA |
| Widerstandsbedingte Zündquelle (das 100-W-Kriterium, wo PTC-Elemente oder Regler die Leistung begrenzen, ergänzt) | korrigiert | FLIR S. 48; AIR S. 52 |
| 2014 zählte die verfügbare Leistung, 2018 zählt die umgesetzte Leistung | korrekt | ULQA; TI 2018 TRF |
| Lichtbogen-Zündquelle: mindestens 50 V, Volt mal Ampere über 15 | korrekt | FLIR S. 48; AIR S. 51 |
| Die Antwort von UL zu einem HB-Gehäuse | korrekt (wörtlich) | ULQA |
| USB-C höchstens 15 W (5 V, 3 A) | nicht geprüft (Designwert) | design-notes.md |
| Die 125-%-Regel für Sicherungen (12,5 W hinter der 2-A-Sicherung, 33 W bei 24 V, eine 0,5-A-Sicherung) | aus freien Quellen nicht prüfbar (EN 62368-1, kostenpflichtig; UL beschreibt das Messen knapp unter dem Auslösepunkt) | ULTB |
| PoE: mehr als 15 W; 33,6 W an einem vergleichbaren Gerät gemessen | korrekt | FLIR S. 47 |
| PoE: Volt mal Ampere verwendet den aufgenommenen Strom (die 3 bis 9 W sind Designwerte) | korrekt | FLIR S. 48; AIR S. 51 |
| 12 bis 24 V: unter 50 V, also nur die 15-W-Regel | korrekt | FLIR S. 48 |
| 12 bis 24 V: Die Klasse folgt der angegebenen Grenze der Versorgung | korrekt | ULTB |
| Leistung des Lesers 2,5, 4,5 und 8,3 W | nicht geprüft (Designwert) | design-notes.md, „Leistungsbilanz“ |
| FLIR: 8,1 W, CTC advanced, 2021; PoE-Anschluss PS2 | korrekt | FLIR S. 1, 2, 8 |
| FLIR: 7,0 „also keine Lichtbogenquelle“ am PoE-Anschluss, nach dem Fehlertest keine (jetzt: die Prüfung nennt keinen Anschluss; eine widerstandsbedingte Quelle wurde auf der Seite der externen Versorgung gefunden) | korrigiert | FLIR S. 48 |
| FLIR: Metallgehäuse, weil der externe Eingang über 100 W gemessen wurde | korrekt | FLIR S. 2, 10, 47 |
| Airtame: 5 V, 2 A Ausgang; EKTOS, 2018 | korrekt | AIR S. 1, 2 |
| Airtame: 15,9 und 16,5 W; Quellen an der Buchse, an Gleichrichtern und Schutzdioden | korrekt | AIR S. 51, 52 |
| Airtame: Gehäuse 5VB zählt als Brandschutzgehäuse | korrekt | AIR S. 21 |
| Eine Datenblattklasse aus Prüfstäben muss für ein gedrucktes Teil nicht gelten | aus freien Quellen nicht prüfbar (fachliche Einschätzung) | keine |
| Eine Flammprüfung am gedruckten Teil entscheidet (Anhang S) | korrekt | ULQA |
| Ein Hersteller darf eine Zündquelle erklären (gängige Praxis) | korrekt | ULQA |
| Die Zone reicht 50 mm nach oben (der Dock-Abstand von 14 mm ist ein Designwert) | korrekt | ULQA |
| Eine Sicherung hält in einem warmen Gehäuse zwei Drittel ihres Nennwerts | nicht geprüft (Designwert) | Datenblatt der Sicherung |
| Filament Unger ABS+: keine Klasse, kein RoHS oder REACH; Datenblätter nur für PLA+, PETG, PA12 CF15 | korrekt | Unger guide; Unger downloads |
| ABS ohne Flammschutzmittel ist meist HB | aus freien Quellen nicht prüfbar (Allgemeinwissen) | keine |
| FormFutura ABSpro Flame Retardant | korrekt | FormFutura TDS |
| BASF Ultrafuse PC/ABS FR Black: V-0 bei 1,5 und 3,0 mm | korrekt | BASF TDS |
| ROSA „ABS FR V0“ ist HB (jetzt: Das Datenblatt trägt die Überschrift „ABS+“ und ist widersprüchlich) | korrigiert | ROSA TDS |
| Filament Unger ABS+ etwa 95 °C | korrekt | Unger guide |
| „Das wärmste Teil erreicht 79 °C“ (jetzt: 79 °C ist das Wi-Fi-Modul; die wärmste Stelle liegt bei etwa 80 °C; die LED-Reihen) | korrigiert | design-notes.md, „Simulation“ |
| Die Ausgaben 2018 und 2023 wurden nicht gelesen (zwei Änderungen von 2018 ergänzt) | korrekt | TUV Punkte 16, 17 (sekundär) |

### Tests on the ports

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| ESD 4 kV Kontakt, 8 kV Luft, an allen zugänglichen Oberflächen | korrekt | EN 301 489-1 §9.3.2 |
| Störfestigkeit gegen Abstrahlung 3 V/m, 80 MHz bis 6 GHz | korrekt | EN 301 489-1 §9.2.2 |
| Schnelle Transienten 0,5 kV, HF-Gleichtakt 3 V, wenn das Kabel länger als 3 m sein darf (jetzt auch für den Ethernet-Anschluss angegeben) | korrekt | EN 301 489-1 §9.4.1, §9.4.2, §9.5.1, §9.5.2 |
| Stoßspannung 0,5 kV für Innenkabel über 30 m; mehr für Außenkabel (1 kV, 10/700 µs ergänzt); stattdessen 1,2/50 µs erlaubt, wo das Koppelnetzwerk einen Hochgeschwindigkeitsanschluss stört | korrekt; ergänzt (Review-Stufe 4) | EN 301 489-1 §9.8.2.1, §9.8.2.2; EN 301 489-17 Tabelle 6 |
| Leitungsgebundene Störaussendung in „Klasse B“ am DC-Eingang (jetzt: EN 301 489-1 Tabelle 5; Klasse B für Ethernet und für den AC-Anschluss eines eigenen Netzteils; NFC-Ausschlussband) | korrigiert | EN 301 489-1 §8.3.1, §8.3.2, §8.3.3, §8.4.3.2, §8.7.3 |
| Eine Klemme für Installationsleitungen bedeutet Prüfungen am DC-Anschluss (die zitierte Formulierung stammt aus design-notes, nicht aus einer Norm) | korrekt | EN 301 489-1 §9.4.1, §9.5.1, Anhang C.1 |
| Keine Stoßspannungsprüfung an DC-Versorgungsanschlüssen (PoE kommt über einen drahtgebundenen Netzwerkanschluss, ergänzt) | korrekt | EN 301 489-1 §3.1, §9.8.1 |
| Nur der Ethernet-Anschluss erhält eine Stoßspannung, 0,5 kV, über 30 m | korrekt | EN 301 489-1 §9.8.2.2 |
| EN 50130-4 ist die EMV-Norm (Störfestigkeit) für Zutrittskontrolle | korrekt | EVS 50130-4; iTeh 50130-4 preview §1 |
| EN 50130-4 nennt keine Richtlinie (EVS) | falsch, korrigiert (Review-Stufe 4): EN 50130-4:2011 ist unter der EMV-Richtlinie zitiert, nicht unter der RED, und begründet für dieses Funkprodukt daher keine Vermutung | OJ C 173 2016; EMC summary list 2022; HS-RED |
| EN 50130-4 verlangt Stoßspannungen über 42 Ohm auf ELV-DC-Leitungen | aus freien Quellen nicht prüfbar (EN 50130-4, kostenpflichtig) | iTeh 50130-4 preview (nur Titel von Klausel 13) |
| EN 50130-4, konsolidierter englischer Text, 24,80 EUR bei EVS | korrekt | EVS 50130-4 |
| Deutsche Ausgabe 79,96 EUR bei DIN Media | korrekt | DIN Media 50130-4 |
| prEN 50130-4:2026 liegt als Entwurf vor | korrekt | EVS 50130-4 |
| „0,5 kV Leiter-Leiter hinter 2 Ohm, die Prüfung der IEC 61000-4-5 für Versorgungsanschlüsse“ (jetzt: IEC 61000-4-5 ist eine Grundnorm und legt keine Anwendbarkeit fest; Pegel und Impedanz als ungeprüft gekennzeichnet) | korrigiert | IEC 61000-4-5 preview §1 |

### What the board design does

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Maßnahmen auf der Platine (Lagen, Regler, Filter, TVS, Layout) | nicht geprüft (Designwert) | Schaltplan und Layout; design-notes.md |

### Where the board may still fail in the lab

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Ausfallstellen und Abhilfen (Punkte 1, 3 und 4; das Pre-Compliance-Kit) | aus freien Quellen nicht prüfbar (fachliche Einschätzung) | keine |
| ESD und Transienten: durchgefallen, wenn sich der Leser nicht selbst erholt; Klausel 6 von Teil 1 „shall not apply“, der Prüfplan setzt objektive Kriterien | korrigiert (Review-Stufe 4: EN 301 489-1 §6.2 nicht mehr zitiert) | EN 301 489-17 §6.1, §6.4, Tabelle 2 |
| Abgestrahlte Leistung des Wi-Fi-Moduls (Punkt 5): 0,15 dB unter dem Grenzwert bei 2,4 GHz auf Espressifs Platine | modulspezifisch | CE-C5 S. 2; EN 300 328 §4.3.2.2.3 |
| Espressifs HF-Testfirmware (jetzt benannt: EspRFTestTool oder das ESP-IDF-Beispiel `cert_test`) | korrekt | RFT; FAQ |

### Open points for the product

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Sendeleistung je Band aus der e.i.r.p.-Messung des Labors, als Obergrenze der Firmware | aus freien Quellen nicht prüfbar (folgt aus dem Abschnitt zum Modul) | CE-C5 S. 2; EN 300 328 §4.3.2.2.3; EN 301 893 §4.2.3.2.2 |
| Verpackung und Anleitung: 5-GHz-Beschränkung auf Innenräume mit den Codes der Mitgliedstaaten; Bänder und maximale Leistung | korrekt | RED Art. 10(8), 10(10); IR 2017/1354 Art. 2 |
| Typenschild: CE-Zeichen, Modell, Seriennummer, Name und Postanschrift, durchgestrichene Mülltonne (Identität des Herstellers und Zeichen nach 2005 ergänzt) | korrekt | RED Art. 10(6), (7), 20(1); ElektroG §9 |
| Eine Kopie der Konformitätserklärung im Karton (fehlte) | korrigiert (ergänzt) | RED Art. 10(9) |
| Technische Unterlagen zehn Jahre aufbewahrt (die Erklärung und die Regel des CRA ergänzt) | korrekt | RED Art. 10(4); CRA Art. 13(13) |
| Ob gewerbliche oder private Käufer, entscheidet über ElektroG und GPSR (jetzt auch deutsche Anleitung; Verpackungspflichten gelten in den meisten Fällen in beiden Fällen) | korrigiert | ElektroG §3 Nr. 5; FuAG §20(1); GPSR Art. 3(1); VerpackDG §3(7) |

### Test lab

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Zwei oder drei akkreditierte Labore anfragen (jetzt: auch benannte Stellen, wo eine nötig ist) | korrigiert | RED Art. 17(4); CRA Art. 32(2) |
| Konfiguration für das Angebot: das C5-Modul mit seiner Platinenantenne in beiden Bändern, Kanäle 36 bis 64 und 100 bis 140 | nicht geprüft (Designwert) | firmware-port.md |
| Die Ethernet-Version mit bestücktem Wi-Fi deckt meist die Wi-Fi-Version ab | aus freien Quellen nicht prüfbar (Laborpraxis) | stimmt überein mit EG 203 367 §6.1 Anmerkung 3 |

### Sources

| Aussage (kurz) | Ergebnis | Quelle |
|---|---|---|
| Linkliste (jetzt auf diese Seite verschoben, mit den Quellen, auf die sich die Korrekturen stützen) | korrigiert | diese Seite |

## Source list

### EU law and Commission documents

| Schlüssel | Vollständiger Titel | Version / Datum | URL | Herangezogene Klausel oder Seite |
|---|---|---|---|---|
| RED | Directive 2014/53/EU (Radio Equipment Directive) | konsolidierte Fassung vom 30. Mai 2026 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014L0053-20260530> | Art. 1(4), 2(1), 3, 3(1)(a), 10(4), (6), (7), (8), (9), (10), 16, 17(2), (3), (4), 18(3), 20(1), 50; Anhang Ia Teil I; Anhang II; Anhang VI Nr. 8 |
| DR 2022/30 | Commission Delegated Regulation (EU) 2022/30 (RED Art. 3(3)(d), (e), (f)) | ursprünglicher Text | <https://eur-lex.europa.eu/eli/reg_del/2022/30/oj> | Art. 1(1), (2), (3), Art. 3 |
| DR 2023/2444 | Commission Delegated Regulation (EU) 2023/2444 amending 2022/30 | ursprünglicher Text | <https://eur-lex.europa.eu/eli/reg_del/2023/2444/oj> | Art. 1 (Anwendung ab dem 1. August 2025; neuer Wortlaut von Art. 1(2)) |
| DR 2026/339 | Commission Delegated Regulation (EU) 2026/339 repealing 2022/30 | angenommen am 16. Februar 2026, ABl. L vom 29. April 2026 | <https://eur-lex.europa.eu/eli/reg_del/2026/339/oj> | Art. 1; Erwägungsgründe 4, 5 |
| HS-RED | Commission Implementing Decision (EU) 2022/2191, harmonised standards for radio equipment | konsolidierte Fassung vom 15. November 2026 (zuletzt geändert durch 2026/2003) | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02022D2191-20261115> | Anhang I Nr. 5, 16, 17, 65a, 164, 165, 168, 169 mit ihren Mitteilungen; kein Eintrag für EN 301 489-1, EN 55032, EN 62368-1, EN 62311, EN 50665, EN 50364 |
| ID 2025/138 | Commission Implementing Decision (EU) 2025/138 (citation of EN 18031) | ursprünglicher Text | <https://eur-lex.europa.eu/eli/dec_impl/2025/138/oj> | Erwägungsgrund 6; Anhang |
| EMCD | Directive 2014/30/EU (EMC Directive) | ursprünglicher Text | <https://eur-lex.europa.eu/eli/dir/2014/30/oj> | Art. 2(2)(a) |
| HS-EMC | Commission Implementing Decision (EU) 2019/1326, harmonised standards for EMC | konsolidierte Fassung vom 10. Juni 2022 (die letzte aufgeführte) | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02019D1326-20220610> | Einträge EN 55032:2015/A11:2020, EN 55035:2017/A11:2020 |
| HS-RED 2025/893 | Commission Implementing Decision (EU) 2025/893, amending Implementing Decision (EU) 2022/2191 | ursprünglicher Text | <https://eur-lex.europa.eu/eli/dec_impl/2025/893/oj> | Erwägungsgrund zu den Mitteilungen für EN 301 489-3 und -17 („performance-based criteria on a subjective basis“) |
| WAS | Commission Implementing Decision (EU) 2022/179, harmonised use of the 5 GHz bands for wireless access systems including RLANs (WAS/RLAN) | vom 8. Februar 2022, ABl. L 29, 10.2.2022, S. 10; konsolidierte Fassung vom 25. November 2022 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022D0179> | Art. 1, 2(b), 5; Anhang (ersetzt durch WAS-A) Tabellen 1 bis 3 und Anmerkungen |
| WAS-A | Commission Implementing Decision (EU) 2022/2307, amending 2022/179 | vom 23. November 2022, ABl. L 305, 25.11.2022, S. 63 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022D2307> | Art. 1(2) (Anhang ersetzt) |
| SRD | Commission Decision 2006/771/EC, harmonisation of the radio spectrum for short-range devices, annex replaced by Implementing Decision (EU) 2025/105 | konsolidierte Fassung vom 23. Januar 2025 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025D0105> (2006/771/EC: CELEX 32006D0771(01)) | Anhang, Band 61 |
| IR 2017/1354 | Commission Implementing Regulation (EU) 2017/1354, presentation of the information under RED Art. 10(10) | vom 20. Juli 2017, ABl. L 190, 21.7.2017, S. 7 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32017R1354> | Art. 2(1), (2), 3; Anhang I (Piktogramm), Anhang II (Codes) |
| OJ C 173 2016 | Commission communication 2016/C 173/01, harmonised standards under Directive 2014/30/EU (EMC) | ABl. C 173 vom 13. Mai 2016 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52016XC0513(01)> | Eintrag EN 50130-4:2011 |
| EMC summary list 2022 | European Commission, summary list of harmonised standards for the EMC Directive | 19. September 2022 | <https://single-market-economy.ec.europa.eu/single-market/european-standards/harmonised-standards/electromagnetic-compatibility-emc_en> | Eintrag EN 50130-4:2011 |
| HS-LVD | Commission Implementing Decision (EU) 2023/2723, harmonised standards for low-voltage equipment | konsolidierte Fassungen vom 30. April 2026 und 23. Januar 2027 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02023D2723-20260430> | Einträge EN 62368-1:2014, EN 62311:2008, EN 50364:2010 |
| CRA | Regulation (EU) 2024/2847 (Cyber Resilience Act) | Text des Amtsblatts vom 20. November 2024 | <https://eur-lex.europa.eu/eli/reg/2024/2847/oj> | Art. 3(48), 7(1), 13(2), (3), (8), (9), (13), (17), (18), (19), 14(2), (4), 27(1), 32(2), (5), (6), 33(5), 64(10)(a), 69(1), (2), (3), 71(2); Anhang I Teile I und II; Anhang II; Anhang III Klasse I Nr. 1 |
| CRA guidance | Commission guidance on the Cyber Resilience Act, C/2026/6013 | ABl. C vom 17. November 2026 | <https://eur-lex.europa.eu/eli/C/2026/6013/oj> | Abs. 25, 126, 137, 148, 149, 251 bis 254 |
| IR 2025/2392 | Commission Implementing Regulation (EU) 2025/2392, technical description of important and critical product categories | vom 28. November 2025, ABl. vom 1. Dezember 2025 | <https://eur-lex.europa.eu/eli/reg_impl/2025/2392/oj> | Anhang I, Klasse I, Nr. 1 |
| C(2026) 7861 | Commission Implementing Decision C(2026) 7861 amending the CRA standardisation request, with annex | 10. November 2026 | <https://ec.europa.eu/transparency/documents-register/detail?ref=C(2026)7861&lang=en> | Anhang, Zeile 16 (Frist 31/01/2027) |
| CRA std page | European Commission, "Cyber Resilience Act - Standardisation" | aktualisiert am 23. November 2026 | <https://digital-strategy.ec.europa.eu/en/policies/cra-standardisation> | Stand der Normen; Änderung vom 10. November 2026 |
| MSME page | European Commission, "Cyber Resilience Act - Microenterprises and Small and Medium-sized enterprises (MSMEs)" | gelesen am 25. November 2026 | <https://digital-strategy.ec.europa.eu/en/policies/cra-msmes> | das vereinfachte Dokumentationsformular ist noch nicht festgelegt |
| RoHS | Directive 2011/65/EU (RoHS) | ursprünglicher Text | <https://eur-lex.europa.eu/eli/dir/2011/65/oj> | Art. 7(b), (d); Anhang VI |
| REACH | Regulation (EC) No 1907/2006 (REACH) | konsolidierte Fassung vom 23. Juni 2025 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006R1907-20250623> | Art. 33(1), (2) |
| WFD | Directive (EU) 2018/851 amending the Waste Framework Directive 2008/98/EC | ursprünglicher Text | <https://eur-lex.europa.eu/eli/dir/2018/851/oj> | Art. 9(1)(i) der 2008/98/EG in der eingefügten Fassung |
| Batteries Reg | Regulation (EU) 2023/1542 (Batteries Regulation) | ursprünglicher Text | <https://eur-lex.europa.eu/eli/reg/2023/1542/oj> | Art. 1(3) |
| GPSR | Regulation (EU) 2023/988 (General Product Safety Regulation) | ursprünglicher Text | <https://eur-lex.europa.eu/eli/reg/2023/988/oj> | Art. 2(1), 3(1), 19, 20, 36, 37, 52; Erwägungsgrund 17 |
| Data Act | Regulation (EU) 2023/2854 (Data Act) | ursprünglicher Text | <https://eur-lex.europa.eu/eli/reg/2023/2854/oj> | Art. 2(5), 7(1), 50 |
| PLD | Directive (EU) 2024/2853 (Product Liability Directive) | ursprünglicher Text | <https://eur-lex.europa.eu/eli/dir/2024/2853/oj> | Art. 2(1), 4(1), 7(2)(f), 11(2), 22(1) |
| WEEE | Directive 2012/19/EU (WEEE Directive) | ursprünglicher Text | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32012L0019> | Art. 3(1)(f), (h), 16(1), 17(2) |
| PPWR | Regulation (EU) 2025/40 (Packaging and Packaging Waste Regulation) | ursprünglicher Text | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R0040> | Art. 3 (Definition des Herstellers), 15(1), (2), 71 |

### German law and authorities

| Schlüssel | Vollständiger Titel | Version / Datum | URL | Herangezogene Klausel oder Seite |
|---|---|---|---|---|
| FuAG | Funkanlagengesetz | zuletzt geändert durch Art. 2 des Gesetzes vom 20. Juli 2026 (BGBl. 2026 I Nr. 214) | <https://www.gesetze-im-internet.de/fuag/BJNR194710017.html> | Fußnote; §9(3), §20(1), (2), (3), §23(1) |
| ElektroG | Elektro- und Elektronikgerätegesetz | zuletzt geändert am 25. November 2025 (BGBl. 2025 I Nr. 286) | <https://www.gesetze-im-internet.de/elektrog_2015/BJNR173910015.html> | §3 Nr. 4, 5; §6(1), (3); §7(1), (3); §7a(1); §8(5); §9(1), (2); §19(1); §19a |
| GebV | ElektroG-, BattDG-Gebührenverordnung (ElektroGBattDGGebV) | zuletzt geändert am 30. September 2025 (BGBl. 2025 I Nr. 233) | <https://www.gesetze-im-internet.de/elektroggebv/BJNR177600015.html> | Gebührenverzeichnis Nr. 1.2 |
| VerpackDG | Verpackungsrecht-Durchführungsgesetz | vom 13. Juli 2026 (BGBl. 2026 I Nr. 207), Text ab dem 12. August 2026 | <https://www.gesetze-im-internet.de/verpackdg/BJNR0CF0B0026.html> | §3(6), (7); §6(1), (6); §7; §9(1); §10; §39(1) |
| ChemG | Chemikaliengesetz, §16f | aktueller Text, gelesen am 25. November 2026 | <https://www.gesetze-im-internet.de/chemg/__16f.html> | §16f(1) |
| BT-Drs 21/6134 | Regierungsentwurf zur Umsetzung des CRA in Deutschland (Änderung des BSIG) | Bundestagsdrucksache 21/6134 | <https://dserver.bundestag.de/btd/21/061/2106134.pdf> | Art. 1, neuer §65(1) BSIG |
| BR-Drs 621/26 | Vom Bundestag beschlossener Text, an den Bundesrat übersandt | beschlossen am 15. Oktober 2026 | <https://dserver.bundestag.de/brd/2026/0621-26.pdf> | Anschreiben |
| ear reg | stiftung ear, "WEEE-Registrierung beantragen" | gelesen am 25. November 2026 | <https://www.stiftung-ear.de/anleitungen/weee-registrierung-beantragen/> | "Wie lange dauert die Erteilung der WEEE-Registrierung?" |
| ear fees | stiftung ear, "Kosten & Gebühren" | gelesen am 25. November 2026 | <https://www.stiftung-ear.de/anleitungen/kosten-und-gebuehren/> | "Beispiel 3 – Hersteller (b2b)"; Beträge sind netto |
| ZSVR | Zentrale Stelle Verpackungsregister, "PPWR & VerpackDG: Das gilt seit dem 12. August 2026" | gelesen am 25. November 2026 | <https://www.verpackungsregister.org/ich-moechte-wissen-was-seit-dem-12-august-2026-gilt> | Ablösung des VerpackG; LUCID; Zulassung für Verpackungen außerhalb der Systembeteiligung ab Ende 2027 |
| VDE RED modules | VDE Prüf- und Zertifizierungsinstitut (benannte Stelle 0366), "RED Information Radio Modules" | 24. November 2020 | <https://vde.com/resource/blob/2257746/305090fb24a3738e51dbe4a523c4be35/red-kundeninformation-en-data.pdf> (deutsch: <https://vde.com/resource/blob/2257754/fc11b11d828ba03345ac6bc90681da68/red-kundeninformation-de-data.pdf>) | S. 2 |

### Standards, guides and their previews

| Schlüssel | Vollständiger Titel | Version / Datum | URL | Herangezogene Klausel oder Seite |
|---|---|---|---|---|
| EN 300 328 | ETSI EN 300 328, wideband transmission systems in the 2.4 GHz band | V2.2.2 (2019-07) | <https://www.etsi.org/deliver/etsi_en/300300_300399/300328/02.02.02_60/en_300328v020202p.pdf> | §3.1, §4.2.4, §4.3.2.2.2, §4.3.2.2.3, §5.4.1 m) |
| EN 301 893 | ETSI EN 301 893, 5 GHz RLAN, harmonised standard for access to radio spectrum | V2.2.1 (2024-11) | <https://www.etsi.org/deliver/etsi_en/301800_301899/301893/02.02.01_60/en_301893v020201p.pdf> | §1 Tabelle 1, §3.1, §4.2.3.1.2, §4.2.3.2.2 Tabelle 2 und Anmerkung 1, §4.2.6.1.2, §4.2.6.1.4.2 a), §4.2.6.2.1 Tabelle 5; Anhang B; Anhang D Tabelle D.2 Anmerkung 2 |
| EN 300 330 | ETSI EN 300 330, short range devices 9 kHz to 25 MHz | V2.1.1 (2017-02) | <https://www.etsi.org/deliver/etsi_en/300300_300399/300330/02.01.01_60/en_300330v020101p.pdf> | §4.3.4 Tabelle 2 mit Anmerkungen 2, 3; §4.3.8.3 Tabelle 5; §4.3.9.3 Tabelle 6; §5.4.1; §6.2.9; Anhang C.2.3 |
| EN 301 489-1 | ETSI EN 301 489-1, EMC for radio equipment, part 1: common technical requirements | V2.2.3 (2019-11) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148901/02.02.03_60/en_30148901v020203p.pdf> | §3.1; §6.2; §8.3.1, §8.3.2, §8.3.3 Tabelle 5; §8.4.3.2; §8.7.3; §9.2.2; §9.3.2; §9.4.1, §9.4.2; §9.5.1, §9.5.2; §9.8.1, §9.8.2.1, §9.8.2.2; Anhang C.1 |
| EN 301 489-3 | ETSI EN 301 489-3, part 3: short range devices 9 kHz to 246 GHz | V2.3.2 (2023-01) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148903/02.03.02_60/en_30148903v020302p.pdf> | §2.1, §3.1, §6.1 |
| EN 301 489-17 | ETSI EN 301 489-17, part 17: broadband and wideband data transmission systems | V3.3.1 (2024-09) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148917/03.03.01_60/en_30148917v030301p.pdf> | §1 Tabelle 1, §2.1, §6, §6.1, §6.4, Tabelle 2, Tabelle 6 |
| EG 203 367 | ETSI EG 203 367, guide to harmonised standards for multi-radio and combined equipment | V1.1.1 (2016-06), die einzige Version | <https://www.etsi.org/deliver/etsi_eg/203300_203399/203367/01.01.01_60/eg_203367v010101p.pdf> | §1, §3.1, §5.1.1.3, §5.2.3, §6.1 Anmerkungen 1 bis 3, §6.2 |
| IEC18 | IEC 62368-1:2018, table of contents (VDE Verlag preview) | Ausgabe 3.0 | <https://www.vde-verlag.de/iec-normen/preview-pdf/info_iec62368-1%7Bed3.0%7Db.pdf> | Titel von Tabelle 4; Klauseln 6.4.5, 10.4; Tabelle 40 |
| EVS 50130-4 | EVS product page, EVS-EN 50130-4:2011+A1:2014 (consolidated) | gelesen am 25. November 2026 | <https://www.evs.ee/en/evs-en-50130-4-2011-a1-2014-consolidated> | Anwendungsbereich; Preis; "Directives or regulations: None"; Normenhistorie (prEN 50130-4:2026) |
| DIN Media 50130-4 | DIN Media, DIN EN 50130-4:2015-04; VDE 0830-1-4:2015-04 | gelesen am 25. November 2026 | <https://www.dinmedia.de/en/standard/din-en-50130-4/228662474> | Preis |
| iTeh 50130-4 preview | SIST EN 50130-4:2011, free sample | Basistext von 2011 | <https://cdn.standards.iteh.ai/samples/22803/7e22d3a729bd42438ee0562acbfd0d9b/SIST-EN-50130-4-2011.pdf> | Klausel 1; Inhaltsverzeichnis (Klausel 13, Tabelle 7) |
| IEC 61000-4-5 preview | IEC 61000-4-5, surge immunity test (VDE Verlag preview) | Ausgabe 3.0 (2014) | <https://www.vde-verlag.de/iec-normen/preview-pdf/info_iec61000-4-5%7Bed3.0%7Db.pdf> | Klausel 1, Anmerkung; Inhaltsverzeichnis |
| DIN Media prEN 40000-10 | DIN Media, draft DIN EN 40000-10 (English version prEN 40000-10:2026) | Entwürfe vom 22. Mai 2026 und 6. November 2026 | <https://www.dinmedia.de/en/draft-standard/din-en-40000-10/402331001>, <https://www.dinmedia.de/en/draft-standard/din-en-40000-10/407570821> | Ausgabedaten |
| Genorma | Genorma, listing of prEN 40000-10 (secondary) | gelesen am 25. November 2026 | <https://genorma.com/en/standards/pren-40000-10> | Stufe 40.60; Ende der Abstimmung 13. August 2026; CEN/TC 224 |
| BSI 60825-1 | BSI, scope of BS EN 60825-1:2014+A11:2021 | gelesen am 25. November 2026 | <https://knowledge.bsigroup.com/products/safety-of-laser-products-equipment-classification-and-requirements-3?version=standard> | Anwendungsbereich: LEDs aus Teil 1 entfernt |
| SIQ | SIQ, "Update on EN IEC 62368-1:2024 + A11:2024 and OJEU harmonization status" (secondary) | 16. Dezember 2025 | <https://www.siq.si/en/news/update-on-en-iec-62368-12024-a112024-and-ojeu-harmonization-status/> | die Ausgabe 2024 existiert und wird voraussichtlich nicht zitiert |

### Espressif and FCC (module-specific)

| Schlüssel | Vollständiger Titel | Version / Datum | URL | Herangezogene Klausel oder Seite |
|---|---|---|---|---|
| DS-C5 | ESP32-C5-MINI-1 & MINI-1U Datasheet | v1.4 | <https://documentation.espressif.com/esp32-c5-mini-1_mini-1u_datasheet_en.pdf> | §1 (Überblick: Platinenantenne, 2,4 und 5 GHz) |
| CE-C5 | EU-type examination certificate 44024-05-2026-260268, ESP32-C5-MINI-1, Eurofins Electrical and Electronic Testing NA, Inc., notified body 0980 | 27. Mai 2026 | <https://documentation.espressif.com/ESP32-C5-MINI-1%20CE%20Certification.pdf> | S. 1 (Bescheinigung); S. 2 (Anhang: Bänder, Sendeleistung, Antenne, Berichte zu Gesundheit und Sicherheit); S. 3 (Berichte zu EMV und Funk) |
| FCC-C5 | FCC grant, FCC ID 2AC7Z-ESPC5MINI1 (ESP32-C5-MINI-1), part 15E | erteilt am 28. Mai 2026 | <https://documentation.espressif.com/ESP32-C5-MINI-1%20FCC-5G%20Certification.pdf> | Hinweise der Zulassung (einzeln modular; Ausgangsleistung leitungsgebunden; 20 cm; Co-Location) |
| ANT-C5 | Sporton, "OTA Antenna Performance Data Summary", ESP-DUAL BAND-ANT C (PCB antenna), FCC exhibit "ANT Test Report" 9339346 for 2AC7Z-ESPC5MINI1 | geprüft am 20. bis 21. Oktober 2025 | <https://fccid.io/2AC7Z-ESPC5MINI1> | §3.1 (maximaler Spitzengewinn je Band) |
| FAQ | ESP-FAQ, Hardware related, RF related | latest, gelesen am 25. November 2026 | <https://docs.espressif.com/projects/esp-faq/en/latest/hardware-related/RF-related.html> | Antennenauswahl und Wiederverwendung von Berichten; HF-Informationen über den Vertrieb; Beispiel `cert_test` |
| RFT | ESP Test Tools, "EspRFTestTool Toolkit" (ESP32-C5) | latest, gelesen am 26. November 2026 | <https://docs.espressif.com/projects/esp-test-tools/en/latest/esp32c5/development_stage/rf_test_guide/rf_test_guide.html> | Toolkit und Testfirmware |
| IDF-WIFI | ESP-IDF Programming Guide, ESP32-C5, Wi-Fi driver overview | latest, v6.1.1 und v6.0.2 verglichen, gelesen am 26. November 2026 | <https://docs.espressif.com/projects/esp-idf/en/latest/esp32c5/api-guides/wifi-driver/overview.html> | "Dynamic Frequency Selection (DFS)", "Home Channel" |
| IDF-API | ESP-IDF API reference, ESP32-C5, Wi-Fi (`esp_wifi.h`, `esp_wifi_types.h`) | latest, gelesen am 26. November 2026 | <https://docs.espressif.com/projects/esp-idf/en/latest/esp32c5/api-reference/network/esp_wifi.html> | `esp_wifi_set_country`, `esp_wifi_set_country_code`, `wifi_country_t.wifi_5g_channel_mask`, `esp_wifi_set_max_tx_power` |
| IDF-REG | ESP-IDF, `components/esp_wifi/regulatory/esp_wifi_regulatory.txt` | master, Commit 34ff741b vom 8. Mai 2026 | <https://raw.githubusercontent.com/espressif/esp-idf/master/components/esp_wifi/regulatory/esp_wifi_regulatory.txt> | Eintrag `country DE` |

### Test reports, UL, IEEE and other secondary sources

| Schlüssel | Vollständiger Titel | Version / Datum | URL | Herangezogene Klausel oder Seite |
|---|---|---|---|---|
| FLIR | CTC advanced, test report 60429496-001, FLIR A50/A70, IEC 62368-1:2014 | 30. April 2021 | <https://support.flir.com/CertDownload/Assets/FLIR%20A50%20and%20A70%20series/IEC%2062368-1%20TEST%20REPORT.pdf> | S. 1, 2, 8, 10, 15, 17, 18, 47, 48 |
| AIR | EKTOS, test report P18-0060-1, Airtame AT-PoE, IEC 62368-1:2014 | 21. November 2018 | <https://www.northamber.com/storage/uploads/Product%20Safety/Airtame/EU%20Safety%20Test%20Report%20(LVD)%20PoE%20_P18-0060-1_IEC62368-1.pdf> | S. 1, 2, 8, 9, 21, 51, 52 |
| TI 2018 TRF | Test report US-2558-MET EN 126343 M0A0, IEC 62368-1:2018 (hosted by TI) | gelesen am 25. November 2026 | <https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/US_2D00_2558_2D00_MET-EN-126343-M0A0.pdf> | Tabelle 6.2.3.2, Spalte "Dissipate power (W)" |
| ULQA | UL Solutions, "IEC 62368-1 Ask the Engineers" questions and answers (secondary) | gelesen am 25. November 2026 | <https://www.ul.com/resources/iec-62368-1-ask-engineers-question-and-answer-page> | Antworten zu ES1 und internen Wandlern, HB-Gehäusen, PS2 ohne Brandschutzgehäuse, widerstandsbedingten Zündquellen in den Ausgaben 2 und 3, Erklärung einer Zündquelle, 6.3.1, 6.4.8, 5.4.11 |
| ULTB | UL technical brief on power source classification and measurement (secondary) | 2011, für die erste Ausgabe | <https://japan.ul.com/wp-content/uploads/sites/27/2014/06/1_techbrief_classandele_measurement.pdf> | Tabelle zu PS1, PS2, PS3; S. 2, 3 (Messen unterhalb des Auslösepunkts) |
| TUV | TÜV Rheinland, IEC 62368-1 third edition technical product sheet (secondary) | 20. September 2019 | <https://media.go.tuv.com/Web/TUVRheinlandAG/%7B73d23bd3-a64c-4168-b067-832362b95455%7D_62368-1_Technical_Product_Sheet_AV-IT_9.20.19.pdf> | Punkte 16, 17 |
| IEEEI | IEEE 802.3 interpretation 3-07/04 on clause 33.4.1 | gelesen am 25. November 2026 | <https://www.ieee802.org/3/interp/interp-3-0704.pdf> | Zitat von 33.4.1 |
| IEEEW | IEEE 802.3 isolation ad hoc, summary of isolation tests (working-group document, secondary) | 17. August 2017 | <https://www.ieee802.org/3/ad_hoc/isolation/public/Walker_1_08172017_rev_1.pdf> | Tabelle zu 33.4.1 |
| Sagentia | Sagentia, "Lead is now on the REACH candidate list" (secondary) | gelesen am 25. November 2026 | <https://sagentia.com/news/lead-is-now-on-the-reach-candidate-list/> | Blei am 27. Juni 2018 in die Kandidatenliste aufgenommen |
| JLCPCB UL | JLCPCB help, "UL Certification" | gelesen am 25. November 2026 | <https://jlcpcb.com/help/article/UL-Certification> | UL-Akte E479892; UL-Kennzeichnung ergänzt, wenn die Bestellung sie verlangt |

### Filament makers

| Schlüssel | Vollständiger Titel | Version / Datum | URL | Herangezogene Klausel oder Seite |
|---|---|---|---|---|
| Unger guide | Filament Unger, material guide | gelesen am 25. November 2026 | <https://filament-unger.de/pages/material-guide> | ABS+ Wärmebeständigkeit etwa 95 °C; keine Angabe zu Entflammbarkeit, RoHS oder REACH |
| Unger downloads | Filament Unger, downloads | gelesen am 25. November 2026 | <https://filament-unger.de/pages/downloads> | Liste der Datenblätter |
| FormFutura TDS | FormFutura, ABSpro Flame Retardant technical data sheet | v3 | <https://cdn.shopify.com/s/files/1/0622/4181/files/ABSpro_Flame_Retardant_-_TDS_-_Formfutura.pdf> | Entflammbarkeit, Zusammensetzung, RoHS, REACH |
| BASF TDS | BASF Ultrafuse PC/ABS FR Black, technical data sheet (German) | v1.1, 9. Februar 2021 | <https://cdn.shopify.com/s/files/1/0264/8791/4555/files/Ultrafuse_PC-ABS_FR_Black_TDS_DE_v1.1.pdf> | "Flammschutzklasse V0 @ 1,5 mm and 3,0 mm" |
| ROSA TDS | ROSA 3D, technical data sheet "3D FILAMENT ABS+" (product name ABS FR V0) | gelesen am 25. November 2026 | <https://www.lemona.lt/Files/Instrukcijos/TI/En/Pdf/TDS-ROSA-ABS-EN.pdf> | Kopfzeile, Produktname, Flammschutzklasse |

### Repository

| Schlüssel | Vollständiger Titel | Version / Datum | URL | Herangezogene Klausel oder Seite |
|---|---|---|---|---|
| design-notes.md | Touch P4 design notes | dieser Branch | [design-notes.md](hardware/touch-p4/design-notes.md) | „WLAN-Antenne“, „Stromversorgung“, „Leistungsbilanz“, „Simulation“, „Entscheidungen“ (DC-Anschlüsse) |
