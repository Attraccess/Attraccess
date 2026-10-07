#include "utils.hpp"
#include <string>
#include <cstdio>
#include <cstring>
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "platform.hpp"

std::string translateReaderError(const std::string &errorKey)
{
    // Card / enrollment errors
    if (errorKey == "USER_NOT_SET")
        return "Kein Benutzer ausgewählt";
    if (errorKey == "INVALID_PARAMS")
        return "Ungültige Anfrage";
    if (errorKey == "CARD_ALREADY_ENROLLED")
        return "Karte ist bereits registriert";
    if (errorKey == "ENROLL_NEW_CARD_DATA_NOT_SET")
        return "Registrierungsdaten fehlen";
    if (errorKey == "KEY_NOT_SET")
        return "Schlüssel fehlt";
    if (errorKey == "USER_NOT_FOUND")
        return "Benutzer nicht gefunden";
    if (errorKey == "RESET_NFC_CARD_DATA_NOT_SET")
        return "Daten zum Zurücksetzen fehlen";
    if (errorKey == "INVALID_UID")
        return "Ungültige Karten-UID";
    if (errorKey == "CARD_NOT_FOUND")
        return "Karte nicht gefunden";
    if (errorKey == "CARD_NOT_ACTIVE")
        return "Karte ist nicht aktiv";

    // Resource usage / session errors
    if (errorKey == "INVALID_RESOURCE_ID")
        return "Ungültige Ressource";
    if (errorKey == "READER_NOT_FOUND")
        return "Leser nicht gefunden";
    if (errorKey == "RESOURCE_NOT_ASSOCIATED_WITH_READER")
        return "Ressource ist diesem Leser nicht zugeordnet";
    if (errorKey == "USER_NOT_AUTHENTICATED")
        return "Nicht angemeldet";
    if (errorKey == "INSUFFICIENT_BALANCE")
        return "Guthaben reicht nicht aus";

    // Billing / top-up errors
    if (errorKey == "SUMUP_NOT_ENABLED")
        return "Bezahlung nicht aktiviert";
    if (errorKey == "INVALID_AMOUNT")
        return "Ungültiger Betrag";
    if (errorKey == "NO_SUMUP_TERMINALS_AVAILABLE")
        return "Kein Zahlungsterminal verfügbar";
    if (errorKey == "SUMUP_TOPUP_FAILED")
        return "Aufladung fehlgeschlagen";

    // Unknown key or free-form server message: surface the raw value so the
    // information is not lost (e.g. door errors sent as free-form text).
    return errorKey;
}
