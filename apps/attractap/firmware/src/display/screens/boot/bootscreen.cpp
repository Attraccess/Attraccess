#include "bootscreen.hpp"
#include "display/theme.hpp"
#include <string>

void BootScreen::init()
{
    if (this->screen)
    {
        return;
    }
    this->screen = lv_obj_create(NULL);
    DisplayTheme::applyScreen(this->screen);

    // Main title
    lv_obj_t *title_label = lv_label_create(this->screen);
    lv_label_set_text(title_label, "Attraccess");
    lv_obj_set_style_text_font(title_label, &lv_font_montserrat_48, 0);
    lv_obj_set_style_text_color(title_label, DisplayTheme::text(), 0);
    lv_obj_align(title_label, LV_ALIGN_CENTER, 0, -60);

    // Firmware info
    lv_obj_t *firmware_label = lv_label_create(this->screen);
    std::string firmware_info = std::string(FIRMWARE_FRIENDLY_NAME) + " v" + FIRMWARE_VERSION;
    lv_label_set_text(firmware_label, firmware_info.c_str());
    lv_obj_set_style_text_font(firmware_label, &lv_font_montserrat_18, 0);
    lv_obj_set_style_text_color(firmware_label, DisplayTheme::muted(), 0);
    lv_obj_align(firmware_label, LV_ALIGN_CENTER, 0, 20);
}

lv_obj_t *BootScreen::getScreen()
{
    return this->screen;
}

void BootScreen::loop()
{
}

std::string BootScreen::getName()
{
    return "BootScreen";
}

void BootScreen::onScreenLeave()
{
}

void BootScreen::destroy()
{
    if (!this->screen)
    {
        return;
    }
    lv_obj_del(this->screen);
    this->screen = nullptr;
}
