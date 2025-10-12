#include "unlocked.hpp"

void Unlockedscreen::init()
{
    this->screen = lv_obj_create(NULL);
    lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *label = lv_label_create(this->screen);
    lv_obj_set_width(label, LV_SIZE_CONTENT);
    lv_obj_set_height(label, LV_SIZE_CONTENT);
    lv_obj_set_x(label, 12);
    lv_obj_set_y(label, -57);
    lv_obj_set_align(label, LV_ALIGN_CENTER);
    lv_label_set_text(label, "Zugriff gewährt");
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_AUTO, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(label, lv_color_hex(0x00FF00), LV_PART_MAIN | LV_STATE_DEFAULT);
}

lv_obj_t *Unlockedscreen::getScreen()
{
    return this->screen;
}

void Unlockedscreen::loop()
{
}