/**
 * Minimal display for ESP32-P4 - BootScreen only, no API/State/Network dependencies.
 */
#include "display_p4.hpp"

#if defined(DISPLAY_DRIVER_P4_DSI)

#include "driver/p4_dsi/p4_dsi_gt911_driver.hpp"

#endif

#include "../logger/logger.hpp"
#include "screens/boot/bootscreen.hpp"

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
std::function<void(int16_t, int16_t)> Display::touchCallback = nullptr;
lv_obj_t *Display::activePopup = nullptr;
lv_timer_t *Display::popupAutoCloseTimer = nullptr;
uint8_t Display::reboot_count = 0;

void Display::flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map)
{
    if (Display::driver)
        Display::driver->flush(area, px_map);
    lv_display_flush_ready(disp);
}

void Display::touchpad_read(lv_indev_t *indev_driver, lv_indev_data_t *data)
{
    if (!Display::driver)
    {
        data->state = LV_INDEV_STATE_RELEASED;
        return;
    }
    TouchPoint point;
    if (!Display::driver->readTouch(point) || !point.pressed)
    {
        data->state = LV_INDEV_STATE_RELEASED;
        return;
    }
    data->state = LV_INDEV_STATE_PRESSED;
    data->point.x = point.x;
    data->point.y = point.y;
    if (Display::touchCallback)
        Display::touchCallback(point.x, point.y);
}

uint32_t Display::tick_cb()
{
    return millis();
}

void Display::setup()
{
    Display::logger.info("Initializing");

#if defined(DISPLAY_DRIVER_P4_DSI)
    Display::driver = new P4DsiGt911Driver(Display::logger);
#else
    Display::driver = nullptr;
#endif

    if (!Display::driver || !Display::driver->begin())
    {
        Display::logger.error("Display driver init failed");
        while (1)
            delay(1000);
    }

    Display::screenWidth = Display::driver->width();
    Display::screenHeight = Display::driver->height();
    lv_init();

    lv_tick_set_cb(Display::tick_cb);

    const uint32_t buf_pixels = Display::screenWidth * 20;
    const uint32_t buf_size_bytes = buf_pixels * (LV_COLOR_DEPTH / 8);
    uint8_t *buf1 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_DMA);
    uint8_t *buf2 = NULL;

    Display::disp = lv_display_create((int32_t)Display::screenWidth, (int32_t)Display::screenHeight);
    lv_display_set_flush_cb(Display::disp, Display::flush);
    lv_display_set_buffers(Display::disp, buf1, buf2, buf_size_bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);

    Display::indev = lv_indev_create();
    lv_indev_set_type(Display::indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(Display::indev, Display::touchpad_read);

    lv_theme_t *base_theme = lv_theme_default_init(
        Display::disp,
        lv_palette_main(LV_PALETTE_BLUE),
        lv_palette_lighten(LV_PALETTE_BLUE, 2),
        false,
        &lv_font_montserrat_18);

    static lv_style_t global_bg_style;
    lv_style_init(&global_bg_style);
    lv_style_set_bg_color(&global_bg_style, lv_color_hex(0x1F2C47));
    lv_style_set_bg_grad_color(&global_bg_style, lv_color_hex(0x364C7C));
    lv_style_set_bg_grad_dir(&global_bg_style, LV_GRAD_DIR_VER);
    lv_style_set_bg_opa(&global_bg_style, LV_OPA_COVER);
    lv_style_set_text_color(&global_bg_style, lv_color_white());

    lv_obj_t *scr = lv_disp_get_scr_act(Display::disp);
    lv_obj_add_style(scr, &global_bg_style, 0);
    lv_display_set_theme(Display::disp, base_theme);

    Display::transitionToScreen(&Display::bootScreen);
    Display::logger.info("Setup done");
}

void Display::loop()
{
    lv_timer_handler();
    if (Display::activeScreen)
        Display::activeScreen->loop();
}

void Display::transitionToScreen(IScreen *screen)
{
    Display::transitionToScreen(screen, nullptr);
}

void Display::transitionToScreen(IScreen *screen, std::function<void()> onTransitionComplete)
{
    if (!screen)
        return;
    Display::logger.infof("Transitioning to screen: %s", screen->getName().c_str());
    if (!screen->isLoaded())
        screen->init();
    lv_obj_t *targetRoot = screen->getScreen();
    if (!targetRoot)
        return;
    IScreen *previousScreen = Display::activeScreen;
    if (Display::activeScreen)
        Display::activeScreen->onScreenLeave();
    Display::activeScreen = screen;
    lv_screen_load_anim(targetRoot, LV_SCR_LOAD_ANIM_FADE_IN, 500, 0, false);
    Display::transitionStartTime = millis();
    Display::transitionComplete = false;
    Display::onTransitionComplete = onTransitionComplete;
}

void Display::setTouchCallback(std::function<void(int16_t, int16_t)> callback)
{
    Display::touchCallback = callback;
}

void Display::setDeviceName(String deviceName)
{
    Display::deviceNameInitValue = deviceName;
}

void Display::showErrorPopup(const String &title, const String &message)
{
    (void)title;
    (void)message;
}

void Display::showInsufficientBalancePopup(std::function<void(uint32_t)> onStart, std::function<void()> onCancel)
{
    (void)onStart;
    (void)onCancel;
}

void Display::hidePopup()
{
}
