#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

void ResourceDetailsScreen::ensureProjectsModal()
{
   if (this->projectsModal)
   {
      return;
   }

   lv_obj_t *overlay = lv_obj_create(lv_layer_top());
   this->projectsModal = overlay;
   lv_obj_remove_style_all(overlay);
   lv_obj_add_flag(overlay, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_flag(overlay, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_set_size(overlay, lv_pct(100), lv_pct(100));
   lv_obj_set_align(overlay, LV_ALIGN_CENTER);
   lv_obj_set_style_bg_color(overlay, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(overlay, 160, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(overlay, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(overlay, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

   lv_obj_t *panel = lv_obj_create(overlay);
   this->projectsModalPanel = panel;
   lv_obj_remove_style_all(panel);
   lv_obj_set_width(panel, lv_pct(90));
   lv_obj_set_style_max_width(panel, 400, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_min_height(panel, 370, LV_PART_MAIN | LV_STATE_DEFAULT);
   DisplayTheme::applySurface(panel);
   lv_obj_set_style_pad_left(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(panel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(panel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);

   lv_obj_t *header = lv_obj_create(panel);
   lv_obj_remove_style_all(header);
   lv_obj_set_width(header, lv_pct(100));
   lv_obj_set_height(header, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_margin_bottom(header, 12, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *title = lv_label_create(header);
   lv_label_set_text(title, "Projekt auswählen");
    lv_obj_set_style_text_font(title, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(title, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *closeButton = lv_button_create(header);
   DisplayTheme::secondaryButton(closeButton);
   lv_obj_set_size(closeButton, 32, 32);
   lv_obj_set_style_pad_all(closeButton, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(closeButton, &ResourceDetailsScreen::onProjectsModalClose, LV_EVENT_CLICKED, this);
   lv_obj_t *closeLabel = lv_label_create(closeButton);
   lv_label_set_text(closeLabel, LV_SYMBOL_CLOSE);
   lv_obj_center(closeLabel);

   this->projectsListContainer = lv_obj_create(panel);
   lv_obj_remove_style_all(this->projectsListContainer);
   lv_obj_set_width(this->projectsListContainer, lv_pct(100));
   lv_obj_set_height(this->projectsListContainer, 240);
   lv_obj_set_style_max_height(this->projectsListContainer, 240, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_grow(this->projectsListContainer, 1);
   lv_obj_add_flag(this->projectsListContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_scroll_dir(this->projectsListContainer, LV_DIR_VER);
   lv_obj_set_flex_flow(this->projectsListContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->projectsListContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(this->projectsListContainer, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_margin_bottom(this->projectsListContainer, 12, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *footer = lv_obj_create(panel);
   lv_obj_remove_style_all(footer);
   lv_obj_set_width(footer, lv_pct(100));
   lv_obj_set_height(footer, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

   this->projectsPrevButton = lv_button_create(footer);
   DisplayTheme::secondaryButton(this->projectsPrevButton);
   lv_obj_set_height(this->projectsPrevButton, 36);
   lv_obj_set_width(this->projectsPrevButton, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_left(this->projectsPrevButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->projectsPrevButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(this->projectsPrevButton, &ResourceDetailsScreen::onProjectsPrevPage, LV_EVENT_CLICKED, this);
   lv_obj_t *prevLabel = lv_label_create(this->projectsPrevButton);
   lv_label_set_text(prevLabel, "Zurück");
   lv_obj_set_style_text_font(prevLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);

   this->projectsPaginationLabel = lv_label_create(footer);
   lv_label_set_text(this->projectsPaginationLabel, "Seite 1");
   lv_obj_set_style_text_color(this->projectsPaginationLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->projectsNextButton = lv_button_create(footer);
   DisplayTheme::button(this->projectsNextButton);
   lv_obj_set_height(this->projectsNextButton, 36);
   lv_obj_set_width(this->projectsNextButton, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_left(this->projectsNextButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->projectsNextButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(this->projectsNextButton, &ResourceDetailsScreen::onProjectsNextPage, LV_EVENT_CLICKED, this);
   lv_obj_t *nextLabel = lv_label_create(this->projectsNextButton);
   lv_label_set_text(nextLabel, "Weiter");
   lv_obj_set_style_text_align(nextLabel, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN | LV_STATE_DEFAULT);
}
void ResourceDetailsScreen::showProjectsModal()
{
   this->ensureProjectsModal();
   if (!this->projectsDataInitialized)
   {
      this->showProjectsLoading();
      if (this->projectsPageRequestCallback)
      {
         uint32_t page = this->projectsCurrentPage == 0 ? 1 : this->projectsCurrentPage;
         this->projectsPageRequestCallback(page);
      }
   }
   else
   {
      this->rebuildProjectsList();
   }
   if (this->projectsModal)
   {
      lv_obj_clear_flag(this->projectsModal, LV_OBJ_FLAG_HIDDEN);
   }
}
void ResourceDetailsScreen::hideProjectsModal()
{
   if (!this->projectsModal)
   {
      return;
   }
   lv_obj_add_flag(this->projectsModal, LV_OBJ_FLAG_HIDDEN);
}
