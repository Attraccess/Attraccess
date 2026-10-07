#include "display.hpp"
#include "theme.hpp"
#include <vector>
#include <string>
#include <functional>

#include "../utils.hpp"
#include "platform.hpp"
#ifndef ATTRACTAP_HOST
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

#ifdef HAS_IO_EXPANDER
#include "../ioexpander/ioexpander.hpp"
#endif

#if defined(DISPLAY_DRIVER_GT911)
#include "driver/gt911/rgb_gt911_driver.hpp"
#endif
#if defined(DISPLAY_DRIVER_QUALIA)
#include "driver/qualia/qualia_ft_cst_driver.hpp"
#endif


#ifdef ATTRACTAP_HOST
void Display::setup(IDisplayDriver &hostDriver)
#elif defined(HAS_IO_EXPANDER)
void Display::setup(IOExpander *ioExpander)
#else
void Display::setup()
#endif
{
    Display::logger.info("Initializing");

#ifdef ATTRACTAP_HOST
    Display::driver = &hostDriver;
    if (!Display::driver->begin())
    {
        Display::logger.error("Host display driver init failed");
        return;
    }
    Display::screenWidth = Display::driver->width();
    Display::screenHeight = Display::driver->height();
    lv_init();
    lv_tick_set_cb(Display::tick_cb);
    static std::vector<uint16_t> buffer;
    buffer.resize(Display::screenWidth * 80);
    Display::disp = lv_display_create(static_cast<int32_t>(Display::screenWidth), static_cast<int32_t>(Display::screenHeight));
    lv_display_set_color_format(Display::disp, LV_COLOR_FORMAT_RGB565);
    lv_display_set_flush_cb(Display::disp, Display::flush);
    lv_display_set_buffers(Display::disp, buffer.data(), nullptr, buffer.size() * sizeof(buffer.front()), LV_DISPLAY_RENDER_MODE_PARTIAL);
    Display::indev = lv_indev_create();
    lv_indev_set_type(Display::indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(Display::indev, Display::touchpad_read);
    DisplayTheme::init(Display::disp);
    Display::initDeviceOverlay();
    Display::initDrawer();
    Display::transitionToScreen(&Display::bootScreen);
    Display::logger.info("Host display setup done");
#else

#if defined(DISPLAY_DRIVER_GT911)
#ifdef HAS_IO_EXPANDER
    Display::driver = new RgbGt911Driver(Display::logger, ioExpander);
#else
    Display::driver = new RgbGt911Driver(Display::logger);
#endif
#elif defined(DISPLAY_DRIVER_QUALIA)
    Display::driver = new QualiaFtCstDriver(Display::logger);
#else
    Display::driver = nullptr;
#endif

    // Bounded retry: a transient I2C glitch at boot (the GT911/RGB panel shares the
    // I2C bus with the PN532/IO-expander) can make begin() fail. Recover the bus and
    // retry a few times; if it still fails, reboot rather than hang forever.
    const uint8_t MAX_DISPLAY_INIT_ATTEMPTS = 5;
    bool driverReady = false;
    for (uint8_t attempt = 1; attempt <= MAX_DISPLAY_INIT_ATTEMPTS; attempt++)
    {
        if (Display::driver && Display::driver->begin())
        {
            driverReady = true;
            break;
        }

        Display::logger.errorf("Display driver init failed (attempt %u/%u)", attempt, MAX_DISPLAY_INIT_ATTEMPTS);

        if (attempt < MAX_DISPLAY_INIT_ATTEMPTS)
        {
#if defined(DISPLAY_DRIVER_GT911) && defined(PIN_TOUCH_I2C_SDA) && defined(PIN_TOUCH_I2C_SCL)
            {
                // Resetting the bus must not race other bus users (ATT-554).
                I2CBusGuard busGuard;
                // Clear any I2C slave stuck mid-transaction before the next
                // attempt (the driver toggles SCL until SDA releases).
                i2c_master_bus_reset(getSharedI2CBus());
            }
#endif
            delay(200);
        }
    }

    if (!driverReady)
    {
        Display::logger.error("Display driver init exhausted retries; restarting");
        delay(100); // let the serial buffer flush before reset
        esp_restart();
    }

    Display::screenWidth = Display::driver->width();
    Display::screenHeight = Display::driver->height();

    lv_init();

#if LV_USE_LOG != 0
    /* Route LVGL logs to our logger */
    lv_log_register_print_cb(Display::logFromLvgl);
#endif

    /* Set LVGL tick source (v9) */
    lv_tick_set_cb(Display::tick_cb);

    Display::setupFramebuffer();
#endif
}
