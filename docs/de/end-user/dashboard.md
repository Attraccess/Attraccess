# Dashboard

<!-- llms-description: Wie Sie Ihr persönliches Dashboard aus Widgets, Seiten und Ressourcen zusammenstellen, bearbeiten und neu anordnen und von dort Sitzungen starten oder beenden. -->

Ihr Dashboard sammelt an einem Ort, was Sie am häufigsten nutzen: Widgets mit Live-Inhalten, Seiten und Ressourcen. Jede Person hat ihr eigenes Dashboard, und es steht Ihnen in jedem Browser und auf jedem Gerät zur Verfügung, auf dem Sie sich anmelden.

Sie öffnen es über **Dashboard** ganz oben in der Seitenleiste.

## Etwas hinzufügen

Es gibt zwei Wege, etwas auf Ihr Dashboard zu bringen.

**Zum Dashboard hinzufügen:** Wählen Sie **Dashboard bearbeiten** in der Kopfzeile des Dashboards und dann **Zum Dashboard hinzufügen**. Die Liste zeigt alle Widgets und Seiten, die Sie verwenden dürfen und die noch nicht auf Ihrem Dashboard sind. Wählen Sie **Hinzufügen** neben einem Eintrag, um ihn ans Ende Ihres Dashboards zu setzen. Die Liste bleibt offen, sodass Sie mehrere Einträge nacheinander hinzufügen können. Wählen Sie **Schließen**, wenn Sie fertig sind.

**Der Stern:** Öffnen Sie eine Seite oder Ressource und wählen Sie den **Stern** in ihrer Kopfzeile (**An Dashboard anheften**). Der Stern wird ausgefüllt. Ressourcen können Sie nur auf diesem Weg hinzufügen.

Sie können hinzufügen:

- die [Widgets](#widgets), die Sie verwenden dürfen
- jede Seite der Seitenleiste, die Sie öffnen dürfen, außer dem Dashboard selbst und Links, die Attraccess verlassen
- Seiten von Plugins, deren Plugin sie für das Dashboard anbietet
- jede Ressource, von ihrer Detailseite aus

Ein leeres Dashboard bietet direkt **Zum Dashboard hinzufügen** und **Ressourcen durchsuchen** an.

## Ihre Startseite

Solange Ihr Dashboard leer ist, öffnet Attraccess weiterhin die Ressourcenübersicht. Sobald etwas darauf ist, zeigt Attraccess beim Öffnen stattdessen Ihr Dashboard. Entfernen Sie alles, um wieder bei der Ressourcenübersicht zu starten.

## Bearbeitungsmodus

Normalerweise ist das Dashboard eine aufgeräumte Ansicht: Sie können alles auf den Karten verwenden, aber es gibt keine Griffe und keine Schaltflächen zum Entfernen. Um das Dashboard zu ändern, wählen Sie **Dashboard bearbeiten**. Während Sie bearbeiten:

- zeigt jede Karte einen Griff zum Verschieben und eine Schaltfläche zum Entfernen (**… vom Dashboard entfernen**)
- öffnet **Zum Dashboard hinzufügen** die Liste der Widgets und Seiten
- wird jede Änderung sofort gespeichert

Wählen Sie **Fertig**, um zur normalen Ansicht zurückzukehren. Auch wenn Sie das Dashboard verlassen, endet der Bearbeitungsmodus.

### Karten neu anordnen

Ziehen Sie im Bearbeitungsmodus eine Karte an ihrem Griff (die Punkte oben links) an eine neue Stelle. Mit der Tastatur fokussieren Sie den Griff, drücken die Leertaste, verschieben die Karte mit den Pfeiltasten und drücken erneut die Leertaste. Die neue Reihenfolge wird sofort gespeichert. Kann sie nicht gespeichert werden, kehrt das Dashboard zur gespeicherten Reihenfolge zurück und weist Sie darauf hin.

### Eine Karte entfernen

Wählen Sie im Bearbeitungsmodus die Schaltfläche zum Entfernen oben rechts auf einer Karte. Seiten und Ressourcen können Sie auch lösen, indem Sie den ausgefüllten Stern in ihrer Kopfzeile erneut wählen.

## Karten im Dashboard

- **Seitenkarten** zeigen Symbol und Namen der Seite sowie einen Zähler, wo die Seitenleiste einen zeigt (zum Beispiel ungelesene Nachrichten). Wählen Sie den Seitennamen, um die Seite zu öffnen.
- **Ressourcenkarten** zeigen den Status der Ressource und ihre Sitzungssteuerung. Sie können Ihre eigene Sitzung direkt dort starten und beenden, nach denselben Regeln wie auf der Ressourcenseite: Sie brauchen eine Einweisung, beaufsichtigte Starts fragen nach einer Aufsicht und so weiter. Eine laufende Sitzung einer anderen Person zeigt ihren Timer. Wählen Sie **Öffnen**, um zur Ressourcenseite zu gelangen.
- **Widgets** zeigen Live-Inhalte und Schnellaktionen für einen Bereich von Attraccess.

Die Karten aktualisieren sich live, wenn Sitzungen beginnen und enden.

## Widgets

Jedes Widget wird nur Personen angeboten, die die Seite öffnen dürfen, für die es steht. Jede Schaltfläche in einem Widget erscheint nur, wenn Sie verwenden dürfen, was sie öffnet.

| Widget              | Zeigt                                                                                                                                                                                            | Wer es sieht                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Nachrichten**     | Die Zahl der ungelesenen Nachrichten, Ihre fünf neuesten Unterhaltungen mit Vorschau und ungelesenen Nachrichten sowie **Posteingang öffnen**. Wählen Sie eine Unterhaltung, um sie zu öffnen.   | Alle                                                                      |
| **Meine Sitzungen** | Ihre laufenden Sitzungen mit je einem Timer und **Beenden**, um eine nach einer Bestätigung zu beenden.                                                                                          | Alle                                                                      |
| **Ressourcen**      | Eine Suche, die die Ressourcenübersicht mit Ihrem Suchbegriff öffnet, und Schaltflächen für alle Ressourcen, das Erstellen einer Ressource, Flows, MQTT-Server, Lesegeräte und Nutzungsberichte. | Alle; jede Schaltfläche nur mit ihrer Berechtigung                        |
| **Benutzer**        | Eine Suche, die die Benutzerliste mit Ihrem Suchbegriff öffnet, und Schaltflächen für alle Benutzer, unbestätigte E-Mail-Adressen, das Einladen eines Benutzers und Rollen.                      | Personen, die die Benutzerliste sehen dürfen                              |
| **Guthaben**        | Ihr Guthaben in der eingestellten Währung, mit **Aufladen** und **Transaktionen**.                                                                                                               | Instanzen mit dem Abrechnungsmodul                                        |
| **Lesegeräte**      | Wie viele Lesegeräte gekoppelt sind und wie viele sich seit 24 Stunden nicht verbunden haben, die drei davon mit der ältesten Verbindung sowie **Alle Lesegeräte**.                              | Personen, die Lesegeräte verwalten, auf Instanzen mit dem Attractap-Modul |

Plugins können eigene Widgets hinzufügen. Das Reservierungs-Plugin bietet zum Beispiel **Anstehende Reservierungen** an: Ihre nächsten drei Buchungen, **Meine Reservierungen** und, für Personen, die Reservierungen verwalten, **Verwalten**.

## Karten, die Sie nicht mehr verwenden können

Verlieren Sie den Zugriff auf eine angeheftete Seite oder ein Widget, zum Beispiel weil eine Berechtigung entzogen wurde, ein Lizenzmodul endete oder ein Plugin nicht mehr verfügbar ist, zeigt die Karte **Nicht mehr zugänglich**. Wählen Sie **Vom Dashboard entfernen**, um sie zu entfernen; diese Schaltfläche gibt es auch außerhalb des Bearbeitungsmodus. Behalten Sie die Karte und erhalten den Zugriff zurück, erscheint wieder die normale Karte.

Wird eine angeheftete Ressource gelöscht, verschwindet ihre Karte aus allen Dashboards.
