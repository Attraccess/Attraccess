#include "render_harness.hpp"

#include "display/ui/ui_slots.hpp"
#include <cmath>

namespace
{
constexpr WallClock::LocalTime saturday{true, 2026, 10, 10, 6, 14, 32};
constexpr const char *lockPrompt = "Bitte mit RFID \n        Karte/Tag anmelden";

lv_area_t bounds(lv_obj_t *obj)
{
    lv_obj_update_layout(lv_screen_active());
    lv_area_t area;
    lv_obj_get_coords(obj, &area);
    return area;
}

// Feed LVGL's pointer driver so hit testing and event dispatch are exercised.
struct Pointer
{
    lv_indev_t *device = lv_indev_create();
    lv_indev_data_t sample{};

    explicit Pointer(lv_display_t *display)
    {
        lv_indev_set_type(device, LV_INDEV_TYPE_POINTER);
        lv_indev_set_display(device, display);
        lv_indev_set_mode(device, LV_INDEV_MODE_EVENT);
        lv_indev_set_user_data(device, this);
        lv_indev_set_read_cb(device, [](lv_indev_t *device, lv_indev_data_t *data) {
            *data = static_cast<Pointer *>(lv_indev_get_user_data(device))->sample;
        });
    }

    ~Pointer() { lv_indev_delete(device); }

    void click(lv_obj_t *target, lv_obj_t *expectedHit)
    {
        const auto area = bounds(target);
        sample.point = {(area.x1 + area.x2) / 2, (area.y1 + area.y2) / 2};
        expect(lv_indev_search_obj(lv_screen_active(), &sample.point) == expectedHit,
               "Pointer hit test reaches only the intended input surface");
        sample.state = LV_INDEV_STATE_PRESSED;
        lv_indev_read(device);
        sample.state = LV_INDEV_STATE_RELEASED;
        lv_indev_read(device);
    }
};
}

void testWallClock(Renderer &renderer)
{
    {
        Lockscreen lock;
        lock.setResourceName("CNC Fräse");
        lock.init();
        ScreenGuard guard(lock.getScreen(), &lock);
        lock.setUsageInfo(false, "", false);
        // Unknown time keeps today's sign-in sentence and shows no clock.
        expect(lv_obj_is_visible(requireObject(guard.root, &lv_label_class, lockPrompt)), "Sign-in sentence without time");
        expect(!lv_obj_is_visible(requireObject(guard.root, &lv_label_class, "RFID-Karte auflegen")), "No card prompt without time");
        renderer.capture("wall-clock-lockscreen-unknown");

        Fixtures::wallClock = saturday;
        lock.loop();
        auto *time = requireObject(guard.root, &lv_label_class, "14:32");
        auto *date = requireObject(guard.root, &lv_label_class, "Samstag, 10. Oktober");
        auto *prompt = lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "RFID-Karte auflegen"));
        expect(lv_obj_get_style_text_font(time, LV_PART_MAIN) == &attractap_font_montserrat_digits_88, "Wall clock digits font");
        expect(!lv_obj_is_visible(requireObject(guard.root, &lv_label_class, lockPrompt)), "Clock replaces the sign-in sentence");
        expect(lv_obj_is_visible(prompt), "Card prompt with time");
        const auto timeArea = bounds(time), dateArea = bounds(date), promptArea = bounds(prompt);
        expect(timeArea.y1 >= 66, "Clock starts below the header");
        expect(timeArea.y2 <= dateArea.y1 + 8 && dateArea.y2 < promptArea.y1, "Clock, date and prompt stack top to bottom");
        expect(promptArea.y2 <= 460 && promptArea.x1 >= 0 && promptArea.x2 < 480, "Card prompt clears the device footer");
        renderer.capture("wall-clock-lockscreen");
        // Refresh the existing bindings in the same minute, without a clock tick.
        Fixtures::activeLanguage = "en";
        FirmwareI18n::refreshTree(guard.root, "en");
        lock.loop();
        requireObject(guard.root, &lv_label_class, "Saturday, 10 October");
        requireObject(guard.root, &lv_label_class, "Tap RFID card");
        renderer.capture("wall-clock-lockscreen-en");
        Fixtures::activeLanguage = "de";
        FirmwareI18n::refreshTree(guard.root, "de");
        lock.loop();
        requireObject(guard.root, &lv_label_class, "Samstag, 10. Oktober");


        lock.setUsageInfo(true, "Müller", false);
        renderer.capture("wall-clock-lockscreen-in-use");
        lock.setUsageInfo(false, "", false);

        // The public reservation status replaces "Available" and wins only over that: the three public states,
        // in both languages, readable on the lock screen background.
        const auto luminance = [](lv_color_t c) {
            const auto channel = [](uint8_t v) {
                const double x = v / 255.0;
                return x <= 0.03928 ? x / 12.92 : std::pow((x + 0.055) / 1.055, 2.4);
            };
            const uint32_t rgb = lv_color_to_u32(c);
            return 0.2126 * channel((rgb >> 16) & 0xFF) + 0.7152 * channel((rgb >> 8) & 0xFF) + 0.0722 * channel(rgb & 0xFF);
        };
        const auto putStatus = [](uint32_t revision, const char *text, ui::NodeType type, ui::Tone tone) {
            auto *rec = ui::allocRecord();
            expect(rec != nullptr, "Allocates a status record");
            std::memset(rec, 0, sizeof(ui::SlotRecord));
            rec->slot = ui::SlotId::ListRowStatus;
            rec->resourceId = 7;
            rec->revision = revision;
            rec->ownerHash = 1;
            std::strcpy(rec->key, "r");
            rec->nodeCount = 1;
            rec->nodes[0].type = type;
            rec->nodes[0].parent = ui::NO_PARENT;
            rec->nodes[0].tone = tone;
            rec->nodes[0].textLen = static_cast<uint16_t>(std::strlen(text));
            std::strcpy(rec->pool, text);
            rec->poolUsed = static_cast<uint16_t>(std::strlen(text) + 1);
            expect(ui::slotCache().apply(*rec, 0) == ui::ApplyResult::Applied, "Applies the status");
            ui::freeRecord(rec);
        };
        API::ResourceBrief brief{};
        brief.id = 7;
        std::strcpy(brief.name, "CNC Fräse");
        lock.setUsageInfo(brief);
        struct Case { const char *de, *en; ui::NodeType type; ui::Tone tone; };
        const Case cases[] = {
            {"Frei bis 14:00", "Free until 14:00", ui::NodeType::Text, ui::Tone::Success},
            {"Res., Check-in bis 14:15", "Res., check in by 14:15", ui::NodeType::Text, ui::Tone::Warning},
            {"Reserviert bis 16:00", "Reserved until 16:00", ui::NodeType::Badge, ui::Tone::Warning},
        };
        uint32_t revision = 1;
        for (const char *language : {"de", "en"}) {
            Fixtures::activeLanguage = language;
            FirmwareI18n::refreshTree(guard.root, language);
            for (const auto &c : cases) {
                const char *shown = std::strcmp(language, "de") == 0 ? c.de : c.en;
                putStatus(revision++, shown, c.type, c.tone);
                lock.refreshUiSlots();
                auto *status = requireObject(guard.root, &lv_label_class, shown);
                lv_obj_update_layout(guard.root);
                { lv_area_t a; lv_obj_get_coords(status, &a); expect(a.y2 - a.y1 < 24 && a.y1 >= 40, std::string("One line below the resource name: ") + shown); }
                expect(lv_obj_is_visible(status), std::string("Lock screen shows ") + shown);
                expect(!lv_obj_is_visible(requireObject(guard.root, &lv_label_class, std::strcmp(language, "de") == 0 ? "Verfügbar" : "Available")),
                       "The plugin status replaces Available");
                const auto bounds = lv_obj_get_style_text_color(status, LV_PART_MAIN);
                const double ratio = (luminance(bounds) + 0.05) / (luminance(DisplayTheme::background()) + 0.05);
                expect(std::max(ratio, 1 / ratio) >= 3.0, std::string("Readable on the lock screen: ") + shown);
                renderer.capture(std::string("wall-clock-lockscreen-status-") + language + "-" + std::to_string(revision));
            }
        }
        // In use wins over the plugin status.
        lock.setUsageInfo(true, "Müller", false);
        Fixtures::activeLanguage = "de";
        FirmwareI18n::refreshTree(guard.root, "de");
        expect(lv_obj_is_visible(requireObject(guard.root, &lv_label_class, "In Verwendung: Müller")),
               "In use wins over the plugin status");
        ui::slotCache().clear();
        lock.setUsageInfo(false, "", false);
        Fixtures::activeLanguage = "de";
        FirmwareI18n::refreshTree(guard.root, "de");

        // The minute ticks over without rebuilding, and March needs its umlaut.
        Fixtures::wallClock = {true, 2027, 3, 1, 1, 9, 5};
        lock.loop();
        requireObject(guard.root, &lv_label_class, "09:05");
        requireObject(guard.root, &lv_label_class, "Montag, 1. März");

        Fixtures::wallClock = {};
        lock.loop();
        expect(lv_obj_is_visible(requireObject(guard.root, &lv_label_class, lockPrompt)), "Losing the time restores the sentence");
        expect(!lv_obj_is_visible(time), "Losing the time hides the clock");
    }
    {
        ResourceListScreen list;
        API::ResourceList resources{};
        resources.count = 3;
        const char *names[] = {"Lasercutter", "CNC Fräse", "3D Drucker"};
        for (int i = 0; i < 3; ++i) {
            resources.items[i].id = i + 1;
            resources.items[i].isHealthy = true;
            std::strcpy(resources.items[i].name, names[i]);
        }
        resources.items[1].hasActiveUsage = true;
        std::strcpy(resources.items[1].activeUser, "Robin");
        resources.items[2].isUnderMaintenance = true;
        list.setResourceList(resources);
        Fixtures::wallClock = saturday;
        list.init();
        ScreenGuard guard(list.getScreen(), &list);
        Pointer pointer(renderer.display);
        auto *logo = requireObject(guard.root, &lv_image_class);
        auto *time = requireObject(guard.root, &lv_label_class, "14:32");
        requireObject(guard.root, &lv_label_class, "Samstag");
        requireObject(guard.root, &lv_label_class, "10. Oktober 2026");
        expect(lv_obj_has_flag(logo, LV_OBJ_FLAG_HIDDEN) && lv_obj_is_visible(time), "Clock header replaces the logo");
        const auto header = bounds(lv_obj_get_parent(time));
        const auto firstRow = bounds(lv_obj_get_parent(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Lasercutter"))));
        expect(header.y2 < firstRow.y1, "Clock header stays above the resource rows");
        renderer.capture("wall-clock-resource-list");
        Fixtures::activeLanguage = "en";
        FirmwareI18n::refreshTree(guard.root, "en");
        list.loop();
        requireObject(guard.root, &lv_label_class, "Saturday");
        requireObject(guard.root, &lv_label_class, "10 October 2026");
        requireObject(guard.root, &lv_label_class, "CNC Fräse"); // supplied name stays literal
        renderer.capture("wall-clock-resource-list-en");
        Fixtures::activeLanguage = "de";
        FirmwareI18n::refreshTree(guard.root, "de");
        list.loop();
        requireObject(guard.root, &lv_label_class, "10. Oktober 2026");


        unsigned clockClicks = 0, selections = 0, actions = 0;
        for (auto *container : {lv_obj_get_parent(time),
                               lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Samstag"))}) {
            expect(!lv_obj_has_flag(container, LV_OBJ_FLAG_SCROLLABLE), "Clock containers cannot scroll");
            lv_obj_add_event_cb(container, [](lv_event_t *event) {
                ++*static_cast<unsigned *>(lv_event_get_user_data(event));
            }, LV_EVENT_CLICKED, &clockClicks);
        }
        list.setResourceSelectionCallback([&](const auto &) { ++selections; });
        list.setActionCallback([&](const auto &, auto) { ++actions; });
        pointer.click(time, guard.root);
        auto *date = requireObject(guard.root, &lv_label_class, "10. Oktober 2026");
        pointer.click(date, guard.root);
        expect(clockClicks == 0 && selections == 0 && actions == 0, "Clock touches neither capture clicks nor invoke resource callbacks");
        auto *resource = requireObject(guard.root, &lv_label_class, "Lasercutter");
        pointer.click(resource, lv_obj_get_parent(resource));
        expect(selections == 1 && actions == 0, "Resource selection still works beside the clock");

        std::strcpy(resources.authenticatedUsername, "Alex Example");
        resources.items[0].accessKnown = true;
        resources.items[0].hasIntroduction = true;
        list.setResourceList(resources);
        list.setAuthenticatedUser("Alex Example");
        expect(lv_obj_has_flag(logo, LV_OBJ_FLAG_HIDDEN) && !lv_obj_is_visible(time), "Signed in, the session header takes the row");
        auto *start = requireObject(guard.root, &lv_label_class, "Start");
        pointer.click(start, lv_obj_get_parent(start));
        expect(selections == 1 && actions == 1, "Signed-in resource action still receives pointer input");
        list.setAuthenticatedUser("");
        expect(lv_obj_is_visible(time), "Clock returns after sign-out");

        Fixtures::wallClock = {};
        list.loop();
        expect(!lv_obj_has_flag(logo, LV_OBJ_FLAG_HIDDEN) && !lv_obj_is_visible(time), "Unknown time shows the logo");
    }
}
