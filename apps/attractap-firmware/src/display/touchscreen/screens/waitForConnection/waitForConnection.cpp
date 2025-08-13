#include "waitForConnection.hpp"

WaitForConnectionScreen::WaitForConnectionScreen() : screen(nullptr), currentStatusLabel(nullptr), currentStatusDetailLabel(nullptr), initialized(false), logger("Touchscreen:WaitForConnection")
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

    // Create three dots and a single synchronized animation that updates all of them
    const int dot_size = 12;
    const int spacing = 30;

    // Calculate base y offset dynamically based on dot count and spacing
    dotsBaseYOffset = -60;
    dotsAmplitude = 20;
    dotsAnimDurationMs = 16000; // Full sine cycle duration (slower)

    for (int i = 0; i < DOT_COUNT; i++)
    {
        dots[i] = lv_obj_create(screen);
        lv_obj_set_size(dots[i], dot_size, dot_size);
        lv_obj_set_style_radius(dots[i], LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_color(dots[i], lv_color_hex(0x0080FF), 0);
        lv_obj_set_style_border_width(dots[i], 0, 0);

        // Position dots horizontally centered above the status list
        int x_offset = (i - (DOT_COUNT - 1) / 2) * spacing; // Distributes dots evenly around center
        dotXOffsets[i] = x_offset;
        logger.debugf("Dot %d: x_offset=%d", i, x_offset);
        lv_obj_align(dots[i], LV_ALIGN_CENTER, x_offset, dotsBaseYOffset);
    }

    // One animation drives a shared phase (angle 0..3600) for all dots
    lv_anim_t anim;
    lv_anim_init(&anim);
    lv_anim_set_var(&anim, this);
    lv_anim_set_exec_cb(&anim, &WaitForConnectionScreen::dotsAnimExecCb);
    lv_anim_set_values(&anim, 0, 3600);
    lv_anim_set_duration(&anim, dotsAnimDurationMs);
    lv_anim_set_repeat_count(&anim, LV_ANIM_REPEAT_INFINITE);
    lv_anim_start(&anim);

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
    // Stop the shared dots animation if running
    lv_anim_delete(this, &WaitForConnectionScreen::dotsAnimExecCb);
}

lv_obj_t *WaitForConnectionScreen::getScreen()
{
    if (!initialized)
    {
        initialize();
    }
    return screen;
}

void WaitForConnectionScreen::onDataChange(State::NetworkState networkState, State::WebsocketState webSocketState, State::ApiState apiState, State::ApiEventData apiEventData)
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

    logger.debug("updateStatus");

    bool isConnected = networkState.wifi_connected || networkState.ethernet_connected;
    if (!isConnected)
    {
        logger.debug("updateStatus: set currentStatusLabel to Connecting to network");
        lv_label_set_text(currentStatusLabel, "Connecting to network");
        lv_label_set_text(currentStatusDetailLabel, ("SSID: " + networkState.wifi_ssid).c_str());

        return;
    }

    if (webSocketState.hostname.isEmpty() || webSocketState.port == 0)
    {
        logger.debug("updateStatus: API not configured");
        lv_label_set_text(currentStatusLabel, "Connecting to websocket");
        lv_label_set_text(currentStatusDetailLabel, "Please configure API");
        return;
    }

    logger.debugf("updateStatus: set currentStatusDetailLabel to %s:%d", webSocketState.hostname.c_str(), webSocketState.port);
    if (!webSocketState.connected)
    {
        logger.debug("updateStatus: set currentStatusLabel to Connecting to websocket");
        lv_label_set_text(currentStatusLabel, "Connecting to websocket");
        lv_label_set_text(currentStatusDetailLabel, String(webSocketState.hostname + ":" + webSocketState.port).c_str());
        return;
    }

    if (!apiState.authenticated)
    {
        logger.debug("updateStatus: set currentStatusLabel to Connecting to API");
        lv_label_set_text(currentStatusLabel, "Authenticating with API");
        lv_label_set_text(currentStatusDetailLabel, String(webSocketState.hostname + ":" + webSocketState.port).c_str());
        return;
    }

    logger.debug("updateStatus: set currentStatusLabel to Connected");
    lv_label_set_text(currentStatusLabel, "Connected");
    lv_label_set_text(currentStatusDetailLabel, ("Reader ID: " + apiState.deviceName).c_str());

    logger.debug("updateStatus done");
}

void WaitForConnectionScreen::loop()
{
    // nothing to do here
}

void WaitForConnectionScreen::dotsAnimExecCb(void *var, int32_t v)
{
    // var is the WaitForConnectionScreen instance; v is the shared angle (0..3600)
    WaitForConnectionScreen *self = static_cast<WaitForConnectionScreen *>(var);
    if (self == nullptr)
    {
        return;
    }

    // Distribute dots evenly across 180 degrees (1800 in LVGL's 0..3600 angle units)
    const int32_t phaseStep = 1800 / (DOT_COUNT - 1); // 180 degrees spread across all dots

    for (int i = 0; i < DOT_COUNT; i++)
    {
        lv_obj_t *dot = self->dots[i];
        if (dot == nullptr)
        {
            continue;
        }

        int32_t angle = (v + i * phaseStep) % 3600;
        int32_t s = lv_trigo_sin(angle); // [-32767..32767]
        int32_t yOffset = self->dotsBaseYOffset - (self->dotsAmplitude * s) / LV_TRIGO_SIN_MAX;

        lv_obj_align(dot, LV_ALIGN_CENTER, self->dotXOffsets[i], (int16_t)yOffset);
    }
}