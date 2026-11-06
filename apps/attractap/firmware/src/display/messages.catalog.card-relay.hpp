#pragma once

#include "messages.catalog.hpp"

// Texts for the card relay: errors the server reports while it runs enrollment, reset and sign-in
// against a card. They follow the main catalog in the Message enum, in this order.
namespace FirmwareI18n {
inline constexpr Entry cardRelayCatalog[] = {
    {Message::ErrorCardAuthenticationFailed, "Karte konnte nicht bestätigt werden", "Card could not be verified"},
    {Message::ErrorCardNotSupported, "Karte wird nicht unterstützt", "Card is not supported"},
    {Message::ErrorServerBusy, "Server ausgelastet, bitte erneut versuchen", "Server busy, please try again"},
    {Message::ErrorCardRemoved, "Karte zu früh entfernt", "Card removed too early"},
    {Message::ErrorCardTimeout, "Keine Antwort von der Karte", "No response from the card"},
    {Message::ErrorEnrollNotConfirmed, "Karte nicht bestätigt, bitte erneut auflegen", "Card not confirmed, please tap it again"},
    {Message::ErrorNoFreeKeySlot, "Kein freier Schlüsselplatz auf der Karte", "No free key slot on the card"},
    {Message::ErrorCardNotFactory, "Karte ist bereits anderweitig eingerichtet", "Card is already set up elsewhere"},
    {Message::ErrorResetNotConfirmed, "Zurücksetzen nicht bestätigt, bitte erneut auflegen", "Reset not confirmed, please tap the card again"},
    {Message::ErrorWrongCard, "Das ist nicht die ausgewählte Karte", "This is not the selected card"},
    {Message::ErrorCardKeyUnavailable, "Kartenschlüssel nicht verfügbar", "Card key unavailable"},
    {Message::ErrorFirmwareUpdateRequired, "Firmware-Update erforderlich", "Firmware update required"},
    {Message::ErrorReaderNotAllowedToWriteCards, "Dieser Reader darf keine Karten registrieren", "This reader may not enroll cards"},
    {Message::ErrorCardOperationExpired, "Zeit abgelaufen, bitte erneut starten", "Timed out, please start again"},
};
static_assert(sizeof(catalog) / sizeof(Entry) + sizeof(cardRelayCatalog) / sizeof(Entry) == static_cast<size_t>(Message::Count),
              "every firmware message needs a catalog entry, in enum order");
} // namespace FirmwareI18n
