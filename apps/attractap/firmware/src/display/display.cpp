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

// display.cpp is the composition root: it owns the shared static state, brings
// up the driver + LVGL, and drives the main loop. The behaviour-bearing
// collaborators live in sibling translation units:
//   display_router.cpp  - screen routing (transitionToScreen)
//   display_input.cpp   - flush + touch input dispatch
//   display_popups.cpp  - global overlay popups
//   display_overlay.cpp - persistent device-info overlay

// Static member definitions
Logger Display::logger("Display");
uint32_t Display::screenWidth = 0;
uint32_t Display::screenHeight = 0;
IDisplayDriver *Display::driver = nullptr;
lv_display_t *Display::disp = NULL;
lv_indev_t *Display::indev = NULL;
std::string Display::deviceNameInitValue = "Attractap";

lv_obj_t *Display::deviceNameLabel = NULL;
lv_obj_t *Display::networkQualityContainer = NULL;
lv_obj_t *Display::networkQualityLabel = NULL;
State::NetworkQuality Display::networkQualityOverlayValue = State::NETWORK_QUALITY_GOOD;
bool Display::networkQualityOverlayInitialized = false;
BootScreen Display::bootScreen;
SetPinScreen Display::setPinScreen;
ConnectionConfigurationScreen Display::connectionConfigurationScreen;
InitScreen Display::initScreen;
Lockscreen Display::lockscreen;
NoResourcesScreen Display::noResourcesScreen;
ResourceListScreen Display::resourceListScreen;
ResourceDetailsScreen Display::resourceDetailsScreen;
EnrollmentScreen Display::enrollmentScreen;
ResetScreen Display::resetScreen;
SupervisionScreen Display::supervisionScreen;
FirmwareUpdateScreen Display::firmwareUpdateScreen;
#ifdef DEMO_MODE
DemoSettingsScreen Display::demoSettingsScreen;
#endif

std::function<void(int16_t, int16_t)> Display::touchCallback = nullptr;
lv_obj_t *Display::activePopup = nullptr;
lv_timer_t *Display::popupAutoCloseTimer = nullptr;

lv_obj_t *Display::drawerBackdrop = nullptr;
lv_obj_t *Display::drawerPanel = nullptr;
bool Display::drawerOpen = false;
lv_obj_t *Display::rebootConfirmOverlay = nullptr;
std::function<void()> Display::onOpenSettingsCallback = nullptr;
std::function<bool()> Display::drawerAvailableCallback = nullptr;
bool Display::gestureCandidate = false;
bool Display::gesturePrevPressed = false;
int16_t Display::gestureStartY = 0;

// Set during setup() if touch hardware was not found; popup is shown on the first loop() tick
// to ensure LVGL is fully running before creating overlay objects.
bool Display::touchWarningPending = false;

#if LV_USE_LOG != 0
/* Serial debugging */
void Display::logFromLvgl(lv_log_level_t level, const char *buf)
{
    switch (level)
    {
    case LV_LOG_LEVEL_ERROR:
        Display::logger.error(buf);
        break;
    case LV_LOG_LEVEL_WARN:
        Display::logger.info(buf); // map warn to info
        break;
    case LV_LOG_LEVEL_INFO:
        Display::logger.info(buf);
        break;
#ifdef ATTRACTAP_LV_PERF_MONITOR
    case LV_LOG_LEVEL_USER:
        /* LVGL sysmon perf logs arrive as USER level; surface them as info so
         * FPS / render / flush timing is visible on serial (PERFORMANCE_ANALYSIS.md A-4). */
        Display::logger.info(buf);
        break;
#endif
    case LV_LOG_LEVEL_TRACE:
    default:
        Display::logger.debug(buf);
        break;
    }
}
#endif

uint8_t Display::reboot_count = 0;
void Display::increase_reboot(void *arg)
{
#ifndef ATTRACTAP_HOST
    Display::reboot_count++;
    if (Display::reboot_count == 30)
    {
        esp_restart();
    }
#else
    (void)arg;
#endif
}

uint32_t Display::tick_cb()
{
    return millis();
}
