# WAGO 879-3020 (4PS) über CC100 RS-485

Die CC100-Runtime unterstützt lesende Messungen vom WAGO 879-3020 (4PS) über seine Zweidraht-RS-485-Schnittstelle. Wählen Sie das Geräteprofil **WAGO 879-3020 (4PS) — Modbus RTU**.

## Verbindung

Das [WAGO-4PU/4PS/2PU-CT-Handbuch, V1.6](https://www.tme.eu/Document/cb78e7d2f399e5b3e36d23003a167a48/879-3020-en.pdf), Anhang 3, dokumentiert diese Werkseinstellungen:

| Einstellung          | Wert          |
| -------------------- | ------------- |
| Transport            | Modbus RTU    |
| Serieller CC100-Pfad | `/dev/serial` |
| Slave-/Unit-Adresse  | `1`           |
| Baudrate             | `9600`        |
| Datenbits            | `8`           |
| Parität              | Gerade        |
| Stoppbits            | `1`           |

Zählerklemmen 7 und 8 bilden die RS-485-Verbindung. Beachten Sie Zähler- und CC100-Klemmenmarkierungen für Polarität sowie Busabschlussanforderungen des Handbuchs. Verwenden Sie tatsächliche Zählereinstellungen, wenn sie geändert wurden.

## Runtime-Version

Installieren Sie eine Version mit Hardwareprofil `cc100-751-9301-fw31-digital-rtu-v1`. Alte `digital-v1`-Versionen behalten reine Digitalbereitstellung und bieten keinen seriellen Zugang.

Der Installer prüft den root-eigenen Alias `/dev/serial` nach `/dev/ttySTM1`, root/dialout-Eigentum und `0660`-Rechte des Zeichengeräts sowie RS-485-Boot-Konfiguration der Firmware. Er mappt nur dieses Gerät lesend/schreibend als `/dev/serial` in den Container und ergänzt dessen bestehende Host-dialout-GID zu UID 10001. Die Runtime bleibt unprivilegiert, verwirft alle Fähigkeiten und verwendet bestehende überwachte Startprüfungen. Serielle Prüfungen wiederholen sich vor überwachten Starts.

Auf dem FW31-Entwicklungsgerät meldet der STM32-UART aktiviertes RS-485 mit Kernel-Richtungssteuerung und 1 ms Verzögerung vor und nach Senden. Der Transport verwendet Firmware-Richtungssteuerung; er schaltet keine GPIOs und benötigt keinen privilegierten Modus.

## Messungen konfigurieren

1. Controller-Seite **Konfigurieren** öffnen, dann **Externe Geräte**.
2. RTU-Verbindung mit obigen Einstellungen hinzufügen. Mit 2000 ms Antworttimeout und einer gemeinsamen Verbindung für den RS-485-Bus beginnen.
3. Zähler mit Unit-Adresse 1 und Profil **WAGO 879-3020 (4PS) — Modbus RTU** hinzufügen.
4. Messkanäle an die benötigten Signale binden.
5. Speichern, prüfen und veröffentlichen. Anwendung der Revision abwarten, dann frische Messwerte unter **Diagnose** prüfen.

Das Profil stellt alle 131 dokumentierten nicht reservierten FC03-Werte aus Anhang A3.2, Seiten 34–38, bereit. Das Controller-Frontpanel gruppiert sie in ausklappbare Bereiche:

- Elektrische Messwerte: Spannung, Strom, Wirk-/Blind-/Scheinleistung und Leistungsfaktor für L1, L2 und L3, Summen, Frequenz und Außenleiterspannungen.
- Wirk- und Blindenergie: Gesamt-, Import- und Exportzähler, alle vier Tarife, Phasenzähler und zurücksetzbare Tageszähler.
- Quadrantenenergie: Q1–Q4-Summen und Tarifzähler.
- Zählerinformationen: Serien-/Typcodes, Firmware-/Hardware-/Protokollversionen, Kommunikationseinstellungen, Phasenrichtungen/Quadranten, Prüfsummen, Statuswörter, Tarif, S0- und Anzeigeeinstellungen.

Jeder Wert ist ein benannter Messkanal für Diagnose und Flows. Bestehende Fünfkanal-Konfigurationen behalten Identitäten und Transformationen; erneutes Speichern des Geräts ergänzt fehlende Kanäle. Das Profil hat keine Schreibaktionen. Reservierte Adressen werden nie angefragt. Modellspezifische Register mit gültiger Modbus-Ausnahme werden isoliert, damit verfügbare Messwerte weiterhin veröffentlicht werden.

Registeradressen sind nullbasierte hexadezimale Wire-Adressen. Elektrische und Energiegrößen verwenden IEEE-754-float32-ABCD-Bytereihenfolge. kW, kvar, kVA, kWh und kvarh werden jeweils in W, var, VA, Wh und varh umgerechnet. Frequenz, Verhältnisse, Metadaten und S0-Einstellungen tragen eigene Einheiten; Codes haben lesbare Labels oder Hexformatierung. Gesamt-/Nettoenergie und zurücksetzbare Tageszähler verwenden Live-Messwerte, sodass legitime Abnahme oder Reset erhalten bleibt statt als Zählerfehler zu gelten. Eigene Import-/Export- und Quadrantenzähler bleiben kumulativ.

Die Runtime liest benachbarte Felder gemeinsam, höchstens 120 Register je Anfrage, ohne undokumentierte Lücken zu überqueren. Jeder Block erhält seinen tatsächlichen Erfassungszeitstempel; kein vorheriger Durchlauf wird als neuer Messwert veröffentlicht. Eine Protokollausnahme kann auf Einzellesen zurückfallen; mehrdeutige RTU-Timeouts und CRC-Fehler nicht.

Die Pulsbreitenzeile in A3.2 nennt zwei Wörter und überlappt das Pulstypregister bei `0x4022`. Das Profil verwendet das einzelne Wort bei `0x4021`, spezifiziert durch FC06-Einstellung in A3.3, und hält Pulstyp separat. Timerwerte verwenden gepackte Dezimalziffern (BCD), passend zu A3.3: `0x0030` ist 30 ms und `0x0025` ist 25 Sekunden. BCD-Decodierung erfolgt vor Skalierung und ganzzahliger Milli-Einheiten-Veröffentlichung.

Dieses Profil erwartet das Standard-Float-Datenformat des Zählers (`0x4026 = 1`). Es hat keine Schreibaktionen und ändert weder Zählerkonfiguration noch Zählerstände. Technische Werte werden explizit auf drei Dezimalstellen gerundet vor strikter ganzzahliger Milli-Einheiten-MQTT-Codierung. Dies entfernt float32-Darstellungsrauschen (beispielsweise wird `232.07000732421875 V` zu `232070 mV`), während eigene Profile ohne `decimalPlaces` exakte Werte behalten. Rundung ist Transportauflösung, keine Aussage zur Zählergenauigkeit.

Ein mehrdeutiger RTU-Timeout oder CRC-Fehler versetzt den Bus in Quarantäne. Fehlgeschlagenes Lesen erholt sich nach Ruhezeit durch validierte Leseprobe; korrigierte serielle Rahmen-, Unit- und Registereinstellungen werden von ihr verwendet. Fehlgeschlagenes Schreiben erholt sich nie selbst. Fehlerhafte oder alte Messwerte werden nicht als aktuell präsentiert.

## Nachweise am Entwicklungsgerät

Am 2026-09-26 antwortete der verbundene Zähler (damals fälschlich als 879-3000 identifiziert) bei Adresse 1 / 9600 / 8N1. FC03-Lesen bestätigte Zählercode `0x1112` (4PS / 879-3020), Baudeinstellung `6`, Paritätseinstellung `2` und Standarddatenformat `1`. Wiederholtes Lesen durch produktiven Node-/Python-Transport lieferte etwa 232–233 V auf L1 und null Strom, Leistung und Energie unter verbundenen Leerlaufbedingungen. Dies prüft Kommunikation und Decodierung auf diesem Aufbau; Last-Leistungs-/Energiegenauigkeit und andere Baugruppen bleiben separate Hardwareabnahme.

Die seriell aktivierte Version wurde dann durch geführte Inbetriebnahme installiert, und alle fünf benannten Kanäle wurden als Konfigurationsrevision 1 veröffentlicht. Nach Korrektur der float32-Präzisionsbehandlung lieferte der finale Build alle fünf Messwerte über MQTT und die Web-Diagnose. Dreiminütige Beobachtung prüfte frische Quellzeitstempel, fortlaufende Sequenzen je Kanal, keine Messfehler und durchgehend online bleibenden Controller. Spannung schwankte etwa 232–235 V; Strom, Leistung und beide Energiezähler blieben im Leerlauf null.

Am 2026-10-03 bestätigte das Kommunikationsmenü des Zählers Adresse 1, 9600 Baud und keine Parität. Konfigurationsrevision 14 verwendet diese tatsächlichen Einstellungen (8N1), 2000 ms Antworttimeout und integriertes Profil `wago-879-3020`. Das temporäre eigene Profil des Runtime-Upgrades wurde entfernt; bestehende I/O- und Messkanalidentitäten blieben erhalten.

Nach verwaltetem Runtime-Update stellte der Wechsel von gerader zu keiner Parität den Quarantäne-Bus ohne CC100-Runtime-Neustart wieder her. Alle fünf Messzeitstempel und Sequenzen liefen weiter, ohne Lesefehler und mit online bleibendem Controller. Die Web-UI zeigte etwa 237 V, 0 A, 0 W, 697 Wh importierte und 0 Wh exportierte Energie. Das Diagnose-Backend löscht Messlesefehler jetzt erst nach neuerer erfolgreicher Erfassung; alte Timeout-Markierungen verbergen daher wiederhergestellte Werte nicht mehr.

Die erweiterte Zuordnung wurde als Revision 15 auf demselben Entwicklungscontroller angewendet. Alle 131 dokumentierten Werte lieferten aktuelle Messwerte ohne Lesefehler, und Quellzeitstempel sowie Sequenz jedes Kanals liefen bei wiederholter Beobachtung weiter. L1/L2/L3 meldeten etwa 235–237 V, Frequenz 50 Hz, Phasenströme und Leistung null und importierte Wirkenergie 697 Wh. Zählercode war `0x1112`, Adresse 1, Baudcode 6, Paritätscode 2 und Standard-Float-Datenformatcode 1. Bestehendes internes I/O und ursprüngliche fünf Messidentitäten blieben erhalten.

Das Timerregister lieferte `0x0030`, passend zum 30-ms-Beispiel des Handbuchs. Das Profil decodiert gepackte Dezimal-Timerziffern explizit vor Skalierung; reine Binärinterpretation würde fälschlich 48 ms anzeigen. Dies prüft Registerdarstellung, nicht elektrisches Timing des physischen S0-Ausgangs.
