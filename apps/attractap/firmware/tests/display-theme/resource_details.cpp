#include "render_harness.hpp"
#include "display/ui/ui_builder.hpp"
#include "src/misc/lv_text_private.h"
#include <vector>

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
    FirmwareI18n::refreshTree(guard.root, "en");
    requireObject(guard.root, &lv_label_class, "Current usage");
    requireObject(guard.root, &lv_label_class, "00:01:00 · Running");
    renderer.capture("usage-stats-meters-english");
    FirmwareI18n::refreshTree(guard.root, "de");
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
        expect(lv_obj_has_flag(lv_obj_get_parent(panel), LV_OBJ_FLAG_SCROLLABLE), "Long list can be scrolled on reader");
        renderer.capture(occupied ? "introducers-occupied-top" : "introducers-available-top");
        lv_obj_scroll_to_y(lv_obj_get_parent(panel), LV_COORD_MAX, LV_ANIM_OFF);
        settle();
        lv_area_t bounds;
        lv_obj_get_coords(list, &bounds);
        expect(bounds.y2 < 452 && bounds.y2 > 0, "Last tutor is reachable by scrolling, above the device footer");
        expect(lv_obj_get_width(list) <= lv_obj_get_content_width(panel), "Long names wrap inside the panel");
        renderer.capture(occupied ? "introducers-occupied-bottom" : "introducers-available-bottom");
        details.showActionProgress(FirmwareI18n::Message::PleaseWait);
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

// ATT-1188: the reservations plugin splits a clause with a long holder name (16 characters) between the name and
// its times. Built by the production UI builder at the details content width, every clause stays on one line, so
// no time or half of a range is left alone; the session lines also leave room for the countdown beside them.
namespace
{
    struct TreeBuilder
    {
        ui::SlotRecord rec{};

        uint8_t add(ui::NodeType type, uint8_t parent, const char *text = nullptr)
        {
            auto &node = rec.nodes[rec.nodeCount];
            node.type = type;
            node.parent = parent;
            if (text) {
                node.textOffset = rec.poolUsed;
                node.textLen = static_cast<uint16_t>(std::strlen(text));
                std::strcpy(rec.pool + rec.poolUsed, text);
                rec.poolUsed = static_cast<uint16_t>(rec.poolUsed + node.textLen + 1);
            }
            return rec.nodeCount++;
        }
    };

    void expectOneLinePerClause(const std::string &name, ui::SlotId slot, const std::vector<const char *> &clauses)
    {
        TreeBuilder tree;
        tree.rec.slot = slot;
        const bool session = slot == ui::SlotId::DetailsSession;
        uint8_t parent = ui::NO_PARENT;
        if (session) parent = tree.add(ui::NodeType::Row, ui::NO_PARENT);
        const uint8_t col = tree.add(ui::NodeType::Col, parent);
        tree.rec.nodes[col].fill = true;
        for (const char *clause : clauses) {
            const uint8_t text = tree.add(ui::NodeType::Text, col, clause);
            tree.rec.nodes[text].style = session ? ui::TextStyle::Small : ui::TextStyle::Body;
            tree.rec.nodes[text].fill = session;
        }
        if (session) tree.rec.nodes[tree.add(ui::NodeType::Countdown, parent)].toMs = 59 * 60 * 1000;

        // The details screen content: 480 px less its 20 px padding on each side.
        lv_obj_t *screen = lv_obj_create(nullptr);
        ScreenGuard guard(screen);
        lv_obj_t *content = lv_obj_create(screen);
        lv_obj_remove_style_all(content);
        lv_obj_set_size(content, Renderer::width - 40, LV_SIZE_CONTENT);
        expect(ui::buildRecord(content, tree.rec, 0, true) != nullptr, name + ": builds");
        lv_obj_update_layout(screen);

        lv_area_t countdown{};
        if (session) {
            lv_obj_t *label = findObject(screen, &lv_label_class, "59:00");
            expect(label != nullptr, name + ": countdown label");
            if (label) lv_obj_get_coords(label, &countdown);
        }
        const lv_font_t *font = session ? &attractap_font_montserrat_latin1_14 : &attractap_font_montserrat_latin1_18;
        for (const char *clause : clauses) {
            lv_obj_t *label = requireObject(screen, &lv_label_class, clause);
            expect(lv_obj_get_height(label) == lv_font_get_line_height(font),
                   name + ": one line for '" + clause + "'");
            lv_area_t area;
            lv_obj_get_coords(label, &area);
            if (session) expect(area.x2 < countdown.x1, name + ": '" + clause + "' stays left of the countdown");
        }
    }
}

void testReaderUiClauseLines()
{
    // The plugin's longest forms: a 16-character name and weekday times on both ends of a range.
    expectOneLinePerClause("body/idle-de", ui::SlotId::DetailsBody,
                           {"Frei bis Di 13:55,", "dann reserviert von Wolfgang Mohrman", "bis Di 14:25"});
    expectOneLinePerClause("body/idle-en", ui::SlotId::DetailsBody,
                           {"Free until Tue 13:55,", "then reserved by Wolfgang Mohrman", "until Tue 14:25"});
    expectOneLinePerClause("body/running-de", ui::SlotId::DetailsBody,
                           {"Reserviert von Wolfgang Mohrman", "Mo 13:55-Di 14:25", "(Check-in bis Mo 14:10)"});
    expectOneLinePerClause("body/running-en", ui::SlotId::DetailsBody,
                           {"Reserved by Wolfgang Mohrman", "Tue 13:55-Wed 14:25", "(check in by Tue 14:10)"});
    // Up to 42 characters stay one clause (READER_LINE_CHARS in the plugin's texts.ts).
    expectOneLinePerClause("body/short-name-de", ui::SlotId::DetailsBody,
                           {"Frei bis 13:55,", "dann reserviert von Anna Mueller bis 14:25"});
    expectOneLinePerClause("session/long-name-de", ui::SlotId::DetailsSession,
                           {"Reserviert von Wolfgang Mohrman", "Mo 13:55-Di 14:25"});
    expectOneLinePerClause("session/short-name-de", ui::SlotId::DetailsSession,
                           {"Reserviert von Anna Mueller Mo 13:55-14:25"});

    // ':' and ')' never end a line; names still wrap at hyphens, dots and underscores.
    expect(!lv_text_is_break_char(':') && !lv_text_is_break_char(')'), "':' and ')' are not break characters");
    for (const char c : {' ', ',', '-', '.', '_'})
        expect(lv_text_is_break_char(c), std::string("'") + c + "' is a break character");
}
