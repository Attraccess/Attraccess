#pragma once

#include "messages.catalog.session-users.hpp"

// Texts for the Bluetooth setup on a Touch screen (ATT-1371, src/bt_setup): the button that opens a window and the
// status line while one is open. They follow the session users texts in the Message enum, in this order.
namespace FirmwareI18n {
inline constexpr Entry btSetupCatalog[] = {
    {Message::BluetoothSetup, "Bluetooth-Einrichtung", "Bluetooth setup"},
    // {0}: the time left (mm:ss), {1}: the advertised name the user picks in the browser ("Attractap Touch 71C8"), on
    // a line of its own so it is never cut off.
    {Message::BluetoothSetupOpen, "Bluetooth-Einrichtung offen · {0}\n{1}", "Bluetooth setup open · {0}\n{1}"},
    {Message::BluetoothSetupLinked, "Bluetooth-Einrichtung: Browser verbunden", "Bluetooth setup: browser connected"},
    {Message::BluetoothSetupUnavailable, "Bluetooth nicht verfügbar", "Bluetooth unavailable"},
};
static_assert(sizeof(catalog) / sizeof(Entry) + sizeof(cardRelayCatalog) / sizeof(Entry) +
                      sizeof(networkStatusCatalog) / sizeof(Entry) + sizeof(sessionUsersCatalog) / sizeof(Entry) +
                      sizeof(btSetupCatalog) / sizeof(Entry) ==
                  static_cast<size_t>(Message::Count),
              "every firmware message needs a catalog entry, in enum order");
} // namespace FirmwareI18n
