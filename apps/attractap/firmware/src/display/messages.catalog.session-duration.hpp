#pragma once

#include "messages.catalog.bt-setup.hpp"

// Texts for the session duration (ATT-43): the estimate input shown before a start on a machine that requires one,
// the remaining time and the extension of a running session. They follow the Bluetooth setup texts in the Message
// enum, in this order.
namespace FirmwareI18n {
inline constexpr Entry sessionDurationCatalog[] = {
    {Message::DurationTitle, "Wie lange nutzen Sie die Maschine?", "How long will you use the machine?"},
    {Message::DurationHint, "Die Maschine stoppt automatisch spätestens nach dieser Zeit. Sie können verlängern, solange sie läuft.", "The machine will stop automatically after this time at the latest. You can extend while it runs."},
    // {0}: the longest allowed time ("8 h").
    {Message::DurationMaxLine, "Maximale Sitzungsdauer: {0}", "Maximum session time: {0}"},
    {Message::DurationHours, "{0} h", "{0} h"},
    {Message::DurationMinutes, "{0} min", "{0} min"},
    {Message::DurationHoursMinutes, "{0} h {1} min", "{0} h {1} min"},
    {Message::DurationHoursLabel, "Stunden", "Hours"},
    {Message::DurationMinutesLabel, "Minuten", "Minutes"},
    {Message::ExtendSession, "Verlängern", "Extend"},
    // {0}: the local clock time ("17:30").
    {Message::ExtendStopsAt, "Stoppt um {0}", "Stops at {0}"},
    {Message::ExtendToMax, "Auf Maximum verlängern", "Extend to maximum"},
    {Message::ExtendMaxReached, "Maximale Sitzungsdauer erreicht", "Maximum session time reached"},
    {Message::ExtendStep, "+{0} h", "+{0} h"},
    {Message::ExtendingSession, "Sitzung wird verlängert", "Extending session"},
    // {0}: the time left; {1}: the local clock time (absent while the reader has no clock).
    {Message::AutoEndLine, "Stoppt automatisch in {0}", "Stops automatically in {0}"},
    {Message::AutoEndLineAt, "Stoppt automatisch in {0} (um {1})", "Stops automatically in {0} (at {1})"},
    {Message::ErrorExtensionExceedsMaximum, "Das überschreitet die maximale Sitzungsdauer", "That exceeds the maximum session time"},
    {Message::ErrorExtensionNotPossible, "Verlängern ist nicht möglich", "Extending is not possible"},
    {Message::ErrorEstimateExceedsMaximum, "Die Zeit überschreitet die maximale Sitzungsdauer", "The time exceeds the maximum session time"},
    {Message::ErrorEstimateRequired, "Bitte eine Nutzungsdauer angeben", "Please enter how long you will use it"},
};
static_assert(sizeof(catalog) / sizeof(Entry) + sizeof(cardRelayCatalog) / sizeof(Entry) +
                      sizeof(networkStatusCatalog) / sizeof(Entry) + sizeof(sessionUsersCatalog) / sizeof(Entry) +
                      sizeof(btSetupCatalog) / sizeof(Entry) + sizeof(sessionDurationCatalog) / sizeof(Entry) ==
                  static_cast<size_t>(Message::Count),
              "every firmware message needs a catalog entry, in enum order");
} // namespace FirmwareI18n
