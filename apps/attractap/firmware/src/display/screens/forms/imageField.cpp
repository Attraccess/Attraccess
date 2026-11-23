// The image field of a usage form (ATT-879): the reader has no camera, so it shows a QR code that opens the photo page
// on the user's phone, and counts the photos the server has received. The count and link arrive with the field
// (RESOURCE_USAGE_FORM_FIELDS) and again whenever the application polls the open page, so both update in place.
#include "formsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <lvgl.h>
#include <string>

extern "C" {
#include "src/libs/qrcode/qrcodegen.h"
}

namespace
{
    // Dark modules on white whatever the theme, or phones cannot read it. The form page has to fit with the title, the
    // hint and the count on a 480 px display, so the card is smaller than the pairing screen's.
    constexpr int32_t IMAGE_QR_CANVAS_PX = 140;
    constexpr int32_t IMAGE_QR_QUIET_MODULES = 4;
    // The photo link is short (a token of about 24 characters); anything longer cannot be a link of ours.
    constexpr size_t IMAGE_QR_MAX_URL_BYTES = 200;
}

void FormsScreen::createImageField(lv_obj_t *fieldContainer, FormFieldWidget &widget, const API::ResourceUsageFormField &field)
{
   lv_obj_t *row = lv_obj_create(fieldContainer);
   lv_obj_remove_style_all(row);
   lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(row, lv_pct(100));
   lv_obj_set_height(row, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(row, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_column(row, 16, LV_PART_MAIN | LV_STATE_DEFAULT);

   widget.imageQrCard = lv_obj_create(row);
   lv_obj_remove_flag(widget.imageQrCard, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_size(widget.imageQrCard, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
   lv_obj_set_style_bg_color(widget.imageQrCard, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(widget.imageQrCard, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_border_width(widget.imageQrCard, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(widget.imageQrCard, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_all(widget.imageQrCard, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   widget.imageQrCode = lv_qrcode_create(widget.imageQrCard);
   lv_qrcode_set_size(widget.imageQrCode, IMAGE_QR_CANVAS_PX);
   lv_qrcode_set_dark_color(widget.imageQrCode, lv_color_black());
   lv_qrcode_set_light_color(widget.imageQrCode, lv_color_white());
   lv_obj_add_flag(widget.imageQrCard, LV_OBJ_FLAG_HIDDEN);

   // Beside the code: what to do with it and how many photos the server has. Below it, the page would scroll.
   lv_obj_t *text = lv_obj_create(row);
   lv_obj_remove_style_all(text);
   lv_obj_remove_flag(text, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_height(text, LV_SIZE_CONTENT);
   lv_obj_set_flex_grow(text, 1);
   lv_obj_set_flex_flow(text, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_style_pad_row(text, 10, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *hint = lv_label_create(text);
   FirmwareI18n::setLabel(hint, FirmwareI18n::Message::FormImageScanHint);
   lv_obj_set_style_text_font(hint, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(hint, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_width(hint, lv_pct(100));
   lv_label_set_long_mode(hint, LV_LABEL_LONG_WRAP);

   widget.imageCountLabel = lv_label_create(text);
   lv_obj_set_width(widget.imageCountLabel, lv_pct(100));
   lv_obj_set_style_text_font(widget.imageCountLabel, &attractap_font_montserrat_latin1_24, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(widget.imageCountLabel, DisplayTheme::primary(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_label_set_long_mode(widget.imageCountLabel, LV_LABEL_LONG_WRAP);

   this->updateImageField(field);
}

// Draws the symbol and pads the white card up to the four quiet modules a phone needs around it.
void FormsScreen::showImageQr(FormFieldWidget &widget, const std::string &url)
{
   if (!widget.imageQrCode || !widget.imageQrCard)
   {
      return;
   }
   if (url.empty() || url.length() > IMAGE_QR_MAX_URL_BYTES)
   {
      lv_obj_add_flag(widget.imageQrCard, LV_OBJ_FLAG_HIDDEN);
      return;
   }
   const int version = qrcodegen_getMinFitVersion(qrcodegen_Ecc_MEDIUM, url.length());
   if (version == 0 || lv_qrcode_update(widget.imageQrCode, url.c_str(), url.length()) != LV_RESULT_OK)
   {
      this->logger.warnf("Cannot build the photo QR code (%u bytes)", static_cast<unsigned>(url.length()));
      lv_obj_add_flag(widget.imageQrCard, LV_OBJ_FLAG_HIDDEN);
      return;
   }
   const int32_t modules = qrcodegen_version2size(version);
   const int32_t moduleSize = IMAGE_QR_CANVAS_PX / modules;
   const int32_t margin = (IMAGE_QR_CANVAS_PX - modules * moduleSize) / 2;
   const int32_t pad = IMAGE_QR_QUIET_MODULES * moduleSize > margin ? IMAGE_QR_QUIET_MODULES * moduleSize - margin : 0;
   lv_obj_set_style_pad_all(widget.imageQrCard, pad, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_invalidate(widget.imageQrCode);
   lv_obj_remove_flag(widget.imageQrCard, LV_OBJ_FLAG_HIDDEN);
}

void FormsScreen::updateImageField(const API::ResourceUsageFormField &field)
{
   for (uint16_t i = 0; i < this->formFieldWidgetCount; ++i)
   {
      FormFieldWidget &widget = this->formFieldWidgets[i];
      if (widget.type != API::ResourceUsageFormFieldType::IMAGE || widget.fieldId != field.id || !widget.imageCountLabel)
      {
         continue;
      }
      FirmwareI18n::setLabel(widget.imageCountLabel,
                             FirmwareI18n::Text::format(FirmwareI18n::Message::FormImageCount,
                                                        {FirmwareI18n::Text::literal(std::to_string(field.imageCount)) /* i18n-data: Photo count. */,
                                                         FirmwareI18n::Text::literal(std::to_string(field.maxImages)) /* i18n-data: Photo limit. */}));
      if (widget.imageUrl != field.handoffUrl)
      {
         widget.imageUrl = field.handoffUrl;
         this->showImageQr(widget, widget.imageUrl);
      }
      return;
   }
}
