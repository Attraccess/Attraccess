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


void Display::renderTask(void *parameter)
{
#ifndef ATTRACTAP_HOST
    (void)parameter;
    while (true)
    {
        // lv_timer_handler self-locks via lv_lock() (LV_USE_OS LV_OS_FREERTOS)
        // and returns the time until the next ready timer.
        uint32_t delayMs = lv_timer_handler();
        if (delayMs == LV_NO_TIMER_READY)
        {
            delayMs = LV_DEF_REFR_PERIOD;
        }
        if (delayMs < 1)
        {
            delayMs = 1;
        }
        else if (delayMs > LV_DEF_REFR_PERIOD)
        {
            delayMs = LV_DEF_REFR_PERIOD;
        }
        vTaskDelay(pdMS_TO_TICKS(delayMs));
    }
#else
    (void)parameter;
#endif
}

void Display::asyncCall(lv_async_cb_t cb, void *user_data)
{
#ifdef ATTRACTAP_HOST
    lv_async_call(cb, user_data);
#else
    lv_lock();
    lv_async_call(cb, user_data);
    lv_unlock();
#endif
}

bool Display::hasTouchInput()
{
    return Display::driver && Display::driver->touchAvailable();
}

void Display::loop()
{
#ifdef ATTRACTAP_HOST
    Display::updateDrawerAvailability();
    Display::updateNetworkQualityOverlay();
    Display::advanceScreenRouter();
    return;
#endif
    // Runs on the main application loop; rendering itself lives on LvglTask
    // (renderTask). Everything below mutates LVGL objects, so hold lv_lock for
    // the duration (recursive FreeRTOS mutex, also taken by lv_timer_handler).
    lv_lock();

    if (Display::touchWarningPending)
    {
        Display::touchWarningPending = false;
        Display::showErrorPopup("Touch Unavailable",
                                "Touch panel not detected.\nCheck hardware and reboot.");
    }

    Display::updateDrawerAvailability();
    Display::updateNetworkQualityOverlay();
    Display::advanceScreenRouter();

    lv_unlock();
}
