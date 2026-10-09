#include "workflow.hpp"

void ReaderWorkflow::testSessionSummary()
{
    // Own-session summary works from both list and details and survives duplicate replies.
    supervised = false;
    active = true; login();
    auto stopReply = [&](const std::string &metadata, bool stale = false) {
        auto id = server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
        server.push("STOP_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(stale ? id + 100 : id) + "," + metadata + "}");
        pump();
    };
    click("Lasercutter"); click("Sitzung beenden");
    stopReply(R"("success":true,"durationSeconds":360000,"endedOwnSession":true)", true);
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    stopReply(R"("success":true,"durationSeconds":360000,"endedOwnSession":true,"billingSummary":{"amount":0,"total":"0,00 EUR"})");
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    assert(label(lv_screen_active(), "100:00:00"));
    assert(!label(lv_screen_active(), "Abgerechnet"));
    assert(lv_obj_get_x(label(lv_screen_active(), "Dauer")) == 140);
    display.capture(output, "session-summary-unbilled");
    stopReply(R"("success":true,"durationSeconds":1,"endedOwnSession":true)");
    assert(label(lv_screen_active(), "100:00:00"));
    const auto stopsAtSummary = server.count("STOP_RESOURCE_USAGE_SESSION");
    pump(3000); assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    pump(600); assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsAtSummary);
    login(); click("Stop");
    stopReply(R"("success":true,"durationSeconds":0,"endedOwnSession":true)");
    assert(label(lv_screen_active(), "00:00:00"));
    display.touch = {1, 1, true}; pump(); display.touch.pressed = false; pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    // Incorrect metadata and another owner's stop retain the legacy completion flow.
    for (const auto &metadata : {
        R"("success":true,"durationSeconds":-1,"endedOwnSession":true,"billingSummary":{"amount":1250,"total":"12,50 EUR"})",
        R"("success":true,"durationSeconds":1.5,"endedOwnSession":true)",
        R"("success":true,"durationSeconds":"1","endedOwnSession":true)",
        R"("success":true,"durationSeconds":4294967296,"endedOwnSession":true)",
        R"("success":true,"durationSeconds":1,"endedOwnSession":"true")",
        R"("success":true,"durationSeconds":1,"endedOwnSession":false)",
        R"("success":true)",
        R"("error":"Stop denied","durationSeconds":1,"endedOwnSession":true)"}) {
        login(); click("Stop"); stopReply(metadata); list();
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(label(lv_screen_active(), "Alex"));
        if (std::string(metadata).find("billingSummary") != std::string::npos)
            assert(label(lv_layer_top(), "12,50 EUR"));
        Display::hidePopup(); click("Abmelden");
    }
    username = "abcdefghijklmnopqrstuvwxyz012345";
    login(); click("Stop");
    stopReply(R"("success":true,"durationSeconds":1426,"endedOwnSession":true,"billingSummary":{"amount":1234567890,"total":"12.345.678.901,23 EUR"})");
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    display.capture(output, "session-summary-long-values");
    lv_obj_t *greeting = nullptr;
    for (uint32_t i = 0; i < lv_obj_get_child_count(lv_screen_active()); ++i) {
        auto *child = lv_obj_get_child(lv_screen_active(), i);
        if (lv_obj_check_type(child, &lv_label_class) &&
            std::strncmp(lv_label_get_text(child), "Danke, ", 7) == 0) greeting = child;
    }
    assert(greeting);
    lv_area_t greetingBounds, durationBounds, chargeBounds, farewellBounds;
    lv_obj_get_coords(greeting, &greetingBounds);
    lv_obj_get_coords(label(lv_screen_active(), "Dauer"), &durationBounds);
    lv_obj_get_coords(label(lv_screen_active(), "12.345.678.901,23 EUR"), &chargeBounds);
    lv_obj_get_coords(label(lv_screen_active(), "Bis bald!"), &farewellBounds);
    assert(greetingBounds.y2 < durationBounds.y1);
    assert(chargeBounds.y2 < farewellBounds.y1 && chargeBounds.x2 < 480);

    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(lv_screen_active() == Display::initScreen.getScreen());
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(!label(lv_screen_active(), "Danke, abcdefghijklmnopqrstuvwxyz012345!"));
    username = "Alex";
    login();
}
