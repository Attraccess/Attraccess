# Knotentypen

Flows werden aus drei Kategorien von Knoten aufgebaut: **Eingabe** (Trigger), **Verarbeitung** (Logik) und **Ausgabe** (Aktionen). Diese Seite beschreibt jeden verfügbaren Knotentyp und seine Konfiguration.

## Eingabe-Knoten (Trigger)

Eingabe-Knoten starten einen Flow, wenn ein bestimmtes Ereignis eintritt. Jeder Flow benötigt mindestens einen Eingabe-Knoten.

### Button

Ein manueller Auslöser. Fügt der Ressourcen-Detailseite einen Button hinzu, den Benutzer anklicken können, um den Flow auszuführen.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Beschriftung** | Text, der auf dem Button angezeigt wird |

### Ressourcennutzung gestartet

Löst aus, wenn ein Benutzer eine Nutzungssitzung an der Ressource startet.

Keine zusätzlichen Einstellungen.

### Ressourcennutzung beendet

Löst aus, wenn ein Benutzer eine Nutzungssitzung an der Ressource beendet.

Keine zusätzlichen Einstellungen.

### Ressourcennutzung übernommen

Löst aus, wenn ein Benutzer eine aktive Nutzungssitzung eines anderen Benutzers übernimmt.

Keine zusätzlichen Einstellungen.

### Tür entsperrt

Löst aus, wenn eine Tür-Ressource entsperrt wird.

Keine zusätzlichen Einstellungen.

### Tür gesperrt

Löst aus, wenn eine Tür-Ressource gesperrt wird.

Keine zusätzlichen Einstellungen.

### Tür geöffnet (Unlatch)

Löst aus, wenn eine Tür-Ressource kurzzeitig geöffnet wird (Unlatch).

Keine zusätzlichen Einstellungen.

### MQTT-Nachricht empfangen

Löst aus, wenn eine Nachricht auf einem bestimmten MQTT-Topic empfangen wird.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Topic** | Das MQTT-Topic, auf dem gelauscht wird (z.B. `workshop/laser/status`) |

> [!TIP]
> Der empfangene MQTT-Nachrichten-Payload steht nachfolgenden Knoten als Eingabedaten zur Verfügung. Sie können **Payload setzen** oder **Wenn**-Knoten verwenden, um damit zu arbeiten.

### Keine Aktivität

Löst nach einer Inaktivitätsperiode an der Ressource aus. Nützlich für Sicherheits-Automatisierungen wie automatische Abschaltung.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Timeout** | Dauer der Inaktivität vor dem Auslösen |
| **Einheit** | Sekunden, Minuten oder Stunden |

---

## Verarbeitungs-Knoten

Verarbeitungs-Knoten steuern den Datenfluss zwischen Eingabe- und Ausgabe-Knoten.

### Warten

Pausiert den Flow für eine bestimmte Dauer, bevor er fortgesetzt wird.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Dauer** | Wie lange gewartet werden soll |
| **Einheit** | Sekunden, Minuten oder Stunden |

### Wenn (If)

Bedingte Verzweigung. Wertet einen Vergleich aus und leitet den Flow auf verschiedene Pfade.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Linker Wert** | Erster Vergleichswert |
| **Operator** | Vergleichsoperator (gleich, ungleich, größer als, kleiner als etc.) |
| **Rechter Wert** | Zweiter Vergleichswert |

Der Knoten hat zwei Ausgänge:

- **Wahr** -- Die Bedingung traf zu
- **Falsch** -- Die Bedingung traf nicht zu

### Payload setzen

Setzt oder ändert Variablen, die an nachfolgende Knoten weitergegeben werden.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Schlüssel** | Variablenname |
| **Wert** | Variablenwert |

> [!NOTE]
> Sie können mehrere Payload-setzen-Knoten verketten, um komplexe Daten für einen Ausgabe-Knoten aufzubauen.

### Auf MQTT-Nachricht warten

Pausiert den Flow, bis eine bestimmte MQTT-Nachricht empfangen wird oder ein Timeout abläuft.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Topic** | Das MQTT-Topic, auf dem gelauscht wird |
| **Timeout** | Maximale Wartezeit |
| **Einheit** | Sekunden, Minuten oder Stunden |

Der Knoten hat zwei Ausgänge:

- **Nachricht empfangen** -- Eine Nachricht kam vor dem Timeout an
- **Timeout** -- Keine Nachricht wurde rechtzeitig empfangen

### Fehler

Löst die Fehlerbehandlung des Flows aus. Verwenden Sie diesen Knoten, um einen Flow zu stoppen und ein Problem zu signalisieren.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Nachricht** | Anzuzeigende Fehlermeldung |

---

## Ausgabe-Knoten (Aktionen)

Ausgabe-Knoten führen Aktionen aus, wenn sie erreicht werden. Sie befinden sich typischerweise am Ende eines Flows.

### HTTP-Anfrage

Sendet eine HTTP-Anfrage an eine externe URL. Nützlich für Webhooks und API-Integrationen.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Methode** | GET, POST, PUT, PATCH oder DELETE |
| **URL** | Die Ziel-URL |
| **Headers** | Optionale HTTP-Header (Schlüssel-Wert-Paare) |
| **Body** | Optionaler Anfragekörper (für POST/PUT/PATCH) |

### MQTT-Nachricht senden

Veröffentlicht eine Nachricht auf einem MQTT-Topic.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Topic** | Das MQTT-Topic, auf dem veröffentlicht wird |
| **Payload** | Der Nachrichteninhalt |

### Abrechnungsposten setzen

Setzt Abrechnungsposten für die aktuelle Nutzungssitzung. Wird für automatisierte Kostenerfassung verwendet.

| Einstellung | Beschreibung |
|-------------|-------------|
| **Posten** | Liste der Abrechnungsposten mit Name, Menge und Preis |

> [!NOTE]
> Dieser Knoten funktioniert nur, wenn der Flow durch ein nutzungsbezogenes Ereignis ausgelöst wird (Nutzung gestartet, beendet oder übernommen).

### Nutzungssitzung beenden

Beendet die aktuelle Nutzungssitzung an der Ressource. Nützlich für automatische Abschaltungs-Flows.

Keine zusätzlichen Einstellungen.

### Aktivität verfolgen

Zeichnet ein Aktivitätsereignis an der Ressource auf. Setzt den Inaktivitäts-Timer für **Keine Aktivität**-Trigger-Knoten zurück.

Keine zusätzlichen Einstellungen.

## Siehe auch

- [Flow-Editor](flows/flow-editor.md) -- Knoten platzieren und verbinden
- [Flows-Überblick](flows/overview.md) -- Was Flows sind und wie sie funktionieren
- [MQTT & IoT](mqtt/overview.md) -- MQTT einrichten
- [Abrechnung](billing/overview.md) -- Details zum Abrechnungssystem
