#include "waitForConnection.hpp"

WaitForConnectionScreen::WaitForConnectionScreen() : screen(nullptr), currentStatusLabel(nullptr), currentStatusDetailLabel(nullptr), initialized(false), appState(), lastKnownAppStateChangeTime(0), logger("WaitForConnection")
{
    // Don't create LVGL objects here - they need to be created after lv_init()
}

void WaitForConnectionScreen::initialize()
{
    if (initialized)
        return;

    logger.debug("initialize");

    screen = lv_obj_create(NULL);
    lv_obj_set_size(screen, TFT_HOR_RES, TFT_VER_RES);

    // Create bouncing dots animation
    const int dot_count = 3;
    const int dot_size = 12;
    const int spacing = 24;

    const int dot_y_offset = -60;

    for (int i = 0; i < dot_count; i++)
    {
        lv_obj_t *dot = lv_obj_create(screen);
        lv_obj_set_size(dot, dot_size, dot_size);
        lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_color(dot, lv_color_hex(0x0080FF), 0);
        lv_obj_set_style_border_width(dot, 0, 0);

        // Position dots horizontally centered above the status list
        int x_offset = (i - 1) * spacing; // -24, 0, +24 for dots 0,1,2
        logger.debugf("Dot %d: x_offset=%d", i, x_offset);
        lv_obj_align(dot, LV_ALIGN_CENTER, x_offset, dot_y_offset);

        // Create bouncing animation with staggered delay
        lv_anim_t anim;
        lv_anim_init(&anim);
        lv_anim_set_var(&anim, dot);
        // Store the x_offset for this dot in a way the animation can access it
        lv_obj_set_user_data(dot, (void *)(intptr_t)x_offset);

        lv_anim_set_exec_cb(&anim, [](void *var, int32_t val)
                            {
            lv_obj_t *obj = (lv_obj_t*)var;
            // Get the stored x_offset for this dot
            int x_offset = (int)(intptr_t)lv_obj_get_user_data(obj);
            // Re-align with the original x_offset and animated y_offset
            lv_obj_align(obj, LV_ALIGN_CENTER, x_offset, dot_y_offset + val); });
        lv_anim_set_values(&anim, 0, -20); // Bounce up by 20 pixels
        lv_anim_set_duration(&anim, 600);
        lv_anim_set_playback_duration(&anim, 600);
        lv_anim_set_repeat_count(&anim, LV_ANIM_REPEAT_INFINITE);
        lv_anim_set_delay(&anim, i * 200); // Stagger the animations
        lv_anim_start(&anim);
    }

    // current status label
    currentStatusLabel = lv_label_create(screen);
    lv_label_set_text(currentStatusLabel, "");
    lv_obj_align(currentStatusLabel, LV_ALIGN_TOP_MID, 0, 150);
    lv_obj_set_style_text_align(currentStatusLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(currentStatusLabel, &lv_font_montserrat_16, 0);

    // status detail label (smaller, underneath)
    currentStatusDetailLabel = lv_label_create(screen);
    lv_label_set_text(currentStatusDetailLabel, "");
    lv_obj_align(currentStatusDetailLabel, LV_ALIGN_TOP_MID, 0, 170);
    lv_obj_set_style_text_align(currentStatusDetailLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(currentStatusDetailLabel, &lv_font_montserrat_12, 0);

    // Firmware info at bottom
    lv_obj_t *firmwareText = lv_label_create(screen);
    lv_label_set_text(firmwareText, ("Firmware: " + String(FIRMWARE_FRIENDLY_NAME)).c_str());
    lv_obj_align(firmwareText, LV_ALIGN_BOTTOM_MID, 0, -30);
    lv_obj_set_style_text_align(firmwareText, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(firmwareText, &lv_font_montserrat_8, 0);

    lv_obj_t *variantText = lv_label_create(screen);
    lv_label_set_text(variantText, ("Variant: " + String(FIRMWARE_VARIANT_FRIENDLY_NAME)).c_str());
    lv_obj_align(variantText, LV_ALIGN_BOTTOM_MID, 0, -20);
    lv_obj_set_style_text_align(variantText, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(variantText, &lv_font_montserrat_8, 0);

    lv_obj_t *versionText = lv_label_create(screen);
    lv_label_set_text(versionText, ("Version: " + String(FIRMWARE_VERSION)).c_str());
    lv_obj_align(versionText, LV_ALIGN_BOTTOM_MID, 0, -10);
    lv_obj_set_style_text_align(versionText, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(versionText, &lv_font_montserrat_8, 0);

    initialized = true;
}

void WaitForConnectionScreen::onScreenEnter()
{
    logger.debug("onScreenEnter");
}

void WaitForConnectionScreen::onScreenExit()
{
    logger.debug("onScreenExit");
}

lv_obj_t *WaitForConnectionScreen::getScreen()
{
    if (!initialized)
    {
        initialize();
    }
    return screen;
}

void WaitForConnectionScreen::updateStatus()
{
    if (!initialized)
    {
        logger.debug("updateStatus: initialize");
        initialize();
    }

    if (!currentStatusLabel)
    {
        return;
    }

    if (!currentStatusDetailLabel)
    {
        return;
    }

    uint32_t lastStateChangeTime = appState.getLastStateChangeTime();
    if (lastKnownAppStateChangeTime <= lastStateChangeTime)
    {
        logger.debug("updateStatus: no change");
        return;
    }

    lastKnownAppStateChangeTime = lastStateChangeTime;

    logger.debug("updateStatus");

    auto networkState = appState.getNetworkState();
    auto websocketState = appState.getWebsocketState();
    auto apiState = appState.getApiState();

    bool isConnected = networkState.wifi_connected || networkState.ethernet_connected;
    if (!isConnected)
    {
        logger.debug("updateStatus: set currentStatusLabel to Connecting to network");
        lv_label_set_text(currentStatusLabel, "Connecting to network");
        lv_label_set_text(currentStatusDetailLabel, ("SSID: " + networkState.wifi_ssid).c_str());

        return;
    }

    if (websocketState.hostname.isEmpty() || websocketState.port == 0)
    {
        logger.debug("updateStatus: API not configured");
        lv_label_set_text(currentStatusLabel, "Connecting to websocket");
        lv_label_set_text(currentStatusDetailLabel, "Please configure API");
        return;
    }

    logger.debugf("updateStatus: set currentStatusDetailLabel to %s:%d", websocketState.hostname.c_str(), websocketState.port);
    if (!websocketState.connected)
    {
        logger.debug("updateStatus: set currentStatusLabel to Connecting to websocket");
        lv_label_set_text(currentStatusLabel, "Connecting to websocket");
        lv_label_set_text(currentStatusDetailLabel, String(websocketState.hostname + ":" + websocketState.port).c_str());
        return;
    }

    if (!apiState.authenticated)
    {
        logger.debug("updateStatus: set currentStatusLabel to Connecting to API");
        lv_label_set_text(currentStatusLabel, "Authenticating with API");
        lv_label_set_text(currentStatusDetailLabel, String(websocketState.hostname + ":" + websocketState.port).c_str());
        return;
    }

    logger.debug("updateStatus: set currentStatusLabel to Connected");
    lv_label_set_text(currentStatusLabel, "Connected");
    lv_label_set_text(currentStatusDetailLabel, ("Reader ID: " + apiState.deviceName).c_str());

    logger.debug("updateStatus done");
}

void WaitForConnectionScreen::loop()
{
    this->updateStatus();
}