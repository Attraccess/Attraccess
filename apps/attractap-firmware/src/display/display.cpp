#include "display.hpp"

// Static member definitions
Logger Display::logger("Display");
uint32_t Display::screenWidth = 0;
uint32_t Display::screenHeight = 0;
TouchDrvGT911 Display::GT911;
int16_t Display::x[5] = {0};
int16_t Display::y[5] = {0};
lv_display_t *Display::disp = NULL;
lv_indev_t *Display::indev = NULL;
IScreen *Display::activeScreen = NULL;
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

std::function<void(int16_t, int16_t)> Display::touchCallback = nullptr;

Arduino_DataBus *Display::bus = NULL;

Arduino_ESP32RGBPanel *Display::rgbpanel = NULL;
Arduino_RGB_Display *Display::gfx = NULL;

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

        if (Display::touchCallback)
        {
            Display::touchCallback(touchX, touchY);
        }
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

    Display::bootScreen.init();
    Display::setPinScreen.init();
    Display::connectionConfigurationScreen.init();
    Display::initScreen.init();
    Display::lockscreen.init();
    Display::noResourcesScreen.init();
    Display::resourceListScreen.init();
    Display::resourceDetailsScreen.init();
    Display::enrollmentScreen.init();

    Display::initDeviceOverlay();

    Display::transitionToScreen(&Display::bootScreen);

    Display::logger.info("Setup done");
}

void Display::loop()
{
    lv_timer_handler(); /* let the GUI do its work */
    Display::activeScreen->loop();

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
        }
    }
}

void Display::transitionToScreen(IScreen *screen)
{
    Display::transitionToScreen(screen, nullptr);
}

void Display::transitionToScreen(IScreen *screen, std::function<void()> onTransitionComplete)
{
    Display::logger.infof("Transitioning to screen: %s", screen->getName().c_str());
    Display::activeScreen = screen;

    // TODO: reInit the screen
    // Display::activeScreen->destroy();
    // Display::activeScreen->init();

    lv_screen_load_anim(Display::activeScreen->getScreen(), Display::TRANSITION_ANIMATION, Display::TRANSITION_DURATION, 0, false);
    Display::transitionStartTime = millis();
    Display::transitionComplete = false;

    if (onTransitionComplete)
    {
        Display::onTransitionComplete = onTransitionComplete;
    }
    else
    {
        Display::onTransitionComplete = nullptr;
    }
}

void Display::setTouchCallback(std::function<void(int16_t, int16_t)> callback)
{
    Display::touchCallback = callback;
}

void Display::initDeviceOverlay()
{
    lv_obj_t *top = lv_layer_top();
    lv_obj_remove_flag(top, LV_OBJ_FLAG_SCROLLABLE);
    // Keep the top layer passive; don't assign a layout directly
    lv_obj_add_flag(top, LV_OBJ_FLAG_IGNORE_LAYOUT);

    lv_obj_t *deviceInfoContainer = lv_obj_create(top);
    lv_obj_remove_style_all(deviceInfoContainer);
    lv_obj_set_width(deviceInfoContainer, lv_pct(100));
    lv_obj_set_height(deviceInfoContainer, LV_SIZE_CONTENT);
    lv_obj_set_align(deviceInfoContainer, LV_ALIGN_BOTTOM_MID);
    lv_obj_set_x(deviceInfoContainer, 0);
    lv_obj_set_y(deviceInfoContainer, 0);
    lv_obj_set_flex_flow(deviceInfoContainer, LV_FLEX_FLOW_ROW);
    // Spread labels horizontally in a bottom bar
    lv_obj_set_flex_align(deviceInfoContainer, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
    lv_obj_remove_flag(deviceInfoContainer, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(deviceInfoContainer, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_pad_left(deviceInfoContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(deviceInfoContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_top(deviceInfoContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_bottom(deviceInfoContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);

    Display::deviceNameLabel = lv_label_create(deviceInfoContainer);
    lv_obj_set_width(Display::deviceNameLabel, LV_SIZE_CONTENT);
    lv_obj_set_height(Display::deviceNameLabel, LV_SIZE_CONTENT);
    lv_obj_set_x(Display::deviceNameLabel, -75);
    lv_obj_set_y(Display::deviceNameLabel, -18);
    lv_obj_set_align(Display::deviceNameLabel, LV_ALIGN_CENTER);
    lv_label_set_text(Display::deviceNameLabel, Display::deviceNameInitValue.c_str());

    lv_obj_set_style_text_color(Display::deviceNameLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(Display::deviceNameLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(Display::deviceNameLabel, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *firmwareLabel = lv_label_create(deviceInfoContainer);
    lv_obj_set_width(firmwareLabel, LV_SIZE_CONTENT);
    lv_obj_set_height(firmwareLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(firmwareLabel, LV_ALIGN_CENTER);
    lv_label_set_text(firmwareLabel, (String(FIRMWARE_FRIENDLY_NAME) + " v" + String(FIRMWARE_VERSION)).c_str());
    lv_obj_set_style_text_color(firmwareLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(firmwareLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(firmwareLabel, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *timeLabel = lv_label_create(deviceInfoContainer);
    lv_obj_set_width(timeLabel, LV_SIZE_CONTENT);
    lv_obj_set_height(timeLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(timeLabel, LV_ALIGN_CENTER);
    // TODO: in the future, display the current time
    lv_label_set_text(timeLabel, "");
    lv_obj_set_style_text_color(timeLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(timeLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(timeLabel, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void Display::setDeviceName(String deviceName)
{
    if (!Display::deviceNameLabel)
    {
        Display::deviceNameInitValue = deviceName;
        return;
    }

    // Schedule label update on LVGL thread to avoid cross-thread access
    char *text = (char *)malloc(deviceName.length() + 1);
    if (!text)
    {
        return;
    }
    strcpy(text, deviceName.c_str());
    lv_async_call(
        [](void *p)
        {
            if (Display::deviceNameLabel)
            {
                lv_label_set_text(Display::deviceNameLabel, (const char *)p);
            }
            free(p);
        },
        text);
}