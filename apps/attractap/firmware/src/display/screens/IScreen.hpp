#pragma once

#include <lvgl.h>
#include <Arduino.h>

class IScreen
{
public:
    virtual ~IScreen() = default;

    /** init must be idempotent so a screen can rebuild after destroy() */
    virtual void init() = 0;
    virtual void onScreenLeave() = 0;
    virtual void loop() = 0;
    virtual String getName() = 0;
    virtual lv_obj_t *getScreen() = 0;

    /** Destroy the LVGL tree to release RAM; default is no-op. */
    virtual void destroy() {}

    /** Whether the LVGL tree exists; default infers via getScreen(). */
    virtual bool isLoaded() { return getScreen() != nullptr; }

    /** Screens may opt-out of auto-unload (e.g. lockscreen). */
    virtual bool shouldAutoUnload() const { return true; }
};