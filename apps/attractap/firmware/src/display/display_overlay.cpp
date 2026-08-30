#include "display.hpp"

#include <cstdlib>
#include <cstring>
#include <string>

// Persistent device-info overlay drawn on the LVGL top layer: a bottom bar
// showing the device name and firmware version, present across all screens.

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
    lv_label_set_text(firmwareLabel, (std::string(FIRMWARE_FRIENDLY_NAME) + " v" + FIRMWARE_VERSION).c_str());
    lv_obj_set_style_text_color(firmwareLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(firmwareLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(firmwareLabel, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);

    Display::networkQualityContainer = lv_obj_create(top);
    lv_obj_remove_style_all(Display::networkQualityContainer);
    lv_obj_set_size(Display::networkQualityContainer, 62, 30);
    lv_obj_set_align(Display::networkQualityContainer, LV_ALIGN_TOP_RIGHT);
    lv_obj_set_x(Display::networkQualityContainer, -12);
    lv_obj_set_y(Display::networkQualityContainer, 12);
    lv_obj_set_style_radius(Display::networkQualityContainer, 15, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(Display::networkQualityContainer, 225, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(Display::networkQualityContainer, 2, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(Display::networkQualityContainer, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_flex_flow(Display::networkQualityContainer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(Display::networkQualityContainer, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_remove_flag(Display::networkQualityContainer, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(Display::networkQualityContainer, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(Display::networkQualityContainer, LV_OBJ_FLAG_HIDDEN);

    Display::networkQualityLabel = lv_label_create(Display::networkQualityContainer);
    lv_label_set_text(Display::networkQualityLabel, "! NET");
    lv_obj_set_style_text_color(Display::networkQualityLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(Display::networkQualityLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void Display::updateNetworkQualityOverlay()
{
    if (!Display::networkQualityContainer || !Display::networkQualityLabel)
    {
        return;
    }

    State::NetworkQualityState qualityState = State::getNetworkQualityState();
    if (Display::networkQualityOverlayInitialized && qualityState.quality == Display::networkQualityOverlayValue)
    {
        return;
    }

    Display::networkQualityOverlayValue = qualityState.quality;
    Display::networkQualityOverlayInitialized = true;

    switch (qualityState.quality)
    {
    case State::NETWORK_QUALITY_GOOD:
        lv_obj_add_flag(Display::networkQualityContainer, LV_OBJ_FLAG_HIDDEN);
        break;
    case State::NETWORK_QUALITY_DEGRADED:
        lv_obj_remove_flag(Display::networkQualityContainer, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_style_bg_color(Display::networkQualityContainer, lv_color_hex(0xD97706), LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_label_set_text(Display::networkQualityLabel, "! NET");
        break;
    case State::NETWORK_QUALITY_OFFLINE:
    default:
        lv_obj_remove_flag(Display::networkQualityContainer, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_style_bg_color(Display::networkQualityContainer, lv_color_hex(0xDC2626), LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_label_set_text(Display::networkQualityLabel, "x NET");
        break;
    }
}

void Display::setDeviceName(std::string deviceName)
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
    Display::asyncCall(
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
