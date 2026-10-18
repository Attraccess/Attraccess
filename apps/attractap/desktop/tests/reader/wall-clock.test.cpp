#include "workflow.hpp"
#include "api/demo/clock.hpp"
#include "display/shared/wallClockText.hpp"
#include "../controlled-clock.hpp"

namespace
{
std::string expectedClock(int32_t offsetMinutes)
{
    const time_t local = time(nullptr) + offsetMinutes * 60;
    tm parts{};
    gmtime_r(&local, &parts);
    char text[8];
    std::snprintf(text, sizeof(text), "%02d:%02d", parts.tm_hour, parts.tm_min);
    return text;
}

std::string serverTime(int32_t offsetMinutes)
{
    return R"({"epochMs":)" + std::to_string(static_cast<int64_t>(time(nullptr)) * 1000) +
           R"(,"utcOffsetMinutes":)" + std::to_string(offsetMinutes) + "}";
}

// Accept either side of a minute boundary crossed while the UI refreshed.
bool showsClock(lv_obj_t *root, int32_t offsetMinutes, const std::string &before)
{
    return label(root, before.c_str()) || label(root, expectedClock(offsetMinutes).c_str());
}
}

void ReaderWorkflow::testWallClock()
{
    click("Abmelden");
    list(false);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    // No server sample yet: the signed-out list keeps its logo, nothing shows a time.
    assert(!WallClock::now().valid);
    // Reuse an idle lockscreen that was created before synchronization.
    Display::lockscreen.init();
    for (int weekday = 0; weekday < 7; ++weekday)
        assert(!label(lv_screen_active(), FirmwareI18n::messageText(WallClockText::weekday(WallClock::LocalTime{true, 2026, 10, 10, weekday}), State::getActiveLanguage())));
    display.capture(output, "wall-clock-01-unknown");

    // Heartbeat replies carry the server clock at the top level.
    auto before = expectedClock(120);
    server.incoming.push(R"({"event":"HEARTBEAT","serverTime":)" + serverTime(120) + "}");
    pump();
    assert(WallClock::now().valid);
    assert(showsClock(lv_screen_active(), 120, before));
    assert(label(lv_screen_active(), FirmwareI18n::messageText(WallClockText::weekday(WallClock::now()), State::getActiveLanguage())));
    display.capture(output, "wall-clock-02-list");

    // Authentication applies the server timezone too, e.g. a non-hour offset.
    before = expectedClock(-210);
    server.push("READER_AUTHENTICATED", R"({"name":"Test reader","language":"de","serverTime":)" + serverTime(-210) + "}");
    list(false);
    assert(showsClock(lv_screen_active(), -210, before));

    // Implausible samples (old/future clocks, impossible offsets) are ignored.
    server.incoming.push(R"({"event":"HEARTBEAT","serverTime":{"epochMs":1000,"utcOffsetMinutes":60}})");
    // JSON numbers can exceed int64_t, including the rounded upper boundary.
    for (const char *epoch : {"1e30", "-1e30", "9223372036854775808", "-9223372036854777856", "1e999"})
        server.incoming.push(std::string(R"({"event":"HEARTBEAT","serverTime":{"epochMs":)") + epoch +
                             R"(,"utcOffsetMinutes":60}})");
    // These future epochs fit int64_t; the wall-clock range must reject them
    // before changing the existing timezone, even though the host has synced.
    for (const char *epoch : {"4102444800000", "4102444800001", "9000000000000000000"})
        server.incoming.push(std::string(R"({"event":"HEARTBEAT","serverTime":{"epochMs":)") + epoch +
                             R"(,"utcOffsetMinutes":60}})");
    server.incoming.push(R"({"event":"HEARTBEAT","serverTime":{"epochMs":)" +
                         std::to_string(static_cast<int64_t>(time(nullptr)) * 1000) + R"(,"utcOffsetMinutes":900}})");
    server.incoming.push(R"({"event":"HEARTBEAT","serverTime":{"epochMs":)" +
                         std::to_string(static_cast<int64_t>(time(nullptr)) * 1000) +
                         R"(,"utcOffsetMinutes":-2147483648}})");
    pump();
    assert(showsClock(lv_screen_active(), -210, before));

    // A powered outage keeps ticking with the last server offset. Reconnection
    // changes the offset on the first online heartbeat, without changing UTC.
    State::setWebsocketState(false, "reader.test", 80, false);
    pump();
    const auto disconnectedUtc = time(nullptr);
    TestClock::set(disconnectedUtc + 3600);
    before = expectedClock(-210);
    pump();
    assert(!State::getApiState().authenticated);
    // The existing router shows InitScreen offline; clock state still advances.
    assert(WallClock::now().valid);
    assert(WallClockText::clock(WallClock::now()) == expectedClock(-210));
    State::setWebsocketState(true, "reader.test", 80, false);
    server.push("READER_AUTHENTICATED", R"({"name":"Test reader","language":"de"})");
    server.incoming.push(R"({"event":"HEARTBEAT","serverTime":)" + serverTime(60) + "}");
    before = expectedClock(60);
    list(false);
    assert(State::getApiState().authenticated);
    assert(time(nullptr) >= disconnectedUtc + 3600 && time(nullptr) < disconnectedUtc + 3605);
    assert(showsClock(lv_screen_active(), 60, before));

    // The idle lockscreen becomes the wall clock; the sign-in sentence gives way to a prompt.
    // A loaded lockscreen must be current on its first frame after selection,
    // even if a busy loop leaves no time for another screen-loop tick.
    pump();
    auto *resourceButton = lv_obj_get_parent(label(lv_screen_active(), "Lasercutter"));
    assert(!lv_obj_has_state(resourceButton, LV_STATE_DISABLED));
    lv_obj_send_event(resourceButton, LV_EVENT_CLICKED, nullptr);
    application.loop();
    lv_timer_handler();
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    assert(showsClock(lv_screen_active(), 60, before));
    assert(lv_obj_is_visible(label(lv_screen_active(), "RFID-Karte auflegen")));
    assert(!lv_obj_is_visible(label(lv_screen_active(), "Bitte mit RFID \n        Karte/Tag anmelden")));
    display.capture(output, "wall-clock-03-lockscreen");

    // This is a signed-out sign-in screen even when the resource is in use.
    // Updating its status within the same minute keeps the clock and RFID prompt.
    Display::lockscreen.setUsageInfo(true, "Müller", false);
    lv_refr_now(nullptr);
    assert(lv_obj_is_visible(label(lv_screen_active(), "In Verwendung: Müller")));
    assert(showsClock(lv_screen_active(), 60, before));
    assert(lv_obj_is_visible(label(lv_screen_active(), "RFID-Karte auflegen")));
    display.capture(output, "wall-clock-03a-in-use-lockscreen");
    Display::lockscreen.setUsageInfo(false, "", false);

    // Returning without resource/user updates must refresh the cached list's
    // first frame, before another Display::loop() can tick its clock.
    auto *cachedList = Display::resourceListScreen.getScreen();
    assert(cachedList);
    TestClock::set(time(nullptr) + 120);
    before = expectedClock(60);
    auto *backButton = lv_obj_get_parent(label(lv_screen_active(), LV_SYMBOL_LEFT));
    lv_obj_send_event(backButton, LV_EVENT_CLICKED, nullptr);
    // Activate before the router retires the old list. No setter or loop runs.
    Display::transitionToScreen(&Display::resourceListScreen);
    lv_refr_now(nullptr);
    assert(lv_screen_active() == cachedList);
    assert(showsClock(lv_screen_active(), 60, before));
    display.capture(output, "wall-clock-03b-cached-list-first-frame");

    // Reactivate the cached lockscreen without resource setters or a loop tick.
    // Its first frame must reflect the time that elapsed while it was hidden.
    auto *cachedLockscreen = Display::lockscreen.getScreen();
    assert(cachedLockscreen);
    TestClock::set(time(nullptr) + 120);
    before = expectedClock(60);
    Display::transitionToScreen(&Display::lockscreen);
    lv_refr_now(nullptr);
    assert(lv_screen_active() == cachedLockscreen);
    assert(showsClock(lv_screen_active(), 60, before));
    display.capture(output, "wall-clock-03c-cached-lockscreen-first-frame");
    Display::transitionToScreen(&Display::resourceListScreen);
    application.loop();

    // Demo setup also makes a deliberate historical preset visible on the
    // production idle screen, without passing the network plausibility gate.
    const auto restoredUtc = time(nullptr);
    TestClock::set(1704067200); // 2024-01-01T00:00:00Z
    const auto presetUtc = time(nullptr);
    tm presetLocal{};
    localtime_r(&presetUtc, &presetLocal);
    const WallClock::LocalTime expectedPreset{true, presetLocal.tm_year + 1900,
        presetLocal.tm_mon + 1, presetLocal.tm_mday, presetLocal.tm_wday,
        presetLocal.tm_hour, presetLocal.tm_min};
    DemoClock::initialize();
    pump();
    assert(time(nullptr) >= presetUtc && time(nullptr) < presetUtc + 5);
    assert(WallClock::now().valid && WallClock::now().year == expectedPreset.year);
    assert(label(lv_screen_active(), WallClockText::clock(expectedPreset).c_str()));
    assert(label(lv_screen_active(), WallClockText::date(expectedPreset, true).render(State::getActiveLanguage()).c_str()));
    display.capture(output, "wall-clock-04-demo-preset-2024");
    TestClock::set(restoredUtc);
    WallClock::onServerTime(static_cast<int64_t>(restoredUtc) * 1000, 60);
    pump();
    username = "Alex";
    login();
}
