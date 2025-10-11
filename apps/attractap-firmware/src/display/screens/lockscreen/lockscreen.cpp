#include "lockscreen.hpp"

void Lockscreen::init()
{
    this->screen = lv_obj_create(NULL);
    lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *backgorundImage = lv_image_create(this->screen);
    lv_image_set_src(backgorundImage, &lockscreen_background_image);
    lv_obj_set_width(backgorundImage, lv_pct(100));
    lv_obj_set_height(backgorundImage, lv_pct(100));
    lv_obj_set_align(backgorundImage, LV_ALIGN_CENTER);
    lv_obj_add_flag(backgorundImage, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(backgorundImage, LV_OBJ_FLAG_SCROLLABLE);
    lv_image_set_scale(backgorundImage, 512);

    lv_obj_t *label = lv_label_create(this->screen);
    lv_obj_set_width(label, LV_SIZE_CONTENT);
    lv_obj_set_height(label, LV_SIZE_CONTENT);
    lv_obj_set_x(label, 60);
    lv_obj_set_y(label, -115);
    lv_obj_set_align(label, LV_ALIGN_CENTER);
    lv_label_set_text(label, "Bitte mit NFC \nKarte/Tag anmelden");
    lv_obj_set_style_text_font(label, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
}

lv_obj_t *Lockscreen::getScreen()
{
    return this->screen;
}

void Lockscreen::loop()
{
}