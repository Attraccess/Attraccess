#include "noResourcesScreen.hpp"
#include "display/theme.hpp"
#include <string>

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
   DisplayTheme::applyScreen(this->screen);
   lv_obj_set_style_pad_left(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *noResourcesMessage = lv_label_create(this->screen);
   lv_obj_set_width(noResourcesMessage, lv_pct(100));
   lv_obj_set_height(noResourcesMessage, LV_SIZE_CONTENT);
   lv_obj_set_align(noResourcesMessage, LV_ALIGN_CENTER);

   State::ApiState apiState = State::getApiState();
   lv_label_set_text(noResourcesMessage, "Keine Ressourcen mit diesem Lesegeraet verknuepft, bitte konfigurieren Sie das Lesegeraet in der Attraccess Administration");
   lv_obj_set_style_text_font(noResourcesMessage, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(noResourcesMessage, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
}

lv_obj_t *NoResourcesScreen::getScreen()
{
   return this->screen;
}

void NoResourcesScreen::loop()
{
   // nothing to do
}

std::string NoResourcesScreen::getName()
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
