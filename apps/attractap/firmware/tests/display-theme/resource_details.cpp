#include "render_harness.hpp"

void testUsageStatsExpiry(Renderer &renderer)
{
    ResourceDetailsScreen details;
    API::ResourceBrief resource{};
    resource.id = 1;
    resource.hasActiveUsage = true;
    resource.activeUsageId = 99;
    resource.isHealthy = true;
    resource.accessKnown = true;
    resource.hasIntroduction = true;
    std::strcpy(resource.name, "Lasercutter");
    std::strcpy(resource.activeUser, Fixtures::userName);
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({Fixtures::userName, false, true, false, false});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    API::UsageStats stats{};
    stats.resourceId = 1;
    stats.usageId = 99;
    stats.meters = {{"Energy (kWh)", "0.125", 30, "0,30 EUR"}, {"Heartbeats", "3", 0, "0,00 EUR"}};
    stats.operatingDurationMs = 60000;
    stats.isOperating = 1;
    const auto receivedAt = Fixtures::nowMs;
    details.setUsageStats(stats);
    Fixtures::nowMs = receivedAt + 24999;
    details.loop();
    requireObject(guard.root, &lv_label_class, "Energy (kWh): 0.125\n0,30 EUR / Wert\nHeartbeats: 3\n0,00 EUR / Wert");
    requireObject(guard.root, &lv_label_class, "00:01:00 · Läuft");
    renderer.capture("usage-stats-meters");
    Fixtures::nowMs = receivedAt + 25000;
    details.loop();
    requireObject(guard.root, &lv_label_class, "Warte auf Messwert");
    requireObject(guard.root, &lv_label_class, "Keine Daten");
    expect(!findObject(guard.root, &lv_label_class, "Heartbeats: 0"), "Expired consumption is unavailable, not zero");
    renderer.capture("usage-stats-expired");
    stats.meters = {{"Heartbeats", "0", 0, "0,00 EUR"}};
    stats.isOperating = 0;
    details.setUsageStats(stats);
    requireObject(guard.root, &lv_label_class, "Heartbeats: 0\n0,00 EUR / Wert");
    requireObject(guard.root, &lv_label_class, "00:01:00 · Leerlauf");
    renderer.capture("usage-stats-recovered");
}

void testIntroducerDetails(Renderer &renderer)
{
    ResourceDetailsScreen details;
    API::ResourceBrief resource{};
    std::strcpy(resource.name, "Lathe");
    resource.isHealthy = true;
    resource.accessKnown = true;
    std::string expected;
    for (int i = 1; i <= 30; ++i) {
        const auto name = "Tutor " + std::to_string(i) + " with a long display name" +
                          (i == 30 ? " that needs to wrap onto another line" : "");
        resource.introducers.push_back(name);
        if (i > 1) expected += "\n";
        expected += name;
    }
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({"Learner", false, false, false, false});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    for (bool occupied : {false, true}) {
        resource.hasActiveUsage = occupied;
        std::strcpy(resource.activeUser, "Someone else");
        details.setResourceAndUsageDetails(resource);
        settle();
        auto *list = requireObject(guard.root, &lv_label_class, expected.c_str());
        auto *panel = lv_obj_get_parent(list);
        expect(!lv_obj_has_flag(panel, LV_OBJ_FLAG_HIDDEN), "Introduction panel remains visible with occupancy");
        expect(lv_obj_has_flag(guard.root, LV_OBJ_FLAG_SCROLLABLE), "Long list can be scrolled on reader");
        renderer.capture(occupied ? "introducers-occupied-top" : "introducers-available-top");
        lv_obj_scroll_to_y(guard.root, LV_COORD_MAX, LV_ANIM_OFF);
        settle();
        lv_area_t bounds;
        lv_obj_get_coords(list, &bounds);
        expect(bounds.y2 < 480 && bounds.y2 > 0, "Last tutor is reachable by scrolling");
        expect(lv_obj_get_width(list) <= lv_obj_get_content_width(panel), "Long names wrap inside the panel");
        renderer.capture(occupied ? "introducers-occupied-bottom" : "introducers-available-bottom");
        details.showActionProgress("Bitte warten");
        settle();
        auto *overlay = lv_obj_get_child(guard.root, -1);
        const auto expectOverlayCoverage = [&] {
            lv_area_t area;
            lv_obj_get_coords(overlay, &area);
            expect(area.x1 == 0 && area.y1 == 0 && area.x2 == 479 && area.y2 == 479,
                   "Pending action covers the viewport even when details are scrolled");
            expect(lv_obj_has_flag(overlay, LV_OBJ_FLAG_CLICKABLE), "Pending overlay intercepts input");
        };
        expectOverlayCoverage();
        renderer.capture(occupied ? "introducers-occupied-pending" : "introducers-available-pending");
        lv_obj_scroll_to_y(guard.root, 0, LV_ANIM_OFF);
        settle();
        expectOverlayCoverage();
        details.hideActionProgress();
        expect(lv_obj_has_flag(overlay, LV_OBJ_FLAG_HIDDEN), "Completed action hides its overlay");
    }
    resource.introducers = {"Updated tutor"};
    details.setResourceAndUsageDetails(resource);
    settle();
    requireObject(guard.root, &lv_label_class, "Updated tutor");
    expect(!findObject(guard.root, &lv_label_class, expected.c_str()), "Refresh replaces old introducers");
}
