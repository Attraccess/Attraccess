#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"

// The row of the stop button; on a machine "Report a problem" joins it there.
lv_obj_t *ResourceDetailsScreen::createStopSessionRow()
{
   lv_obj_t *row = lv_obj_create(this->sessionControls);
   lv_obj_remove_style_all(row);
   lv_obj_set_size(row, lv_pct(100), LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
   lv_obj_set_style_pad_column(row, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_remove_flag(row, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_flag(row, LV_OBJ_FLAG_HIDDEN);
   return row;
}

// "Report a problem": for a signed-in card holder who may request maintenance here, whether or not they may use the
// resource, a session runs or it is under maintenance (the web hides its button while a maintenance is active).
void ResourceDetailsScreen::createReportProblemButton()
{
   this->reportProblemButton = lv_button_create(this->body);
   lv_obj_set_width(this->reportProblemButton, lv_pct(100));
   lv_obj_set_height(this->reportProblemButton, 50);
   lv_obj_remove_flag(this->reportProblemButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::secondaryButton(this->reportProblemButton);
   lv_obj_add_flag(this->reportProblemButton, LV_OBJ_FLAG_HIDDEN);
   auto *evt = new ButtonClickEventData{this, BUTTON_CLICK_TYPE_REPORT_PROBLEM, {}};
   lv_obj_add_event_cb(this->reportProblemButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, evt);
   lv_obj_add_event_cb(this->reportProblemButton, &ResourceDetailsScreen::onContainerDelete, LV_EVENT_DELETE, evt);

   lv_obj_t *label = lv_label_create(this->reportProblemButton);
   FirmwareI18n::setLabel(label, FirmwareI18n::Message::ReportProblem);
   lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_center(label);
}

void ResourceDetailsScreen::updateReportProblemButton()
{
   if (!this->reportProblemButton) return;
   // The row only takes space while the stop button in it shows.
   const bool stopShown = !lv_obj_has_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);
   lv_obj_set_flag(this->stopSessionRow, LV_OBJ_FLAG_HIDDEN, !stopShown);
   // The flag only means something in a list personalised for the signed-in card.
   const bool shown = this->userDetailsInitialized && this->userDetailsCache.listPersonalized &&
                      this->resourceCacheValid && this->resourceCache.canRequestMaintenance;
   lv_obj_set_flag(this->reportProblemButton, LV_OBJ_FLAG_HIDDEN, !shown);
   this->placeReportProblemButton(stopShown);
}

// A door: directly below its action buttons. A machine whose stop button shows: beside it, in one row. Otherwise (no
// session to end, or no access to the controls) at the end of the details.
void ResourceDetailsScreen::placeReportProblemButton(bool stopShown)
{
   const bool controlsShown = !lv_obj_has_flag(this->sessionControls, LV_OBJ_FLAG_HIDDEN);
   const bool door = this->resourceCacheValid && this->resourceCache.type == 1;
   lv_obj_t *parent = !controlsShown ? this->body
                      : door         ? this->sessionControls
                      : stopShown    ? this->stopSessionRow
                                     : this->body;
   if (lv_obj_get_parent(this->reportProblemButton) != parent) lv_obj_set_parent(this->reportProblemButton, parent);
   if (parent == this->sessionControls)
      lv_obj_move_to_index(this->reportProblemButton, lv_obj_get_index(this->doorControls) + 1);
   // In the row both buttons take half; elsewhere the button spans the width (growing would stretch a column).
   lv_obj_set_flex_grow(this->reportProblemButton, parent == this->stopSessionRow ? 1 : 0);
}
