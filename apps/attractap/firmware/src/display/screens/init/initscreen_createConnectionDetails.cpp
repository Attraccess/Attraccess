#include "initscreen.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>
#include <cstdio>
#include "platform.hpp"

void InitScreen::createConnectionDetails(lv_obj_t *statesContainer)
{
   // Connection / cert-detection progress detail block. Smaller font, left aligned,
   // so users can see the configured target, which CA is being tried, the live
   // connection phase and the countdown to the next attempt.
   lv_obj_t *detailsContainer = lv_obj_create(statesContainer);
   lv_obj_remove_style_all(detailsContainer);
   lv_obj_set_width(detailsContainer, lv_pct(100));
   lv_obj_set_height(detailsContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(detailsContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(detailsContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(detailsContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(detailsContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(detailsContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(detailsContainer, 6, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->serverTargetLabel = lv_label_create(detailsContainer);
   lv_obj_set_width(this->serverTargetLabel, lv_pct(100));
   lv_obj_set_height(this->serverTargetLabel, LV_SIZE_CONTENT);
   lv_label_set_text(this->serverTargetLabel, "");
   lv_obj_set_style_text_font(this->serverTargetLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->serverTargetLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->certLabel = lv_label_create(detailsContainer);
   lv_obj_set_width(this->certLabel, lv_pct(100));
   lv_obj_set_height(this->certLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->certLabel, LV_LABEL_LONG_DOT);
   lv_label_set_text(this->certLabel, "");
   lv_obj_set_style_text_font(this->certLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->certLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->connectionStateLabel = lv_label_create(detailsContainer);
   lv_obj_set_width(this->connectionStateLabel, lv_pct(100));
   lv_obj_set_height(this->connectionStateLabel, LV_SIZE_CONTENT);
   lv_label_set_text(this->connectionStateLabel, "");
   lv_obj_set_style_text_font(this->connectionStateLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->connectionStateLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *openSettingsButton = lv_btn_create(statesContainer);
   DisplayTheme::button(openSettingsButton);
   lv_obj_set_width(openSettingsButton, LV_SIZE_CONTENT);
   lv_obj_set_height(openSettingsButton, LV_SIZE_CONTENT);
   lv_obj_set_align(openSettingsButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(openSettingsButton, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_add_flag(openSettingsButton, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *openSettingsButtonLabel = lv_label_create(openSettingsButton);
   lv_obj_set_width(openSettingsButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(openSettingsButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(openSettingsButtonLabel, LV_ALIGN_CENTER);
   lv_label_set_text(openSettingsButtonLabel, "Einstellungen");
   lv_obj_set_style_text_color(openSettingsButtonLabel, DisplayTheme::onPrimary(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(openSettingsButtonLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_add_event_cb(openSettingsButton, &InitScreen::onOpenSettingsButtonEvent, LV_EVENT_CLICKED, this);

}
