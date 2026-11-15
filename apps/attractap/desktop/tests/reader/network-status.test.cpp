#include "workflow.hpp"

// ATT-1273: the Status tab of the connection configuration screen shows the live
// network quality, behind the PIN lock, in the reader's language.
void ReaderWorkflow::testNetworkStatusTab()
{
    const auto setLanguage = [&](const char *language) {
        server.push("READER_LANGUAGE", std::string("{\"language\":\"") + language + "\"}");
        api.loop(); Display::loop();
        assert(State::getActiveLanguage() == language);
    };
    const auto row = [](const char *caption) {
        auto *found = requireLabel(lv_screen_active(), caption);
        return std::string(lv_label_get_text(lv_obj_get_child(lv_obj_get_parent(found), 1)));
    };
    const std::string previousLanguage = State::getActiveLanguage();
    setLanguage("en");
    // Nothing measured yet: the quality is known, the samples are not.
    State::NetworkQualityState unmeasured;
    unmeasured.quality = State::NETWORK_QUALITY_OFFLINE;
    State::setNetworkQualityState(unmeasured);

    Display::connectionConfigurationScreen.enablePinLock();
    Display::transitionToScreen(&Display::connectionConfigurationScreen);
    Display::loop();
    auto *tabs = lv_obj_get_child(lv_screen_active(), 0);
    assert(lv_obj_check_type(tabs, &lv_tabview_class));
    assert(lv_tabview_get_tab_count(tabs) == 4);
    auto *statusTab = lv_obj_get_child(lv_tabview_get_tab_bar(tabs), 3);
    assert(std::strcmp(lv_label_get_text(lv_obj_get_child(statusTab, 0)), "Status") == 0);
    lv_tabview_set_active(tabs, 3, LV_ANIM_OFF);
    Display::loop();
    // The PIN overlay covers the Status tab like the other tabs.
    auto *pinOverlay = requireLabel(lv_screen_active(), "Unlock with PIN");
    assert(lv_obj_is_visible(pinOverlay));
    while (lv_obj_get_parent(pinOverlay) != lv_screen_active()) pinOverlay = lv_obj_get_parent(pinOverlay);
    assert(lv_obj_get_index(pinOverlay) > lv_obj_get_index(tabs));
    Display::connectionConfigurationScreen.disablePinLock();
    Display::loop();

    assert(row("Connection quality") == "Offline");
    for (const char *caption : {"Time since last message", "Latest ping", "Average ping", "Ping trend", "Ping loss (1 min)"})
        assert(row(caption) == "Not available");
    assert(row("Reconnects (1 min)") == "0" && row("Send queue") == "0");

    // A degraded connection appears after the next refresh, at most a second later.
    State::NetworkQualityState degraded;
    degraded.quality = State::NETWORK_QUALITY_DEGRADED;
    degraded.lastInboundAgeMs = 1450;
    degraded.hasInboundMessage = true;
    degraded.lastPongRttMs = 2140;
    degraded.averagePongRttMs = 1870;
    degraded.pongRttTrendMs = 12;
    degraded.hasPongRttSample = true;
    degraded.reconnectsLastMinute = 2;
    degraded.txQueueDepth = 3;
    degraded.txQueueFullEventsLastMinute = 1;
    degraded.sendFailuresLastMinute = 4;
    degraded.livenessTimeoutsLastMinute = 5;
    degraded.pongTimeoutsLastMinute = 6;
    degraded.pongProbeLossPercentLastMinute = 33;
    degraded.hasCompletedPongProbe = true;
    degraded.missedHeartbeatsLastMinute = 7;
    State::setNetworkQualityState(degraded);
    pump(1100);
    assert(row("Connection quality") == "Degraded");
    assert(row("Time since last message") == "1450 ms");
    assert(row("Latest ping") == "2140 ms" && row("Average ping") == "1870 ms");
    assert(row("Ping trend") == "+12 ms");
    assert(row("Reconnects (1 min)") == "2" && row("Send queue") == "3" && row("Queue full (1 min)") == "1");
    assert(row("Send failures (1 min)") == "4" && row("Connection timeouts (1 min)") == "5");
    assert(row("Ping timeouts (1 min)") == "6" && row("Ping loss (1 min)") == "33%");
    assert(row("Missed heartbeats (1 min)") == "7");
    display.capture(output, "net-status-degraded-english");

    // The language switch re-renders captions and values, the tab title included.
    setLanguage("de");
    assert(row("Verbindungsqualität") == "Eingeschränkt");
    assert(row("Ping-Verlust (1 Min.)") == "33 %");
    assert(row("Zeit seit letzter Nachricht") == "1450 ms");
    assert(std::strcmp(lv_label_get_text(lv_obj_get_child(statusTab, 0)), "Status") == 0);
    assert(label(lv_screen_active(), "Gerät"));
    display.capture(output, "net-status-degraded-german");

    State::NetworkQualityState good = degraded;
    good.quality = State::NETWORK_QUALITY_GOOD;
    good.lastPongRttMs = 24;
    good.averagePongRttMs = 31;
    good.pongRttTrendMs = -7;
    good.reconnectsLastMinute = good.txQueueDepth = good.txQueueFullEventsLastMinute = 0;
    good.sendFailuresLastMinute = good.livenessTimeoutsLastMinute = good.pongTimeoutsLastMinute = 0;
    good.pongProbeLossPercentLastMinute = good.missedHeartbeatsLastMinute = 0;
    good.hasInboundMessage = false;
    State::setNetworkQualityState(good);
    pump(1100);
    assert(row("Verbindungsqualität") == "Gut");
    assert(row("Letzter Ping") == "24 ms" && row("Ping-Trend") == "-7 ms");
    assert(row("Zeit seit letzter Nachricht") == "Nicht verfügbar");
    display.capture(output, "net-status-good-german");
    setLanguage("en");
    assert(row("Connection quality") == "Good" && row("Ping loss (1 min)") == "0%");
    display.capture(output, "net-status-good-english");

    // Leaving the screen unloads it; reopening starts from the current state.
    setQuality(State::NETWORK_QUALITY_GOOD);
    setLanguage(previousLanguage.c_str());
    Display::transitionToScreen(&Display::resourceListScreen); pump(1100);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
}
