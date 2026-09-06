#include "firmwareUpdateScreen.hpp"
#include "display/theme.hpp"
#include <string>

void FirmwareUpdateScreen::init()
{
    if (this->screen)
    {
        return;
    }
    this->screen = lv_obj_create(NULL);
    lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
    DisplayTheme::applyScreen(this->screen);

    this->progressBar = lv_bar_create(this->screen);
    lv_bar_set_value(this->progressBar, 25, LV_ANIM_OFF);
    lv_bar_set_start_value(this->progressBar, 0, LV_ANIM_OFF);
    lv_obj_set_width(this->progressBar, 400);
    lv_obj_set_height(this->progressBar, 50);
    lv_obj_set_align(this->progressBar, LV_ALIGN_CENTER);
    lv_obj_set_style_bg_color(this->progressBar, DisplayTheme::surfaceSecondary(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(this->progressBar, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_radius(this->progressBar, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(this->progressBar, DisplayTheme::primary(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(this->progressBar, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);
    lv_obj_set_style_radius(this->progressBar, 6, LV_PART_INDICATOR | LV_STATE_DEFAULT);

    // Compensating for LVGL9.1 draw crash with bar/slider max value when top-padding is nonzero and right-padding is 0
    if (lv_obj_get_style_pad_top(this->progressBar, LV_PART_MAIN) > 0)
        lv_obj_set_style_pad_right(this->progressBar, lv_obj_get_style_pad_right(this->progressBar, LV_PART_MAIN) + 1, LV_PART_MAIN);

    this->title = lv_label_create(this->screen);
    lv_obj_set_width(this->title, LV_SIZE_CONTENT);
    lv_obj_set_height(this->title, LV_SIZE_CONTENT);
    lv_obj_set_x(this->title, 0);
    lv_obj_set_y(this->title, -50);
    lv_obj_set_align(this->title, LV_ALIGN_CENTER);
    lv_label_set_text(this->title, "Softwareaktualiesierung");
    lv_obj_set_style_text_color(this->title, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(this->title, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->title, &lv_font_montserrat_28, LV_PART_MAIN | LV_STATE_DEFAULT);

    this->versionsLabel = lv_label_create(this->screen);
    lv_obj_set_width(this->versionsLabel, LV_SIZE_CONTENT);
    lv_obj_set_height(this->versionsLabel, LV_SIZE_CONTENT);
    lv_obj_set_x(this->versionsLabel, 0);
    lv_obj_set_y(this->versionsLabel, 50);
    lv_obj_set_align(this->versionsLabel, LV_ALIGN_CENTER);
    lv_obj_set_style_text_color(this->versionsLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(this->versionsLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->versionsLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
    if (this->availableVersionCache.length() > 0)
    {
        this->setAvailableVersion(this->availableVersionCache);
    }
    else
    {
        std::string placeholder = std::string(FIRMWARE_VERSION) + " -> ??.??.??";
        lv_label_set_text(this->versionsLabel, placeholder.c_str());
    }

    this->setProgress(this->progressPercent);

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

void FirmwareUpdateScreen::setAvailableVersion(std::string availablevVersion)
{
    this->availableVersionCache = availablevVersion;
    this->logger.debugf("Updating available version to %s", availablevVersion.c_str());
    if (!this->versionsLabel)
    {
        return;
    }
    std::string s = std::string(FIRMWARE_VERSION) + " -> " + availablevVersion;
    lv_label_set_text(this->versionsLabel, s.c_str());
}

void FirmwareUpdateScreen::setProgress(int percent)
{
    if (percent < 0)
        percent = 0;

    if (percent > 100)
        percent = 100;

    this->progressPercent = percent;

    if (!this->progressBar)
    {
        return;
    }

    this->logger.debugf("Updating firmware update progress %d", percent);
    lv_bar_set_value(this->progressBar, percent, LV_ANIM_OFF);
}

void FirmwareUpdateScreen::onScreenLeave()
{
}

void FirmwareUpdateScreen::destroy()
{
    if (!this->screen)
    {
        return;
    }
    lv_obj_del(this->screen);
    this->screen = nullptr;
    this->progressBar = nullptr;
    this->title = nullptr;
    this->versionsLabel = nullptr;
}
