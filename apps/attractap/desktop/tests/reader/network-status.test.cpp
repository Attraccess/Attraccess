#include "workflow.hpp"

#include <functional>

// ATT-1273: the network status opens from the maintenance drawer behind the device PIN and shows
// the live network quality in the reader's language. Unlike the connection settings it keeps the
// reader connected, so its values follow the connection while it is open.
void ReaderWorkflow::testNetworkStatus()
{
    const auto setLanguage = [&](const char *language) {
        server.push("READER_LANGUAGE", std::string("{\"language\":\"") + language + "\"}");
        pump();
        assert(State::getActiveLanguage() == language);
    };
    const auto row = [](const char *caption) {
        auto *found = requireLabel(lv_screen_active(), caption);
        return std::string(lv_label_get_text(lv_obj_get_child(lv_obj_get_parent(found), 1)));
    };
    const auto findAll = [](const lv_obj_class_t *type) {
        std::vector<lv_obj_t *> found;
        std::function<void(lv_obj_t *)> walk = [&](lv_obj_t *object) {
            if (lv_obj_check_type(object, type)) found.push_back(object);
            for (uint32_t i = 0; i < lv_obj_get_child_count(object); ++i) walk(lv_obj_get_child(object, i));
        };
        walk(lv_screen_active());
        return found;
    };
    const auto enterPin = [&](const std::string &pin) {
        auto areas = findAll(&lv_textarea_class);
        auto keyboards = findAll(&lv_keyboard_class);
        assert(areas.size() == 1 && keyboards.size() == 1);
        lv_textarea_set_text(areas.front(), pin.c_str());
        lv_obj_send_event(keyboards.front(), LV_EVENT_READY, nullptr);
        pump();
    };
    const auto openFromDrawer = [&] {
        display.touch = {240, 10, true}; pump();
        display.touch = {240, 150, true}; pump();
        display.touch.pressed = false; pump();
        assert(drawerOpen());
        click(FirmwareI18n::messageText(FirmwareI18n::Message::NetworkStatusShort, State::getActiveLanguage()), true);
        assert(Display::isActive(&Display::networkStatusScreen));
    };
    const std::string previousLanguage = State::getActiveLanguage();
    const unsigned disablesBefore = server.connectionDisables;
    setLanguage("en");
    // Nothing measured yet: the quality is known, the samples are not.
    State::NetworkQualityState unmeasured;
    unmeasured.quality = State::NETWORK_QUALITY_OFFLINE;
    State::setNetworkQualityState(unmeasured);

    auto *origin = lv_screen_active();
    openFromDrawer();
    assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Network status")));
    // The PIN overlay covers the values until the device PIN is entered.
    auto *pinOverlay = requireLabel(lv_screen_active(), "Unlock with PIN");
    assert(lv_obj_is_visible(pinOverlay));
    while (lv_obj_get_parent(pinOverlay) != lv_screen_active()) pinOverlay = lv_obj_get_parent(pinOverlay);
    assert(lv_obj_get_index(pinOverlay) == static_cast<int32_t>(lv_obj_get_child_count(lv_screen_active())) - 1);
    display.capture(output, "net-status-pin");
    enterPin(Settings::getDeviceConfig().passCode);
    assert(!lv_obj_is_visible(pinOverlay));
    // Opening it does not stop the connection, unlike the connection settings.
    assert(server.connectionDisables == disablesBefore);

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

    // The server's language switch reaches the open screen: title, captions and values.
    setLanguage("de");
    assert(Display::isActive(&Display::networkStatusScreen));
    assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Netzwerkstatus")));
    assert(row("Verbindungsqualität") == "Eingeschränkt");
    assert(row("Ping-Verlust (1 Min.)") == "33 %");
    assert(row("Zeit seit letzter Nachricht") == "1450 ms");
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

    // Back returns to the screen it was opened on.
    click(LV_SYMBOL_LEFT);
    pump(100);
    assert(lv_screen_active() == origin);

    // Reopening asks for the PIN again. A dropped connection keeps the screen up, so the drop can
    // be watched; the init screen follows once it is closed.
    openFromDrawer();
    assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Unlock with PIN")));
    enterPin(Settings::getDeviceConfig().passCode);
    State::setWebsocketState(false, "reader.test", 80, false);
    setQuality(State::NETWORK_QUALITY_OFFLINE);
    pump(1100);
    assert(Display::isActive(&Display::networkStatusScreen));
    assert(row("Connection quality") == "Offline");
    click(LV_SYMBOL_LEFT);
    pump(100);
    assert(Display::isActive(&Display::initScreen));

    State::setWebsocketState(true, "reader.test", 80, false);
    setQuality(State::NETWORK_QUALITY_GOOD);
    State::setApiState(true, "Test reader"); list(false); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    setLanguage(previousLanguage.c_str());
}
