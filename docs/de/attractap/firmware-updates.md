# Firmware-Updates

Attractap-Leser unterstuetzen OTA-Firmware-Updates (Over-The-Air). Das bedeutet, dass Sie die Leser-Firmware ueber das Attraccess-Backend aus der Ferne aktualisieren koennen, ohne physisch auf das Geraet zugreifen zu muessen.

## Wie Firmware-Updates funktionieren

1. Eine neue Firmware-Version wird in das Attraccess-Backend hochgeladen
2. Die Firmware wird einem oder mehreren Lesegeraeten zugewiesen
3. Der Leser laedt das Update ueber das Netzwerk herunter und installiert es
4. Der Leser startet mit der neuen Firmware neu

> [!NOTE]
> Waehrend eines Firmware-Updates ist der Leser voruebergehend nicht verfuegbar. Das Update dauert in der Regel weniger als eine Minute.

## Firmware verwalten

### Verfuegbare Firmware anzeigen

1. Oeffnen Sie die Gruppe **Geraete** in der Seitenleiste
2. Klicken Sie auf **Attractap-Lesegeraete**
3. Sie sehen eine Liste aller hochgeladenen Firmware-Versionen

<!-- TODO: Screenshot der Firmware-Liste -->

### Neue Firmware hochladen

1. Navigieren Sie zu **Geraete** > **Attractap-Lesegeraete**
2. Klicken Sie auf **Firmware hochladen**
3. Fuellen Sie die Firmware-Details aus:

| Feld | Beschreibung |
|------|-------------|
| **Version** | Versionsnummer der Firmware (z.B. "1.2.0") |
| **Variante** | Hardware-Variante, fuer die diese Firmware bestimmt ist (Lite, Touch etc.) |
| **Datei** | Die Firmware-Binaerdatei (.bin) |
| **Release Notes** | Optionale Beschreibung der Aenderungen in dieser Version |

4. Klicken Sie auf **Hochladen**

> [!NOTE]
> Verschiedene Hardware-Varianten erfordern unterschiedliche Firmware-Dateien. Stellen Sie sicher, dass Sie beim Hochladen die richtige Variante auswaehlen.

### Updates an Leser uebertragen

1. Navigieren Sie zu **Geraete** > **Attractap-Lesegeraete**
2. Waehlen Sie den/die Leser aus, die Sie aktualisieren moechten
3. Waehlen Sie die Ziel-Firmware-Version
4. Klicken Sie auf **Firmware aktualisieren**
5. Das Update wird an die ausgewaehlten Leser uebertragen

<!-- TODO: Screenshot des Firmware-Update-Dialogs -->

## Firmware-Varianten

Jede Hardware-Variante erfordert ihren eigenen Firmware-Build:

| Hardware-Variante | Firmware-Variante |
|-------------------|------------------|
| Attractap Lite Ethernet | `lite-ethernet` |
| Attractap Touch WiFi | `touch-wifi` |
| Attractap Touch Ethernet | `touch-ethernet` |

> [!TIP]
> Testen Sie ein Firmware-Update immer erst an einem einzelnen Leser, bevor Sie es an alle Geraete verteilen.

## Update-Status

Nach dem Uebertragen eines Updates koennen Sie den Fortschritt in der Leserliste verfolgen:

| Status | Beschreibung |
|--------|-------------|
| **Aktuell** | Der Leser laeuft mit der neuesten zugewiesenen Firmware |
| **Update ausstehend** | Das Update wurde uebertragen, aber noch nicht installiert |
| **Wird aktualisiert** | Der Leser laedt das Update gerade herunter und installiert es |
| **Update fehlgeschlagen** | Das Update konnte nicht installiert werden -- pruefen Sie die Konnektivitaet des Lesers |

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| Update bleibt im Status "ausstehend" | Ueberpruefen Sie, ob der Leser mit dem Netzwerk verbunden ist und das Backend erreichen kann |
| Update schlaegt wiederholt fehl | Stellen Sie sicher, dass Sie die richtige Firmware-Variante fuer die Leser-Hardware hochgeladen haben |
| Leser reagiert nach dem Update nicht | Warten Sie einige Minuten, bis der Leser neu startet. Falls er sich nicht erholt, kann ein manuelles Flashen erforderlich sein |

## Siehe auch

- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [Einrichtung](attractap/setup.md) -- Leser registrieren und konfigurieren
