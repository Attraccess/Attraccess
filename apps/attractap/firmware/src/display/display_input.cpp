#include "display.hpp"
#include <functional>
#ifdef ATTRACTAP_TEST_HOOKS
#include "../testhooks/test_hooks.hpp"
#endif

uint32_t Display::touchPressSequence = 0;
static bool touchPressed = false;

// Input dispatch and frame flushing: bridges the display driver to LVGL's
// flush/indev callbacks and forwards touch points to an optional consumer.

/* Display flushing (LVGL v9 signature) */
void Display::flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map)
{
    if (Display::driver)
    {
        Display::driver->flush(area, px_map);
    }
    lv_display_flush_ready(disp);
}

const uint8_t *Display::frameBuffer()
{
    return Display::driver ? Display::driver->frameBuffer() : nullptr;
}

// True while a finger is down; fills `point` in display coordinates.
static bool readPressedPoint(IDisplayDriver *driver, TouchPoint &point)
{
#ifdef ATTRACTAP_TEST_HOOKS
    // A gesture injected over serial replaces the panel while it runs, so
    // everything below handles it exactly like a real finger.
    if (TestHooks::injectedTouch(point))
    {
        return point.pressed;
    }
#endif
    return driver->readTouch(point) && point.pressed;
}

/* Read the touchpad (LVGL v9 signature) */
void Display::touchpad_read(lv_indev_t *indev_driver, lv_indev_data_t *data)
{
    if (!Display::driver)
    {
        touchPressed = false;
        data->state = LV_INDEV_STATE_RELEASED;
        return;
    }

    TouchPoint point;
    if (!readPressedPoint(Display::driver, point))
    {
        touchPressed = false;
        data->state = LV_INDEV_STATE_RELEASED;
        Display::handleGestureSample(0, 0, false);
        return;
    }

    if (!touchPressed) ++Display::touchPressSequence;
    touchPressed = true;
    data->state = LV_INDEV_STATE_PRESSED;
    data->point.x = point.x;
    data->point.y = point.y;

    Display::handleGestureSample(point.x, point.y, true);

    if (Display::touchCallback)
    {
        Display::touchCallback(point.x, point.y);
    }
}

void Display::setTouchCallback(std::function<void(int16_t, int16_t)> callback)
{
    Display::touchCallback = callback;
}
