#include "qualia_ft_cst_driver.hpp"
#include "../../../platform.hpp"
#include "../../../utils.hpp"
#include "qualia_pins.hpp"

#include "esp_io_expander_tca9554.h"
#include "esp_lcd_panel_rgb.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_lcd_panel_io_additions.h"
#include "esp_lcd_st7701.h"

#ifndef I2C_TOUCH_ADDR
#define I2C_TOUCH_ADDR 0x48
#endif

// FocalTech register map (FT6206 / CST826-compatible)
#define FT_REG_TD_STATUS 0x02 // number of touch points (low nibble)


QualiaFtCstDriver::QualiaFtCstDriver(Logger &logger) : logger(logger) {}


void QualiaFtCstDriver::flush(const lv_area_t *area, uint8_t *px_map)
{
    if (!initialized || !panel)
    {
        return;
    }

    esp_lcd_panel_draw_bitmap(panel, area->x1, area->y1, area->x2 + 1, area->y2 + 1, px_map);
}

bool QualiaFtCstDriver::readTouch(TouchPoint &point)
{
    point.pressed = false;

    if (!initialized || !touchOK || !touchDev)
    {
        return false;
    }

    // Serialize the touch read against PN532 traffic on the shared bus
    // (ATT-554) — same rationale as RgbGt911Driver::readTouch.
    I2CBusGuard busGuard;

    // One burst read: TD_STATUS + P1 XH/XL/YH/YL — a single atomic transaction.
    uint8_t reg = FT_REG_TD_STATUS;
    uint8_t data[5] = {0};
    if (i2c_master_transmit_receive(touchDev, &reg, 1, data, sizeof(data), ATTRACTAP_I2C_XFER_TIMEOUT_MS) != ESP_OK)
    {
        return false;
    }

    uint8_t touches = data[0] & 0x0F;
    if (touches == 0 || touches > 2)
    {
        return false;
    }

    point.x = (int16_t)(((data[1] & 0x0F) << 8) | data[2]);
    point.y = (int16_t)(((data[3] & 0x0F) << 8) | data[4]);
    point.pressed = true;
    return true;
}
