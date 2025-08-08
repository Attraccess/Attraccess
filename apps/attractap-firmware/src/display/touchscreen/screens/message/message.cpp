#include "message.hpp"

MessageScreen::MessageScreen() : screen(nullptr), lineOneLabel(nullptr), lineTwoLabel(nullptr), initialized(false), logger("Touchscreen:Message")
{
    // Don't create LVGL objects here - they need to be created after lv_init()
}

void MessageScreen::initialize()
{
    if (initialized)
        return;

    this->screen = lv_obj_create(NULL);
    lv_obj_set_size(this->screen, TFT_HOR_RES, TFT_VER_RES);
    lv_obj_set_style_bg_color(this->screen, lv_color_hex(0x000000), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(this->screen, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_border_width(this->screen, 0, LV_PART_MAIN);
    lv_obj_set_style_border_color(this->screen, lv_color_hex(0x000000), LV_PART_MAIN);

    lineOneLabel = lv_label_create(this->screen);
    lv_obj_center(lineOneLabel);

    lineTwoLabel = lv_label_create(this->screen);
    lv_obj_center(lineTwoLabel);

    initialized = true;
}

void MessageScreen::onScreenEnter()
{
    logger.debug("onScreenEnter");
}

void MessageScreen::onScreenExit()
{
    logger.debug("onScreenExit");
}

lv_obj_t *MessageScreen::getScreen()
{
    if (!initialized)
    {
        initialize();
    }
    return screen;
}

void MessageScreen::loop()
{
}

void MessageScreen::setMessage(String lineOne, lv_color_t lineOneColor)
{
    this->setMessage(lineOne, lineOneColor, "", lv_color_hex(0xFFFFFF));
}

void MessageScreen::setMessage(String lineOne, lv_color_t lineOneColor, String lineTwo, lv_color_t lineTwoColor)
{
    if (!initialized)
    {
        initialize();
    }

    if (!lineOneLabel)
    {
        return;
    }
    lv_label_set_text(lineOneLabel, lineOne.c_str());
    lv_obj_set_style_text_color(lineOneLabel, lineOneColor, LV_PART_MAIN);

    if (!lineTwoLabel)
    {
        return;
    }
    lv_label_set_text(lineTwoLabel, lineTwo.c_str());
    lv_obj_set_style_text_color(lineTwoLabel, lineTwoColor, LV_PART_MAIN);
}