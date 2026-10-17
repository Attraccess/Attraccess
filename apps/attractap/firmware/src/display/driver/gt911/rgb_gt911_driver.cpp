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

#ifdef HAS_IO_EXPANDER
#include "../../../ioexpander/ioexpander.hpp"
#endif

#include "st7701_flip180_commands.hpp"

bool RgbGt911Driver::begin()
{
    logger.infof("RgbGt911Driver::begin() starting at t=%lu ms", static_cast<unsigned long>(millis()));

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
        logger.infof("GT911 touch init SUCCESS at t=%lu ms", static_cast<unsigned long>(millis()));
        touchInitialized = true;
    }
    else
    {
        logger.error("GT911 not found at either address — display will work without touch");
    }

    // === DISPLAY INIT SECOND ===
    logger.infof("Initializing ST7701 RGB display at t=%lu ms...", static_cast<unsigned long>(millis()));

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
                 static_cast<unsigned long>(millis()), (unsigned)screenWidth, (unsigned)screenHeight);

    initialized = true;
    return true;
}
