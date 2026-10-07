#include "rgb_gt911_driver.hpp"
#include "../../../platform.hpp"
#include "../../../utils.hpp"

#include "esp_lcd_panel_rgb.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_lcd_panel_io_additions.h"
#include "esp_lcd_st7701.h"

#ifdef HAS_IO_EXPANDER
#include "../../../ioexpander/ioexpander.hpp"
#endif


#ifdef HAS_IO_EXPANDER
RgbGt911Driver::RgbGt911Driver(Logger &logger, IOExpander *ioExpander)
    : logger(logger), ioExpander(ioExpander) {}
#else
RgbGt911Driver::RgbGt911Driver(Logger &logger) : logger(logger) {}
#endif


void RgbGt911Driver::flush(const lv_area_t *area, uint8_t *px_map)
{
    if (!initialized || !panel)
    {
        return;
    }

    esp_lcd_panel_draw_bitmap(panel, area->x1, area->y1, area->x2 + 1, area->y2 + 1, px_map);
}

bool RgbGt911Driver::readTouch(TouchPoint &point)
{
    point.pressed = false;

    if (!initialized || !touchInitialized)
    {
        return false;
    }

    int16_t rawX = 0;
    int16_t rawY = 0;
    int touched = 0;
    bool stale = false;
    {
        // One GT911 point read = one atomic conversation on the shared bus, so
        // it can never interleave with a PN532 exchange on the NFC task
        // (ATT-554 crash: interleaved transactions wedged the I2C driver).
        // NOTE: we already hold lv_lock here (LVGL indev read) — I2CBusGuard is
        // a leaf lock, NFC code never takes lv_lock while holding it.
        I2CBusGuard busGuard;
        touched = touch.getPoint(rawX, rawY, stale);
    }

    if (touched <= 0)
    {
        // The GT911 scans every 5-15 ms while LVGL polls every 15 ms
        // (LV_DEF_REFR_PERIOD); a poll can land before the controller has a
        // fresh sample. Treating that as "finger lifted" splits one press into
        // several press/release pairs — each pair is a CLICKED event, so
        // switches toggled right back and taps got swallowed (ATT-541). Hold
        // the last known press through stale polls; a real release is a fresh
        // empty sample and is still reported immediately. The hold window is
        // capped so a wedged controller/bus cannot leave a press stuck.
        if (stale && lastTouchPressed && (millis() - lastFreshSampleMs) <= TOUCH_STALE_HOLD_MS)
        {
            point = lastTouchPoint;
            point.pressed = true;
            return true;
        }
        if (!stale)
        {
            lastFreshSampleMs = millis();
        }
        lastTouchPressed = false;
        return false;
    }

    lastFreshSampleMs = millis();

    logger.debugf("Touch detected: touched=%d, x=%d, y=%d", touched, rawX, rawY);

    // The 180° flip lives in the panel init sequence (no software rotation), so
    // the GT911 still reports coordinates in the unflipped orientation: mirror
    // both axes to match what is on screen.
    point.x = (int16_t)(screenWidth - 1) - rawX;
    point.y = (int16_t)(screenHeight - 1) - rawY;
    point.pressed = true;

    lastTouchPoint = point;
    lastTouchPressed = true;
    return true;
}
