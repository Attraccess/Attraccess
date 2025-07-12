#include "SettingsHeader.h"

SettingsHeader::SettingsHeader()
    : headerContainer(nullptr),
      backButton(nullptr),
      titleLabel(nullptr),
      onBackPressed(nullptr)
{
}

SettingsHeader::~SettingsHeader()
{
    // Note: We don't delete the LVGL objects here because they are managed by LVGL's parent-child hierarchy
    // When the parent screen is deleted, all child objects are automatically deleted
}

lv_obj_t *SettingsHeader::create(lv_obj_t *parent, const String &title, BackButtonCallback backCallback)
{
    if (!parent)
    {
        Serial.println("SettingsHeader: Error - parent is null");
        return nullptr;
    }

    onBackPressed = backCallback;

    // Create header container
    headerContainer = lv_obj_create(parent);
    lv_obj_set_size(headerContainer, 240, 50); // Fixed size like WiFi settings
    lv_obj_align(headerContainer, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_color(headerContainer, lv_color_hex(0x1E1E1E), 0);
    lv_obj_set_style_border_width(headerContainer, 0, 0);
    lv_obj_set_style_radius(headerContainer, 0, 0);
    lv_obj_set_style_pad_all(headerContainer, 10, 0);

    // Disable scrolling on header
    lv_obj_clear_flag(headerContainer, LV_OBJ_FLAG_SCROLLABLE);

    // Create back button
    backButton = lv_btn_create(headerContainer);
    lv_obj_set_size(backButton, 30, 30); // Match WiFi settings size
    lv_obj_align(backButton, LV_ALIGN_LEFT_MID, 0, 0);
    lv_obj_set_style_bg_color(backButton, lv_color_hex(0x333333), 0);
    lv_obj_set_style_bg_color(backButton, lv_color_hex(0x555555), LV_STATE_PRESSED);
    lv_obj_set_style_radius(backButton, 15, 0); // Match WiFi settings radius
    lv_obj_set_style_border_width(backButton, 0, 0);
    lv_obj_add_event_cb(backButton, onBackButtonClicked, LV_EVENT_CLICKED, this);

    // Back button icon
    lv_obj_t *backIcon = lv_label_create(backButton);
    lv_label_set_text(backIcon, LV_SYMBOL_LEFT);
    lv_obj_set_style_text_font(backIcon, &lv_font_montserrat_14, 0); // Match WiFi settings font
    lv_obj_set_style_text_color(backIcon, lv_color_hex(0xFFFFFF), 0);
    lv_obj_center(backIcon);

    // Create title label
    titleLabel = lv_label_create(headerContainer);
    lv_label_set_text(titleLabel, title.c_str());
    lv_obj_set_style_text_font(titleLabel, &lv_font_montserrat_18, 0);
    lv_obj_set_style_text_color(titleLabel, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_width(titleLabel, 160);                     // Limit width to prevent overflow
    lv_label_set_long_mode(titleLabel, LV_LABEL_LONG_DOT); // Add "..." if text is too long
    lv_obj_align(titleLabel, LV_ALIGN_LEFT_MID, 40, 0);    // Match WiFi settings position

    Serial.printf("SettingsHeader: Created header with title: %s\n", title.c_str());

    return headerContainer;
}

void SettingsHeader::setTitle(const String &title)
{
    if (titleLabel)
    {
        lv_label_set_text(titleLabel, title.c_str());
        Serial.printf("SettingsHeader: Updated title to: %s\n", title.c_str());
    }
}

void SettingsHeader::onBackButtonClicked(lv_event_t *e)
{
    SettingsHeader *header = (SettingsHeader *)lv_event_get_user_data(e);
    if (header && header->onBackPressed)
    {
        Serial.println("SettingsHeader: Back button clicked");
        header->onBackPressed();
    }
}