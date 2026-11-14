# WAGO 879-3020 (4PS) über CC100-RS-485

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Die CC100-Laufzeit unterstützt die nur lesende Messwerterfassung am WAGO 879-3020 (4PS) über ihre
zweidrahtige RS-485-Schnittstelle. Wählen Sie das Geräteprofil **WAGO 879-3020 (4PS) — Modbus RTU**.

## Verbindung

Das [WAGO-Handbuch 4PU/4PS/2PU CT, V1.6](https://www.tme.eu/Document/cb78e7d2f399e5b3e36d23003a167a48/879-3020-en.pdf), Anhang 3,
dokumentiert diese Werkseinstellungen:

| Einstellung          | Wert          |
| -------------------- | ------------- |
| Transport            | Modbus RTU    |
| Serieller CC100-Pfad | `/dev/serial` |
| Slave-/Geräteadresse | `1`           |
| Baudrate             | `9600`        |
| Datenbits            | `8`           |
| Parität              | Even (gerade) |
| Stoppbits            | `1`           |

Die Klemmen 7 und 8 des Messgeräts sind der RS-485-Anschluss. Beachten Sie für die Polarität die Klemmenbeschriftungen
des Messgeräts und des CC100 sowie die Anforderungen des Handbuchs an den Busabschluss.
Verwenden Sie die tatsächlichen Einstellungen des Messgeräts, wenn diese geändert wurden.

## Laufzeit-Release

Installieren Sie ein Release, das das Hardwareprofil
`cc100-751-9301-fw31-digital-rtu-v1` deklariert. Ältere `digital-v1`-Releases behalten ihre
rein digitale Bereitstellung und bieten keinen seriellen Zugriff.

Das Installationsprogramm prüft den root-eigenen Alias `/dev/serial` auf `/dev/ttySTM1`, die
Eigentümerschaft root/dialout und die Berechtigungen `0660` des Zeichengeräts sowie die
RS-485-Boot-Konfiguration der Firmware. Es bildet ausschließlich dieses Gerät, lesend und schreibend, als
`/dev/serial` in den Container ab und fügt der UID 10001 die bereits vorhandene dialout-GID des Hosts hinzu. Die Laufzeit
bleibt unprivilegiert, verwirft alle Capabilities und nutzt die vorhandenen überwachten
Startprüfungen. Die seriellen Prüfungen laufen vor überwachten Starts erneut.

Auf dem FW31-Entwicklungsgerät meldet die STM32-UART aktiviertes RS-485 mit Richtungssteuerung durch den Kernel
und 1 ms Verzögerung vor und nach dem Senden. Der Transport nutzt die
Richtungssteuerung der Firmware; er schaltet keine GPIOs und benötigt keinen privilegierten Modus.

## Messwerte konfigurieren

1. Öffnen Sie die Seite **Konfigurieren** des Controllers, dann **Externe Geräte**.
2. Fügen Sie eine RTU-Verbindung mit den oben genannten Einstellungen hinzu. Beginnen Sie mit 2000 ms Antwort-Timeout
   und einer gemeinsamen Verbindung für den RS-485-Bus.
3. Fügen Sie das Messgerät mit Geräteadresse 1 und dem Profil **WAGO 879-3020 (4PS) — Modbus RTU** hinzu.
4. Fügen Sie Messwertkanäle hinzu, die an die benötigten Signale gebunden sind. Auf der Seite **Ein- & Ausgänge**
   erzeugt **Modbus-Gerät hinzufügen** alle Kanäle auf einmal, mit aktivierten empfohlenen Messwerten (siehe
   [Standard-Messwerte](#standard-messwerte-und-weitere-aktivieren)).
5. Speichern, prüfen und veröffentlichen Sie. Warten Sie, bis die Revision angewendet wurde, und prüfen Sie dann
   die frischen Messwerte unter **Diagnose**.

Das Profil stellt alle 131 dokumentierten, nicht reservierten FC03-Werte aus Anhang
A3.2, Seiten 34–38, bereit. Die Frontplatte des Controllers gruppiert sie in aufklappbare Bereiche:

- Elektrische Messwerte: Spannung, Strom, Wirk-/Blind-/Scheinleistung und
  Leistungsfaktor für L1, L2 und L3, Summen, Frequenz und verkettete Spannungen.
- Wirk- und Blindenergie: Summen-, Bezugs- und Lieferzähler, alle vier Tarife, Phasenzähler
  und rücksetzbare Tageszähler.
- Quadrantenenergie: Q1–Q4-Summen und ihre Tarifzähler.
- Geräteinformationen: Serien-/Typcodes, Firmware-/Hardware-/Protokollversionen,
  Kommunikationseinstellungen, Phasenrichtungen/Quadranten, Prüfsummen, Statuswörter,
  Tarif, S0-Einstellungen und Anzeigeeinstellungen.

Jeder Wert ist ein benannter Messwertkanal, der der Diagnose und Flows zur Verfügung steht.
Bestehende Fünf-Kanal-Konfigurationen behalten ihre Identitäten und Umrechnungen;
erneutes Speichern des Geräts fügt die fehlenden Kanäle hinzu; welche das sind und ob sie aktiviert sind, hängt von
der CC100-Laufzeit ab (siehe die Regeln unten). Das Profil hat keine Schreibaktionen.
Reservierte Adressen werden nie angefragt. Modellspezifische Register, die eine
gültige Modbus-Ausnahme zurückgeben, werden isoliert, sodass verfügbare Messwerte weiterhin veröffentlicht werden.

## Standard-Messwerte und weitere aktivieren

Ein auf der Seite **Ein- & Ausgänge** hinzugefügtes Messgerät erhält einen Punkt und einen Kanal für alle 131 Werte, aber
nur diese 11 Messwerte sind aktiviert:

| Messwert                        | Messwert-ID                              | Adresse            |
| ------------------------------- | ---------------------------------------- | ------------------ |
| Spannung L1, L2, L3             | `voltage-l1`, `voltage-l2`, `voltage-l3` | `0x5002`–`0x5007`  |
| Frequenz                        | `frequency`                              | `0x5008`           |
| Strom (gesamt) und L1, L2, L3   | `current`, `current-l1`–`current-l3`     | `0x500a`–`0x5011`  |
| Wirkleistung (gesamt)           | `active-power`                           | `0x5012`           |
| Bezogene und gelieferte Energie | `import-energy`, `export-energy`         | `0x600c`, `0x6018` |

Die übrigen 120 Kanäle werden mit `enabled: false` gespeichert. Der Controller fragt einen deaktivierten Kanal nicht ab,
veröffentlicht ihn nicht und steuert ihn nicht, und er zählt ihn nicht auf die Grenze von 256 aktivierten Kanälen. Ein
deaktivierter Kanal behält seine ID, seinen Namen und seine Kalibrierung, sodass das spätere Aktivieren keine Flows
verändert, die auf andere Kanäle verweisen. Die empfohlene Auswahl liegt im Plugin
(`WAGO_879_3020_DEFAULT_ENABLED` in `modbus/wago-879-3020.ts`), nicht im Profil, daher bleiben die integrierte
Profilversion und eigene Kopien davon unverändert.

Um Messwerte auszuwählen, öffnen Sie die Einstellungen des Messgeräts (Zahnradsymbol auf seiner Karte). Jedes Register hat einen
Schalter, nach Bereich gruppiert. **Bereich aktivieren** und **Bereich deaktivieren** schalten einen ganzen Bereich um;
**Nur empfohlene Messwerte** stellt die 11 Messwerte oben wieder her. Ein Messgerät mit einer eigenen Kopie der
Zuordnung hat stattdessen **Alle ungenutzten Messwerte deaktivieren**: Das deaktiviert jeden Messwert, den keine Freigabebedingung, keine
Rückmeldung und kein Flow verwendet. Ein Messwert, den eine Freigabebedingung oder eine Rückmeldung verwendet, kann nicht
ausgeschaltet werden; das Seitenpanel nennt den Ausgang, der ihn verwendet, und die Bereichs- und Sammelaktionen
überspringen ihn. Das Seitenpanel zeigt, wie viele Kanäle der gesamte Controller aktiviert hätte, zum Beispiel
„21 von 256 Kanälen auf diesem Controller aktiviert“. Speichern Sie, dann wenden Sie an. Eine Karte zeigt
**Deaktiviert** für einen Messwert, dessen Kanal deaktiviert ist, und **Nicht konfiguriert** für ein
Register, das keinen Kanal hat.

Regeln:

- Bestehende Konfigurationen werden nicht automatisch geändert. Ein Messgerät, das mit allen 131
  aktivierten Messwerten veröffentlicht wurde, bleibt so, bis Sie **Nur empfohlene Messwerte** drücken (oder
  Messwerte umschalten) und anwenden.
- Erneutes Speichern eines bestehenden Messgeräts fügt seine fehlenden Register hinzu. Bei einer Laufzeit, die
  `channel-enabled-v1` meldet, werden sie als deaktivierte Kanäle hinzugefügt. Bei einer älteren Laufzeit werden nur die fehlenden
  empfohlenen Messwerte hinzugefügt, und zwar aktiviert; bei einem Messgerät, das nur die ursprünglichen fünf
  Kanäle hat, sind das die sechs anderen empfohlenen Messwerte, und die übrigen 120 Register erhalten gar
  keinen Kanal.
- Nur Modbus-Messwertkanäle ohne Aktion können deaktiviert werden. Eine Freigabebedingung oder eine Rückmeldung kann
  keinen deaktivierten Kanal verwenden.
- Das Deaktivieren eines Kanals, den Flows lesen, wird vor dem Anwenden als Flow-Auswirkung aufgeführt: Diese Flows sehen den
  Messwert als nicht verfügbar.
- Deaktivierte Kanäle erfordern eine CC100-Laufzeit, die `channel-enabled-v1` meldet. Bei einer älteren Laufzeit
  lehnt der Server das Veröffentlichen einer Konfiguration ab, die Kanäle deaktiviert, ein neues Messgerät erhält nur die 11
  empfohlenen Kanäle (keine deaktivierten), und die Schalter sind gesperrt, mit einem Hinweis, die
  CC100-Laufzeit zu aktualisieren. Ein Gerät, das auf einer solchen Laufzeit 256 Kanäle überschreiten würde, kann nicht gespeichert werden; aktualisieren Sie die
  Laufzeit, oder entfernen Sie Register oder Geräte. Solange der Controller-Status nicht geladen ist, weiß die Seite nicht,
  welche Laufzeit installiert ist: Sie zeigt an, dass sie prüft, und bietet **Modbus-Gerät hinzufügen**
  nicht an.
- Ein Downgrade wird nicht unterstützt, solange Kanäle deaktiviert sind. Eine Server- oder Laufzeitversion ohne
  `enabled`-Unterstützung lehnt eine gespeicherte Konfiguration mit `enabled: false` ab („persisted
  configuration is invalid“). Veröffentlichen Sie vor einem Downgrade eine Revision mit allen aktivierten Kanälen, zum
  Beispiel durch ein Rollback auf eine Revision von vor der Deaktivierung von Messwerten. Dieses Verfahren wurde
  nicht auf Hardware getestet.

## Buszeit für zehn Messgeräte

Die folgenden Zahlen sind aus den Modbus-RTU-Rahmengrößen **berechnet**. Sie sind nicht auf
Hardware gemessen: Die Antwortverzögerung des Messgeräts ist im Handbuch nicht angegeben und wurde nicht gemessen,
und weder die RS-485-Lasteinheiten (Unit Loads) von zehn Messgeräten an einem CC100-Segment noch der unterstützte Baudratenbereich des CC100
wurde verifiziert.

Annahmen: 9600 Baud mit der werkseitigen 8E1-Rahmung (11 Bit pro Byte, etwa 1,15 ms pro Byte), ein
Ruheintervall von 3,5 Zeichen (etwa 4 ms) vor jedem Rahmen, FC03-Anfragen von 8 Byte und Antworten
von 5 Byte plus 2 Byte pro Register. Wie es die Laufzeit heute tut, werden nur benachbarte aktivierte Register
zu einer Anfrage zusammengefasst (bis zu 120 Register); ein deaktiviertes Register zwischen zwei aktivierten teilt
die Anfrage.

| Pro Messgerät           | Anfragen | Register | Bytes auf der Leitung | Leitungszeit inkl. Ruheintervallen |
| ----------------------- | -------- | -------- | --------------------- | ---------------------------------- |
| 11 empfohlene Messwerte | 3        | 22       | 83                    | etwa 0,12 s                        |
| Alle 131 Messwerte      | 7        | 240      | 571                   | etwa 0,71 s                        |

Jede Anfrage wartet außerdem auf die Antwort des Messgeräts. Bei einer angenommenen Antwortverzögerung von 25 ms pro Anfrage braucht ein
Messgerät etwa 0,2 s mit den empfohlenen Messwerten und etwa 0,9 s mit der vollständigen Zuordnung. Zehn Messgeräte an
einem Bus benötigen daher etwa 2 s Leitungs- und Antwortzeit pro Abfragerunde mit den empfohlenen
Messwerten und etwa 9 s mit allen aktivierten Messwerten.

Diese Zahlen umfassen nur die Leitungszeit und die angenommene Antwortverzögerung. Der größte Kostenfaktor ist darin nicht enthalten und
wurde nicht gemessen: Die Laufzeit startet für jede RTU-Anfrage einen Python-Prozess und öffnet die serielle Schnittstelle
(`cc100-runtime/src/modbus/transport/serial.ts`). Mit den empfohlenen Messwerten sind das 3 Prozessstarts
pro Messgerät, also 30 pro Abfragerunde bei zehn Messgeräten. Auf dem CC100 kann eine Runde dadurch auch mit den empfohlenen Messwerten länger dauern als das
Standard-Abfrageintervall von 5 s; wenn Messwerte verspätet eintreffen oder sich Runden überlappen,
erhöhen Sie das Abfrageintervall. Die Zeile mit der vollständigen Zuordnung ist der günstigste Fall: Wenn eine zusammengefasste Anfrage eine Modbus-
Ausnahme zurückgibt, liest die Laufzeit diesen Block erneut, Register für Register
(`cc100-runtime/src/modbus/routing/adapter.ts`), was pro
Register eine Anfrage und einen Prozessstart zusätzlich bedeutet. Aktivieren Sie nur die Messwerte, die Sie verwenden, bevor Sie die vollständige Zuordnung auf vielen Messgeräten aktivieren. Die Grenze für aktivierte Kanäle (256, integrierte E/A-Kanäle eingeschlossen) erlaubt zehn Messgeräte mit je bis zu 25
Messwerten, wenn keine integrierte E/A konfiguriert ist.

Registeradressen sind nullbasierte hexadezimale Leitungsadressen. Elektrische und
Energiegrößen verwenden IEEE-754-float32 in der Bytereihenfolge ABCD. kW, kvar, kVA, kWh und
kvarh werden in W, var, VA, Wh bzw. varh umgerechnet. Frequenz, Verhältnisse,
Metadaten und S0-Einstellungen tragen ihre eigenen Einheiten; Codes haben lesbare Bezeichnungen oder
Hex-Formatierung. Summen-/Nettoenergie und rücksetzbare Tageszähler verwenden Live-Messwerte, sodass eine
legitime Abnahme oder ein Zurücksetzen erhalten bleibt und nicht als Zählerfehler behandelt wird.
Dedizierte Bezugs-/Liefer- und Quadrantenzähler bleiben kumulativ.

Die Laufzeit liest benachbarte Felder gemeinsam, bis zu 120 Register pro Anfrage,
ohne undokumentierte Lücken zu überbrücken. Jeder Block erhält seinen tatsächlichen Erfassungszeitstempel;
kein früherer Durchlauf wird als neuer Messwert erneut veröffentlicht. Eine Protokollausnahme
kann auf Einzellesevorgänge zurückfallen; mehrdeutige RTU-Timeouts und CRC-Fehler tun das nicht.

Die Impulsbreiten-Zeile in A3.2 listet zwei Wörter, die das Impulstyp-Register
bei `0x4022` überlappen. Das Profil verwendet das einzelne Wort bei `0x4021`, das durch die FC06-
Einstellung in A3.3 festgelegt ist, und hält den Impulstyp getrennt. Timer-Werte verwenden gepackte Dezimalziffern (BCD),
übereinstimmend mit A3.3: `0x0030` sind 30 ms und `0x0025` sind 25 Sekunden.
Die BCD-Dekodierung geht der Skalierung und der Veröffentlichung als ganzzahlige Milli-Einheiten voraus.

Dieses Profil erwartet das Standard-Float-Datenformat des Messgeräts (`0x4026 = 1`).
Es hat keine Schreibaktionen und ändert weder die Konfiguration noch die Zähler des Messgeräts.
Technische Werte werden vor der
strikten MQTT-Kodierung als ganzzahlige Milli-Einheiten ausdrücklich auf drei Dezimalstellen gerundet. Das entfernt float32-Darstellungs-
rauschen (zum Beispiel wird `232.07000732421875 V` zu `232070 mV`), während eigene Profile, die `decimalPlaces` weglassen, exakte Werte behalten.
Das Runden ist eine Transportauflösung, keine Aussage über die Genauigkeit des Messgeräts.

Ein mehrdeutiger RTU-Timeout oder CRC-Fehler stellt den Bus unter Quarantäne. Fehlgeschlagene Lesevorgänge
erholen sich nach einer Ruhephase durch eine validierte Lesesonde; korrigierte serielle
Rahmung, Geräteadresse und Registereinstellungen werden von der Sonde verwendet. Fehlgeschlagene Schreibvorgänge erholen sich nie
selbst. Fehlerhafte oder alte Messwerte werden nicht als aktuelle Messwerte dargestellt.

## Nachweise vom Entwicklungsgerät

Am 2026-09-26 antwortete das angeschlossene Messgerät (damals fälschlich als 879-3000 identifiziert) unter Adresse 1 / 9600 / 8N1. FC03-
Lesevorgänge bestätigten den Messgerätecode `0x1112` (4PS / 879-3020), die Baudrateneinstellung `6`, die Paritätseinstellung `2` und
das Standard-Datenformat `1`. Wiederholte Lesevorgänge über den produktiven Node/Python-
Transport lieferten unter den angeschlossenen Leerlaufbedingungen etwa 232–233 V auf L1 und null Strom, Leistung und
Energie. Das verifiziert Kommunikation und
Dekodierung in diesem Aufbau; die Genauigkeit von Leistung/Energie unter Last und andere Baugruppen bleiben
getrennte Hardware-Abnahmearbeit.

Das Release mit seriellem Zugriff wurde anschließend über die geführte Inbetriebnahme installiert, und
alle fünf benannten Kanäle wurden als Konfigurationsrevision 1 veröffentlicht. Nach der Behebung der
float32-Präzisionsbehandlung lieferte der finale Build alle fünf Messwerte über
MQTT und die Web-Diagnoseansicht. Eine dreiminütige Beobachtung bestätigte frische
Quellzeitstempel, fortschreitende Sequenzen für jeden Kanal, keine Messwertfehler
und einen durchgehend online befindlichen Controller. Die Spannung variierte etwa zwischen 232 und 235 V;
Strom, Leistung und beide Energiezähler blieben im Leerlaufaufbau null.

Am 2026-10-03 bestätigte das Kommunikationsmenü des Messgeräts Adresse 1, 9600 Baud
und keine Parität. Konfigurationsrevision 14 verwendet diese tatsächlichen Einstellungen (8N1), ein
Antwort-Timeout von 2000 ms und das integrierte Profil `wago-879-3020`. Das temporäre
eigene Profil, das während des Laufzeit-Upgrades verwendet wurde, wurde entfernt; die bestehenden Identitäten der E/A- und
Messwertkanäle blieben erhalten.

Nach dem verwalteten Laufzeit-Update stellte die Änderung der Parität von even auf none den
unter Quarantäne gestellten Bus wieder her, ohne die CC100-Laufzeit neu zu starten. Alle fünf Messwert-
Zeitstempel und Sequenzen schritten voran, ohne Lesefehler und mit einem online befindlichen Controller.
Die Weboberfläche zeigte etwa 237 V, 0 A, 0 W, 697 Wh bezogene Energie
und 0 Wh gelieferte Energie. Das Diagnose-Backend löscht einen Messwert-Lesefehler jetzt
erst nach einer neueren erfolgreichen Erfassung, sodass alte Timeout-Flags wiederhergestellte Messwerte nicht
mehr verdecken.

Die erweiterte Zuordnung wurde auf demselben Entwicklungs-Controller als Revision 15 angewendet.
Alle 131 dokumentierten Werte lieferten aktuelle Messwerte ohne Lesefehler, und Quellzeitstempel und Sequenz jedes
Kanals schritten über wiederholte Beobachtungen voran.
L1/L2/L3 meldeten etwa 235–237 V, Frequenz 50 Hz, Phasenströme und
Leistung null und bezogene Wirkenergie 697 Wh. Der Messgerätecode war `0x1112`, Adresse
1, Baudratencode 6, Paritätscode 2 und Standard-Float-Datenformatcode 1. Die bestehende
integrierte E/A und die ursprünglichen fünf Messwert-Identitäten blieben erhalten.

Das Timer-Register lieferte `0x0030`, passend zum 30-ms-Beispiel des Handbuchs.
Das Profil dekodiert gepackte Dezimal-Timerziffern ausdrücklich vor der Skalierung;
eine einfache Binärinterpretation würde fälschlich 48 ms anzeigen. Das verifiziert die
Registerdarstellung, nicht das elektrische Timing des physischen S0-Ausgangs.
