#include "unknownState.hpp"

UnknownStateScreen::UnknownStateScreen() : screen(nullptr), initialized(false), logger("Touchscreen:UnknownState")
{
    // Don't create LVGL objects here - they need to be created after lv_init()
}

void UnknownStateScreen::initialize()
{
    if (initialized)
        return;

    this->screen = lv_obj_create(NULL);
    lv_obj_set_size(this->screen, TFT_HOR_RES, TFT_VER_RES);
    lv_obj_set_style_bg_color(this->screen, lv_color_hex(0x000000), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(this->screen, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_border_width(this->screen, 0, LV_PART_MAIN);
    lv_obj_set_style_border_color(this->screen, lv_color_hex(0x000000), LV_PART_MAIN);

    lv_obj_t *label = lv_label_create(this->screen);
    lv_obj_center(label);
    lv_label_set_text(label, "Unknown state");
    lv_obj_set_style_text_color(label, lv_color_hex(0xFF0000), LV_PART_MAIN);

    initialized = true;
}

void UnknownStateScreen::onScreenEnter()
{
    logger.debug("onScreenEnter");
}

void UnknownStateScreen::onScreenExit()
{
    logger.debug("onScreenExit");
}

lv_obj_t *UnknownStateScreen::getScreen()
{
    if (!initialized)
    {
        initialize();
    }
    return screen;
}

void UnknownStateScreen::loop()
{
}