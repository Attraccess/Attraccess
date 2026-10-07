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


void Display::setupFramebuffer()
{
#ifndef ATTRACTAP_HOST
    /* Allocate draw buffers in bytes for LVGL v9.
     * Was 480x20 (1/24 of the frame) in internal DRAM, forcing 24 serialized
     * partial render+flush passes per full screen (~150ms/frame, "Bildaufbau
     * sehr langsam"). Enlarged to 480x120 (1/4) then 480x240 (1/2) double-
     * buffered in PSRAM: a full-screen first paint drops from 24 to 2 passes,
     * and the panel flushes concurrently (PERFORMANCE_ANALYSIS.md A-4). The
     * RGB panel framebuffer is also in PSRAM, so flush is PSRAM->PSRAM. */
    uint32_t buf_pixels = Display::screenWidth * 240; /* half of screen */
    uint32_t buf_size_bytes = buf_pixels * (LV_COLOR_DEPTH / 8);
    uint8_t *buf1 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_DMA);
    uint8_t *buf2 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_DMA);
    if (buf1 == nullptr || buf2 == nullptr)
    {
        /* Fall back to the old small single buffer if PSRAM is tight; log a
         * warning so a degraded rendering config is diagnosable on devices
         * with constrained PSRAM (Sourcery PR #1694). */
        if (buf1) heap_caps_free(buf1);
        if (buf2) heap_caps_free(buf2);
        buf_pixels = Display::screenWidth * 20;
        buf_size_bytes = buf_pixels * (LV_COLOR_DEPTH / 8);
        buf1 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_DMA);
        buf2 = NULL;
        if (buf1 == nullptr)
        {
            Display::logger.error("Draw-buffer allocation failed even for fallback; restarting");
            delay(100); // let the serial buffer flush before reset
            esp_restart();
        }
        Display::logger.warn("PSRAM draw-buffer alloc failed — falling back to 480x20 single buffer (degraded rendering)");
    }

    /* Create display and set buffers/callbacks (v9) */
    Display::disp = lv_display_create((int32_t)Display::screenWidth, (int32_t)Display::screenHeight);
    lv_display_set_flush_cb(Display::disp, Display::flush);
    lv_display_set_buffers(Display::disp, buf1, buf2, buf_size_bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);

#ifdef ATTRACTAP_LV_PERF_MONITOR
    /* Log FPS / render / flush timing to serial (LV_USE_PERF_MONITOR_LOG_MODE)
     * so Bildaufbau cost is measurable on hardware (PERFORMANCE_ANALYSIS.md A-4). */
    lv_sysmon_show_performance(Display::disp);
#endif

    /* Initialize input device (v9) */
    Display::indev = lv_indev_create();
    lv_indev_set_type(Display::indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(Display::indev, Display::touchpad_read);
    /* Touch sampling decoupled from refresh: LVGL defaults the indev read
     * timer to LV_DEF_REFR_PERIOD (24 ms), so a tap waits up to that before
     * the press is even seen — on top of the GT911 scan + render that feels
     * sluggish. Sample touch at 10 ms (100 Hz); refresh stays at 24 ms
     * (PERFORMANCE_ANALYSIS.md, measured: system ~90% idle, latency-bound). */
    lv_timer_set_period(lv_indev_get_read_timer(Display::indev), 10);

    const esp_timer_create_args_t reboot_timer_args = {
        .callback = &Display::increase_reboot,
        .arg = nullptr,
        .dispatch_method = ESP_TIMER_TASK,
        .name = "reboot",
        .skip_unhandled_events = false};

    DisplayTheme::init(disp);

    Display::initDeviceOverlay();
    Display::initDrawer();

    Display::transitionToScreen(&Display::bootScreen);

    if (!Display::driver->touchAvailable())
    {
        Display::logger.warn("Touch panel not detected — warning will be shown after first render");
        Display::touchWarningPending = true;
    }

    // Rendering + touch sampling on a dedicated task (ATT-554 item 7), pinned to
    // core 1 (away from the WiFi/LwIP core) at priority 4: above the app loop,
    // NFC task (1) and websocket client (3), so input/refresh never wait behind
    // blocking application work.
    xTaskCreatePinnedToCore(Display::renderTask, "LvglTask", 8192, nullptr, 4, nullptr, 1);

    Display::logger.info("Setup done");
#endif
}
