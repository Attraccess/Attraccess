#include "reader_workflow.hpp"

void ReaderWorkflow::testUsageStats()
{
    const auto statsRequest = server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>();
    assert(server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["resourceId"].as<uint32_t>() == 1);
    auto stats = [&](uint32_t request, uint32_t usage, const char *values) {
        server.push("RESOURCE_USAGE_STATS", "{\"resourceId\":1,\"requestId\":" + std::to_string(request) +
            ",\"usage\":{\"id\":" + std::to_string(usage) + "," + values + "}}");
        pump();
    };
    assert(label(lv_screen_active(), "Warte auf Messwert"));
    display.capture(output, "05c-usage-stats-waiting");
    stats(statsRequest, 99, "\"energyKwh\":\"0.125\",\"operatingDurationMs\":123000,\"isOperating\":true");
    assert(label(lv_screen_active(), "0.125 kWh"));
    assert(label(lv_screen_active(), "00:02:03 · Läuft"));
    display.capture(output, "05d-usage-stats-running");
    // Replies for earlier requests or another usage cannot overwrite the displayed reading.
    stats(statsRequest - 1, 99, "\"energyKwh\":\"9\"");
    stats(statsRequest, 100, "\"energyKwh\":\"9\"");
    assert(label(lv_screen_active(), "0.125 kWh"));
    stats(statsRequest, 99, "\"energyKwh\":\"0\",\"operatingDurationMs\":0,\"isOperating\":false");
    assert(label(lv_screen_active(), "0 kWh"));
    assert(label(lv_screen_active(), "00:00:00 · Leerlauf"));
    display.capture(output, "05e-usage-stats-idle");
    stats(statsRequest, 99, "\"energyKwh\":null,\"operatingDurationMs\":null,\"isOperating\":null");
    assert(label(lv_screen_active(), "Keine Daten"));
    assert(label(lv_screen_active(), "Warte auf Messwert"));
    stats(statsRequest, 99, "\"energyKwh\":\"0.125\",\"operatingDurationMs\":123000,\"isOperating\":true");
    display.capture(output, "05-details-running");
    const auto beforeMarquee = display.pixels;
    pump(1200);
    display.capture(output, "05a-details-marquee");
    bool marqueeMoved = false;
    for (int y = fullDescriptionBounds.y1; y <= fullDescriptionBounds.y2; ++y)
        for (int x = fullDescriptionBounds.x1; x <= fullDescriptionBounds.x2; ++x)
            marqueeMoved |= beforeMarquee[y * 480 + x] != display.pixels[y * 480 + x];
    assert(marqueeMoved);
    lv_obj_send_event(lv_screen_active(), LV_EVENT_PRESSED, nullptr);
    const auto pollsBefore = server.count("RESOURCE_USAGE_STATS");
    pump(10000);
    assert(server.count("RESOURCE_USAGE_STATS") > pollsBefore);
    const auto latestStatsRequest = server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>();
    stats(latestStatsRequest, 99, "\"energyKwh\":\"0.250\",\"operatingDurationMs\":130000,\"isOperating\":false");
    assert(label(lv_screen_active(), "0.250 kWh"));
    // Changing sessions clears A's cached reading before B's reply arrives.
    activeUsageId = 100; list();
    const auto replacementStatsRequest = server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>();
    assert(replacementStatsRequest != latestStatsRequest);
    assert(label(lv_screen_active(), "Warte auf Messwert"));
    stats(latestStatsRequest, 99, "\"energyKwh\":\"9\"");
    assert(label(lv_screen_active(), "Warte auf Messwert"));
    stats(replacementStatsRequest, 100, "\"energyKwh\":\"0.500\"");
    stats(latestStatsRequest, 99, "\"energyKwh\":\"9\"");
    server.push("RESOURCE_USAGE_STATS", "{\"resourceId\":1,\"requestId\":" + std::to_string(latestStatsRequest) + ",\"usage\":null}");
    pump();
    assert(label(lv_screen_active(), "0.500 kWh"));
    // Ending a session while its lookup is outstanding keeps the panel hidden.
    activeUsageId = 101; list();
    const auto endingStatsRequest = server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>();
    active = false; list();
    stats(endingStatsRequest, 101, "\"energyKwh\":\"9\"");
    assert(!lv_obj_is_visible(label(lv_screen_active(), "Warte auf Messwert")));
    active = true; activeUsageId = 99; list();
    stats(server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>(), 99,
          "\"energyKwh\":\"0.250\",\"operatingDurationMs\":130000,\"isOperating\":false");
    auto *backButton = lv_obj_get_parent(label(lv_screen_active(), LV_SYMBOL_LEFT));
    auto *logoutButton = lv_obj_get_parent(label(lv_screen_active(), "Abmelden"));
    assert(lv_obj_get_parent(backButton) == lv_obj_get_parent(logoutButton));
    assert(lv_obj_get_child(lv_obj_get_parent(backButton), 0) == backButton);
    lv_obj_add_state(backButton, LV_STATE_PRESSED);
    lv_obj_add_state(logoutButton, LV_STATE_PRESSED);
    pump(200);
    for (auto *button : {backButton, logoutButton}) {
        lv_area_t bounds, parent; lv_obj_get_coords(button, &bounds); lv_obj_get_coords(lv_obj_get_parent(button), &parent);
        assert(bounds.y1 == 20 && bounds.y1 >= parent.y1 && bounds.y2 <= parent.y2);
        assert(lv_obj_get_style_transform_width(button, LV_PART_MAIN) == 0);
        assert(lv_obj_get_style_transform_height(button, LV_PART_MAIN) == 0);
    }
    display.capture(output, "05b-header-pressed");
    lv_obj_remove_state(backButton, LV_STATE_PRESSED);
    lv_obj_remove_state(logoutButton, LV_STATE_PRESSED);
}
