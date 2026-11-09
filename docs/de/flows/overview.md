# Flows & Automatisierung
<!-- llms-description: Stellt Flows als visuelle Automatisierungen vor, mit Anwendungsfällen, Ressourcen- und globalen Flows und dem ersten Flow. -->

Flows sind visuelle Automatisierungs-Workflows, die Sie an eine Ressource anheften oder als [globalen Flow](flows/global-flows.md) für alle Ressourcen ausführen können. Sie ermöglichen es, Aktionen auszulösen, wenn etwas passiert -- zum Beispiel eine MQTT-Nachricht senden, wenn eine Maschine eingeschaltet wird, oder die Abrechnung starten, wenn eine Sitzung endet.

## Was ist ein Flow?

Ein Flow ist eine Kette verbundener Knoten auf einer visuellen Arbeitsfläche. Jeder Flow gehört zu einer bestimmten Ressource (oder ist ein [globaler Flow](flows/global-flows.md)) und besteht aus drei Knotentypen:

| Knotenkategorie       | Zweck                                        | Beispiele                                                |
| --------------------- | -------------------------------------------- | -------------------------------------------------------- |
| **Eingabe (Trigger)** | Startet den Flow, wenn ein Ereignis eintritt | Tastendruck, Nutzung gestartet, MQTT-Nachricht empfangen |
| **Verarbeitung**      | Transformiert Daten oder steuert den Ablauf  | Warten, Wenn (Bedingung), Payload setzen                 |
| **Ausgabe (Aktion)**  | Führt eine Aktion aus                        | HTTP-Anfrage, MQTT-Nachricht, Abrechnungsposten setzen   |

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

## Ressourcen-Flows und globale Flows

Ein **Ressourcen-Flow** gehört zu einer Ressource und reagiert auf deren Ereignisse. Ein [**globaler Flow**](flows/global-flows.md) ist an keine Ressource gebunden: Administratoren erstellen ihn unter **Geräte** → **Flows**, und er reagiert auf Ereignisse jeder Ressource, zum Beispiel um einen Kanal zu benachrichtigen, sobald eine beliebige Maschine startet. Globale Flows nutzen denselben Editor und dieselben Knoten, laufen aber innerhalb jedes Starts und Stopps; ein fehlerhafter oder langsamer globaler Flow beeinträchtigt daher alle Maschinen.

## Ihren ersten Flow erstellen

1. Öffnen Sie die [Detailseite](resources/resource-details.md) einer Ressource
2. Gehen Sie zum Tab **Flows**
3. Klicken Sie auf **Flow erstellen**
4. Verwenden Sie den [Flow-Editor](flows/flow-editor.md), um Knoten hinzuzufügen und zu verbinden

> [!TIP]
> Fangen Sie einfach an -- versuchen Sie einen **Button**-Trigger verbunden mit einer **HTTP-Anfrage**-Ausgabe, um Ihr Setup zu testen, bevor Sie komplexe Automatisierungen erstellen.

## Siehe auch

- [Flow-Editor](flows/flow-editor.md) -- Den visuellen Editor verwenden
- [Payloads, Variablen & Vorlagen](flows/payloads-variables-templates.md) -- Knotendaten und gespeicherte Werte verwenden
- [Globale Flows](flows/global-flows.md) -- Flows, die auf jede Ressource reagieren
- [Knotentypen](flows/node-types.md) -- Alle verfügbaren Knotentypen
- [MQTT & IoT](mqtt/overview.md) -- Hardware verbinden
- [Abrechnung](billing/overview.md) -- Kostenerfassung automatisieren
