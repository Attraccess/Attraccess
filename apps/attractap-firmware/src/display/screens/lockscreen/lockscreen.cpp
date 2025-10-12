#include "lockscreen.hpp"

void Lockscreen::init()
{
    this->screen = lv_obj_create(NULL);
    lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_image_src(this->screen, &lockscreen_background_image, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *label = lv_label_create(this->screen);
    lv_obj_set_width(label, LV_SIZE_CONTENT);
    lv_obj_set_height(label, LV_SIZE_CONTENT);
    lv_obj_set_x(label, 12);
    lv_obj_set_y(label, -57);
    lv_obj_set_align(label, LV_ALIGN_CENTER);
    lv_label_set_text(label, "Bitte mit NFC \n        Karte/Tag anmelden");
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_AUTO, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *logo = lv_image_create(this->screen);
    lv_image_set_src(logo, &logo_400w_png);
    lv_obj_set_width(logo, LV_SIZE_CONTENT);
    lv_obj_set_height(logo, LV_SIZE_CONTENT);
    lv_obj_set_x(logo, 0);
    lv_obj_set_y(logo, -175);
    lv_obj_set_align(logo, LV_ALIGN_CENTER);
    lv_obj_add_flag(logo, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(logo, LV_OBJ_FLAG_SCROLLABLE);
    lv_image_set_scale(logo, 200);
}

lv_obj_t *Lockscreen::getScreen()
{
    return this->screen;
}

void Lockscreen::loop()
{
}