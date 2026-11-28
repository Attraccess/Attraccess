#include "projectSelectScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/headerButton.hpp"

// The picker while a running session switches its project (ATT-1421).

void ProjectSelectScreen::setSwitchTarget(bool value, uint32_t current)
{
   this->switching = value;
   this->currentProjectId = value ? current : 0;
   this->updateSwitchChrome();
   if (this->screen && !this->projectsRequestPending && this->projectsDataInitialized)
   {
      this->rebuildProjectsList();
   }
}

// The title and the resource it is for; while switching, "No project" stands to their right, on every page.
void ProjectSelectScreen::createProjectsTitleRow(lv_obj_t *panel)
{
   lv_obj_t *row = lv_obj_create(panel);
   lv_obj_remove_style_all(row);
   lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_size(row, lv_pct(100), LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(row, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_column(row, 12, LV_PART_MAIN);
   lv_obj_set_style_margin_bottom(row, 8, LV_PART_MAIN);

   lv_obj_t *titles = lv_obj_create(row);
   lv_obj_remove_style_all(titles);
   lv_obj_remove_flag(titles, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_height(titles, LV_SIZE_CONTENT);
   lv_obj_set_flex_grow(titles, 1);
   lv_obj_set_flex_flow(titles, LV_FLEX_FLOW_COLUMN);
   ReaderHeader::createFlowTitle(titles, &this->titleLabel, &this->resourceNameLabel);
   lv_obj_set_width(this->titleLabel, lv_pct(100));
   lv_obj_set_width(this->resourceNameLabel, lv_pct(100));
   FirmwareI18n::setDynamicLabel(this->resourceNameLabel, this->resourceName.c_str()) /* i18n-data: Server-supplied resource name; preserve exact contents. */;

   this->noProjectButton = lv_button_create(row);
   DisplayTheme::secondaryButton(this->noProjectButton);
   lv_obj_set_size(this->noProjectButton, LV_SIZE_CONTENT, 44);
   lv_obj_set_style_pad_hor(this->noProjectButton, 16, LV_PART_MAIN);
   lv_obj_set_style_pad_ver(this->noProjectButton, 0, LV_PART_MAIN);
   lv_obj_add_event_cb(this->noProjectButton, &ProjectSelectScreen::onNoProjectClick, LV_EVENT_CLICKED, this);
   lv_obj_t *label = lv_label_create(this->noProjectButton);
   lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   FirmwareI18n::setLabel(label, FirmwareI18n::Message::NoProject);
   lv_obj_center(label);

   this->updateSwitchChrome();
}

void ProjectSelectScreen::updateSwitchChrome()
{
   if (!this->titleLabel || !this->noProjectButton) return;
   FirmwareI18n::setLabel(this->titleLabel, this->switching ? FirmwareI18n::Message::ChangeProject : FirmwareI18n::Message::SelectProject);
   lv_obj_set_flag(this->noProjectButton, LV_OBJ_FLAG_HIDDEN, !this->switching);
   lv_obj_set_state(this->noProjectButton, LV_STATE_DISABLED, this->currentProjectId == 0);
}

void ProjectSelectScreen::onNoProjectClick(lv_event_t *e)
{
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (!self) return;
   self->selectedProjectId = 0;
   if (self->selectionCallback) self->selectionCallback(0, "");
}
