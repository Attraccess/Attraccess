# Matter: Verwaltungsseite

<!-- llms-description: Die Matter-Verwaltungsseite unter Geräte: ihre Tabs, wer was sieht, degradierte Zustände, die Oberfläche für den Gerätelebenszyklus, Live-Updates und was noch kommt. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Matter** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

**Geräte → Matter** ist die zentrale Stelle, um Matter in Attraccess zu verwalten. Es gibt nur einen Eintrag in der
Seitenleiste und darunter mehrere Tabs. Die Adresse jedes Tabs lässt sich als Lesezeichen speichern oder teilen; die
Zurück- und Vor-Schaltflächen des Browsers und ein Neuladen behalten Ihre Position bei.

```text
 Matter
 ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
 │ ⚠ Matter-Sidecar nicht erreichbar                                                            │
 │   Nicht erreichbar seit 12:03. [Infrastruktur öffnen] [Jetzt erneut versuchen]               │
 ├──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Geräte │ Infrastruktur │ Thread-Netzwerk │ Inbetriebnahme │ Systemzustand │ Software-Updates │
 ├──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Anzeigen: [Alle aktiven ▾]   ( ) Archivierte und entfernte einbeziehen                       │
 │ ┌────────────────────────────────────────────────────────────────────────────────────────┐   │
 │ │ Plug (7)   [Nicht übernommen] [Erreichbar]                                             │   │
 │ │ ⚠ Nicht übernommenes Gerät – in Flows erst nach Übernahme nutzbar.                     │   │
 │ │ Acme / Plug · Software 1.0.3 · 2 Endpunkte · zuletzt gesehen 12:01                     │   │
 │ │ [Übernehmen] [Archivieren] [Entfernen erzwingen] [Details]                             │   │
 │ └────────────────────────────────────────────────────────────────────────────────────────┘   │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Auf dem Smartphone werden die Tabs zu einer Auswahlliste über dem Inhalt.

## Wer was sieht

Die Seite öffnet sich für Benutzer mit `matter.devices.read` oder `thread.network.read`. Jeder Tab prüft dann seinen
eigenen Schlüssel, und Benutzer sehen nur die Tabs, die sie nutzen dürfen. Ein Link auf einen Tab, den Sie nicht sehen
dürfen, führt Sie zum ersten Tab, den Sie sehen dürfen. Die Schlüssel stehen in [Matter: Berechtigungen](plugins/matter/permissions.md).

| Tab              | Sichtbar mit                                     | Aktionen erfordern                                                                                                                   |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Geräte           | `matter.devices.read`                            | `matter.devices.manage`: übernehmen, reparieren, neu verknüpfen, archivieren, wiederherstellen, Entfernen erzwingen, Namen, Abgleich |
| Infrastruktur    | `matter.devices.read`                            | `matter.devices.manage`: Einstellungen, Fabric, Wiederherstellungsschlüssel, Backup, Restore                                         |
| Thread-Netzwerk  | `thread.network.read`                            | `thread.network.manage` (noch keine Aktion)                                                                                          |
| Inbetriebnahme   | `matter.devices.commission`                      | –                                                                                                                                    |
| Systemzustand    | `matter.devices.read` oder `thread.network.read` | – (Thread-Karten brauchen `thread.network.read`)                                                                                     |
| Software-Updates | `matter.devices.read`                            | `matter.devices.manage` (Freigeben und Einspielen, später)                                                                           |

Benutzer mit reinem Leserecht sehen keine Bearbeiten- oder Lebenszyklus-Schaltfläche, und Attraccess sendet nie eine
Anfrage, die ihre Berechtigungen ablehnen würden.

## Degradierte Zustände

Solange der Sidecar nicht verbunden ist, nennt ein Banner auf jedem Tab den Grund und wo er behoben wird: **nicht
eingerichtet**, **Verbindung wird aufgebaut**, **nicht erreichbar**, **Token abgelehnt**, **inkompatibel** oder
**falsch konfiguriert**. Es zeigt, seit wann das so ist und wann der nächste Versuch stattfindet, und verlinkt auf die
**Infrastruktur**. Benutzer mit `matter.devices.manage` erhalten außerdem **Jetzt erneut versuchen**, das sofort neu
verbindet, statt auf den nächsten Versuch zu warten. Eine Warnung vor einer unverschlüsselten Verbindung (einfaches
`http` zu einem anderen Rechner) erscheint an derselben Stelle.

Der Rest der Seite bleibt nutzbar: Die Geräteliste zeigt, was Attraccess zuletzt wusste, und eine fehlschlagende Anfrage
betrifft nur den Bereich, zu dem sie gehört. Sollte die ganze Matter-Seite einmal abstürzen, fängt Attraccess das ab; der
Rest der Anwendung arbeitet weiter.

## Geräte

Die Liste zeigt jedes Gerät mit Name (oder Produktname und Node-ID), Lebenszyklus-Zustand, Erreichbarkeit, Hersteller und
Produkt, Software- und Hardwareversion, Anzahl der Endpunkte und dem Zeitpunkt, zu dem es zuletzt gesehen wurde.
**Anzeigen** filtert nach Zustand; archivierte und entfernte Geräte sind ausgeblendet, solange Sie sie nicht einbeziehen.

Geräte, die eine Entscheidung brauchen, stehen zuerst und werden erklärt:

| Zustand          | Bedeutung                                                                                        | Was Sie tun können                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Nicht übernommen | Das Gerät ist in der Fabric, aber niemand hat es übernommen. Es ist in Flows nicht nutzbar.      | **Übernehmen** (mit optionalem Namen), **Archivieren**, **Entfernen erzwingen** |
| Getrennt         | Der Datensatz hat sein Gerät verloren (nicht mehr gelistet oder Fabric geändert). Nicht nutzbar. | **Reparieren**, **Neu verknüpfen**, **Archivieren**, **Entfernen erzwingen**    |
| Übernommen       | In Benutzung.                                                                                    | **Reparieren**, **Entfernen erzwingen** (auf der Detailseite)                   |
| Archiviert       | In der Liste ausgeblendet, nicht nutzbar.                                                        | **Wiederherstellen**, **Entfernen erzwingen**                                   |
| Entfernt         | Aus Attraccess entfernt; der Verlauf bleibt erhalten.                                            | –                                                                               |

Nicht übernommene und getrennte Geräte bieten nichts außer diesen Aktionen: keinen Befehl und keine „Benutzen“-Schaltfläche.
**Neu verknüpfen** lässt Sie das nicht übernommene Gerät wählen, das das getrennte ersetzt hat. Unterscheiden sich
Hersteller, Produkt oder Seriennummer, bestätigen Sie das in einem zweiten Schritt. **Entfernen erzwingen** verlangt eine
Bestätigung, die sagt, dass das Gerät nur aus Attraccess entfernt wird: Es wird nicht auf Werkseinstellungen
zurückgesetzt und nicht aus der Matter-Fabric entfernt. Was jede Aktion bewirkt, steht in
[Matter: Datenmodell und Lebenszyklus](plugins/matter/data-model.md).

Der **Abgleich** zeigt das Ergebnis des letzten Vergleichs mit dem Inventar des Sidecars, und **Abgleich jetzt
ausführen** startet einen.

### Ein Gerät

**Details** öffnet das Gerät auf einer eigenen Seite (`/matter/devices/<id>`) mit einem Link zurück zur Liste. Sie zeigt

- die Identität, die das Gerät meldet: Hersteller, Produkt, Seriennummer, Hardware- und Softwareversion, Attestierung,
- Name, Beschreibung und Ort, bei einem übernommenen Gerät bearbeitbar (höchstens 100, 500 und 100 Zeichen),
- die Endpunkte als Baum, jeweils mit ihrem Profil in verständlichen Worten (etwa „Türschloss“ oder „Schalter“), einem
  bearbeitbaren Namen, der Bridge, hinter der sie hängen, und ob die Bridge sie sieht, sowie ihrem aktuellen Zustand mit
  Markierungen **Aktuell** oder **Veraltet** und dem Zeitpunkt der Beobachtung,
- wo das Gerät in Flows verwendet wird (noch nicht verfügbar: Die Seite sagt „In keinem Flow verwendet“),
- einen eingeklappten Bereich **Diagnose** mit rohen Gerätetypen, Cluster-, Attribut- und Befehls-IDs und den Fähigkeiten
  als JSON. Sie brauchen ihn nie, um ein Gerät zu nutzen; er ist für den Support gedacht.

## Infrastruktur

Der Verbindungsstatus (Zustand, Sidecar-, matter.js- und Wire-Version, Kompatibilität, Fähigkeiten), die
**Verbindungseinstellungen** und der Bereich **Fabric und Backup**. Solange der Sidecar nicht verbunden ist, sind die
Versionen als **zuletzt bekannt** markiert. Das Einstellungsformular prüft URL (`http` oder `https`), Token (32 bis 512
druckbare Zeichen) und CA-Zertifikat (PEM) schon beim Tippen. Speichert ein anderer Administrator währenddessen andere
Einstellungen, sagt Ihnen das Formular das, behält Ihre Änderungen und verlangt ein Neuladen, bevor Sie speichern können:
So wird nichts stillschweigend überschrieben. **CA-Zertifikat entfernen** lässt sich bis zum Speichern rückgängig machen.
Das Token wird nach dem Speichern nie wieder angezeigt. Alles Weitere zur Verbindung steht in
[Matter: Betriebsanleitung](plugins/matter/operator.md), Fabric und Backups in
[Matter: Backup und Wiederherstellung](plugins/matter/backup-restore.md).

## Thread-Netzwerk, Inbetriebnahme und Software-Updates

Thread und Software-Updates gibt es, damit Adresse und Berechtigung bereitstehen; die Funktionen kommen mit späteren Plugin-Versionen.
Jeder sagt das, ausgehend von dem, was der Sidecar meldet (Funktionsfamilien `thread`, `commissioning` und `ota`):

- **Thread-Netzwerk** erklärt, dass Thread nicht eingerichtet ist, und gibt Hinweise, wie sich Thread, Zigbee und WLAN das
  2,4-GHz-Band teilen. Bereiche für Dataset, Border Router, Radio-Co-Prozessoren und SMLIGHT-Diagnose sind Platzhalter.
- **Inbetriebnahme** ist ein geführter Ablauf auf einer eigenen Seite: Gerät vorbereiten, Code eingeben oder scannen,
  Fortschritt verfolgen, Gerät benennen. Meldet der Sidecar die Familie `commissioning` nicht, sagt der Tab das und bietet
  keine Eingabe an. Teilen, das Entfernen aus der Fabric und die weiteren Administratoren eines Geräts stehen nicht in
  diesem Tab, sondern auf der Seite des Geräts selbst. Siehe
  [Inbetriebnahme, Teilen und Entfernen](plugins/matter/commissioning.md).
- **Software-Updates** listet die Software, die jedes Gerät gerade nutzt. Updates finden, freigeben und einspielen kommt
  mit der OTA-Unterstützung.

## Systemzustand

Eine Seite mit Verbindung, Kompatibilität, Fabric, Backup, Abgleich und Ereigniszählern, den Funktionsfamilien, die der
Sidecar unterstützt, und für Benutzer mit `thread.network.read` einem Thread-Platzhalter. Eine Karte, die nicht in
Ordnung ist, verlinkt auf den Tab, auf dem Sie das beheben können. Die Verbindungskarten folgen dem Status, den die Seite
alle 5 Sekunden prüft; Fabric, Backup und Abgleich aktualisieren sich alle 30 Sekunden. Beides pausiert, solange der
Browser-Tab im Hintergrund ist.

## Live-Updates

Geräteliste, Gerät und sein Zustand aktualisieren sich ohne Neuladen: Attraccess sendet ein kurzes „etwas hat sich
geändert“-Signal, und die Seite liest die neuen Daten über die normale, berechtigungsgeprüfte API. Sind Live-Updates nicht
verfügbar, sagt die Seite, dass das Angezeigte veraltet sein kann, und aktualisiert sich etwa alle 15 Sekunden selbst,
bis sie wieder funktionieren.
