#include "projectSelectScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/screenChrome.hpp"

// The picker while a running session switches its project (ATT-1421).

void ProjectSelectScreen::setSwitchTarget(bool value, uint32_t current)
{
   this->switching = value;
   this->currentProjectId = value ? current : 0;
   if (this->titleLabel)
   {
      FirmwareI18n::setLabel(this->titleLabel, value ? FirmwareI18n::Message::ChangeProject : FirmwareI18n::Message::SelectProject);
   }
   if (this->screen && !this->projectsRequestPending && this->projectsDataInitialized)
   {
      this->rebuildProjectsList();
   }
}

void ProjectSelectScreen::createNoProjectButton()
{
   lv_obj_t *button = lv_button_create(this->projectsListContainer);
   lv_obj_set_width(button, lv_pct(100));
   lv_obj_set_height(button, 40);
   lv_obj_add_flag(button, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(button, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::secondaryButton(button);
   if (this->currentProjectId == 0) lv_obj_add_state(button, LV_STATE_DISABLED);
   lv_obj_add_event_cb(button, &ProjectSelectScreen::onNoProjectClick, LV_EVENT_CLICKED, this);
   lv_obj_t *label = ScreenChrome::createOneLineLabel(button, ScreenChrome::ContentWidth - 24, &attractap_font_montserrat_latin1_18);
   lv_obj_center(label);
   lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
   FirmwareI18n::setLabel(label, FirmwareI18n::Message::NoProject);
}

void ProjectSelectScreen::onNoProjectClick(lv_event_t *e)
{
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (!self) return;
   self->selectedProjectId = 0;
   if (self->selectionCallback) self->selectionCallback(0, "");
}
