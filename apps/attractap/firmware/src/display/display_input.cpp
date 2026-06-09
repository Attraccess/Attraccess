#include "display.hpp"
#include "../utils.hpp"

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

/* Read the touchpad (LVGL v9 signature) */
void Display::touchpad_read(lv_indev_t *indev_driver, lv_indev_data_t *data)
{
    if (!Display::driver)
    {
        data->state = LV_INDEV_STATE_RELEASED;
        return;
    }

    // The GT911 shares the I2C bus with the PN532; serialize the hardware read
    // against NFC polling on the app loop task (ATT-548). Scope the lock to the
    // bus transaction only — gesture/callback dispatch runs unlocked.
    TouchPoint point;
    bool gotTouch;
    {
        I2CBusGuard _i2c;
        gotTouch = Display::driver->readTouch(point);
    }
    if (!gotTouch || !point.pressed)
    {
        data->state = LV_INDEV_STATE_RELEASED;
        Display::handleGestureSample(0, 0, false);
        return;
    }

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
