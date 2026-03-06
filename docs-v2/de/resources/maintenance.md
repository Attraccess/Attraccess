# Wartung

Attraccess hilft Ihnen, die Wartung Ihrer Ressourcen im Blick zu behalten. Sie können manuelle Wartungseinträge erstellen und automatisierte Wartungspläne einrichten, die auf Nutzung oder Zeit basieren.

## Berechtigungen

Sie benötigen die Berechtigung **Ressourcen verwalten**, um Wartungseinträge und -pläne zu erstellen und zu verwalten.

## Manuelle Wartung

Manuelle Wartungseinträge dokumentieren einzelne Wartungsarbeiten an einer Ressource.

### Wartungseintrag erstellen

1. Öffnen Sie die [Detailseite](resources/resource-details.md) der Ressource
2. Scrollen Sie zum Bereich **Wartung**
3. Klicken Sie auf **Neue Wartung**
4. Füllen Sie die Details aus:

| Feld | Erforderlich | Beschreibung |
|------|-------------|-------------|
| **Grund** | Ja | Welche Wartung durchgeführt wird |
| **Startzeit** | Ja | Wann die Wartung beginnt |

5. Klicken Sie auf **Speichern**

<!-- TODO: Screenshot eines Wartungseintrags einfügen -->

### Wartungseintrag abschließen

1. Öffnen Sie die Detailseite der Ressource
2. Finden Sie den offenen Wartungseintrag im Bereich **Wartung**
3. Klicken Sie auf **Abschließen**
4. Endzeit und abschließender Benutzer werden automatisch erfasst

### Details eines Wartungseintrags

Jeder Wartungseintrag enthält:

| Feld | Beschreibung |
|------|-------------|
| **Startzeit** | Wann die Wartung begonnen hat |
| **Endzeit** | Wann die Wartung abgeschlossen wurde |
| **Grund** | Beschreibung der durchgeführten Wartungsarbeiten |
| **Erstellt von** | Benutzer, der den Eintrag erstellt hat |
| **Abgeschlossen von** | Benutzer, der den Eintrag als erledigt markiert hat |

## Automatisierte Wartungspläne

Wartungspläne erstellen automatisch Wartungserinnerungen basierend auf Nutzung oder Zeit. So wird sichergestellt, dass Ressourcen regelmäßig gewartet werden.

### Wartungsplan erstellen

1. Öffnen Sie die Detailseite der Ressource
2. Scrollen Sie zum Bereich **Wartungspläne**
3. Klicken Sie auf **Neuer Plan**
4. Wählen Sie einen Auslösertyp und konfigurieren Sie ihn

<!-- TODO: Screenshot der Wartungsplanerstellung einfügen -->

### Auslösertypen

| Auslösertyp | Beschreibung | Beispiel |
|-------------|-------------|---------|
| **USAGE_HOURS** | Löst nach einer bestimmten Anzahl von Nutzungsstunden aus | Wartung alle 100 Betriebsstunden |
| **USAGE_COUNT** | Löst nach einer bestimmten Anzahl von Nutzungssitzungen aus | Wartung alle 500 Sitzungen |
| **TIME_INTERVAL** | Löst nach einer bestimmten Zeitspanne aus (Tage, Stunden oder Minuten) | Wartung alle 30 Tage |

### Plan-Einstellungen

| Einstellung | Beschreibung |
|-------------|-------------|
| **Auslösertyp** | Einer von USAGE_HOURS, USAGE_COUNT oder TIME_INTERVAL |
| **Auslöserwert** | Der Schwellenwert, der die Wartung auslöst (z.B. 100 Stunden, 500 Sitzungen, 30 Tage) |
| **Aktiviert** | Ob der Plan derzeit aktiv ist |

> [!NOTE]
> Das Deaktivieren eines Plans löscht ihn nicht. Sie können ihn jederzeit wieder aktivieren. Der Plan setzt die Zählung dort fort, wo er aufgehört hat.

### So funktionieren automatisierte Pläne

1. Der Plan überwacht den konfigurierten Auslöser (Nutzungsstunden, Sitzungsanzahl oder verstrichene Zeit)
2. Wenn der Schwellenwert erreicht ist, wird eine Wartungserinnerung erstellt
3. Ein Ressourcenverwalter führt die Wartung durch und markiert den Eintrag als erledigt
4. Der Zähler wird zurückgesetzt und der Plan beginnt, den nächsten Schwellenwert zu verfolgen

> [!TIP]
> Sie können mehrere Pläne für dieselbe Ressource kombinieren. Richten Sie beispielsweise einen Plan für alle 100 Betriebsstunden und einen weiteren für alle 6 Monate ein -- je nachdem, was zuerst eintritt.

## Siehe auch

- [Detailseite](resources/resource-details.md)
- [Nutzungsverfolgung](resources/usage-tracking.md)
- [Ressourcen](resources/overview.md)
