#include "display/i18n.hpp"
#include "pendingApprovalScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../theme.hpp"
#include "../../images/lockscreen_background_image.hpp"
#include <string>

extern "C" {
#include "src/libs/qrcode/qrcodegen.h"
}

namespace
{
    // Dark modules on white whatever the theme, or phones cannot read it. LVGL 9.3 has no quiet zone
    // option, so the white card is padded by hand to at least 4 modules (QR spec) around the symbol.
    constexpr int32_t QR_CANVAS_PX = 190;
    constexpr int32_t QR_QUIET_MODULES = 4;
    constexpr size_t QR_MAX_URL_BYTES = 200;
}

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

   this->qrCard = lv_obj_create(this->screen);
   lv_obj_remove_flag(this->qrCard, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_size(this->qrCard, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
   lv_obj_set_style_bg_color(this->qrCard, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->qrCard, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_border_width(this->qrCard, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->qrCard, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_all(this->qrCard, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   this->qrCode = lv_qrcode_create(this->qrCard);
   lv_qrcode_set_size(this->qrCode, QR_CANVAS_PX);
   lv_qrcode_set_dark_color(this->qrCode, lv_color_black());
   lv_qrcode_set_light_color(this->qrCode, lv_color_white());
   lv_obj_add_flag(this->qrCard, LV_OBJ_FLAG_HIDDEN);

   this->codeLabel = lv_label_create(this->screen);
   lv_obj_set_style_text_font(this->codeLabel, &attractap_font_montserrat_latin1_36, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_letter_space(this->codeLabel, 4, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->codeLabel, DisplayTheme::primary(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->scanHintLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->scanHintLabel, lv_pct(100));
   lv_obj_set_style_text_align(this->scanHintLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   FirmwareI18n::setLabel(this->scanHintLabel, FirmwareI18n::Message::ScanOrEnterCodeInAttraccess);
   lv_obj_set_style_text_font(this->scanHintLabel, &attractap_font_montserrat_latin1_20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->scanHintLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->scanHintLabel, LV_OBJ_FLAG_HIDDEN);

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
      this->updateQrCode("");
      setDynamicLabelTextIfChanged(this->codeLabel, "- - -");
      setLabelTextIfChanged(this->hintLabel, FirmwareI18n::Text::format(FirmwareI18n::Message::EnrollmentRetryIn, {FirmwareI18n::Text::literal(seconds(enrollment.retryInMs)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */}));
      return;
   }
   this->updateQrCode(enrollment.enrollUrl);
   setDynamicLabelTextIfChanged(this->codeLabel, enrollment.code.c_str());
   setLabelTextIfChanged(this->hintLabel, FirmwareI18n::Text::format(FirmwareI18n::Message::EnrollmentCodeChangesIn, {FirmwareI18n::Text::literal(seconds(enrollment.rotatesInMs)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */}));
}

bool PendingApprovalScreen::isQrVisible() const
{
   return this->qrCard && !lv_obj_has_flag(this->qrCard, LV_OBJ_FLAG_HIDDEN);
}

void PendingApprovalScreen::showQrCode(bool visible)
{
   if (visible)
   {
      lv_obj_remove_flag(this->qrCard, LV_OBJ_FLAG_HIDDEN);
      lv_obj_remove_flag(this->scanHintLabel, LV_OBJ_FLAG_HIDDEN);
   }
   else
   {
      lv_obj_add_flag(this->qrCard, LV_OBJ_FLAG_HIDDEN);
      lv_obj_add_flag(this->scanHintLabel, LV_OBJ_FLAG_HIDDEN);
   }
}

// Called every tick; the QR is only touched when the link changed (once per rotation).
void PendingApprovalScreen::updateQrCode(const std::string &url)
{
   if (url == this->qrUrl)
   {
      return;
   }
   this->qrUrl = url;
   if (url.empty())
   {
      this->showQrCode(false);
      return;
   }
   const int version = url.length() <= QR_MAX_URL_BYTES ? qrcodegen_getMinFitVersion(qrcodegen_Ecc_MEDIUM, url.length()) : 0;
   if (version == 0 || lv_qrcode_update(this->qrCode, url.c_str(), url.length()) != LV_RESULT_OK)
   {
      this->logger.warnf("Cannot build the enrollment QR code (%u bytes), showing the code only", static_cast<unsigned>(url.length()));
      this->showQrCode(false);
      return;
   }
   // LVGL scales by whole pixels and centres the symbol on the canvas: pad the white card up to 4 modules.
   const int32_t modules = qrcodegen_version2size(version);
   const int32_t moduleSize = QR_CANVAS_PX / modules;
   const int32_t margin = (QR_CANVAS_PX - modules * moduleSize) / 2;
   const int32_t pad = QR_QUIET_MODULES * moduleSize > margin ? QR_QUIET_MODULES * moduleSize - margin : 0;
   lv_obj_set_style_pad_all(this->qrCard, pad, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_invalidate(this->qrCode);
   this->showQrCode(true);
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
   this->scanHintLabel = nullptr;
   this->qrCard = nullptr;
   this->qrCode = nullptr;
   this->qrUrl.clear();
}
