#pragma once

#include "messages.catalog.secure-conversion.hpp"

// Texts of maintenance requests on the reader: "Report a problem", the "Is the machine OK?" check before a session
// ends (src/display/screens/maintenance) and what became of the request. They follow the secure conversion texts in
// the Message enum, in this order.
namespace FirmwareI18n {
inline constexpr Entry maintenanceCatalog[] = {
    {Message::ReportProblem, "Problem melden", "Report a problem"},
    {Message::MaintenanceCheckTitle, "Ist die Maschine in Ordnung?", "Is the machine OK?"},
    {Message::MaintenanceCheckHint, "Bevor die Sitzung endet: Muss die Maschine gewartet werden?", "Before your session ends: does the machine need maintenance?"},
    {Message::MaintenanceMachineOk, "Maschine ist in Ordnung", "Machine is OK"},
    {Message::MaintenanceNeeded, "Wartung nötig", "Needs maintenance"},
    {Message::MaintenanceReasonTitle, "Was ist das Problem?", "What's wrong?"},
    {Message::MaintenanceReasonPlaceholder, "z.B. Der Not-Aus-Schalter klemmt", "e.g. The emergency stop button is stuck"},
    {Message::MaintenanceSend, "Senden", "Send"},
    {Message::SendingReport, "Meldung wird gesendet", "Sending report"},
    {Message::MaintainersNotified, "Wartungsteam benachrichtigt", "Maintainers have been notified"},
    {Message::ReportNotSent, "Meldung nicht gesendet", "Report not sent"},
    {Message::ReportNotSentAfterStop, "Meldung nicht gesendet. Bitte erneut melden.", "Report not sent. Please report it again."},
};
static_assert(sizeof(catalog) / sizeof(Entry) + sizeof(cardRelayCatalog) / sizeof(Entry) +
                      sizeof(networkStatusCatalog) / sizeof(Entry) + sizeof(sessionUsersCatalog) / sizeof(Entry) +
                      sizeof(btSetupCatalog) / sizeof(Entry) + sizeof(sessionDurationCatalog) / sizeof(Entry) +
                      sizeof(formImagesCatalog) / sizeof(Entry) + sizeof(secureConversionCatalog) / sizeof(Entry) +
                      sizeof(maintenanceCatalog) / sizeof(Entry) ==
                  static_cast<size_t>(Message::Count),
              "every firmware message needs a catalog entry, in enum order");
} // namespace FirmwareI18n
