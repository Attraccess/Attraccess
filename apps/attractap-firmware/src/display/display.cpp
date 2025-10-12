#include "display.hpp"

// Static member definitions
uint32_t Display::screenWidth = 0;
uint32_t Display::screenHeight = 0;
TouchDrvGT911 Display::GT911;
int16_t Display::x[5] = {0};
int16_t Display::y[5] = {0};
lv_display_t *Display::disp = NULL;
lv_indev_t *Display::indev = NULL;
IScreen *Display::activeScreen = NULL;

Lockscreen Display::lockscreen;
InitScreen Display::initScreen;
BootScreen Display::bootScreen;
SetPinScreen Display::setPinScreen;
ConnectionConfigurationScreen Display::connectionConfigurationScreen;
Unlockedscreen Display::unlockedScreen;

Arduino_DataBus *Display::bus = NULL;

Arduino_ESP32RGBPanel *Display::rgbpanel = NULL;
Arduino_RGB_Display *Display::gfx = NULL;

Logger Display::logger("Display");

#if LV_USE_LOG != 0
/* Serial debugging */
void Display::debug_print(const char *buf)
{
    Display::logger.debug(buf);
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

/* Display flushing (LVGL v9 signature) */
void Display::flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map)
{
    uint32_t w = (area->x2 - area->x1 + 1);
    uint32_t h = (area->y2 - area->y1 + 1);

    /* LVGL v9 provides px_map as a byte pointer in the configured color format.
       We assume LV_COLOR_DEPTH == 16 (RGB565). */
    Display::gfx->draw16bitRGBBitmap(area->x1, area->y1, (uint16_t *)px_map, w, h);

    lv_display_flush_ready(disp);
}

/* Read the touchpad (LVGL v9 signature) */
void Display::touchpad_read(lv_indev_t *indev_driver, lv_indev_data_t *data)
{
    uint8_t touched = Display::GT911.getPoint(Display::x, Display::y, Display::GT911.getSupportTouchPoint());

    if (touched <= 0)
    {
        data->state = LV_INDEV_STATE_RELEASED;
        return;
    }

    Display::logger.debug((String(millis()) + "ms ").c_str());
    for (int i = 0; i < touched; ++i)
    {
        int16_t touchX = Display::x[i];
        int16_t touchY = Display::y[i];
        switch (Display::gfx->getRotation())
        {
        case 0:
            break;
        case 1:
            touchX = Display::y[i];
            touchY = Display::gfx->height() - x[i];
            break;
        case 2:
            touchX = Display::gfx->width() - x[i];
            touchY = Display::gfx->height() - y[i];
            break;
        case 3:
            touchX = Display::gfx->width() - y[i];
            touchY = Display::x[i];
            break;
        }
        data->state = LV_INDEV_STATE_PRESSED;

        /*Set the coordinates*/
        data->point.x = touchX;
        data->point.y = touchY;

        Display::logger.debug((String(touchX) + "Data x ").c_str());
        Display::logger.debug((String(touchY) + "Data y ").c_str());

        // gfx->fillCircle(touchX, touchY, 5, BLUE);
    }
}

uint32_t Display::tick_cb()
{
    return millis();
}

void Display::setup()
{
    Display::logger.info("Initializing");

    // Defer hardware object construction until setup time
    Display::bus = new Arduino_SWSPI(
        GFX_NOT_DEFINED /* DC */, 42 /* CS */,
        2 /* SCK */, 1 /* MOSI */, GFX_NOT_DEFINED /* MISO */);

    Display::rgbpanel = new Arduino_ESP32RGBPanel(
        40 /* DE */, 39 /* VSYNC */, 38 /* HSYNC */, 41 /* PCLK */,
        46 /* R0 */, 3 /* R1 */, 8 /* R2 */, 18 /* R3 */, 17 /* R4 */,
        14 /* G0 */, 13 /* G1 */, 12 /* G2 */, 11 /* G3 */, 10 /* G4 */, 9 /* G5 */,
        5 /* B0 */, 45 /* B1 */, 48 /* B2 */, 47 /* B3 */, 21 /* B4 */,
        1 /* hsync_polarity */, 10 /* hsync_front_porch */, 8 /* hsync_pulse_width */, 50 /* hsync_back_porch */,
        1 /* vsync_polarity */, 10 /* vsync_front_porch */, 8 /* vsync_pulse_width */, 20 /* vsync_back_porch */);

    Display::gfx = new Arduino_RGB_Display(
        480 /* width */, 480 /* height */, Display::rgbpanel, 2 /* rotation */, true /* auto_flush */,
        Display::bus, GFX_NOT_DEFINED /* RST */, st7701_type1_init_operations, sizeof(st7701_type1_init_operations));

    Display::GT911.setPins(-1, 16);
    if (!Display::GT911.begin(Wire, GT911_SLAVE_ADDRESS_L, 15, 7))
    {
        while (1)
        {
            Display::logger.error("Failed to find GT911 - check your wiring!");
            delay(1000);
        }
    }
    Display::logger.info("Init GT911 Sensor success!");

    Display::GT911.setHomeButtonCallback([](void *user_data)
                                         { Display::logger.info("Home button pressed!"); },
                                         NULL);
    Display::GT911.setMaxTouchPoint(1); // max is 5

    Display::gfx->begin();

    Display::screenWidth = Display::gfx->width();
    Display::screenHeight = Display::gfx->height();

    lv_init();

    /* Set LVGL tick source (v9) */
    lv_tick_set_cb(Display::tick_cb);

    /* Allocate draw buffers in bytes for LVGL v9 */
    const uint32_t buf_pixels = Display::screenWidth * Display::screenHeight / 4; /* quarter screen */
    const uint32_t buf_size_bytes = buf_pixels * (LV_COLOR_DEPTH / 8);
    uint8_t *buf1 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_DMA);
    uint8_t *buf2 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_DMA);

#if LV_USE_LOG != 0
    lv_log_register_print_cb(Display::debug_print); /* register print function for debugging */
#endif

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

    Display::lockscreen.init();
    Display::initScreen.init();
    Display::bootScreen.init();
    Display::setPinScreen.init();
    Display::connectionConfigurationScreen.init();
    Display::unlockedScreen.init();

    Display::transitionToScreen(&Display::bootScreen);

    Display::logger.info("Setup done");
}

void Display::loop()
{
    lv_timer_handler(); /* let the GUI do its work */
    Display::activeScreen->loop();
}

void Display::transitionToScreen(IScreen *screen)
{
    Display::activeScreen = screen;
    lv_screen_load_anim(Display::activeScreen->getScreen(), LV_SCR_LOAD_ANIM_FADE_IN, 400, 0, false);
}