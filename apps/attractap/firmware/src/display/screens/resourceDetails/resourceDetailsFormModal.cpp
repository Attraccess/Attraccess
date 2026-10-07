#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

void ResourceDetailsScreen::ensureFormsModal()
{
   if (this->formsModalOverlay)
   {
      return;
   }

   lv_obj_t *overlay = lv_obj_create(lv_layer_top());
   this->formsModalOverlay = overlay;
   lv_obj_remove_style_all(overlay);
   lv_obj_remove_flag(overlay, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_flag(overlay, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_flag(overlay, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_set_size(overlay, lv_pct(100), lv_pct(100));
   lv_obj_set_style_bg_color(overlay, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(overlay, 170, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_all(overlay, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(overlay, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(overlay, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   lv_obj_t *panel = lv_obj_create(overlay);
   this->formsModalPanel = panel;
   lv_obj_remove_style_all(panel);
   lv_obj_set_size(panel, lv_pct(100), lv_pct(100));
   lv_obj_set_style_max_width(panel, LV_COORD_MAX, LV_PART_MAIN | LV_STATE_DEFAULT);
   DisplayTheme::applySurface(panel);
   lv_obj_set_style_pad_all(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(panel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(panel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_grow(panel, 1);

   // Header: step counter (left) + dismiss button (right).
   lv_obj_t *header = lv_obj_create(panel);
   lv_obj_remove_style_all(header);
   lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(header, lv_pct(100));
   lv_obj_set_height(header, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

   this->formsModalProgressLabel = lv_label_create(header);
   lv_label_set_text(this->formsModalProgressLabel, "");
   lv_obj_set_style_text_color(this->formsModalProgressLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->formsModalProgressLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *cancelBtn = lv_button_create(header);
   this->formsCancelButton = cancelBtn;
   lv_obj_remove_style_all(cancelBtn);
   lv_obj_set_size(cancelBtn, 34, 34);
   DisplayTheme::secondaryButton(cancelBtn);
   lv_obj_t *cancelLabel = lv_label_create(cancelBtn);
   lv_label_set_text(cancelLabel, LV_SYMBOL_CLOSE);
   lv_obj_center(cancelLabel);
   lv_obj_add_event_cb(cancelBtn, &ResourceDetailsScreen::onFormsCancel, LV_EVENT_CLICKED, this);

   // Slim progress bar tracking field N of total.
   this->formsProgressBar = lv_bar_create(panel);
   lv_obj_set_width(this->formsProgressBar, lv_pct(100));
   lv_obj_set_height(this->formsProgressBar, 6);
   lv_obj_set_style_margin_top(this->formsProgressBar, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_margin_bottom(this->formsProgressBar, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->formsProgressBar, 3, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->formsProgressBar, DisplayTheme::primarySoft(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->formsProgressBar, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->formsProgressBar, 3, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->formsProgressBar, DisplayTheme::primary(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->formsProgressBar, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_bar_set_range(this->formsProgressBar, 0, 100);
   lv_bar_set_value(this->formsProgressBar, 0, LV_ANIM_OFF);

   // Body: breadcrumb + the single focused field, filling the panel. Never
   // scrolls — text fields are tap-to-edit previews, editing happens in the
   // fullscreen editor overlay, so everything always fits the screen.
   lv_obj_t *content = lv_obj_create(panel);
   this->formsModalContent = content;
   lv_obj_remove_style_all(content);
   lv_obj_set_width(content, lv_pct(100));
   lv_obj_set_flex_flow(content, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(content, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(content, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(content, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_remove_flag(content, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_grow(content, 1);

   this->formsBreadcrumbLabel = lv_label_create(content);
   lv_label_set_text(this->formsBreadcrumbLabel, "");
    lv_obj_set_style_text_color(this->formsBreadcrumbLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->formsBreadcrumbLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_width(this->formsBreadcrumbLabel, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_label_set_long_mode(this->formsBreadcrumbLabel, LV_LABEL_LONG_WRAP);

   this->formsModalErrorLabel = lv_label_create(content);
   lv_label_set_text(this->formsModalErrorLabel, "");
    lv_obj_set_style_text_color(this->formsModalErrorLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->formsModalErrorLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *list = lv_obj_create(content);
   this->formsModalList = list;
   lv_obj_remove_style_all(list);
   lv_obj_remove_flag(list, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(list, lv_pct(100));
   lv_obj_set_height(list, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(list, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(list, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(list, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(list, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Footer pinned below the body: secondary back + primary next/submit.
   lv_obj_t *footer = lv_obj_create(panel);
   lv_obj_remove_style_all(footer);
   lv_obj_remove_flag(footer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(footer, lv_pct(100));
   lv_obj_set_height(footer, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_top(footer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(footer, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *backBtn = lv_button_create(footer);
   this->formsBackButton = backBtn;
   lv_obj_set_flex_grow(backBtn, 1);
   lv_obj_set_height(backBtn, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_all(backBtn, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   DisplayTheme::secondaryButton(backBtn);
   lv_obj_t *backLabel = lv_label_create(backBtn);
   lv_label_set_text(backLabel, "Zurück");
   lv_obj_set_style_text_font(backLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_align(backLabel, LV_ALIGN_CENTER);
   lv_obj_add_event_cb(backBtn, &ResourceDetailsScreen::onFormsBack, LV_EVENT_CLICKED, this);

   lv_obj_t *nextBtn = lv_button_create(footer);
   this->formsNextButton = nextBtn;
   lv_obj_set_flex_grow(nextBtn, 2);
   lv_obj_set_height(nextBtn, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_all(nextBtn, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   DisplayTheme::button(nextBtn);
   this->formsNextLabel = lv_label_create(nextBtn);
   lv_label_set_text(this->formsNextLabel, "Weiter");
   lv_obj_set_align(this->formsNextLabel, LV_ALIGN_CENTER);
   this->formsNextSpinner = lv_spinner_create(nextBtn);
   lv_obj_set_style_arc_color(this->formsNextSpinner, DisplayTheme::border(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_color(this->formsNextSpinner, DisplayTheme::muted(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_update_layout(nextBtn);
   const lv_coord_t nextLabelHeight = lv_obj_get_height(this->formsNextLabel);
   lv_obj_set_size(this->formsNextSpinner, nextLabelHeight, nextLabelHeight);
   lv_obj_set_align(this->formsNextSpinner, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->formsNextSpinner, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(nextBtn, &ResourceDetailsScreen::onFormsNext, LV_EVENT_CLICKED, this);

   this->createFormsEditor(overlay);

}
