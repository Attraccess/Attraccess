#include "touchscreen.hpp"

void Touchscreen::xptPosition(uint16_t *xptX, uint16_t *xptY, uint8_t *xptZ, uint16_t *tftX, uint16_t *tftY)
{
    uint16_t x, y;
    uint8_t z;       // XPT
    uint16_t tx, ty; // TFT

    float xx = (XPT2046_XMAX - XPT2046_XMIN); // width XPT-Points
    float yy = (XPT2046_YMAX - XPT2046_YMIN); // height XPT-Points

    xpt.readData(&x, &y, &z);

    // calc position for TFT display from digitizer position (Portrait mode - rotation 0)
    // Map touch coordinates to portrait orientation (240x320)
    tx = (x - XPT2046_XMIN) * TFT_HOR_RES / xx; // Map to width (240)
    ty = (y - XPT2046_YMIN) * TFT_VER_RES / yy; // Map to height (320)

    // avoid invalid values
    if (tx < 0)
        tx = 0;
    if (ty < 0)
        ty = 0;
    if (tx >= TFT_HOR_RES)
        tx = TFT_HOR_RES - 1;
    if (ty >= TFT_VER_RES)
        ty = TFT_VER_RES - 1;

    *xptX = x;
    *xptY = y;
    *xptZ = z;
    *tftX = tx;
    *tftY = ty;
}

void Touchscreen::flushDisplay(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map)
{
    uint32_t w = lv_area_get_width(area);
    uint32_t h = lv_area_get_height(area);

    // Fix color inversion issue by inverting each pixel
    // uint16_t *pixels = (uint16_t *)px_map;
    // uint32_t pixel_count = w * h;
    /*
      for (uint32_t i = 0; i < pixel_count; i++)
      {
        pixels[i] = ~pixels[i]; // Invert each 16-bit pixel
      }*/

    tft.startWrite();
    tft.setAddrWindow(area->x1, area->y1, w, h);
    tft.pushColors((uint16_t *)px_map, w * h, true);
    tft.endWrite();

    lv_disp_flush_ready(disp);
}

void Touchscreen::readTouchpad(lv_indev_t *indev, lv_indev_data_t *data)
{
    uint16_t xptX, xptY, tftX, tftY;
    uint8_t xptZ;

    if (xpt.touched())
    {
        xptPosition(&xptX, &xptY, &xptZ, &tftX, &tftY);
        data->point.x = tftX;
        data->point.y = tftY;
        data->state = LV_INDEV_STATE_PRESSED;
    }
    else
    {
        data->state = LV_INDEV_STATE_RELEASED;
    }
}

void Touchscreen::setup()
{
    logger.info("Setup XPT2046 Touchscreen");

    xptSPI.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
    xpt.begin(xptSPI);
    xpt.setRotation(0);

    logger.info("Setup TFT Display");
    tft.init();
    tft.setRotation(0); // portrait, USB ports at bottom
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.fillScreen(TFT_BLACK); // clear screen
    tft.initDMA();

    this->logger.info("Setup LVGL");
    lv_init();

    // Create display and store reference
    this->display = lv_display_create(TFT_HOR_RES, TFT_VER_RES);
    if (this->display == NULL)
    {
        this->logger.error("Failed to create LVGL display!");
        return;
    }
    this->logger.info("LVGL display created");

    lv_display_set_buffers(this->display, this->draw_buf, NULL, sizeof(this->draw_buf), LV_DISPLAY_RENDER_MODE_PARTIAL);

    lv_display_set_flush_cb(this->display, flushDisplayWrapper);
    this->logger.debug(("Display buffer set, size: " + String(sizeof(draw_buf)) + " bytes").c_str());

    // Store this instance pointer in display user_data for callback access
    lv_display_set_user_data(this->display, this);

    this->indev = lv_indev_create();
    if (this->indev == NULL)
    {
        this->logger.error("Failed to create LVGL input device!");
        return;
    }
    lv_indev_set_type(this->indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(this->indev, readTouchpadWrapper);

    // Store this instance pointer in input device user_data for callback access
    lv_indev_set_user_data(this->indev, this);

    this->prepareApplicationOverlay();

    // Initialize boot timing and show initial screen
    this->bootMillis = millis();
    this->state = IDisplay::DisplayState::DISPLAY_STATE_BOOTING;
    this->transitionTo(this->state);

    logger.info("Setup complete");
}

void Touchscreen::prepareApplicationOverlay()
{
    // add a label with the device name in small to the top left of the screen
    deviceNameLabel = lv_label_create(lv_layer_top());
    lv_label_set_text(deviceNameLabel, "Attraccess");
    lv_obj_set_style_text_font(deviceNameLabel, &lv_font_montserrat_12, 0);
    lv_obj_align(deviceNameLabel, LV_ALIGN_TOP_LEFT, 10, 10);

    uptimeLabel = lv_label_create(lv_layer_top());
    lv_label_set_text(uptimeLabel, "00:00:00");
    lv_obj_set_style_text_font(uptimeLabel, &lv_font_montserrat_12, 0);
    lv_obj_align(uptimeLabel, LV_ALIGN_TOP_RIGHT, -10, 10);
}

// Static wrapper functions that call the instance methods using user_data
void Touchscreen::flushDisplayWrapper(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map)
{
    // Get the instance pointer from the display's user_data
    Touchscreen *instance = static_cast<Touchscreen *>(lv_display_get_user_data(disp));
    if (instance)
    {
        instance->flushDisplay(disp, area, px_map);
    }
    else
    {
        static uint32_t lastNoFlushLog = 0;
        if (millis() - lastNoFlushLog > 10000)
        {
            instance->logger.error("No instance found for display");
            lastNoFlushLog = millis();
        }
    }
}

void Touchscreen::readTouchpadWrapper(lv_indev_t *indev, lv_indev_data_t *data)
{
    // Get the instance pointer from the input device's user_data
    Touchscreen *instance = static_cast<Touchscreen *>(lv_indev_get_user_data(indev));

    instance->readTouchpad(indev, data);
}

void Touchscreen::onDataChange(State::NetworkState networkState, State::WebsocketState webSocketState, State::ApiState apiState, State::ApiEventData apiEventData)
{
    this->networkState = networkState;
    this->websocketState = webSocketState;
    this->apiState = apiState;
    this->apiEventData = apiEventData;

    if (apiState.deviceName.isEmpty())
    {
        lv_label_set_text(deviceNameLabel, FIRMWARE_FRIENDLY_NAME);
    }
    else
    {
        lv_label_set_text(deviceNameLabel, apiState.deviceName.c_str());
    }

    this->currentScreen->onDataChange(networkState, webSocketState, apiState, apiEventData);
}

void Touchscreen::loop()
{
    feedLvgl();

    // update uptime label
    uint32_t uptime = millis() - bootMillis;
    uint32_t hours = uptime / 3600000;
    uint32_t minutes = (uptime % 3600000) / 60000;
    uint32_t seconds = (uptime % 60000) / 1000;
    lv_label_set_text_fmt(uptimeLabel, "%02d:%02d:%02d", hours, minutes, seconds);
}

void Touchscreen::feedLvgl()
{
    uint32_t currentMillis = millis();

    // Process LVGL tasks without infinite loop to allow main loop to continue
    uint32_t deltaMillis = currentMillis - lastMillis;
    lastMillis = currentMillis;
    lv_tick_inc(deltaMillis);

    // Throttle LVGL timer handler to prevent excessive processing
    static uint32_t lastTimerHandler = 0;
    if (currentMillis - lastTimerHandler >= 10) // Limit to ~100Hz
    {
        // Process LVGL timer with timeout to prevent blocking
        lv_timer_handler();
        lastTimerHandler = currentMillis;
    }
}

void Touchscreen::transitionTo(DisplayState state)
{
    bool isConnectedToNetwork = this->networkState.wifi_connected || this->networkState.ethernet_connected;

    IScreen *oldScreen = currentScreen;

    switch (state)
    {
    case IDisplay::DisplayState::DISPLAY_STATE_BOOTING:
        this->currentScreen = &this->messageScreen;
        this->messageScreen.setMessage("Booting", lv_color_hex(0xFFFFFF));
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_NETWORK:
        this->currentScreen = &this->waitForConnectionScreen;
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_WEBSOCKET:
        this->currentScreen = &this->waitForConnectionScreen;
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_AUTHENTICATION:
        this->currentScreen = &this->waitForConnectionScreen;
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_CONNECTED_WAITING_FOR_API_EVENT:
        this->currentScreen = &this->waitForConnectionScreen;
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_RESOURCE_SELECTION:
        this->currentScreen = &this->messageScreen;
        this->messageScreen.setMessage("Select Resource", lv_color_hex(0xFFFFFF));
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_CONFIRM_ACTION:
        this->currentScreen = &this->messageScreen;
        this->messageScreen.setMessage("Confirm Action", lv_color_hex(0xFFFFFF));
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_WAIT_FOR_NFC_TAP:
        this->currentScreen = &this->nfcTapScreen;
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_SUCCESS:
        this->currentScreen = &this->messageScreen;
        this->messageScreen.setMessage("Success", lv_color_hex(0xFFFFFF));
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_ERROR:
        this->currentScreen = &this->messageScreen;
        this->messageScreen.setMessage("Error", lv_color_hex(0xFFFFFF));
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_TEXT:
        this->currentScreen = &this->messageScreen;
        this->messageScreen.setMessage("Text", lv_color_hex(0xFFFFFF));
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_FIRMWARE_UPDATE:
        this->currentScreen = &this->messageScreen;
        this->messageScreen.setMessage("Firmware Update", lv_color_hex(0xFFFFFF));
        break;
    case IDisplay::DisplayState::DISPLAY_STATE_WAIT_FOR_PROCESSING:
        this->currentScreen = &this->messageScreen;
        this->messageScreen.setMessage("Waiting for Processing", lv_color_hex(0xFFFFFF));
        break;
    }

    if (oldScreen != this->currentScreen)
    {
        if (oldScreen != NULL)
        {
            logger.debug("oldScreen onScreenExit");
            oldScreen->onScreenExit();
        }

        logger.debug("currentScreen onScreenEnter");
        this->currentScreen->onScreenEnter();

        logger.debug("Loading next screen, currentScreen->getScreen()");

        lv_screen_load(this->currentScreen->getScreen());
    }

    this->currentScreen->loop();
}
