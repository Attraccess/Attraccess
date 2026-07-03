#pragma once

#include <string>

#include <lvgl.h>

/**
 * Set a label's text only when it actually changed.
 *
 * lv_label_set_text() invalidates the label unconditionally, so calling it from
 * a screen's loop() every tick re-renders the label every refresh cycle forever
 * (ATT-554 item 5). Compare against the current text first; screen loop()
 * implementations must use this instead of raw lv_label_set_text().
 */
static inline void setLabelTextIfChanged(lv_obj_t *label, const char *text)
{
    if (label == nullptr || text == nullptr)
    {
        return;
    }
    const char *current = lv_label_get_text(label);
    if (current != nullptr && strcmp(current, text) == 0)
    {
        return;
    }
    lv_label_set_text(label, text);
}

class IScreen
{
public:
    virtual ~IScreen() = default;

    /** init must be idempotent so a screen can rebuild after destroy() */
    virtual void init() = 0;
    virtual void onScreenLeave() = 0;
    virtual void loop() = 0;
    virtual std::string getName() = 0;
    virtual lv_obj_t *getScreen() = 0;

    /** Destroy the LVGL tree to release RAM; default is no-op. */
    virtual void destroy() {}

    /** Whether the LVGL tree exists; default infers via getScreen(). */
    virtual bool isLoaded() { return getScreen() != nullptr; }

    /** Screens may opt-out of auto-unload (e.g. lockscreen). */
    virtual bool shouldAutoUnload() const { return true; }
};