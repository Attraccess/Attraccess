#include "nfcTap.hpp"

NfcTapScreen::NfcTapScreen() : screen(nullptr), label(nullptr), initialized(false), logger("Touchscreen:NfcTap")
{
    // Don't create LVGL objects here - they need to be created after lv_init()
}

void NfcTapScreen::initialize()
{
    if (initialized)
        return;

    this->screen = lv_obj_create(NULL);
    lv_obj_set_size(this->screen, TFT_HOR_RES, TFT_VER_RES);
    lv_obj_set_style_bg_color(this->screen, lv_color_hex(0x000000), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(this->screen, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_border_width(this->screen, 0, LV_PART_MAIN);
    lv_obj_set_style_border_color(this->screen, lv_color_hex(0x000000), LV_PART_MAIN);

    label = lv_label_create(this->screen);
    lv_obj_set_style_text_color(label, lv_color_hex(0x0000FF), LV_PART_MAIN);
    lv_obj_center(label);

    initialized = true;
}

void NfcTapScreen::onScreenEnter()
{
    logger.debug("onScreenEnter");
}

void NfcTapScreen::onScreenExit()
{
    logger.debug("onScreenExit");
}

lv_obj_t *NfcTapScreen::getScreen()
{
    if (!initialized)
    {
        initialize();
    }
    return screen;
}

void NfcTapScreen::loop()
{
}

void NfcTapScreen::setMessage(String message)
{
    if (!initialized)
    {
        initialize();
    }

    if (!label)
    {
        return;
    }
    lv_label_set_text(label, message.c_str());
}