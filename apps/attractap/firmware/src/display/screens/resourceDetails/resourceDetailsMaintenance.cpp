#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"

// "Report a problem": for a signed-in card holder who may request maintenance here, whether or not they may use the
// resource, a session runs or it is under maintenance (like the web).
void ResourceDetailsScreen::createReportProblemButton()
{
   this->reportProblemButton = lv_button_create(this->body);
   lv_obj_set_width(this->reportProblemButton, lv_pct(100));
   lv_obj_set_height(this->reportProblemButton, 50);
   lv_obj_remove_flag(this->reportProblemButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::secondaryButton(this->reportProblemButton);
   lv_obj_add_flag(this->reportProblemButton, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->reportProblemButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED,
                       new ButtonClickEventData{this, BUTTON_CLICK_TYPE_REPORT_PROBLEM, {}});

   lv_obj_t *label = lv_label_create(this->reportProblemButton);
   FirmwareI18n::setLabel(label, FirmwareI18n::Message::ReportProblem);
   lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_center(label);
}

void ResourceDetailsScreen::updateReportProblemButton()
{
   if (!this->reportProblemButton) return;
   // The flag only means something in a list personalised for the signed-in card.
   const bool shown = this->userDetailsInitialized && this->userDetailsCache.listPersonalized &&
                      this->resourceCacheValid && this->resourceCache.canRequestMaintenance;
   lv_obj_set_flag(this->reportProblemButton, LV_OBJ_FLAG_HIDDEN, !shown);
}
