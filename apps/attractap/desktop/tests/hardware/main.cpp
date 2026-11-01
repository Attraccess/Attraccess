// Hardware variants, run on the host with the production router:
// - a panel whose touch controller was not found: the warning is seen for its whole 6 s, even
//   when start-up routing replaces it early;
// - the power-off confirmation on V4 hardware: the real connection settings screen with its
//   "Gerät" tab and the confirmation wiring Display::setup installs. Cancel hands the settings
//   back exactly as they were (tab, PIN lock); confirming powers off through the callback;
// - the demo variant's settings screen with its power button.
// With a directory argument, the screens are written to <directory>/gallery/<language>/.
#include "display/display.hpp"
#include "profile_store.hpp"
#include "settings/settings.hpp"
#include "platform.hpp"
#include "../layout-check.hpp"

#include <SDL3/SDL.h>

#include <cassert>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <thread>
#include <vector>

namespace
{
    class Framebuffer : public IDisplayDriver
    {
    public:
        std::vector<uint16_t> pixels = std::vector<uint16_t>(480 * 480);
        bool begin() override { return true; }
        uint32_t width() const override { return 480; }
        uint32_t height() const override { return 480; }
        bool readTouch(TouchPoint &point) override
        {
            point = {};
            return false;
        }
        void flush(const lv_area_t *area, uint8_t *data) override
        {
            auto *source = reinterpret_cast<uint16_t *>(data);
            for (int y = area->y1; y <= area->y2; ++y)
                for (int x = area->x1; x <= area->x2; ++x) pixels[y * 480 + x] = *source++;
        }
        bool touchAvailable() const override { return false; }
    };

    lv_obj_t *findLabel(lv_obj_t *root, const char *text)
    {
        if (lv_obj_check_type(root, &lv_label_class) && std::strcmp(lv_label_get_text(root), text) == 0) return root;
        for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
            if (auto *found = findLabel(lv_obj_get_child(root, i), text)) return found;
        return nullptr;
    }

    lv_obj_t *findWidget(lv_obj_t *root, const lv_obj_class_t *type)
    {
        if (lv_obj_check_type(root, type)) return root;
        for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
            if (auto *found = findWidget(lv_obj_get_child(root, i), type)) return found;
        return nullptr;
    }

    void settle()
    {
        for (int i = 0; i < 3; ++i)
        {
            Display::loop();
            lv_timer_handler();
        }
    }

    void wait(uint32_t ms)
    {
        const uint32_t end = millis() + ms;
        while (static_cast<int32_t>(end - millis()) > 0)
        {
            settle();
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }

    bool touchWarningShown()
    {
        return Display::isActive(&Display::statusScreen) && Display::statusScreen.purpose() == StatusScreen::Purpose::TouchUnavailable;
    }

    void expectCleanLayout(const char *what)
    {
        const auto problems = LayoutCheck::problems();
        for (const auto &problem : problems) std::fprintf(stderr, "LAYOUT %s: %s\n", what, problem.c_str());
        assert(problems.empty());
    }

    std::filesystem::path gallery;
    Framebuffer *panel = nullptr;

    // Checked, and with a directory written as <name>.png in the current language.
    void shot(const char *name)
    {
        expectCleanLayout(name);
        if (gallery.empty()) return;
        lv_obj_invalidate(lv_screen_active());
        lv_refr_now(nullptr);
        const auto directory = gallery / State::getActiveLanguage();
        std::filesystem::create_directories(directory);
        SDL_Surface *frame = SDL_CreateSurfaceFrom(480, 480, SDL_PIXELFORMAT_RGB565, panel->pixels.data(), 480 * 2);
        assert(frame && SDL_SavePNG(frame, (directory / (std::string(name) + ".png")).c_str()));
        SDL_DestroySurface(frame);
    }

    void click(lv_obj_t *label)
    {
        assert(label);
        lv_obj_send_event(lv_obj_get_parent(label), LV_EVENT_CLICKED, nullptr);
        settle();
    }
}

int main(int argc, char **argv)
{
    if (argc > 1) gallery = std::filesystem::path(argv[1]) / "gallery";
    const auto storage = std::filesystem::temp_directory_path() /
                         ("attractap-power-off-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    ProfileStore profile("http://reader.test", 880, storage);
    KVStore::setHostProfile(&profile);
    Settings::setup();
    Settings::setDevicePin("1234");
    State::setDefaultLanguage("de");

    Framebuffer framebuffer;
    panel = &framebuffer;
    Display::setup(framebuffer);

    // No touch: the warning waits for the first real screen, not the boot screen.
    settle();
    assert(!touchWarningShown() && !Display::hasTouchInput());
    Display::transitionToScreen(&Display::initScreen);
    settle();
    assert(touchWarningShown() && findLabel(lv_screen_active(), "Berührung nicht verfügbar"));
    shot("touch-unavailable");
    const uint32_t shownAt = millis();
    // Start-up routing moves on after a second and replaces it: it comes back over the next
    // screen for the rest of its time, without a button nobody could press.
    wait(1000);
    Display::transitionToScreen(&Display::noResourcesScreen);
    settle();
    assert(touchWarningShown() && !findLabel(lv_screen_active(), "OK"));
    while (touchWarningShown() && millis() - shownAt < 8000) wait(50);
    const uint32_t seen = millis() - shownAt;
    assert(seen >= 5800 && seen < 6800);
    assert(lv_screen_active() == Display::noResourcesScreen.getScreen() && !Display::transientActive());
    wait(300);
    assert(!touchWarningShown());

    unsigned poweredOff = 0;
    auto &settings = Display::connectionConfigurationScreen;
    settings.setOnPowerOffCallback([&] { ++poweredOff; });

    for (const bool locked : {false, true})
    {
        if (locked)
            settings.enablePinLock();
        else
            settings.disablePinLock();
        Display::transitionToScreen(&settings);
        settle();
        auto *tabs = findWidget(settings.getScreen(), &lv_tabview_class);
        assert(tabs);
        lv_tabview_set_active(tabs, 2, LV_ANIM_OFF);
        settle();
        if (!locked) shot("settings-device-tab-power-button");
        if (locked)
        {
            // The PIN lock covers the tabs: nothing behind it can be reached until it is unlocked.
            assert(lv_obj_is_visible(findLabel(settings.getScreen(), "Entsperren mit PIN")));
            shot("settings-pin-lock-power-variant");
            continue;
        }
        auto *power = findLabel(settings.getScreen(), LV_SYMBOL_POWER);
        assert(power);
        click(power);
        assert(lv_screen_active() == Display::confirmScreen.getScreen() && Display::isActive(&Display::confirmScreen));
        assert(findLabel(lv_screen_active(), "Gerät ausschalten?"));
        shot("settings-power-off-confirm");
        // Cancel: the settings come back on the "Gerät" tab, still unlocked, nothing powered off.
        click(findLabel(lv_screen_active(), "Abbrechen"));
        assert(lv_screen_active() == settings.getScreen() && lv_tabview_get_tab_active(tabs) == 2 && poweredOff == 0);
        assert(!lv_obj_is_visible(findLabel(settings.getScreen(), "Entsperren mit PIN")));
        // Confirm: powers off through the callback, then hands the settings back as well.
        click(findLabel(settings.getScreen(), LV_SYMBOL_POWER));
        click(findLabel(lv_screen_active(), "Ausschalten"));
        assert(poweredOff == 1 && lv_screen_active() == settings.getScreen() && lv_tabview_get_tab_active(tabs) == 2);
        Display::transitionToScreen(&Display::initScreen);
        settle();
    }
    // The demo variant's settings, with its power button, in both languages.
    unsigned demoPoweredOff = 0;
    auto &demo = Display::demoSettingsScreen;
    demo.setPowerOffCallback([&] { ++demoPoweredOff; });
    for (const char *language : {"de", "en"})
    {
        State::setDefaultLanguage(language);
        Display::transitionToScreen(&demo);
        settle();
        shot("demo-settings");
        click(findLabel(demo.getScreen(), LV_SYMBOL_POWER));
        assert(Display::isActive(&Display::confirmScreen));
        shot("demo-settings-power-off-confirm");
        click(findLabel(lv_screen_active(), std::string(language) == "de" ? "Abbrechen" : "Cancel"));
        assert(lv_screen_active() == demo.getScreen() && demoPoweredOff == 0);
        Display::transitionToScreen(&Display::initScreen);
        settle();
    }
    State::setDefaultLanguage("de");

    std::filesystem::remove_all(storage);
    std::puts("PASS touch warning seen for its 6 s; power-off confirmation on the real settings and demo settings screens");
    return 0;
}
