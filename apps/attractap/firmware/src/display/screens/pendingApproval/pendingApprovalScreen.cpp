#include "display/i18n.hpp"
#include "pendingApprovalScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../theme.hpp"
#include "../../images/lockscreen_background_image.hpp"
#include <string>

void PendingApprovalScreen::init()
{
   if (this->screen)
   {
      return;
   }
   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_row(this->screen, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   DisplayTheme::applyScreen(this->screen);
   lv_obj_set_style_bg_image_src(this->screen, &lockscreen_background_image, LV_PART_MAIN);
   lv_obj_set_style_pad_all(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *title = lv_label_create(this->screen);
   lv_obj_set_width(title, lv_pct(100));
   lv_obj_set_style_text_align(title, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   FirmwareI18n::setLabel(title, FirmwareI18n::Message::ApproveThisReaderInAttraccess);
   lv_obj_set_style_text_font(title, &attractap_font_montserrat_latin1_26, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(title, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->codeLabel = lv_label_create(this->screen);
   lv_obj_set_style_text_font(this->codeLabel, &attractap_font_montserrat_latin1_36, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_letter_space(this->codeLabel, 4, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->codeLabel, DisplayTheme::primary(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->hintLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->hintLabel, lv_pct(100));
   lv_obj_set_style_text_align(this->hintLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->hintLabel, &attractap_font_montserrat_latin1_20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->hintLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->loop();
}

void PendingApprovalScreen::loop()
{
   if (!this->screen)
   {
      return;
   }
   const State::EnrollmentState enrollment = State::getEnrollmentState();
   const auto seconds = [](uint32_t ms) { return std::to_string((ms + 999) / 1000); };

   if (enrollment.rejected)
   {
      setDynamicLabelTextIfChanged(this->codeLabel, "- - -") /* i18n-data: Language-neutral placeholder while no code arrived yet. */;
      setLabelTextIfChanged(this->hintLabel, FirmwareI18n::Text::format(FirmwareI18n::Message::EnrollmentRetryIn, {FirmwareI18n::Text::literal(seconds(enrollment.retryInMs)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */}));
      return;
   }
   setDynamicLabelTextIfChanged(this->codeLabel, enrollment.code.c_str()) /* i18n-data: Server-issued enrollment code; preserve exact contents. */;
   setLabelTextIfChanged(this->hintLabel, FirmwareI18n::Text::format(FirmwareI18n::Message::EnrollmentCodeChangesIn, {FirmwareI18n::Text::literal(seconds(enrollment.rotatesInMs)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */}));
}

lv_obj_t *PendingApprovalScreen::getScreen()
{
   return this->screen;
}

std::string PendingApprovalScreen::getName()
{
   return "PendingApprovalScreen";
}

void PendingApprovalScreen::onScreenLeave()
{
}

void PendingApprovalScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
   this->codeLabel = nullptr;
   this->hintLabel = nullptr;
}
