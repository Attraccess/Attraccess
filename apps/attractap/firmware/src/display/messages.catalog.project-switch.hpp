#pragma once

#include "messages.catalog.secure-conversion.hpp"

// Texts for switching the project of a running session (ATT-1421). They follow the secure conversion texts in the
// Message enum, in this order, and close it.
namespace FirmwareI18n {
inline constexpr Entry projectSwitchCatalog[] = {
    {Message::ChangeProject, "Projekt wechseln", "Change project"},
    {Message::NoProject, "Kein Projekt", "No project"},
    // {0}: the project the running session is booked to.
    {Message::CurrentProjectLine, "Projekt: {0}", "Project: {0}"},
    {Message::SwitchingProject, "Projekt wird gewechselt", "Switching project"},
    {Message::ProjectChanged, "Projekt gewechselt", "Project changed"},
    {Message::PleaseCompleteBeforeSwitchingProject, "Bitte vor dem Wechsel ausfüllen", "Please complete before switching"},
    {Message::ErrorMeterSwitchFailed, "Zähler nicht lesbar. Projekt unverändert.", "Meter not readable. Project unchanged."},
    {Message::ProjectNotChanged, "Projekt nicht gewechselt", "Project not changed"},
};
static_assert(sizeof(catalog) / sizeof(Entry) + sizeof(cardRelayCatalog) / sizeof(Entry) +
                      sizeof(networkStatusCatalog) / sizeof(Entry) + sizeof(sessionUsersCatalog) / sizeof(Entry) +
                      sizeof(btSetupCatalog) / sizeof(Entry) + sizeof(sessionDurationCatalog) / sizeof(Entry) +
                      sizeof(formImagesCatalog) / sizeof(Entry) + sizeof(secureConversionCatalog) / sizeof(Entry) +
                      sizeof(projectSwitchCatalog) / sizeof(Entry) ==
                  static_cast<size_t>(Message::Count),
              "every firmware message needs a catalog entry, in enum order");
} // namespace FirmwareI18n
