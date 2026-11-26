#pragma once

#include "messages.catalog.form-images.hpp"

// Texts of the "Secure this reader" conversion screen (ATT-1208, src/display/screens/secureConversion). They follow
// the image form field texts in the Message enum, in this order.
namespace FirmwareI18n {
inline constexpr Entry secureConversionCatalog[] = {
    {Message::SecureConversionTitle, "Reader wird gesichert", "Securing this reader"},
    {Message::SecureConversionTransfer, "Sichere Firmware wird übertragen", "Transferring the secure firmware"},
    {Message::SecureConversionVerify, "Firmware wird geprüft", "Checking the firmware"},
    {Message::SecureConversionBurn, "Sicherheitsschlüssel werden geschrieben", "Writing the security keys"},
    {Message::SecureConversionBootloader, "Sicherer Bootloader wird geschrieben", "Writing the secure bootloader"},
    {Message::SecureConversionDontUnplug, "Nicht abstecken!", "Don't unplug!"},
    // Shown while the bootloader is written and the reader restarts into flash encryption (brick window 2).
    {Message::SecureConversionRestartHint, "Neustart und Verschlüsselung dauern einige Minuten.", "Restart and encryption take a few minutes."},
};
static_assert(sizeof(catalog) / sizeof(Entry) + sizeof(cardRelayCatalog) / sizeof(Entry) +
                      sizeof(networkStatusCatalog) / sizeof(Entry) + sizeof(sessionUsersCatalog) / sizeof(Entry) +
                      sizeof(btSetupCatalog) / sizeof(Entry) + sizeof(sessionDurationCatalog) / sizeof(Entry) +
                      sizeof(formImagesCatalog) / sizeof(Entry) + sizeof(secureConversionCatalog) / sizeof(Entry) ==
                  static_cast<size_t>(Message::Count),
              "every firmware message needs a catalog entry, in enum order");
} // namespace FirmwareI18n
