# WAGO-Zugangsdaten-Rotation

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Die authentifizierte Administrationsoperation ändert das Broker-Passwort des Controllers,
speichert eine verschlüsselte Wiederherstellungskopie, übergibt sie an den laufenden Controller und wartet
bis zu 30 Sekunden darauf, dass sich der Controller mit den gespeicherten Zugangsdaten wieder verbindet.
Nur diese Bestätigung der Wiederverbindung schließt `wago.credential_rotation` ab. Die API
liefert eine Rotationsrevision und einen Zustand zurück, niemals das Passwort oder das Wiederherstellungs-Token.

Die Operation setzt die Laufzeitfähigkeit `credential-rotation-v1` voraus. Die Topic-Richtlinie des Brokers
muss dem Controller erlauben, `<namespace>/v1/controllers/<hardwareId>/credentials/rotate` zu abonnieren und unter seinem
eigenen Controller-Namespace zu veröffentlichen. Die erstmalige Bereitstellung der Zugangsdaten muss dieses
Abonnement enthalten. Wird dieses optionale Abonnement bei einem Upgrade einer bestehenden Laufzeit verweigert, laufen
gewöhnliche Telemetrie und Befehlsstart weiter; die Laufzeit hält ihre Rotationsfähigkeit zurück und versucht das Abonnement
bei der Wiederverbindung erneut. Aktualisieren Sie die Broker-ACL und verbinden Sie neu, bevor Sie rotieren. Die Rotationsanfrage wird nie gehalten (retained); die Abschlussbestätigung
wird gehalten und enthält nur ihre Registrierungsepoche, Revision, das Korrelations-Token und den Status
`reconnected`. Ältere Laufzeiten scheitern bei der Zulassung, bevor das Broker-Passwort geändert wird.

Die Laufzeit speichert die neuen Zugangsdaten und die Rotationsrevision, bevor sie
ihren bestehenden MQTT-Client neu verbindet. So bleibt die Ausgangsverwaltung auf derselben Laufzeitinstanz.
Sie bestätigt erst, wenn die MQTT-Authentifizierung mit Zugangsdaten gelingt, die dem
gespeicherten Zustand entsprechen. Ein Neustart veröffentlicht diese Bestätigung erneut; niedrigere Revisionen und
abweichende Tokens für eine bereits akzeptierte Revision werden abgelehnt. Jede Übergabe läuft
innerhalb von 30 Sekunden ab, und der Ablauf wird beim eingereihten Speichern der Zugangsdaten erneut geprüft.
Wiederholungen erhalten eine neue Übergabefrist, wobei Passwort und Token erhalten bleiben.

Jede beanspruchte Registrierung hat eine UUID `credentialEpoch`, die vor der Übergabe des Claims gespeichert und
in Rotationsanfragen und Bestätigungen zurückgegeben wird. Eine neue Enrollment-Epoche setzt die Rotationsrevision der Laufzeit zurück; abweichende Epochen können sie nicht rotieren.
Ältere beanspruchte Registrierungen ohne Epoche müssen zuerst sicher neu registriert werden.
Ein Claim mit derselben Epoche kann bereits rotierte Zugangsdaten nicht durch ein altes Passwort ersetzen.
Besitzer manueller Claims können zusätzlich `claim-expiry-v1` nutzen: `expiresAt` muss ein
kanonischer ISO-Zeitstempel in der Zukunft sein, höchstens 60 Sekunden entfernt.

## Wiederherstellung

Ein Timeout, eine verlorene Antwort oder eine unterbrochene Übergabe hinterlässt einen verschlüsselten ausstehenden Zustand.
Eine ausdrückliche Wiederholung verwendet das gespeicherte Passwort und Token; sie ruft die Rotationsoperation
des Brokers nicht erneut auf. Broker-Implementierungen, die bestehende Clients bei einer Passwortänderung
sofort trennen, können die Übergabe verhindern. Sie erfordern eine ausdrückliche
Wiederherstellung des Controllers statt der Behauptung einer erfolgreichen Rotation.

Eine Unterbrechung zwischen der Änderung am Broker und dem Speichern der zurückgegebenen Zugangsdaten
hinterlässt einen Wiederherstellungsdatensatz `provisioning`. Das Ergebnis am Broker ist ungewiss, und eine automatische
erneute Rotation wird abgelehnt. Das ausdrückliche Entfernen des Controllers kann diesen Zustand beheben: Validieren Sie den ursprünglichen Broker, widerrufen Sie seine
Zugangsdaten mit dem vorhandenen Entfernen-Ablauf und löschen Sie dann seine Registrierung.
Die Wiederherstellungszeile wird durch die Foreign-Key-Kaskade des Controllers gelöscht. Manuelle Broker-Anweisungen
allein zählen nie als abgeschlossener Widerruf oder abgeschlossene Rotation.

Die Operationen verwenden die prozessinterne Controller-Warteschlange. Übergeben Sie deren Abbruchsignal und Frist an den Rotationsdienst.
Rufen Sie `assertRemovalBroker` auf, bevor das Entfernen Zugangsdaten widerruft. Registrieren Sie `WagoCredentialRotationEntity`,
`WagoCredentialRotationService` und `WagoCredentialRotation1780010610000` im
Plugin. Der HTTP-Eigentümer muss sich mit `system.settings.manage` authentifizieren, den
Principal aus der authentifizierten Anfrage ableiten und eine ausdrückliche Rotations- bzw. Wiederholungsabsicht verlangen.

Abgeschlossene Zeilen behalten die monoton steigende Revision. Ein Downgrade weigert sich, die
Rotationshistorie zu löschen, solange die Registrierung des Controllers besteht. Wiederherstellungs-Zugangsdaten
nutzen die vorhandene Schnittstelle des Hosts für verschlüsselte Geheimnisse; Audit-Ereignisse enthalten nie
Zugangsdaten, Broker-Payloads oder manuelle Anweisungen.

Die Abnahme mit Software-Fixtures qualifiziert weder einen physischen Controller noch ein Broker-Deployment
oder ein unterstütztes Hardware-Release.
