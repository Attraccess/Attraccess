#include "fixtures.hpp"

#include <ArduinoJson.h>
#include <algorithm>
#include <fstream>
#include <functional>
#include <iostream>
#include <sstream>

#include "display/ui/ui_builder.hpp"
#include "display/ui/ui_record.hpp"
#include "display/ui/ui_slot_cache.hpp"
#include "display/ui/ui_step_modal.hpp"

// ATT-1187: the reservation fixtures render readable on the production theme. The same JSON files drive the
// server validator (Jest) and the firmware parser (host test), so what is drawn here is what plugins send.
namespace
{
double luminance(lv_color_t c)
{
    const auto channel = [](uint8_t v) {
        const double s = v / 255.0;
        return s <= 0.03928 ? s / 12.92 : std::pow((s + 0.055) / 1.055, 2.4);
    };
    const uint32_t rgb = lv_color_to_u32(c);
    return 0.2126 * channel((rgb >> 16) & 0xFF) + 0.7152 * channel((rgb >> 8) & 0xFF) + 0.0722 * channel(rgb & 0xFF);
}

double contrast(lv_color_t a, lv_color_t b)
{
    const double la = luminance(a), lb = luminance(b);
    return (std::max(la, lb) + 0.05) / (std::min(la, lb) + 0.05);
}

lv_color_t backgroundOf(lv_obj_t *obj)
{
    for (lv_obj_t *o = obj; o; o = lv_obj_get_parent(o))
        if (lv_obj_get_style_bg_opa(o, LV_PART_MAIN) >= LV_OPA_COVER) return lv_obj_get_style_bg_color(o, LV_PART_MAIN);
    return DisplayTheme::background();
}

// Every label must be readable against the surface behind it.
void expectReadable(lv_obj_t *root)
{
    if (lv_obj_check_type(root, &lv_label_class) && std::strlen(lv_label_get_text(root)) > 0)
    {
        const double ratio = contrast(lv_obj_get_style_text_color(root, LV_PART_MAIN), backgroundOf(root));
        if (ratio < 4.5) std::cerr << "low contrast " << ratio << " for '" << lv_label_get_text(root) << "'\n";
        assert(ratio >= 4.5);
    }
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i) expectReadable(lv_obj_get_child(root, i));
}

JsonDocument loadFixture(const char *name)
{
    std::ifstream in(std::string(ATTRACTAP_UI_FIXTURES) + "/" + name + ".json");
    assert(in.good());
    std::stringstream ss;
    ss << in.rdbuf();
    JsonDocument doc;
    assert(!deserializeJson(doc, ss.str()));
    return doc;
}

lv_obj_t *renderFixture(lv_obj_t *screen, const char *name, const char *expectedText, bool framed)
{
    JsonDocument doc = loadFixture(name);
    auto *rec = ui::allocRecord();
    assert(rec);
    const auto verdict = ui::parseSlotUpdate(doc["payload"].as<JsonObjectConst>(), measureJson(doc["payload"]), *rec);
    assert(verdict == ui::Verdict::Accept);
    rec->receivedAtMillis = 0;
    lv_obj_t *built = ui::buildRecord(screen, *rec, 0, framed);
    assert(built);
    lv_obj_update_layout(screen);
    if (expectedText) assert(findLabel(screen, expectedText));
    ui::freeRecord(rec);
    return built;
}
}

void testReaderUiFixtures(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    struct Fixture { const char *name; const char *text; bool framed; };
    const Fixture fixtures[] = {
        {"res-header-reserved", "Reserved by Anna M.", true},
        {"res-header-free-until", "Free until 14:00", true},
        {"res-body-countdown", "Reservation starts in", true},
        {"res-session-checkin", "Booked until 16:00", true},
        {"list-row-badge", "Reserved 14:00", false},
        {"list-row-text", "Free until 14:00", false},
        {"latin1-transliterated", "Zlote \xE2\x80\x94 caf\xC3\xA9", true},
    };
    for (const auto &fixture : fixtures)
    {
        lv_obj_t *screen = lv_obj_create(nullptr);
        DisplayTheme::applyScreen(screen);
        lv_obj_set_style_pad_all(screen, 20, LV_PART_MAIN);
        lv_screen_load(screen);
        // The Latin-1 fixture goes through the same safety net as the device: em dash becomes '?'.
        const char *expected = std::strcmp(fixture.name, "latin1-transliterated") == 0 ? "Zlote ? caf\xC3\xA9" : fixture.text;
        renderFixture(screen, fixture.name, expected, fixture.framed);
        expectReadable(screen);
        assert(display.pollEvents());
        lv_refr_now(nullptr);
        std::string file = std::string("ui-slot-") + fixture.name + ".png";
        screenshot(screenshots, file.c_str());
        lv_screen_load(Display::initScreen.getScreen());
        lv_obj_delete(screen);
    }
    // The countdown fixture shows m:ss from the server clock, 40 min from now.
    {
        lv_obj_t *screen = lv_obj_create(nullptr);
        lv_screen_load(screen);
        renderFixture(screen, "res-body-countdown", "40:00", true);
        lv_screen_load(Display::initScreen.getScreen());
        lv_obj_delete(screen);
    }
    std::cout << "PASS reader UI fixtures render with readable contrast" << std::endl;
}

void testReaderUiStepModal(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    ui::StepModal modal;
    std::string stepId, action;
    bool choice = false;
    modal.setActionCallback([&](const std::string &id, const std::string &a, bool c) { stepId = id; action = a; choice = c; });
    lv_obj_t *screen = lv_obj_create(nullptr);
    DisplayTheme::applyScreen(screen);
    lv_screen_load(screen);

    ui::StepRequest step;
    step.stepId = "k3J9vQ2mXc8LrT0aW5yZbQ";
    step.title = "Reserviert ab 14:00";
    step.body = "Sie haben noch 40 Minuten. Trotzdem starten?";
    step.tone = 3;
    step.serverNowMs = 1000000;
    step.expiresAtMs = 1060000;
    step.countdownToMs = 1000000 + 40 * 60 * 1000;
    modal.show(step, 0);
    lv_refr_now(nullptr);
    assert(findLabel(lv_layer_top(), "Reserviert ab 14:00") && findLabel(lv_layer_top(), "40:00"));
    assert(findLabel(lv_layer_top(), "Abbrechen") && findLabel(lv_layer_top(), "Start"));
    expectReadable(lv_layer_top());
    assert(display.pollEvents());
    screenshot(screenshots, "ui-step-confirm.png");
    lv_obj_send_event(lv_obj_get_parent(findLabel(lv_layer_top(), "Start")), LV_EVENT_CLICKED, nullptr);
    assert(stepId == step.stepId && action == "confirm" && !choice);
    lv_obj_send_event(lv_obj_get_parent(findLabel(lv_layer_top(), "Abbrechen")), LV_EVENT_CLICKED, nullptr);
    assert(action == "cancel");

    step.kind = ui::StepKind::Choose;
    step.title = "Restzeit freigeben?";
    step.countdownToMs = 0;
    step.choiceCount = 4;
    const char *labels[] = {"Behalten", "Freigeben", "Verkuerzen", "Spaeter"};
    const char *ids[] = {"keep", "free", "short", "later"};
    for (int i = 0; i < 4; i++) { step.choices[i].id = ids[i]; step.choices[i].label = labels[i]; }
    modal.show(step, 0);
    lv_refr_now(nullptr);
    for (const char *l : labels) assert(findLabel(lv_layer_top(), l));
    // Four stacked buttons plus header, title and body must fit the 480 px panel.
    for (const char *l : labels)
    {
        lv_area_t area;
        lv_obj_get_coords(lv_obj_get_parent(findLabel(lv_layer_top(), l)), &area);
        assert(area.y1 >= 0 && area.y2 < 480);
    }
    expectReadable(lv_layer_top());
    screenshot(screenshots, "ui-step-choose.png");
    lv_obj_send_event(lv_obj_get_parent(findLabel(lv_layer_top(), "Freigeben")), LV_EVENT_CLICKED, nullptr);
    assert(action == "free" && choice);

    step.kind = ui::StepKind::Info;
    step.choiceCount = 0;
    modal.show(step, 0);
    lv_refr_now(nullptr);
    assert(findLabel(lv_layer_top(), "OK") && !findLabel(lv_layer_top(), "Abbrechen"));
    modal.hide();
    assert(!modal.isOpen());
    lv_screen_load(Display::initScreen.getScreen());
    lv_obj_delete(screen);
    std::cout << "PASS reader UI step modal confirm, choose and info" << std::endl;
}
