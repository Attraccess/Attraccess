#pragma once

#include "messages.catalog.network-status.hpp"

// Texts for the users caption of parallel-session machines on the resource list and the lock screen:
// "Du, Sam +2 · 4/6" (own session first, then the rest, then the count). They follow the network status
// texts in the Message enum, in this order.
namespace FirmwareI18n {
inline constexpr Entry sessionUsersCatalog[] = {
    {Message::SessionYou, "Du", "You"},
    {Message::SessionNameJoin, "{0}, {1}", "{0}, {1}"},
    {Message::SessionNamesMore, "{0} +{1}", "{0} +{1}"},
    {Message::SessionUsersLine, "{0} · {1}", "{0} · {1}"},
    {Message::SessionCountOf, "{0}/{1}", "{0}/{1}"},
};
static_assert(sizeof(catalog) / sizeof(Entry) + sizeof(cardRelayCatalog) / sizeof(Entry) +
                      sizeof(networkStatusCatalog) / sizeof(Entry) + sizeof(sessionUsersCatalog) / sizeof(Entry) ==
                  static_cast<size_t>(Message::Count),
              "every firmware message needs a catalog entry, in enum order");
} // namespace FirmwareI18n
