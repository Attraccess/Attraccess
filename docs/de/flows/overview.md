# Flows & Automatisierung

Flows sind visuelle Automatisierungs-Workflows, die Sie an jede Ressource anheften koennen. Sie ermöglichen es, Aktionen auszulösen, wenn etwas passiert -- zum Beispiel eine MQTT-Nachricht senden, wenn eine Maschine eingeschaltet wird, oder die Abrechnung starten, wenn eine Sitzung endet.

## Was ist ein Flow?

Ein Flow ist eine Kette verbundener Knoten auf einer visuellen Arbeitsfläche. Jeder Flow gehört zu einer bestimmten Ressource und besteht aus drei Knotentypen:

| Knotenkategorie | Zweck | Beispiele |
|-----------------|-------|----------|
| **Eingabe (Trigger)** | Startet den Flow, wenn ein Ereignis eintritt | Tastendruck, Nutzung gestartet, MQTT-Nachricht empfangen |
| **Verarbeitung** | Transformiert Daten oder steuert den Ablauf | Warten, Wenn (Bedingung), Payload setzen |
| **Ausgabe (Aktion)** | Führt eine Aktion aus | HTTP-Anfrage, MQTT-Nachricht, Abrechnungsposten setzen |

> [!NOTE]
> Ein Flow beginnt immer mit mindestens einem **Eingabe**-Knoten und endet typischerweise mit einem oder mehreren **Ausgabe**-Knoten.

## Wie Flows funktionieren

1. Ein **Ereignis** tritt ein (z.B. ein Benutzer beginnt eine Ressource zu nutzen)
2. Der passende **Eingabe-Knoten** löst aus
3. Daten durchlaufen eventuelle **Verarbeitungs-Knoten** (Verzögerungen, Bedingungen, Variablenzuweisungen)
4. Ein oder mehrere **Ausgabe-Knoten** führen die abschließende Aktion aus (z.B. eine HTTP-Anfrage senden)

<!-- TODO: Screenshot eines einfachen Beispiel-Flows -->

## Anwendungsfälle

Hier sind einige häufige Beispiele:

- **Maschinensteuerung** -- Eine MQTT-Nachricht senden, um eine Maschine einzuschalten, wenn die Nutzung beginnt, und sie auszuschalten, wenn die Nutzung endet
- **Abrechnung** -- Automatisch Abrechnungsposten basierend auf Formulardaten setzen, wenn eine Sitzung endet
- **Benachrichtigungen** -- Einen HTTP-Webhook an Slack oder E-Mail senden, wenn eine Ressource entsperrt wird
- **Sicherheit** -- Eine Nutzungssitzung automatisch nach einer Inaktivitätsperiode beenden

## Ihren ersten Flow erstellen

1. Öffnen Sie die [Detailseite](resources/resource-details.md) einer Ressource
2. Gehen Sie zum Tab **Flows**
3. Klicken Sie auf **Flow erstellen**
4. Verwenden Sie den [Flow-Editor](flows/flow-editor.md), um Knoten hinzuzufügen und zu verbinden

> [!TIP]
> Fangen Sie einfach an -- versuchen Sie einen **Button**-Trigger verbunden mit einer **HTTP-Anfrage**-Ausgabe, um Ihr Setup zu testen, bevor Sie komplexe Automatisierungen erstellen.

## Siehe auch

- [Flow-Editor](flows/flow-editor.md) -- Den visuellen Editor verwenden
- [Knotentypen](flows/node-types.md) -- Alle verfügbaren Knotentypen
- [MQTT & IoT](mqtt/overview.md) -- Hardware verbinden
- [Abrechnung](billing/overview.md) -- Kostenerfassung automatisieren
