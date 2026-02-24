#include "p4_dsi_gt911_driver.hpp"

#if defined(CONFIG_IDF_TARGET_ESP32P4)

#include <Arduino_GFX_Library.h>

#if defined(P4_PANEL_JC1060P470)
// Guition JC1060P470 7" 1024x600 - WORKING CONFIG (ESPHome: RST 5, hsync 20)
#define DSI_HSYNC_PULSE  20
#define DSI_HSYNC_BACK   160
#define DSI_HSYNC_FRONT  160
#define DSI_VSYNC_PULSE  10
#define DSI_VSYNC_BACK   23
#define DSI_VSYNC_FRONT  12
#define DSI_PREFER_SPEED 48000000
#define DSI_LANE_RATE    750
#define PANEL_WIDTH      1024
#define PANEL_HEIGHT     600
#define PIN_CTP_RST      22
#define PIN_CTP_INT      21
#define PIN_LCD_RST      5
#define PIN_LCD_BL       23
#else
// 4.3" 480x480 DSI (4DS MIPI / AliExpress)
#define DSI_HSYNC_PULSE  20
#define DSI_HSYNC_BACK   20
#define DSI_HSYNC_FRONT  40
#define DSI_VSYNC_PULSE  4
#define DSI_VSYNC_BACK   8
#define DSI_VSYNC_FRONT  20
#define DSI_PREFER_SPEED 48000000
#define DSI_LANE_RATE    750
#define PANEL_WIDTH      480
#define PANEL_HEIGHT     480
#define PIN_CTP_RST      4
#define PIN_CTP_INT      5
#define PIN_LCD_RST      23
#define PIN_LCD_BL       22
#endif

#ifndef PIN_I2C_SDA
#define PIN_I2C_SDA 7
#endif
#ifndef PIN_I2C_SCL
#define PIN_I2C_SCL 8
#endif

P4DsiGt911Driver::P4DsiGt911Driver(Logger &logger) : logger(logger) {}

bool P4DsiGt911Driver::begin()
{
    // Backlight on first - PWM; active-high (duty 255 = on) for Guition JC1060P470
#ifndef P4_LCD_BL_ACTIVE_HIGH
#define P4_LCD_BL_ACTIVE_HIGH 0
#endif
    pinMode(PIN_LCD_BL, OUTPUT);
    ledcAttach(PIN_LCD_BL, 5000, 8);
    ledcWrite(PIN_LCD_BL, P4_LCD_BL_ACTIVE_HIGH ? 255 : 0);
    delay(100);

    dsipanel = new Arduino_ESP32DSIPanel(
        DSI_HSYNC_PULSE, DSI_HSYNC_BACK, DSI_HSYNC_FRONT,
        DSI_VSYNC_PULSE, DSI_VSYNC_BACK, DSI_VSYNC_FRONT,
        DSI_PREFER_SPEED, DSI_LANE_RATE);

    gfx = new Arduino_DSI_Display(
        PANEL_WIDTH, PANEL_HEIGHT, dsipanel, 1 /* rotation: 1 = +90° portrait */, true /* auto_flush */,
        PIN_LCD_RST, jd9165_init_operations,
        sizeof(jd9165_init_operations) / sizeof(lcd_init_cmd_t));

    if (!gfx->begin())
    {
        logger.error("DSI display begin failed");
        return false;
    }

    // Backlight already on above; ensure it stays on

    // GT911 touch on I2C
    touch.setPins(PIN_CTP_RST, PIN_CTP_INT);
    if (!touch.begin(Wire, GT911_SLAVE_ADDRESS_L, PIN_I2C_SDA, PIN_I2C_SCL))
    {
        logger.error("GT911 touch init failed - check I2C wiring");
        // Continue without touch - display still works
    }
    else
    {
        logger.info("GT911 touch init OK");
        touch.setMaxTouchPoint(1);
    }

    screenWidth = gfx->width();
    screenHeight = gfx->height();
    initialized = true;

    // Direct fill test: verify display path before LVGL (white screen)
    gfx->fillScreen(0xFFFF);
    delay(100);

    return true;
}

void P4DsiGt911Driver::flush(const lv_area_t *area, uint8_t *px_map)
{
    if (!initialized || !gfx)
        return;

    uint32_t w = (area->x2 - area->x1 + 1);
    uint32_t h = (area->y2 - area->y1 + 1);
    gfx->draw16bitRGBBitmap(area->x1, area->y1, (uint16_t *)px_map, w, h);
}

bool P4DsiGt911Driver::readTouch(TouchPoint &point)
{
    point.pressed = false;
    if (!initialized || !gfx)
        return false;

    uint8_t touched = touch.getPoint(x, y, touch.getSupportTouchPoint());
    if (touched <= 0)
        return false;

    int16_t touchX = x[0];
    int16_t touchY = y[0];

    switch (gfx->getRotation())
    {
    case 0:
        break;
    case 1:
        touchX = y[0];
        touchY = gfx->height() - x[0];
        break;
    case 2:
        touchX = gfx->width() - x[0];
        touchY = gfx->height() - y[0];
        break;
    case 3:
        touchX = gfx->width() - y[0];
        touchY = x[0];
        break;
    default:
        break;
    }

    point.x = touchX;
    point.y = touchY;
    point.pressed = true;
    return true;
}

#endif // CONFIG_IDF_TARGET_ESP32P4
