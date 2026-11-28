#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"

// Switching the project of a running session (ATT-1421): the card holder's own session shows the project it is
// booked to and "Change project". The server says whether to offer it (only to readers announcing the capability).

void ResourceDetailsScreen::createProjectSwitch()
{
   this->sessionProjectLabel = lv_label_create(this->sessionControls);
   lv_obj_set_width(this->sessionProjectLabel, lv_pct(100));
   // One line, ending in dots: LVGL only dots a label of fixed height, a content-sized one wraps.
   lv_obj_set_height(this->sessionProjectLabel, lv_font_get_line_height(&attractap_font_montserrat_latin1_18));
   lv_label_set_long_mode(this->sessionProjectLabel, LV_LABEL_LONG_DOT);
   lv_obj_set_style_text_font(this->sessionProjectLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_style_text_color(this->sessionProjectLabel, DisplayTheme::text(), LV_PART_MAIN);
   lv_obj_add_flag(this->sessionProjectLabel, LV_OBJ_FLAG_HIDDEN);

   this->switchProjectButton = lv_button_create(this->sessionControls);
   lv_obj_set_height(this->switchProjectButton, 50);
   lv_obj_set_width(this->switchProjectButton, lv_pct(100));
   lv_obj_add_flag(this->switchProjectButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->switchProjectButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::secondaryButton(this->switchProjectButton);
   lv_obj_add_flag(this->switchProjectButton, LV_OBJ_FLAG_HIDDEN);
   auto *click = new ButtonClickEventData{this, BUTTON_CLICK_TYPE_SWITCH_PROJECT, {}};
   lv_obj_add_event_cb(this->switchProjectButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, click);
   lv_obj_add_event_cb(this->switchProjectButton, &ResourceDetailsScreen::onContainerDelete, LV_EVENT_DELETE, click);
   lv_obj_t *label = lv_label_create(this->switchProjectButton);
   lv_obj_set_align(label, LV_ALIGN_CENTER);
   lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   FirmwareI18n::setLabel(label, FirmwareI18n::Message::ChangeProject);

   // Above the stop button, below the automatic end of the running session.
   const uint32_t stopIndex = lv_obj_get_index(this->stopSessionButton);
   lv_obj_move_to_index(this->sessionProjectLabel, stopIndex);
   lv_obj_move_to_index(this->switchProjectButton, stopIndex + 1);
}

void ResourceDetailsScreen::updateProjectSwitch()
{
   if (!this->sessionProjectLabel || !this->switchProjectButton) return;
   const bool visible = this->resourceCacheValid && this->resourceCache.canSwitchProject && this->ownsActiveUsage();
   lv_obj_set_flag(this->sessionProjectLabel, LV_OBJ_FLAG_HIDDEN, !visible);
   lv_obj_set_flag(this->switchProjectButton, LV_OBJ_FLAG_HIDDEN, !visible);
   if (!visible) return;
   const FirmwareI18n::Text name = this->resourceCache.ownProjectId == 0
      ? FirmwareI18n::Text(FirmwareI18n::Message::NoProject)
      : FirmwareI18n::Text::literal(this->resourceCache.ownProjectName) /* i18n-data: Server-supplied project name; preserve exact contents. */;
   FirmwareI18n::setLabel(this->sessionProjectLabel, FirmwareI18n::Text::format(FirmwareI18n::Message::CurrentProjectLine, {name}));
}
