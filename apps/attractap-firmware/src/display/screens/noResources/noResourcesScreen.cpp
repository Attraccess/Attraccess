#include "noResourcesScreen.hpp"
#include "../../backgroundImage.hpp"

void NoResourcesScreen::init()
{
   if (this->screen)
   {
      return;
   }
   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_bg_color(this->screen, lv_color_hex(0x1F2C47), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_all(this->screen, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_row(this->screen, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(this->screen, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_border_width(this->screen, 0, LV_PART_MAIN | LV_STATE_DEFAULT);

   /* Background image as first child, scaled to cover full screen (P4 has larger display) */
   lv_obj_t *bg_img = lv_image_create(this->screen);
   lv_image_set_src(bg_img, &lockscreen_background_image);
   lv_obj_set_size(bg_img, lv_pct(100), lv_pct(100));
   lv_obj_add_flag(bg_img, LV_OBJ_FLAG_IGNORE_LAYOUT);
   lv_obj_set_pos(bg_img, 0, 0);
   lv_image_set_inner_align(bg_img, LV_IMAGE_ALIGN_COVER);
   lv_image_cover_left_align(bg_img);

   lv_obj_t *content = lv_obj_create(this->screen);
   lv_obj_remove_style_all(content);
   lv_obj_set_width(content, lv_pct(100));
   lv_obj_set_height(content, LV_SIZE_CONTENT);
   lv_obj_set_flex_grow(content, 1);
   lv_obj_set_flex_flow(content, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(content, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(content, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_left(content, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(content, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(content, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(content, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *noResourcesMessage = lv_label_create(content);
   lv_obj_set_width(noResourcesMessage, lv_pct(100));
   lv_obj_set_height(noResourcesMessage, LV_SIZE_CONTENT);
   lv_obj_set_align(noResourcesMessage, LV_ALIGN_CENTER);

   State::ApiState apiState = State::getApiState();
   lv_label_set_text(noResourcesMessage, "Keine Ressourcen mit diesem Lesegeraet verknuepft, bitte konfigurieren Sie das Lesegeraet in der Attraccess Administration");
   lv_obj_set_style_text_font(noResourcesMessage, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(noResourcesMessage, lv_color_hex(0xff0000), LV_PART_MAIN | LV_STATE_DEFAULT);
}

lv_obj_t *NoResourcesScreen::getScreen()
{
   return this->screen;
}

void NoResourcesScreen::loop()
{
   // nothing to do
}

String NoResourcesScreen::getName()
{
   return "NoResourcesScreen";
}

void NoResourcesScreen::onScreenLeave()
{
}

void NoResourcesScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
}