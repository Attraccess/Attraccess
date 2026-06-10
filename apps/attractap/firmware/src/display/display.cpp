#include "display.hpp"

#include <Wire.h>
#include "../utils.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

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
IScreen *Display::activeScreen = NULL;
std::vector<IScreen *> Display::pendingDestroyScreens;
uint32_t Display::transitionStartTime = 0;
bool Display::transitionComplete = true;
std::function<void()> Display::onTransitionComplete = nullptr;
String Display::deviceNameInitValue = "Attractap";

lv_obj_t *Display::deviceNameLabel = NULL;
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
FirmwareUpdateScreen Display::firmwareUpdateScreen;

std::function<void(int16_t, int16_t)> Display::touchCallback = nullptr;
lv_obj_t *Display::activePopup = nullptr;
lv_timer_t *Display::popupAutoCloseTimer = nullptr;

lv_obj_t *Display::drawerBackdrop = nullptr;
lv_obj_t *Display::drawerPanel = nullptr;
bool Display::drawerOpen = false;
std::function<void()> Display::onOpenSettingsCallback = nullptr;
bool Display::gestureCandidate = false;
bool Display::gesturePrevPressed = false;
int16_t Display::gestureStartY = 0;

// Set during setup() if touch hardware was not found; popup is shown on the first loop() tick
// to ensure LVGL is fully running before creating overlay objects.
static bool s_touchWarningPending = false;

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
    case LV_LOG_LEVEL_TRACE:
    default:
        Display::logger.debug(buf);
        break;
    }
}
static void lvgl_log_cb(lv_log_level_t level, const char *buf)
{
    Display::logFromLvgl(level, buf);
}
#endif

uint8_t Display::reboot_count = 0;
void Display::increase_reboot(void *arg)
{
    Display::reboot_count++;
    if (Display::reboot_count == 30)
    {
        esp_restart();
    }
}

uint32_t Display::tick_cb()
{
    return millis();
}

#ifdef HAS_IO_EXPANDER
void Display::setup(IOExpander *ioExpander)
#else
void Display::setup()
#endif
{
    Display::logger.info("Initializing");

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
                // Bit-banging the pins + re-running Wire.begin() must not race
                // other bus users (ATT-554).
                I2CBusGuard busGuard;
                // Free any I2C slave stuck mid-transaction before the next attempt.
                recoverI2CBus(PIN_TOUCH_I2C_SDA, PIN_TOUCH_I2C_SCL);
                Wire.begin(PIN_TOUCH_I2C_SDA, PIN_TOUCH_I2C_SCL);
                Wire.setTimeOut(50);
                Wire.setClock(ATTRACTAP_I2C_CLOCK_HZ);
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
    lv_log_register_print_cb(lvgl_log_cb);
#endif

    /* Set LVGL tick source (v9) */
    lv_tick_set_cb(Display::tick_cb);

    /* Allocate draw buffers in bytes for LVGL v9 */
    const uint32_t buf_pixels = Display::screenWidth * 20; /* eighth of screen to save RAM */
    const uint32_t buf_size_bytes = buf_pixels * (LV_COLOR_DEPTH / 8);
    uint8_t *buf1 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_DMA);
    uint8_t *buf2 = NULL; /* single buffering to further reduce RAM usage */

    /* Create display and set buffers/callbacks (v9) */
    Display::disp = lv_display_create((int32_t)Display::screenWidth, (int32_t)Display::screenHeight);
    lv_display_set_flush_cb(Display::disp, Display::flush);
    lv_display_set_buffers(Display::disp, buf1, buf2, buf_size_bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);

    /* Initialize input device (v9) */
    Display::indev = lv_indev_create();
    lv_indev_set_type(Display::indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(Display::indev, Display::touchpad_read);

    const esp_timer_create_args_t reboot_timer_args = {
        .callback = &Display::increase_reboot,
        .name = "reboot"};

    lv_theme_t *base_theme = lv_theme_default_init(
        disp,
        lv_palette_main(LV_PALETTE_BLUE),       /* Primary color */
        lv_palette_lighten(LV_PALETTE_BLUE, 2), /* Secondary color */
        false,                                  /* Dark mode */
        &lv_font_montserrat_18                  /* Normal font */
    );

    static lv_style_t global_bg_style;
    lv_style_init(&global_bg_style);

    /* Background gradient */
    lv_style_set_bg_color(&global_bg_style, lv_color_hex(0x1F2C47));
    lv_style_set_bg_grad_color(&global_bg_style, lv_color_hex(0x364C7C));
    lv_style_set_bg_grad_dir(&global_bg_style, LV_GRAD_DIR_VER);
    lv_style_set_bg_opa(&global_bg_style, LV_OPA_COVER);

    /* Default text color */
    lv_style_set_text_color(&global_bg_style, lv_color_white());

    lv_obj_t *scr = lv_disp_get_scr_act(disp);
    lv_obj_add_style(scr, &global_bg_style, 0);
    lv_display_set_theme(disp, base_theme);

    Display::initDeviceOverlay();
    Display::initDrawer();

    Display::transitionToScreen(&Display::bootScreen);

    if (!Display::driver->touchAvailable())
    {
        Display::logger.warn("Touch panel not detected — warning will be shown after first render");
        s_touchWarningPending = true;
    }

    // Rendering + touch sampling on a dedicated task (ATT-554 item 7), pinned to
    // core 1 (away from the WiFi/LwIP core) at priority 4: above the app loop,
    // NFC task (1) and websocket client (3), so input/refresh never wait behind
    // blocking application work.
    xTaskCreatePinnedToCore(Display::renderTask, "LvglTask", 8192, nullptr, 4, nullptr, 1);

    Display::logger.info("Setup done");
}

void Display::renderTask(void *parameter)
{
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
}

void Display::asyncCall(lv_async_cb_t cb, void *user_data)
{
    lv_lock();
    lv_async_call(cb, user_data);
    lv_unlock();
}

bool Display::hasTouchInput()
{
    return Display::driver && Display::driver->touchAvailable();
}

void Display::loop()
{
    // Runs on the main application loop; rendering itself lives on LvglTask
    // (renderTask). Everything below mutates LVGL objects, so hold lv_lock for
    // the duration (recursive FreeRTOS mutex, also taken by lv_timer_handler).
    lv_lock();

    if (s_touchWarningPending)
    {
        s_touchWarningPending = false;
        Display::showErrorPopup("Touch Unavailable",
                                "Touch panel not detected.\nCheck hardware and reboot.");
    }

    if (Display::activeScreen)
    {
        Display::activeScreen->loop();
    }

    if (!Display::transitionComplete)
    {
        uint32_t currentTime = millis();
        if (Display::transitionStartTime + Display::TRANSITION_DURATION + 500 < currentTime)
        {
            Display::transitionComplete = true;
            if (Display::onTransitionComplete)
            {
                Display::onTransitionComplete();
                Display::onTransitionComplete = nullptr;
            }
            if (!Display::pendingDestroyScreens.empty())
            {
                for (IScreen *scr : Display::pendingDestroyScreens)
                {
                    // Never tear down the screen that is currently active: a
                    // re-transition during the destroy window can make a queued
                    // screen active again, and freeing its LVGL tree would null
                    // its widget pointers (-> lv_obj_get_screen(NULL) assert ->
                    // loopTask hang -> task watchdog). transitionToScreen already
                    // dequeues reused screens; this is a final safety net.
                    if (scr && scr != Display::activeScreen)
                    {
                        Display::logger.debugf("Destroying screen: %s", scr->getName().c_str());
                        scr->destroy();
                    }
                }
                Display::pendingDestroyScreens.clear();
            }
        }
    }

    lv_unlock();
}
