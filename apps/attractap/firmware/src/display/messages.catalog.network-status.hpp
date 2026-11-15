#pragma once

#include "messages.catalog.card-relay.hpp"

// Texts for the Status tab of the connection configuration screen (ATT-1273). They follow the
// card relay texts in the Message enum, in this order.
namespace FirmwareI18n {
inline constexpr Entry networkStatusCatalog[] = {
    {Message::NetworkStatusTab, "Status", "Status"},
    {Message::ConnectionQuality, "Verbindungsqualität", "Connection quality"},
    {Message::ConnectionQualityGood, "Gut", "Good"},
    {Message::ConnectionQualityDegraded, "Eingeschränkt", "Degraded"},
    {Message::ConnectionQualityOffline, "Offline", "Offline"},
    {Message::LastMessageAge, "Zeit seit letzter Nachricht", "Time since last message"},
    {Message::LatestPing, "Letzter Ping", "Latest ping"},
    {Message::AveragePing, "Durchschnittlicher Ping", "Average ping"},
    {Message::PingTrend, "Ping-Trend", "Ping trend"},
    {Message::ReconnectsLastMinute, "Neuverbindungen (1 Min.)", "Reconnects (1 min)"},
    {Message::SendQueueDepth, "Sendewarteschlange", "Send queue"},
    {Message::SendQueueFullLastMinute, "Warteschlange voll (1 Min.)", "Queue full (1 min)"},
    {Message::SendFailuresLastMinute, "Sendefehler (1 Min.)", "Send failures (1 min)"},
    {Message::ConnectionTimeoutsLastMinute, "Verbindungs-Timeouts (1 Min.)", "Connection timeouts (1 min)"},
    {Message::PingTimeoutsLastMinute, "Ping-Timeouts (1 Min.)", "Ping timeouts (1 min)"},
    {Message::PingLossLastMinute, "Ping-Verlust (1 Min.)", "Ping loss (1 min)"},
    {Message::MissedHeartbeatsLastMinute, "Verpasste Heartbeats (1 Min.)", "Missed heartbeats (1 min)"},
    {Message::NotAvailable, "Nicht verfügbar", "Not available"},
    {Message::Milliseconds, "{0} ms", "{0} ms"},
    {Message::Percent, "{0} %", "{0}%"},
};
static_assert(sizeof(catalog) / sizeof(Entry) + sizeof(cardRelayCatalog) / sizeof(Entry) +
                      sizeof(networkStatusCatalog) / sizeof(Entry) ==
                  static_cast<size_t>(Message::Count),
              "every firmware message needs a catalog entry, in enum order");
} // namespace FirmwareI18n
