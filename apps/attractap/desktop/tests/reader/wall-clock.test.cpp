#include "workflow.hpp"
#include "display/shared/wallClockText.hpp"

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
        assert(!label(lv_screen_active(), WallClockText::weekday(WallClock::LocalTime{true, 2026, 10, 10, weekday})));
    display.capture(output, "wall-clock-01-unknown");

    // Heartbeat replies carry the server clock at the top level.
    auto before = expectedClock(120);
    server.incoming.push(R"({"event":"HEARTBEAT","serverTime":)" + serverTime(120) + "}");
    pump();
    assert(WallClock::now().valid);
    assert(showsClock(lv_screen_active(), 120, before));
    assert(label(lv_screen_active(), WallClockText::weekday(WallClock::now())));
    display.capture(output, "wall-clock-02-list");

    // Authentication applies the server timezone too, e.g. a non-hour offset.
    before = expectedClock(-210);
    server.push("READER_AUTHENTICATED", R"({"name":"Test reader","serverTime":)" + serverTime(-210) + "}");
    list(false);
    assert(showsClock(lv_screen_active(), -210, before));

    // Implausible samples (old clocks, impossible offsets) are ignored.
    server.incoming.push(R"({"event":"HEARTBEAT","serverTime":{"epochMs":1000,"utcOffsetMinutes":60}})");
    server.incoming.push(R"({"event":"HEARTBEAT","serverTime":{"epochMs":)" +
                         std::to_string(static_cast<int64_t>(time(nullptr)) * 1000) + R"(,"utcOffsetMinutes":900}})");
    server.incoming.push(R"({"event":"HEARTBEAT","serverTime":{"epochMs":)" +
                         std::to_string(static_cast<int64_t>(time(nullptr)) * 1000) +
                         R"(,"utcOffsetMinutes":-2147483648}})");
    pump();
    assert(showsClock(lv_screen_active(), -210, before));

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
    assert(showsClock(lv_screen_active(), -210, before));
    assert(lv_obj_is_visible(label(lv_screen_active(), "RFID-Karte auflegen")));
    assert(!lv_obj_is_visible(label(lv_screen_active(), "Bitte mit RFID \n        Karte/Tag anmelden")));
    display.capture(output, "wall-clock-03-lockscreen");
    click(LV_SYMBOL_LEFT);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    username = "Alex";
    login();
}
