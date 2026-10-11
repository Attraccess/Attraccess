#include "render_harness.hpp"

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

        lock.setUsageInfo(true, "Müller", false);
        renderer.capture("wall-clock-lockscreen-in-use");

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
