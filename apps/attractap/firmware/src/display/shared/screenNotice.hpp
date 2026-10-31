#pragma once

#include <lvgl.h>

#include "../i18n.hpp"

// A short message that belongs to the screen it is shown on. It is a child of
// that screen's root, so it vanishes with the screen and never blocks input
// beyond its own area. Tapping it or the auto-hide timeout dismisses it.
class ScreenNotice {
public:
    enum class Kind { Info, Success, Error };

    // Default time before the notice hides itself; errors stay longer.
    static uint32_t defaultDurationMs(Kind kind);

    // Replaces any current notice. `durationMs` 0 selects the default for `kind`.
    void show(lv_obj_t *screenRoot, Kind kind, const FirmwareI18n::Text &title,
              const FirmwareI18n::Text &message, uint32_t durationMs = 0);
    void clear();
    bool visible() const { return root != nullptr; }

private:
    lv_obj_t *root = nullptr;
    lv_timer_t *timer = nullptr;
};
