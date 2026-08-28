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

// st7701_type1_init_operations (formerly from Arduino_GFX) with the 180° flip
// done in the panel itself instead of in software (ATT-554 item 2):
//   - BK0 0xC7 (SDIR) = 0x04: source scan S960->S1 (X mirror)
//   - MADCTL 0x36 = 0x10 (ML): line scan bottom->top (Y mirror)
// A software `rotation 2` would force every LVGL flush through a per-pixel
// reversed-index copy into the PSRAM framebuffer; with the flip in hardware
// the flush is a plain row copy. Touch coordinates are mirrored in readTouch().
//
// The esp_lcd_st7701 driver writes MADCTL/COLMOD from panel_dev_config before
// this table runs; the explicit 0x36/0x3A entries below overwrite them with
// the intended values (the driver logs a benign warning for each).
static const st7701_lcd_init_cmd_t st7701_type1_flip180_init_cmds[] = {
    // {cmd, data, data_bytes, delay_ms}
    {0xFF, (uint8_t[]){0x77, 0x01, 0x00, 0x00, 0x10}, 5, 0}, // BK0 select

    {0xC0, (uint8_t[]){0x3B, 0x00}, 2, 0},
    {0xC1, (uint8_t[]){0x0D, 0x02}, 2, 0},
    {0xC2, (uint8_t[]){0x31, 0x05}, 2, 0},
    {0xC7, (uint8_t[]){0x04}, 1, 0}, // SDIR: X mirror (180° flip, part 1)
    {0xCD, (uint8_t[]){0x08}, 1, 0},

    // Positive Voltage Gamma Control
    {0xB0, (uint8_t[]){0x00, 0x11, 0x18, 0x0E, 0x11, 0x06, 0x07, 0x08, 0x07, 0x22, 0x04, 0x12, 0x0F, 0xAA, 0x31, 0x18}, 16, 0},
    // Negative Voltage Gamma Control
    {0xB1, (uint8_t[]){0x00, 0x11, 0x19, 0x0E, 0x12, 0x07, 0x08, 0x08, 0x08, 0x22, 0x04, 0x11, 0x11, 0xA9, 0x32, 0x18}, 16, 0},

    {0xFF, (uint8_t[]){0x77, 0x01, 0x00, 0x00, 0x11}, 5, 0}, // BK1 select

    {0xB0, (uint8_t[]){0x60}, 1, 0}, // Vop=4.7375v
    {0xB1, (uint8_t[]){0x32}, 1, 0}, // VCOM=32
    {0xB2, (uint8_t[]){0x07}, 1, 0}, // VGH=15v
    {0xB3, (uint8_t[]){0x80}, 1, 0},
    {0xB5, (uint8_t[]){0x49}, 1, 0}, // VGL=-10.17v
    {0xB7, (uint8_t[]){0x85}, 1, 0},
    {0xB8, (uint8_t[]){0x21}, 1, 0}, // AVDD=6.6 & AVCL=-4.6
    {0xC1, (uint8_t[]){0x78}, 1, 0},
    {0xC2, (uint8_t[]){0x78}, 1, 0},

    {0xE0, (uint8_t[]){0x00, 0x1B, 0x02}, 3, 0},
    {0xE1, (uint8_t[]){0x08, 0xA0, 0x00, 0x00, 0x07, 0xA0, 0x00, 0x00, 0x00, 0x44, 0x44}, 11, 0},
    {0xE2, (uint8_t[]){0x11, 0x11, 0x44, 0x44, 0xED, 0xA0, 0x00, 0x00, 0xEC, 0xA0, 0x00, 0x00}, 12, 0},
    {0xE3, (uint8_t[]){0x00, 0x00, 0x11, 0x11}, 4, 0},
    {0xE4, (uint8_t[]){0x44, 0x44}, 2, 0},
    {0xE5, (uint8_t[]){0x0A, 0xE9, 0xD8, 0xA0, 0x0C, 0xEB, 0xD8, 0xA0, 0x0E, 0xED, 0xD8, 0xA0, 0x10, 0xEF, 0xD8, 0xA0}, 16, 0},
    {0xE6, (uint8_t[]){0x00, 0x00, 0x11, 0x11}, 4, 0},
    {0xE7, (uint8_t[]){0x44, 0x44}, 2, 0},
    {0xE8, (uint8_t[]){0x09, 0xE8, 0xD8, 0xA0, 0x0B, 0xEA, 0xD8, 0xA0, 0x0D, 0xEC, 0xD8, 0xA0, 0x0F, 0xEE, 0xD8, 0xA0}, 16, 0},
    {0xEB, (uint8_t[]){0x02, 0x00, 0xE4, 0xE4, 0x88, 0x00, 0x40}, 7, 0},
    {0xEC, (uint8_t[]){0x3C, 0x00}, 2, 0},
    {0xED, (uint8_t[]){0xAB, 0x89, 0x76, 0x54, 0x02, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x20, 0x45, 0x67, 0x98, 0xBA}, 16, 0},

    //-----------VAP & VAN---------------
    {0xFF, (uint8_t[]){0x77, 0x01, 0x00, 0x00, 0x13}, 5, 0},
    {0xE5, (uint8_t[]){0xE4}, 1, 0},
    {0xFF, (uint8_t[]){0x77, 0x01, 0x00, 0x00, 0x00}, 5, 0},

    {0x36, (uint8_t[]){0x10}, 1, 0}, // MADCTL ML: Y mirror (180° flip, part 2)
    {0x21, (uint8_t[]){0x00}, 0, 0}, // IPS inversion on
    {0x3A, (uint8_t[]){0x60}, 1, 0}, // COLMOD: RGB666

    {0x11, (uint8_t[]){0x00}, 0, 120}, // Sleep Out + 120 ms
    {0x29, (uint8_t[]){0x00}, 0, 0},   // Display On
};

#ifdef HAS_IO_EXPANDER
RgbGt911Driver::RgbGt911Driver(Logger &logger, IOExpander *ioExpander)
    : logger(logger), ioExpander(ioExpander) {}
#else
RgbGt911Driver::RgbGt911Driver(Logger &logger) : logger(logger) {}
#endif

bool RgbGt911Driver::begin()
{
    logger.infof("RgbGt911Driver::begin() starting at t=%lu ms", millis());

    // === TOUCH INIT FIRST (before display, matching Waveshare V4 demo) ===
    // The GT911 is an I2C device independent of the display hardware.
    // Waveshare's official demo initializes touch BEFORE the panel.
    // Initializing after panel init causes GT911 to stop reporting touches,
    // likely because the ESP32 RGB LCD peripheral setup affects I2C bus state.
    delay(100); // Allow GT911 to settle after power-on (matches Waveshare)

#ifdef HAS_IO_EXPANDER
    if (ioExpander)
    {
        logger.info("Resetting touch panel via IO expander...");
        ioExpander->resetTouchPanel(); // Pulse TP_RST: LOW 20ms → HIGH 50ms
        logger.info("Touch panel reset complete");
    }
    else
    {
        logger.info("No IO expander — skipping touch panel reset");
    }
#endif

    logger.infof("Probing GT911 at 0x%02X/0x%02X (SDA=%d, SCL=%d)...",
                 Gt911Touch::ADDR_PRIMARY, Gt911Touch::ADDR_SECONDARY,
                 PIN_TOUCH_I2C_SDA, PIN_TOUCH_I2C_SCL);
    bool touchFound = false;
    {
        // Keep the whole GT911 probe/init atomic on the shared bus (ATT-554).
        I2CBusGuard busGuard;
        touchFound = touch.begin();
    }

    if (touchFound)
    {
        logger.infof("GT911 touch init SUCCESS at t=%lu ms", millis());
        touchInitialized = true;
    }
    else
    {
        logger.error("GT911 not found at either address — display will work without touch");
    }

    // === DISPLAY INIT SECOND ===
    logger.infof("Initializing ST7701 RGB display at t=%lu ms...", millis());

    // Panel init commands go over bit-banged 3-wire SPI on dedicated GPIOs
    // (the old Arduino_SWSPI bus).
    spi_line_config_t lineConfig = {};
    lineConfig.cs_io_type = IO_TYPE_GPIO;
    lineConfig.cs_gpio_num = 42;
    lineConfig.scl_io_type = IO_TYPE_GPIO;
    lineConfig.scl_gpio_num = 2;
    lineConfig.sda_io_type = IO_TYPE_GPIO;
    lineConfig.sda_gpio_num = 1;
    lineConfig.io_expander = nullptr;

    esp_lcd_panel_io_3wire_spi_config_t ioConfig = ST7701_PANEL_IO_3WIRE_SPI_CONFIG(lineConfig, 0);
    esp_err_t err = esp_lcd_new_panel_io_3wire_spi(&ioConfig, &panelIo);
    if (err != ESP_OK)
    {
        logger.errorf("3-wire SPI panel IO init failed: %s", esp_err_to_name(err));
        return false;
    }

    // RGB dot-clock config — replicates the effective Arduino_ESP32RGBPanel
    // values bit for bit: 12 MHz pclk (octal PSRAM), single framebuffer in
    // PSRAM, no bounce buffers, 16-bit bus, little-endian B/G/R lane order.
    esp_lcd_rgb_panel_config_t rgbConfig = {};
    rgbConfig.clk_src = LCD_CLK_SRC_DEFAULT;
    rgbConfig.timings.pclk_hz = 12 * 1000 * 1000;
    rgbConfig.timings.h_res = 480;
    rgbConfig.timings.v_res = 480;
    rgbConfig.timings.hsync_front_porch = 10;
    rgbConfig.timings.hsync_pulse_width = 8;
    rgbConfig.timings.hsync_back_porch = 50;
    rgbConfig.timings.vsync_front_porch = 10;
    rgbConfig.timings.vsync_pulse_width = 8;
    rgbConfig.timings.vsync_back_porch = 20;
    rgbConfig.timings.flags.hsync_idle_low = 0;  // polarity 1
    rgbConfig.timings.flags.vsync_idle_low = 0;  // polarity 1
    rgbConfig.timings.flags.de_idle_high = 0;
    rgbConfig.timings.flags.pclk_active_neg = 0;
    rgbConfig.timings.flags.pclk_idle_high = 0;
    rgbConfig.data_width = 16;
    rgbConfig.in_color_format = LCD_COLOR_FMT_RGB565;
    rgbConfig.out_color_format = LCD_COLOR_FMT_RGB565;
    rgbConfig.num_fbs = 1;
    rgbConfig.bounce_buffer_size_px = 0;
    rgbConfig.dma_burst_size = 64;
    rgbConfig.hsync_gpio_num = (gpio_num_t)38;
    rgbConfig.vsync_gpio_num = (gpio_num_t)39;
    rgbConfig.de_gpio_num = (gpio_num_t)40;
    rgbConfig.pclk_gpio_num = (gpio_num_t)41;
    rgbConfig.disp_gpio_num = (gpio_num_t)-1;
    // Little-endian lane order (data[0..4]=B0..B4, [5..10]=G0..G5, [11..15]=R0..R4)
    const int dataPins[16] = {5, 45, 48, 47, 21,          // B0..B4
                              14, 13, 12, 11, 10, 9,      // G0..G5
                              46, 3, 8, 18, 17};          // R0..R4
    for (int i = 0; i < 16; i++)
    {
        rgbConfig.data_gpio_nums[i] = (gpio_num_t)dataPins[i];
    }
    rgbConfig.flags.disp_active_low = 1;
    rgbConfig.flags.fb_in_psram = 1;

    st7701_vendor_config_t vendorConfig = {};
    vendorConfig.init_cmds = st7701_type1_flip180_init_cmds;
    vendorConfig.init_cmds_size = sizeof(st7701_type1_flip180_init_cmds) / sizeof(st7701_lcd_init_cmd_t);
    vendorConfig.rgb_config = &rgbConfig;
    vendorConfig.flags.use_mipi_interface = 0;
    vendorConfig.flags.mirror_by_cmd = 0;
    vendorConfig.flags.auto_del_panel_io = 0;

    esp_lcd_panel_dev_config_t panelConfig = {};
    panelConfig.reset_gpio_num = (gpio_num_t)-1;
    panelConfig.rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB;
    panelConfig.bits_per_pixel = 16;
    panelConfig.vendor_config = &vendorConfig;

    err = esp_lcd_new_panel_st7701(panelIo, &panelConfig, &panel);
    if (err != ESP_OK)
    {
        logger.errorf("esp_lcd_new_panel_st7701 failed: %s", esp_err_to_name(err));
        return false;
    }
    err = esp_lcd_panel_reset(panel);
    if (err == ESP_OK)
    {
        err = esp_lcd_panel_init(panel); // sends the init table, then starts RGB refresh
    }
    if (err != ESP_OK)
    {
        logger.errorf("ST7701 panel init failed: %s", esp_err_to_name(err));
        return false;
    }

    screenWidth = 480;
    screenHeight = 480;

    logger.infof("Display init DONE at t=%lu ms: %ux%u",
                 millis(), (unsigned)screenWidth, (unsigned)screenHeight);

    initialized = true;
    return true;
}

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
