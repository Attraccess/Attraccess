# Matter: Inbetriebnahme, Teilen und Entfernen

<!-- llms-description: Ein per IP erreichbares Matter-Gerät in die Attraccess-Fabric aufnehmen, teilen und entfernen: Codes, Schritte, Attestierung, Multi-Admin. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Matter** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Diese Seite behandelt Geräte, die bereits in Ihrem Netzwerk sind (Ethernet oder WLAN). Thread und Bluetooth gehören nicht dazu. Sie baut auf der [Verwaltungsseite](plugins/matter/admin-ui.md), der [Betriebsanleitung](plugins/matter/operator.md) und den [Berechtigungen](plugins/matter/permissions.md) auf.

## Ein Gerät in Betrieb nehmen

Öffnen Sie **Geräte → Matter → Inbetriebnahme**. Der Tab braucht `matter.devices.commission`. Er ist eine eigene Seite mit vier Schritten:

1. **Gerät vorbereiten.** Einschalten, mit dem Netzwerk verbinden und, falls es schon einmal eingerichtet war, in den Kopplungsmodus versetzen.
2. **Code eingeben oder scannen.** Nutzen Sie eine der folgenden Eingabeformen.
3. **Fortschritt.** Jeder Protokollschritt steht mit seinem Live-Zustand in der Liste: Gerät finden, sichere Kopplung (PASE), Gerät auslesen, Attestierung, Attraccess-Fabric hinzufügen, Wiederverbinden (CASE) und Endpunkte auslesen. **Abbrechen** stoppt den Versuch.
4. **Benennen und abschließen.** Vergeben Sie Name und Ort und optional Namen für die Endpunkte. Sie können den Schritt überspringen; das Gerät ist bereits registriert.

Das Gerät wird direkt als **übernommen** durch den Benutzer angelegt, der es in Betrieb genommen hat. Einen eigenen Übernahme-Schritt gibt es nicht. Ein Benutzer mit nur `matter.devices.commission` kann das Gerät in Schritt 4 trotzdem benennen.

### Eingabeformen

Alle Formen führen zur selben Anfrage:

- **Mit der Kamera scannen.** Der Browser dekodiert den QR-Code. Der Kamerazugriff braucht einen sicheren Kontext: HTTPS oder `localhost`. Sonst nutzen Sie eine der anderen Formen.
- **Ein Bild hochladen**, das den QR-Code zeigt. Es wird im Browser dekodiert und nie hochgeladen.
- **Die QR-Nutzdaten einfügen** (`MT:…`).
- **Den manuellen Code tippen**: 11 oder 21 Ziffern. Leerzeichen und Bindestriche werden ignoriert.
- **Einen Freigabecode** eines anderen Ökosystems (siehe [Multi-Admin](#multi-admin)) tragen Sie wie jeden manuellen Code oder jede QR-Nutzlast in dasselbe Feld ein.

Attraccess prüft den Code zuerst im Browser (Prüfziffer des manuellen Codes, Präfix `MT:`). Ein ungültiger Code wird sofort abgelehnt, bevor eine Anfrage entsteht. Der Server prüft ihn erneut.

### Setup-Codes werden nie gespeichert

Setup- und Freigabecodes existieren nur im Arbeitsspeicher. Sie reisen im Body einer Anfrage, nie in einer URL, und werden weder in Datenbank, Audit-Log, Logs, Ereignissen, Browser-Speicher noch Fehlermeldungen abgelegt. Die Seite löscht den Code, wenn die Sitzung endet oder Sie sie verlassen.

### Wenn etwas schiefgeht

Jeder Fehler hat eine eigene Ansicht mit dem nächsten sinnvollen Schritt. Nichts bleibt halb registriert.

| Fehler                                             | Bedeutung                                       | Was zu tun ist                                                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ungültiger Code                                    | Der Code ist fehlerhaft                         | Ziffern prüfen oder erneut scannen                                                                                                                                                                |
| Gerät nicht gefunden                               | Im Netzwerk hat nichts geantwortet              | Gerät ins gleiche Netzwerk bringen, Kopplungsmodus prüfen, erneut versuchen                                                                                                                       |
| Falscher Passcode                                  | Das Gerät hat die Kopplung abgelehnt            | Code prüfen; ein benutzter oder abgelaufener Code braucht einen neuen                                                                                                                             |
| Attestierung fehlgeschlagen                        | Die Echtheit des Geräts ließ sich nicht belegen | Siehe [Attestierung](#attestierung)                                                                                                                                                               |
| Bereits in Betrieb genommen                        | Das Gerät ist schon in der Attraccess-Fabric    | Die Ansicht verlinkt den vorhandenen Datensatz: öffnen, reparieren (getrennt), wiederherstellen (archiviert). Passt keiner, Abgleich ausführen oder das Gerät auf Werkseinstellungen zurücksetzen |
| Fabric voll                                        | Das Gerät kann keine weitere Fabric aufnehmen   | In dessen anderem Controller eine Fabric vom Gerät entfernen                                                                                                                                      |
| Zeitüberschreitung, Wiederverbinden fehlgeschlagen | Das Gerät wurde nicht rechtzeitig fertig        | Neu starten                                                                                                                                                                                       |
| Abgebrochen                                        | Sie haben abgebrochen                           | Neu starten                                                                                                                                                                                       |
| Unterbrochen                                       | Siehe unten                                     | Neu starten                                                                                                                                                                                       |

Es läuft immer nur eine Inbetriebnahme, Entfernung oder Freigabe. Ein zweiter Start antwortet **busy**. Solange die Fabric in `recovery_required` ist (siehe [Backup und Wiederherstellung](plugins/matter/backup-restore.md)), lässt sich nichts in Betrieb nehmen.

### Unterbrechung heißt Neustart

Ein Versuch wird nie fortgesetzt. Startet der Sidecar oder das Plugin neu, bricht das Netzwerk ab oder läuft die Zeit ab, endet er als **unterbrochen** und wird im Audit-Log festgehalten. Das Gerät rollt eine teilweise Einrichtung selbst zurück. Starten Sie neu und geben Sie den Code erneut ein. Wurde das Gerät kurz vor der Unterbrechung noch aufgenommen, erscheint es nach dem nächsten Abgleich im Tab Geräte als **nicht übernommenes** Gerät.

### Wann das Gerät registriert wird

Ein Node entsteht erst, wenn der Sidecar Erfolg meldet **und** das Plugin den Node beim Sidecar gelesen und ihn samt Endpunkten in einer Transaktion geschrieben hat. Gelingt das nicht, endet der Versuch als fehlgeschlagen, und das Gerät erscheint nach dem nächsten Abgleich als nicht übernommenes Gerät, nie als Duplikat.

Jede Inbetriebnahme und jede Entfernung erhöht die Fabric-Generation, daher entsteht kurz darauf automatisch ein [Backup](plugins/matter/backup-restore.md).

## Attestierung

Die Attestierung belegt, dass ein Gerät ein echtes, zertifiziertes Produkt ist. Attraccess ist **strikt**: Jeder Befund auf Fehlerstufe lässt den Versuch scheitern. Dazu zählen ein nicht vertrauenswürdiges Hersteller-Root (PAA), eine fehlerhafte Zertifikatskette, Signatur oder Nonce, ein widerrufenes Gerät, ein Testzertifikat und eine Certification Declaration vom Typ „Test“. Ist der Vertrauensspeicher nicht verfügbar und gibt es kein Seed, scheitert es ebenfalls. Warnungen sind erlaubt und werden nur nach Befundtyp festgehalten.

### Vertrauensspeicher

Der Sidecar bringt einen Schnappschuss der Produktions-Zertifikatswurzeln des CSA Distributed Compliance Ledger (DCL) mit. Damit funktioniert er offline. Ist das DCL erreichbar, aktualisiert der Sidecar die Daten (nur Produktionseinträge, Testzertifikate werden nie akzeptiert) und legt sie in seinem Speicher ab. Mit `MATTER_SIDECAR_DCL_REFRESH=false` schalten Sie die Aktualisierung ab. Widerrufsdaten sind nur so frisch wie die letzte Aktualisierung oder der Seed-Build. Siehe [Betriebsanleitung](plugins/matter/operator.md#vertrauensspeicher-für-die-attestierung).

### Entwicklungs-Override

Entwicklungsgeräte tragen meist Testzertifikate und scheitern an der Attestierung. Dafür kann ein Betreiber am Sidecar `MATTER_SIDECAR_ALLOW_ATTESTATION_OVERRIDE=true` setzen. Standard ist aus, und der Sidecar schreibt beim Start eine Warnung ins Log, wenn es an ist. **Lassen Sie die Variable in Produktion ungesetzt.**

Bei gesetztem Flag bietet die Ansicht „Attestierung fehlgeschlagen“ einen Override an. Er braucht:

- das Flag am Sidecar,
- `matter.devices.commission` **und** `matter.devices.manage`,
- eine ausdrückliche Risikobestätigung für jeden Versuch.

Ein fehlgeschlagener Versuch endet immer. Der Override startet einen **neuen** Versuch mit der Bestätigung, der Code wird also erneut eingegeben (der Browser hält ihn dafür im Speicher). Das Gerät wird dann mit Attestierung **nicht verifiziert** registriert, und die Geräteseite weist auf den Override hin. Der Override wird als gefährliche Aktion mit den Befundtypen auditiert.

## Multi-Admin

Ein Matter-Gerät kann mehreren Fabrics gleichzeitig angehören, zum Beispiel Attraccess und einem Smartphone-Ökosystem.

- **Eingehend.** Um ein Gerät hinzuzufügen, das schon ein anderes Ökosystem (Apple Home, Google Home, SmartThings, Home Assistant, …) steuert, nutzen Sie dessen Funktion „Teilen“ bzw. „In weiterer App hinzufügen“. Sie zeigt einen Freigabecode. Geben Sie ihn wie jeden anderen Code ein; das Gerät muss noch in seinem Freigabefenster sein (wenige Minuten).
- **Ausgehend.** Auf der Geräteseite öffnet **Mit anderem Controller teilen** ein Commissioning-Fenster (3 bis 15 Minuten, Standard 3) und zeigt einen einmaligen manuellen Code und QR-Code mit Countdown. **Fenster schließen** beendet es vorzeitig. Der Code wird einmal angezeigt und weder gespeichert noch geloggt. Braucht `matter.devices.commission`. Das Teilen wird ohne den Code auditiert.
- **Weitere Administratoren.** Die Geräteseite listet die anderen Fabrics des Geräts schreibgeschützt als **Außerhalb von Attraccess verwaltet** (Fabric-Index, Hersteller, Label). Attraccess ordnet nichts, was eine andere Fabric tut, einem Attraccess-Benutzer zu.

## Ein Gerät entfernen

Auf der Geräteseite, mit `matter.devices.commission`:

| Aktion                                                                               | Was passiert                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aus der Fabric entfernen**                                                         | Der Sidecar bittet das erreichbare Gerät, **nur die Attraccess-Fabric** zu entfernen, und vergisst dann den Node. Fabrics anderer Ökosysteme bleiben unberührt. Ist das Gerät nicht erreichbar oder läuft die Zeit ab, ändert sich nichts, und die Seite bietet „Entfernen erzwingen“ an. |
| **Entfernen erzwingen**                                                              | Der Sidecar vergisst den Node, **ohne das Gerät zu kontaktieren**. Das Gerät kann weiterhin Attraccess-Zugangsdaten halten: Setzen Sie es auf Werkseinstellungen zurück oder entfernen Sie es in seinem anderen Controller.                                                               |
| Nur-Datensatz „Entfernen erzwingen“ (Matter-Administration, `matter.devices.manage`) | Setzt nur den Attraccess-Datensatz außer Dienst, für Datensätze, die der Sidecar nicht mehr listet. Siehe [Datenmodell](plugins/matter/data-model.md#aktionen).                                                                                                                           |

Das Entfernen setzt das Gerät nie zurück. Der Node wird `removed` mit dem Grund `removed_from_fabric` oder `forced_from_fabric`, seine Endpunkte werden stillgelegt, und seine Historie (Zustand, Befehle, Audit) bleibt. Ein entfernter Node lässt sich nicht erneut übernehmen. Eine erneute Inbetriebnahme legt einen neuen Datensatz an.
