#include "display.hpp"

// Static member definitions
uint32_t Display::screenWidth = 0;
uint32_t Display::screenHeight = 0;
TouchDrvGT911 Display::GT911;
int16_t Display::x[5] = {0};
int16_t Display::y[5] = {0};
lv_display_t *Display::disp = NULL;
lv_indev_t *Display::indev = NULL;
lv_obj_t *Display::demo_spinner = NULL;
lv_obj_t *Display::nfc_status_label = NULL;
NFC *Display::nfc = NULL;

Arduino_DataBus *Display::bus = new Arduino_SWSPI(
    GFX_NOT_DEFINED /* DC */, 42 /* CS */,
    2 /* SCK */, 1 /* MOSI */, GFX_NOT_DEFINED /* MISO */);

Arduino_ESP32RGBPanel *Display::rgbpanel = new Arduino_ESP32RGBPanel(
    40 /* DE */, 39 /* VSYNC */, 38 /* HSYNC */, 41 /* PCLK */,
    46 /* R0 */, 3 /* R1 */, 8 /* R2 */, 18 /* R3 */, 17 /* R4 */,
    14 /* G0 */, 13 /* G1 */, 12 /* G2 */, 11 /* G3 */, 10 /* G4 */, 9 /* G5 */,
    5 /* B0 */, 45 /* B1 */, 48 /* B2 */, 47 /* B3 */, 21 /* B4 */,
    1 /* hsync_polarity */, 10 /* hsync_front_porch */, 8 /* hsync_pulse_width */, 50 /* hsync_back_porch */,
    1 /* vsync_polarity */, 10 /* vsync_front_porch */, 8 /* vsync_pulse_width */, 20 /* vsync_back_porch */);
Arduino_RGB_Display *Display::gfx = new Arduino_RGB_Display(
    480 /* width */, 480 /* height */, Display::rgbpanel, 2 /* rotation */, true /* auto_flush */,
    Display::bus, GFX_NOT_DEFINED /* RST */, st7701_type1_init_operations, sizeof(st7701_type1_init_operations));

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

void Display::setup(NFC *nfc)
{
    Display::nfc = nfc;

    Display::logger.info("Initializing");

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

    String LVGL_Arduino = "Hello Arduino! ";
    LVGL_Arduino += String('V') + lv_version_major() + "." + lv_version_minor() + "." + lv_version_patch();

    Display::logger.info(LVGL_Arduino.c_str());
    Display::logger.info("I am LVGL_Arduino");

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

    // show a boot screen
    lv_obj_t *boot_screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(boot_screen, lv_color_black(), 0);

    // Main title
    lv_obj_t *title_label = lv_label_create(boot_screen);
    lv_label_set_text(title_label, "Attraccess");
    lv_obj_set_style_text_font(title_label, &lv_font_montserrat_48, 0);
    lv_obj_set_style_text_color(title_label, lv_color_white(), 0);
    lv_obj_align(title_label, LV_ALIGN_CENTER, 0, -60);

    // Firmware info
    lv_obj_t *firmware_label = lv_label_create(boot_screen);
    String firmware_info = String(FIRMWARE_FRIENDLY_NAME) + " v" + String(FIRMWARE_VERSION);
    lv_label_set_text(firmware_label, firmware_info.c_str());
    lv_obj_set_style_text_font(firmware_label, &lv_font_montserrat_18, 0);
    lv_obj_set_style_text_color(firmware_label, lv_color_white(), 0);
    lv_obj_align(firmware_label, LV_ALIGN_CENTER, 0, 20);

    // Board info
    lv_obj_t *board_label = lv_label_create(boot_screen);
    lv_label_set_text(board_label, BOARD_FAMILY);
    lv_obj_set_style_text_font(board_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(board_label, lv_color_white(), 0);
    lv_obj_align(board_label, LV_ALIGN_CENTER, 0, 50);

    lv_screen_load(boot_screen);

    // Show boot screen for 2 seconds
    uint32_t boot_start = millis();
    while (millis() - boot_start < 2000)
    {
        lv_timer_handler();
        delay(5);
    }

    lv_obj_t *idle_screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(idle_screen, lv_color_hex(0x00ff00), 0);

    // Create top row container for spinner and status label
    lv_obj_t *top_row = lv_obj_create(idle_screen);
    lv_obj_set_size(top_row, LV_PCT(100), LV_PCT(30));
    lv_obj_align(top_row, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_opa(top_row, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_opa(top_row, LV_OPA_TRANSP, 0);
    lv_obj_set_flex_flow(top_row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(top_row, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_gap(top_row, 20, 0);

    Display::demo_spinner = lv_spinner_create(top_row);
    lv_spinner_set_anim_params(Display::demo_spinner, 1000, 1000);
    lv_obj_set_size(Display::demo_spinner, 30, 30);

    Display::nfc_status_label = lv_label_create(top_row);
    lv_label_set_text(Display::nfc_status_label, "NFC Status: ");
    lv_obj_set_style_text_font(Display::nfc_status_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(Display::nfc_status_label, lv_color_white(), 0);

    // Create button container with 2 buttons per row
    lv_obj_t *button_container = lv_obj_create(idle_screen);
    lv_obj_set_size(button_container, LV_PCT(90), LV_PCT(60));
    lv_obj_align(button_container, LV_ALIGN_BOTTOM_MID, 0, -20);
    lv_obj_set_style_bg_opa(button_container, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_opa(button_container, LV_OPA_TRANSP, 0);
    lv_obj_set_flex_flow(button_container, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(button_container, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_gap(button_container, 20, 0);

    // First row of buttons
    lv_obj_t *button_row1 = lv_obj_create(button_container);
    lv_obj_set_size(button_row1, LV_PCT(100), 60);
    lv_obj_set_style_bg_opa(button_row1, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_opa(button_row1, LV_OPA_TRANSP, 0);
    lv_obj_set_flex_flow(button_row1, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(button_row1, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_gap(button_row1, 20, 0);

    lv_obj_t *authenticateFactoryButton = lv_btn_create(button_row1);
    lv_obj_set_size(authenticateFactoryButton, LV_PCT(45), 60);
    lv_obj_t *authenticateFactoryButtonLabel = lv_label_create(authenticateFactoryButton);
    lv_label_set_text(authenticateFactoryButtonLabel, "Authenticate Factory");
    lv_obj_set_style_text_font(authenticateFactoryButtonLabel, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(authenticateFactoryButtonLabel, lv_color_white(), 0);
    lv_obj_center(authenticateFactoryButtonLabel);
    lv_obj_add_event_cb(authenticateFactoryButton, Display::authenticateFactoryButton_event_cb, LV_EVENT_CLICKED, NULL);

    lv_obj_t *changeKeyButton = lv_btn_create(button_row1);
    lv_obj_set_size(changeKeyButton, LV_PCT(45), 60);
    lv_obj_t *changeKeyButtonLabel = lv_label_create(changeKeyButton);
    lv_label_set_text(changeKeyButtonLabel, "Change Key");
    lv_obj_set_style_text_font(changeKeyButtonLabel, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(changeKeyButtonLabel, lv_color_white(), 0);
    lv_obj_center(changeKeyButtonLabel);
    lv_obj_add_event_cb(changeKeyButton, Display::changeKeyButton_event_cb, LV_EVENT_CLICKED, NULL);

    // Second row of buttons
    lv_obj_t *button_row2 = lv_obj_create(button_container);
    lv_obj_set_size(button_row2, LV_PCT(100), 60);
    lv_obj_set_style_bg_opa(button_row2, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_opa(button_row2, LV_OPA_TRANSP, 0);
    lv_obj_set_flex_flow(button_row2, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(button_row2, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_gap(button_row2, 20, 0);

    lv_obj_t *authenticateButton = lv_btn_create(button_row2);
    lv_obj_set_size(authenticateButton, LV_PCT(45), 60);
    lv_obj_t *authenticateButtonLabel = lv_label_create(authenticateButton);
    lv_label_set_text(authenticateButtonLabel, "Authenticate");
    lv_obj_set_style_text_font(authenticateButtonLabel, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(authenticateButtonLabel, lv_color_white(), 0);
    lv_obj_center(authenticateButtonLabel);
    lv_obj_add_event_cb(authenticateButton, Display::authenticateButton_event_cb, LV_EVENT_CLICKED, NULL);

    lv_obj_t *changeKeyBackButton = lv_btn_create(button_row2);
    lv_obj_set_size(changeKeyBackButton, LV_PCT(45), 60);
    lv_obj_t *changeKeyBackButtonLabel = lv_label_create(changeKeyBackButton);
    lv_label_set_text(changeKeyBackButtonLabel, "Change Key Back");
    lv_obj_set_style_text_font(changeKeyBackButtonLabel, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(changeKeyBackButtonLabel, lv_color_white(), 0);
    lv_obj_center(changeKeyBackButtonLabel);
    lv_obj_add_event_cb(changeKeyBackButton, Display::changeKeyBackButton_event_cb, LV_EVENT_CLICKED, NULL);

    lv_screen_load(idle_screen);

    lv_obj_del(boot_screen);

    Display::logger.info("Setup done");
}

void Display::authenticateFactoryButton_event_cb(lv_event_t *event)
{
    Display::logger.info("Authenticate Factory button pressed!");
    Display::nfc->authenticate(1, NFC::FACTORY_KEY);
    lv_label_set_text(Display::nfc_status_label, "NFC Status: Authenticated with Factory Key");
}

void Display::changeKeyButton_event_cb(lv_event_t *event)
{
    Display::logger.info("Change Key button pressed!");
    Display::nfc->changeKey(1, NFC::FACTORY_KEY, NFC::FACTORY_KEY, NFC::NEW_KEY);
    lv_label_set_text(Display::nfc_status_label, "NFC Status: Changed Key");
}

void Display::authenticateButton_event_cb(lv_event_t *event)
{
    Display::logger.info("Authenticate button pressed!");
    Display::nfc->authenticate(1, NFC::NEW_KEY);
    lv_label_set_text(Display::nfc_status_label, "NFC Status: Authenticated with New Key");
}

void Display::changeKeyBackButton_event_cb(lv_event_t *event)
{
    Display::logger.info("Change Key Back button pressed!");
    Display::nfc->changeKey(1, NFC::FACTORY_KEY, NFC::NEW_KEY, NFC::FACTORY_KEY);
    lv_label_set_text(Display::nfc_status_label, "NFC Status: Changed Key Back");
}

void Display::loop()
{
    lv_timer_handler(); /* let the GUI do its work */
    delay(5);
}