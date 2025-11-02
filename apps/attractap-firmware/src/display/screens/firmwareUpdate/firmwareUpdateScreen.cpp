#include "firmwareUpdateScreen.hpp"

void FirmwareUpdateScreen::init()
{
    this->screen = lv_obj_create(NULL);
    lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(this->screen, lv_color_hex(0x9353D3), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(this->screen, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

    this->progressBar = lv_bar_create(this->screen);
    lv_bar_set_value(this->progressBar, 25, LV_ANIM_OFF);
    lv_bar_set_start_value(this->progressBar, 0, LV_ANIM_OFF);
    lv_obj_set_width(this->progressBar, 400);
    lv_obj_set_height(this->progressBar, 50);
    lv_obj_set_align(this->progressBar, LV_ALIGN_CENTER);

    // Compensating for LVGL9.1 draw crash with bar/slider max value when top-padding is nonzero and right-padding is 0
    if (lv_obj_get_style_pad_top(this->progressBar, LV_PART_MAIN) > 0)
        lv_obj_set_style_pad_right(this->progressBar, lv_obj_get_style_pad_right(progressBar, LV_PART_MAIN) + 1, LV_PART_MAIN);

    lv_obj_t *title = lv_label_create(this->screen);
    lv_obj_set_width(title, LV_SIZE_CONTENT);
    lv_obj_set_height(title, LV_SIZE_CONTENT);
    lv_obj_set_x(title, 0);
    lv_obj_set_y(title, -50);
    lv_obj_set_align(title, LV_ALIGN_CENTER);
    lv_label_set_text(title, "Softwareaktualiesierung");
    lv_obj_set_style_text_color(title, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(title, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_28, LV_PART_MAIN | LV_STATE_DEFAULT);

    this->versionsLabel = lv_label_create(this->screen);
    lv_obj_set_width(versionsLabel, LV_SIZE_CONTENT);
    lv_obj_set_height(versionsLabel, LV_SIZE_CONTENT);
    lv_obj_set_x(versionsLabel, 0);
    lv_obj_set_y(versionsLabel, 50);
    lv_obj_set_align(versionsLabel, LV_ALIGN_CENTER);
    lv_label_set_text(versionsLabel, "??.??.?? -> ??.??.??");
    lv_obj_set_style_text_color(versionsLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(versionsLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(versionsLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *logo = lv_image_create(this->screen);
    lv_image_set_src(logo, &logo_400w_png);
    lv_obj_set_width(logo, LV_SIZE_CONTENT);
    lv_obj_set_height(logo, LV_SIZE_CONTENT);
    lv_obj_set_x(logo, 0);
    lv_obj_set_y(logo, -150);
    lv_obj_set_align(logo, LV_ALIGN_CENTER);
    lv_obj_add_flag(logo, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(logo, LV_OBJ_FLAG_SCROLLABLE);
}

void FirmwareUpdateScreen::loop()
{
}

void FirmwareUpdateScreen::setAvailableVersion(String availablevVersion)
{
    this->logger.debugf("Updating available version to %s", availablevVersion);
    String s = String(FIRMWARE_VERSION) + " > " + availablevVersion;
    lv_label_set_text(this->versionsLabel, s.c_str());
}

void FirmwareUpdateScreen::setProgress(int percent)
{
    if (percent < 0)
        percent = 0;

    if (percent > 100)
        percent = 100;

    this->logger.debugf("Updating firmware update progress %d", percent);
    lv_bar_set_value(this->progressBar, percent, LV_ANIM_OFF);
}
