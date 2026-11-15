# Reservierungs-API
<!-- llms-description: Referenz der API des Plugins Reservierungen, einschließlich Fehlercodes. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Reservierungen** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Alle Endpunkte liegen unter `/api/reservations` und akzeptieren ein Sitzungs-Cookie **oder** ein API-Token
(`Authorization: Bearer <token>`, siehe [API-Referenz](developer/api-reference.md)). Zeiten sind ISO 8601.
Ein API-Token handelt mit den Berechtigungen des Tokens: Verwalteraktionen (fremde Buchungen genehmigen, stornieren
oder vorzeitig beenden, die Verwalterliste, Ressourceneinstellungen, Buchen bei „nur Verwalter“) brauchen
`resources.update` am Token selbst. Wartungs- und Einweiserrechte aus Ihren Rollen gelten weiterhin.
Einen Kalender-Feed anlegen und seine URL neu erzeugen geht nur mit einer Browser-Sitzung (403 mit einem API-Token),
denn eine Feed-URL zeigt Ihre Buchungen mit allen Ihren Rechten, wie ein API-Token.
Ein Start mit einem API-Token läuft durch die Startprüfung des Kerns und die des Plugins, und beide wenden die
Berechtigungen des Tokens an: Ohne `resources.update` am Token (und ohne Wartungs- oder Einweiserrolle) erhalten Sie die
Sperre statt der Override-Bestätigung, und die Sperre nennt die buchende Person nur, wenn das Token sehen darf, wer die
Maschine nutzt.

| Methode und Pfad                                            | Zweck                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /resources/:resourceId/availability?from=&to=`         | Buchungen, Regeln und Ihre Buchungsberechtigung für einen Zeitraum (höchstens 62 Tage).    |
| `GET /resources/:resourceId/pending-decision`               | Ihre laufende Buchung, die auf „behalten/freigeben“ wartet, oder `null`.                   |
| `POST /`                                                    | Buchen (`resourceId`, `startTime` und `endTime` oder `durationMinutes`, optional `note`).  |
| `GET /mine?scope=upcoming\|past&status=`                    | Ihre Buchungen.                                                                            |
| `GET /manage?resourceId=&status=&from=&to=&page=`           | Buchungen der Ressourcen, die Sie verwalten (25 pro Seite); 403, wenn Sie keine verwalten. |
| `GET /:id`                                                  | Eine Buchung (Buchende oder Verwaltende).                                                  |
| `POST /:id/cancel`                                          | Stornieren (Body: optionaler `reason`, für Verwaltende).                                   |
| `POST /:id/end-early`                                       | Eine laufende Buchung jetzt beenden.                                                       |
| `POST /:id/keep`                                            | Die Buchung behalten (nur Buchende).                                                       |
| `POST /:id/approve`, `POST /:id/reject`                     | Ausstehende Buchung entscheiden (Verwaltende, optionaler `reason`).                        |
| `GET /resources/:resourceId/manager-access`                 | Ob Sie die Ressource verwalten.                                                            |
| `GET` / `PUT /resources/:resourceId/settings`               | Einstellungen der Ressource lesen oder ändern (Verwaltende). `PUT` ist eine Teiländerung.  |
| `GET /resources/:resourceId/settings/future-bookings-count` | Buchungen, die ein Deaktivieren stornieren würde.                                          |
| `GET` / `PUT /settings/global`                              | Plugin-weite Einstellungen (Zeitzone). `PUT` benötigt `system.settings.manage`.            |
| `GET`, `POST /ical/feeds`                                   | Ihre Kalender-Feeds auflisten oder anlegen.                                                |
| `PATCH`, `DELETE /ical/feeds/:id`                           | Einen Feed umbenennen oder neu auswählen, oder widerrufen.                                 |
| `POST /ical/feeds/:id/regenerate`                           | Eine neue geheime URL ausstellen.                                                          |
| `GET /ical/<token>.ics`                                     | Der Kalender (ohne Sitzung; das Token ist die Zugangsberechtigung).                        |

Beispiel: Eine Ressource für 60 Minuten mit einem API-Token buchen.

```bash
curl -X POST https://your-attraccess-instance/api/reservations \
  -H "Authorization: Bearer $ATTRACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "resourceId": 3, "startTime": "2026-12-01T14:00:00Z", "durationMinutes": 60 }'
```

Das Deaktivieren über `PUT /resources/:resourceId/settings` mit `"enabled": false` antwortet mit
`409 FUTURE_BOOKINGS_EXIST`, solange künftige Buchungen existieren, es sei denn, die Anfrage sendet zusätzlich
`"cancelFutureBookings": true`.

## Fehlercodes

Regelverstöße antworten mit `{ "code": "...", "message": "..." }`.

| Code                                                                                       | Status | Bedeutung                                                                      |
| ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| `RESERVATIONS_DISABLED`                                                                    | 409    | Reservierungen sind für die Ressource nicht aktiviert.                         |
| `NOT_ALLOWED_TO_BOOK`                                                                      | 409    | Durch die Einstellung „Wer buchen darf“ nicht erlaubt.                         |
| `IN_THE_PAST`                                                                              | 409    | Die Buchung würde in der Vergangenheit beginnen.                               |
| `OFF_TIME_STEP`                                                                            | 409    | Beginn oder Dauer liegt neben dem Zeitraster.                                  |
| `DURATION_TOO_SHORT`, `DURATION_TOO_LONG`                                                  | 409    | Unter der Mindest- oder über der Höchstdauer.                                  |
| `BEYOND_MAX_ADVANCE`                                                                       | 409    | Weiter in der Zukunft als der maximale Vorlauf.                                |
| `LEAD_TIME_TOO_SHORT`                                                                      | 409    | Zu spät für den Mindestvorlauf.                                                |
| `OUTSIDE_BOOKABLE_HOURS`                                                                   | 409    | Nicht vollständig innerhalb der buchbaren Zeiten.                              |
| `USER_BOOKING_LIMIT`                                                                       | 409    | Höchstzahl aktiver Buchungen pro Person erreicht.                              |
| `OVERLAP`                                                                                  | 409    | Überschneidet eine andere ausstehende oder bestätigte Buchung (mit Puffern).   |
| `MAINTENANCE`                                                                              | 409    | Überschneidet ein Wartungsfenster.                                             |
| `NOT_PENDING`, `NOT_ACTIVE`, `NOT_CANCELLABLE`                                             | 409    | Die Buchung ist nicht in einem Zustand, der diese Aktion erlaubt.              |
| `ALREADY_STARTED`, `ALREADY_FINISHED`                                                      | 409    | Die Buchung hat bereits begonnen oder ist beendet.                             |
| `FUTURE_BOOKINGS_EXIST`                                                                    | 409    | Das Deaktivieren würde künftige Buchungen stornieren; ausdrücklich bestätigen. |
| `FEED_LIMIT`                                                                               | 409    | Höchstzahl an Kalender-Feeds erreicht.                                         |
| `INVALID_RANGE`, `INVALID_SETTINGS`, `INVALID_TIMEZONE`, `RANGE_TOO_LARGE`, `INVALID_FEED` | 400    | Die Anfrage ist fehlerhaft oder ein Wert ist ungültig.                         |
| `FORBIDDEN`                                                                                | 403    | Das dürfen Sie nicht.                                                          |
| `RESERVATION_NOT_FOUND`, `RESOURCE_NOT_FOUND`, `FEED_NOT_FOUND`                            | 404    | Das Objekt existiert nicht (oder Sie dürfen es nicht sehen).                   |

> [!NOTE]
> Plugin-Routen erscheinen in der **Laufzeit**-OpenAPI-Dokumentation einer laufenden Instanz unter `/api`. Sie sind
> **nicht** Teil der exportierten Swagger-Datei und des generierten API-Clients, die ohne Plugins gebaut werden.
