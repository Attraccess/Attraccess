# Matter: Inbetriebnahme, Teilen und Entfernen

<!-- llms-description: Ein per IP erreichbares Matter-Gerät in die Attraccess-Fabric aufnehmen, teilen und entfernen: Codes, Schritte, Attestierung, Multi-Admin. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Matter** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Diese Seite behandelt Geräte, die bereits in Ihrem Netzwerk sind (Ethernet oder WLAN). Thread und Bluetooth gehören nicht dazu. Sie baut auf der [Verwaltungsseite](plugins/matter/admin-ui.md), der [Betriebsanleitung](plugins/matter/operator.md) und den [Berechtigungen](plugins/matter/permissions.md) auf.

## Ein Gerät in Betrieb nehmen

Öffnen Sie **Geräte → Matter → Inbetriebnahme**. Der Tab braucht `matter.devices.commission`. Er ist eine eigene Seite mit vier Schritten:

1. **Gerät vorbereiten.** Einschalten, mit dem Netzwerk verbinden und, falls es schon einmal eingerichtet war, in den Kopplungsmodus versetzen oder bei seinem anderen Controller einen Freigabecode holen.
2. **Code eingeben oder scannen.** Nutzen Sie eine der folgenden Eingabeformen und dann **Inbetriebnahme starten**.
3. **Fortschritt.** Jeder Protokollschritt steht mit seinem Live-Zustand in der Liste: **Gerät finden**, **Sichere Kopplung mit dem Einrichtungscode** (PASE), **Gerät auslesen**, **Gerätezertifikat prüfen** (Attestierung), **Gerät zur Attraccess-Fabric hinzufügen**, **Sicher verbinden** (CASE) und **Endpunkte des Geräts auslesen**. **Abbrechen** stoppt den Versuch nach einer Rückfrage.
4. **Benennen und abschließen.** Vergeben Sie Name und Ort und optional Namen für die Endpunkte, dann **Speichern und abschließen**. Auch **Benennen überspringen** ist möglich; das Gerät ist bereits registriert.

Das Gerät wird direkt als **übernommen** durch den Benutzer angelegt, der es in Betrieb genommen hat. Einen eigenen Übernahme-Schritt gibt es nicht. Ein Benutzer mit nur `matter.devices.commission` kann das Gerät in Schritt 4 trotzdem benennen.

### Eingabeformen

Der Code-Schritt bietet drei Reiter. Alle führen zur selben Anfrage:

- **Mit Kamera scannen.** Der Browser dekodiert den QR-Code. Browser erlauben die Kamera nur in einem sicheren Kontext, also über HTTPS oder auf `localhost`. Über reines HTTP meldet der Reiter, dass die Kamera nicht verfügbar ist; nutzen Sie dann einen der anderen Reiter.
- **Bild hochladen.** Wählen Sie ein Bild des QR-Codes. Es wird im Browser dekodiert und nie hochgeladen.
- **Eingeben oder einfügen.** Fügen Sie die QR-Nutzdaten (`MT:…`) ein oder tippen Sie den manuellen Code: 11 oder 21 Ziffern. Leerzeichen und Bindestriche werden ignoriert.

Einen **Freigabecode** eines anderen Ökosystems (siehe [Multi-Admin](#multi-admin)) geben Sie genauso ein wie einen Einrichtungscode: gescannt, als Bild hochgeladen oder getippt.

Attraccess prüft den Code zuerst im Browser (Prüfziffer des manuellen Codes, Präfix `MT:`). Ein ungültiger Code wird sofort abgelehnt, bevor eine Anfrage entsteht. Der Server prüft ihn erneut.

### Setup-Codes werden nie gespeichert

Setup- und Freigabecodes existieren nur im Arbeitsspeicher. Sie reisen im Body einer Anfrage, nie in einer URL, und werden weder in Datenbank, Audit-Log, Logs, Ereignissen, Browser-Speicher noch Fehlermeldungen abgelegt. Die Seite löscht den Code, wenn die Sitzung endet oder Sie sie verlassen.

### Wenn etwas schiefgeht

Jeder Fehler hat eine eigene Ansicht mit dem nächsten sinnvollen Schritt. Nichts bleibt halb registriert. Die Ansichten bieten **Neu starten**, das zum Code-Schritt zurückführt, und wo es hilft eine Schaltfläche zum Gerät oder zu **Geräte**.

| Fehlercode             | Ansicht                                                     | Bedeutung                                                                                      | Was zu tun ist                                                                                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_code`         | Der Einrichtungscode ist ungültig                           | Der Sidecar konnte den Code nicht lesen                                                        | Code prüfen und erneut eingeben                                                                                                                                                                                                                                       |
| `device_not_found`     | Das Gerät wurde nicht gefunden                              | Im Netzwerk hat nichts geantwortet                                                             | Gerät ins gleiche Netzwerk wie den Sidecar bringen, prüfen, ob sein Kopplungsfenster offen ist, neu starten                                                                                                                                                           |
| `pase_failed`          | Der Code wurde nicht akzeptiert                             | Das Gerät hat den Passcode abgelehnt                                                           | Code auf Tippfehler prüfen oder am Gerät ein neues Kopplungsfenster öffnen; ein benutzter oder abgelaufener Freigabecode braucht einen neuen                                                                                                                          |
| `attestation_failed`   | Das Gerät konnte nicht verifiziert werden                   | Die Echtheit des Geräts ließ sich nicht belegen; die Ansicht nennt die Befundtypen             | Siehe [Attestierung](#attestierung). Am Gerät wurde nichts geändert                                                                                                                                                                                                   |
| `already_commissioned` | Dieses Gerät ist schon in der Attraccess-Fabric             | Das Gerät trägt die Attraccess-Fabric bereits. Es entsteht kein neuer Datensatz                | Die Ansicht verlinkt den vorhandenen Datensatz: öffnen, zum Reparieren öffnen (getrennt) oder zum Wiederherstellen öffnen (archiviert). Passt keiner, unter **Geräte** einen Abgleich ausführen oder das Gerät auf Werkseinstellungen zurücksetzen und neu hinzufügen |
| `fabric_full`          | Das Gerät hat keinen Platz für einen weiteren Administrator | Das Gerät kann keine weitere Fabric aufnehmen                                                  | Das Gerät bei einem seiner anderen Controller entfernen oder auf Werkseinstellungen zurücksetzen und neu starten                                                                                                                                                      |
| `case_failed`          | Die sichere Verbindung ist fehlgeschlagen                   | Das Gerät ist beigetreten, aber das sichere Wiederverbinden (CASE) ließ sich nicht abschließen | Prüfen, ob das Gerät im Netzwerk ist, und neu starten                                                                                                                                                                                                                 |
| `timeout`              | Die Inbetriebnahme hat zu lange gedauert                    | Das Gerät wurde nicht rechtzeitig fertig                                                       | Neu starten                                                                                                                                                                                                                                                           |
| `cancelled`            | Die Inbetriebnahme wurde abgebrochen                        | Sie haben abgebrochen                                                                          | Neu starten                                                                                                                                                                                                                                                           |
| `interrupted`          | Die Inbetriebnahme wurde unterbrochen                       | Sidecar oder Plugin wurden neu gestartet, oder die Verbindung ist abgebrochen (siehe unten)    | Mit dem Code neu starten. War das Gerät schon beigetreten, unter **Geräte** nachsehen: Dort erscheint es als nicht übernommenes Gerät                                                                                                                                 |
| `internal`             | Inbetriebnahme fehlgeschlagen                               | Ein unerwarteter Fehler hat den Versuch gestoppt                                               | Neu starten                                                                                                                                                                                                                                                           |
| `needs_reconciliation` | Das Gerät ist beigetreten, aber noch nicht eingetragen      | Das Gerät ist in der Fabric, aber Attraccess konnte es nicht erfassen                          | **Geräte** öffnen: Nach dem nächsten Abgleich erscheint das Gerät dort als nicht übernommenes Gerät                                                                                                                                                                   |
| `registry_failed`      | Das Gerät ist beigetreten, konnte aber nicht erfasst werden | Das Gerät ist in der Fabric, aber Attraccess konnte es nicht speichern                         | **Geräte** öffnen: Nach dem nächsten Abgleich erscheint das Gerät dort als nicht übernommenes Gerät                                                                                                                                                                   |

Es läuft immer nur eine Inbetriebnahme, Entfernung oder Freigabe. Ein zweiter Start antwortet **busy**, ebenso ein Backup, eine Wiederherstellung oder das Anlegen der Fabric, solange einer dieser Vorgänge läuft. Solange die Fabric in `recovery_required` ist (siehe [Backup und Wiederherstellung](plugins/matter/backup-restore.md)), lässt sich nichts in Betrieb nehmen.

### Unterbrechung heißt Neustart

Ein Versuch wird nie fortgesetzt. Startet der Sidecar oder das Plugin neu, bricht das Netzwerk ab oder läuft die Zeit ab, endet er als **unterbrochen** und wird im Audit-Log festgehalten. Das Gerät rollt eine teilweise Einrichtung selbst zurück. Wählen Sie **Neu starten** und geben Sie den Code erneut ein. Wurde das Gerät kurz vor der Unterbrechung noch aufgenommen, sehen Sie zuerst unter **Geräte** nach: Nach dem nächsten Abgleich erscheint es dort als **nicht übernommenes** Gerät.

### Wann das Gerät registriert wird

Ein Node entsteht erst, wenn der Sidecar Erfolg meldet **und** das Plugin den Node beim Sidecar gelesen und ihn samt Endpunkten in einer Transaktion geschrieben hat. Gelingt das nicht, endet der Versuch als fehlgeschlagen, und das Gerät erscheint nach dem nächsten Abgleich als nicht übernommenes Gerät, nie als Duplikat.

Jede Inbetriebnahme und jede Entfernung erhöht die Fabric-Generation, daher entsteht kurz darauf automatisch ein [Backup](plugins/matter/backup-restore.md).

## Attestierung

Die Attestierung belegt, dass ein Gerät ein echtes, zertifiziertes Produkt ist. Attraccess ist **strikt**: Jeder Befund auf Fehlerstufe lässt den Versuch scheitern. Dazu zählen ein nicht vertrauenswürdiges Hersteller-Root (PAA), eine fehlerhafte Zertifikatskette, Signatur oder Nonce, ein widerrufenes Gerät, ein Testzertifikat und eine Certification Declaration vom Typ „Test“. Ist der Vertrauensspeicher nicht verfügbar und gibt es kein Seed, scheitert es ebenfalls. Warnungen sind erlaubt und werden nur nach Befundtyp festgehalten.

### Vertrauensspeicher

Der Sidecar bringt einen Schnappschuss der Produktions-Zertifikatswurzeln des CSA Distributed Compliance Ledger (DCL) mit. Damit funktioniert er offline. Ist das DCL erreichbar, aktualisiert der Sidecar die Daten (nur Produktionseinträge, Testzertifikate werden nie akzeptiert) und legt sie in seinem Speicher ab. Mit `MATTER_SIDECAR_DCL_REFRESH=false` schalten Sie die Aktualisierung ab. Widerrufsdaten sind nur so frisch wie die letzte Aktualisierung oder der Seed-Build. Siehe [Betriebsanleitung](plugins/matter/operator.md#vertrauensspeicher-für-die-attestierung).

### Entwicklungs-Override

Entwicklungsgeräte tragen meist Testzertifikate und scheitern an der Attestierung. Dafür kann ein Betreiber am Sidecar `MATTER_SIDECAR_ALLOW_ATTESTATION_OVERRIDE=true` setzen. Standard ist aus, und der Sidecar schreibt beim Start eine Warnung ins Log, wenn es an ist. **Lassen Sie die Variable in Produktion ungesetzt.**

Bei gesetztem Flag bietet die Ansicht „Das Gerät konnte nicht verifiziert werden“ **Trotzdem hinzufügen (Entwicklungs-Override)** an. Das braucht:

- das Flag am Sidecar,
- `matter.devices.commission` **und** `matter.devices.manage`,
- eine ausdrückliche Risikobestätigung für jeden Versuch: **Ich verstehe das Risiko und möchte dieses Gerät ohne Verifizierung hinzufügen** ankreuzen und **Trotzdem hinzufügen** wählen.

Ein fehlgeschlagener Versuch endet immer. Der Override startet einen **neuen** Versuch mit der Bestätigung. Sie geben den Code nicht erneut ein: Der Browser sendet den Code, den er vom gescheiterten Versuch noch im Arbeitsspeicher hält, erneut. Er speichert ihn nie. Das Gerät wird dann mit Attestierung **nicht verifiziert** registriert, und die Geräteseite weist auf den Override hin. Der Override wird als gefährliche Aktion mit den Befundtypen auditiert.

## Multi-Admin

Ein Matter-Gerät kann mehreren Fabrics gleichzeitig angehören, zum Beispiel Attraccess und einem Smartphone-Ökosystem.

- **Eingehend.** Um ein Gerät hinzuzufügen, das schon ein anderes Ökosystem (Apple Home, Google Home, SmartThings, Home Assistant, …) steuert, nutzen Sie dessen Funktion „Teilen“ bzw. „In weiterer App hinzufügen“. Sie zeigt einen Freigabecode. Geben Sie ihn wie jeden anderen Code ein; das Gerät muss noch in seinem Freigabefenster sein (wenige Minuten).
- **Ausgehend.** Auf der Geräteseite öffnet **Mit anderem Controller teilen** nach einer Rückfrage ein Kopplungsfenster und zeigt einen einmaligen manuellen Code und QR-Code mit Countdown. Die Seite öffnet das Fenster immer für 3 Minuten. Die API (`POST /api/matter/nodes/:id/share` mit `timeoutSec`) akzeptiert 180 bis 900 Sekunden, Standard ist ebenfalls 180. **Fenster schließen** beendet es vorzeitig; danach funktioniert der Code nicht mehr. Der Code wird einmal angezeigt und weder gespeichert noch geloggt. Ein entferntes Gerät lässt sich nicht teilen. Braucht `matter.devices.commission`. Öffnen, Schließen und das Ende des Fensters werden ohne den Code auditiert.
- **Weitere Administratoren.** Die Geräteseite listet die anderen Fabrics des Geräts schreibgeschützt als **Außerhalb von Attraccess verwaltet** (Fabric-Index, Hersteller, Label). Attraccess ordnet nichts, was eine andere Fabric tut, einem Attraccess-Benutzer zu.

## Ein Gerät entfernen

Auf der Geräteseite, mit `matter.devices.commission`:

| Aktion                                                                               | Was passiert                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aus der Fabric entfernen**                                                         | Der Sidecar bittet das erreichbare Gerät, **nur die Attraccess-Fabric** zu entfernen, und vergisst dann den Node. Fabrics anderer Ökosysteme bleiben unberührt. Ist das Gerät nicht erreichbar, ändert sich nichts, und die Seite bietet „Entfernen aus der Fabric erzwingen“ an. |
| **Entfernen aus der Fabric erzwingen**                                               | Der Sidecar vergisst den Node, **ohne das Gerät zu kontaktieren**. Das Gerät kann weiterhin Attraccess-Zugangsdaten halten: Setzen Sie es auf Werkseinstellungen zurück oder entfernen Sie es in seinem anderen Controller.                                                       |
| Nur-Datensatz „Entfernen erzwingen“ (Matter-Administration, `matter.devices.manage`) | Setzt nur den Attraccess-Datensatz außer Dienst, für Datensätze, die der Sidecar nicht mehr listet. Siehe [Datenmodell](plugins/matter/data-model.md#aktionen).                                                                                                                   |

Antwortet das Gerät nicht rechtzeitig (`timeout`), ist der Ausgang ungewiss: Das Gerät kann das Entfernen noch abschließen, nachdem Attraccess nicht mehr gewartet hat. Es folgt ein Abgleich; sehen Sie daher auf der Geräteseite nach, bevor Sie das Entfernen erzwingen.

Das Entfernen setzt das Gerät nie zurück. Der Node wird `removed` mit dem Grund `removed_from_fabric` oder `forced_from_fabric`, seine Endpunkte werden stillgelegt, und seine Historie (Zustand, Befehle, Audit) bleibt. Ein entfernter Node lässt sich nicht erneut übernehmen. Eine erneute Inbetriebnahme legt einen neuen Datensatz an.
