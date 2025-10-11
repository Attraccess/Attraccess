#include "bootscreen.hpp"

void BootScreen::init()
{
    this->screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(this->screen, lv_color_black(), 0);

    // Main title
    lv_obj_t *title_label = lv_label_create(this->screen);
    lv_label_set_text(title_label, "Attraccess");
    lv_obj_set_style_text_font(title_label, &lv_font_montserrat_48, 0);
    lv_obj_set_style_text_color(title_label, lv_color_white(), 0);
    lv_obj_align(title_label, LV_ALIGN_CENTER, 0, -60);

    // Firmware info
    lv_obj_t *firmware_label = lv_label_create(this->screen);
    String firmware_info = String(FIRMWARE_FRIENDLY_NAME) + " v" + String(FIRMWARE_VERSION);
    lv_label_set_text(firmware_label, firmware_info.c_str());
    lv_obj_set_style_text_font(firmware_label, &lv_font_montserrat_18, 0);
    lv_obj_set_style_text_color(firmware_label, lv_color_white(), 0);
    lv_obj_align(firmware_label, LV_ALIGN_CENTER, 0, 20);

    // Board info
    lv_obj_t *board_label = lv_label_create(this->screen);
    lv_label_set_text(board_label, BOARD_FAMILY);
    lv_obj_set_style_text_font(board_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(board_label, lv_color_white(), 0);
    lv_obj_align(board_label, LV_ALIGN_CENTER, 0, 50);
}

lv_obj_t *BootScreen::getScreen()
{
    return this->screen;
}

void BootScreen::loop()
{
}