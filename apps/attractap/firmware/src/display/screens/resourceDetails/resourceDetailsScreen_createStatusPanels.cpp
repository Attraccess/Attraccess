#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <string.h>

#include "resourceDetailsCopy.hpp"

void ResourceDetailsScreen::createStatusPanels()
{
   this->usageStatsContainer = lv_obj_create(this->screen);
   DisplayTheme::applySurface(this->usageStatsContainer);
   lv_obj_set_width(this->usageStatsContainer, lv_pct(100));
   lv_obj_set_height(this->usageStatsContainer, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(this->usageStatsContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_remove_flag(this->usageStatsContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_all(this->usageStatsContainer, 12, LV_PART_MAIN);
   lv_obj_set_style_pad_row(this->usageStatsContainer, 8, LV_PART_MAIN);
   auto *statsTitle = lv_label_create(this->usageStatsContainer);
   lv_label_set_text(statsTitle, "Aktuelle Nutzung");
   lv_obj_set_style_text_font(statsTitle, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   auto createStat = [this](const char *title) {
      auto *row = lv_obj_create(this->usageStatsContainer);
      lv_obj_remove_style_all(row);
      lv_obj_set_width(row, lv_pct(100));
      lv_obj_set_height(row, LV_SIZE_CONTENT);
      lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
      lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
      auto *label = lv_label_create(row);
      lv_label_set_text(label, title);
      lv_obj_set_style_text_color(label, DisplayTheme::muted(), LV_PART_MAIN);
      lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_16, LV_PART_MAIN);
      auto *value = lv_label_create(row);
      lv_obj_set_width(value, lv_pct(62));
      lv_label_set_long_mode(value, LV_LABEL_LONG_WRAP);
      lv_obj_set_style_text_align(value, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN);
      lv_obj_set_style_text_font(value, &attractap_font_montserrat_latin1_16, LV_PART_MAIN);
      return value;
   };
   this->energyValue = createStat("Energie");
   this->operatingValue = createStat("Betriebszeit");
   lv_obj_add_flag(this->usageStatsContainer, LV_OBJ_FLAG_HIDDEN);

   this->noIntroductionPanel = lv_obj_create(this->screen);
   lv_obj_set_width(this->noIntroductionPanel, lv_pct(100));
   lv_obj_set_height(this->noIntroductionPanel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->noIntroductionPanel, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->noIntroductionPanel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->noIntroductionPanel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->noIntroductionPanel, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::applySurface(this->noIntroductionPanel);
   lv_obj_set_style_bg_color(this->noIntroductionPanel, DisplayTheme::warningSoft(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_border_color(this->noIntroductionPanel, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->noIntroductionPanel, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *noIntroductionInfoLabel = lv_label_create(this->noIntroductionPanel);
   lv_obj_set_width(noIntroductionInfoLabel, lv_pct(100));
   lv_obj_set_height(noIntroductionInfoLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(noIntroductionInfoLabel, LV_ALIGN_CENTER);
   lv_label_set_text(noIntroductionInfoLabel, "Sie benötigen eine Einweisung, bevor Sie diese Ressource nutzen können. Bitte wenden Sie sich an einen der unten aufgeführten Einweiser.");
   lv_obj_set_style_text_font(noIntroductionInfoLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_style_text_color(noIntroductionInfoLabel, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(noIntroductionInfoLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->introducersListLabel = lv_label_create(this->noIntroductionPanel);
   lv_obj_set_width(this->introducersListLabel, lv_pct(100));
   lv_label_set_long_mode(this->introducersListLabel, LV_LABEL_LONG_WRAP);
   lv_obj_set_height(this->introducersListLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(this->introducersListLabel, LV_ALIGN_CENTER);
    lv_label_set_text(this->introducersListLabel, "???");
    lv_obj_set_style_text_font(this->introducersListLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->maintenancePanel = lv_obj_create(this->screen);
   lv_obj_set_width(this->maintenancePanel, lv_pct(100));
   lv_obj_set_height(this->maintenancePanel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->maintenancePanel, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->maintenancePanel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->maintenancePanel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->maintenancePanel, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::applySurface(this->maintenancePanel);
   lv_obj_set_style_bg_color(this->maintenancePanel, DisplayTheme::dangerSoft(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_border_color(this->maintenancePanel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->maintenancePanel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->maintenancePanel, LV_OBJ_FLAG_HIDDEN);

   lv_obj_t *maintenanceInfoLabel = lv_label_create(this->maintenancePanel);
   lv_obj_set_width(maintenanceInfoLabel, lv_pct(100));
   lv_obj_set_height(maintenanceInfoLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(maintenanceInfoLabel, LV_ALIGN_CENTER);
   lv_label_set_text(maintenanceInfoLabel, MAINTENANCE_INFO_TEXT);
   lv_obj_set_style_text_font(maintenanceInfoLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_style_text_color(maintenanceInfoLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(maintenanceInfoLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->maintenanceIntroducersLabel = lv_label_create(this->maintenancePanel);
   lv_obj_set_width(this->maintenanceIntroducersLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->maintenanceIntroducersLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(this->maintenanceIntroducersLabel, LV_ALIGN_CENTER);
    lv_label_set_text(this->maintenanceIntroducersLabel, "???");
    lv_obj_set_style_text_font(this->maintenanceIntroducersLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->healthPanel = lv_obj_create(this->screen);
   lv_obj_set_width(this->healthPanel, lv_pct(100));
   lv_obj_set_height(this->healthPanel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->healthPanel, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->healthPanel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->healthPanel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->healthPanel, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::applySurface(this->healthPanel);
   lv_obj_set_style_bg_color(this->healthPanel, DisplayTheme::dangerSoft(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_border_color(this->healthPanel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->healthPanel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->healthPanel, LV_OBJ_FLAG_HIDDEN);

   lv_obj_t *healthInfoLabel = lv_label_create(this->healthPanel);
   lv_obj_set_width(healthInfoLabel, lv_pct(100));
   lv_obj_set_height(healthInfoLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(healthInfoLabel, LV_ALIGN_CENTER);
   lv_label_set_text(healthInfoLabel, "Diese Ressource ist derzeit nicht betriebsbereit und kann nicht verwendet werden.");
   lv_obj_set_style_text_color(healthInfoLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(healthInfoLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->healthReasonLabel = lv_label_create(this->healthPanel);
   lv_obj_set_width(this->healthReasonLabel, lv_pct(100));
   lv_obj_set_height(this->healthReasonLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->healthReasonLabel, LV_ALIGN_CENTER);
   lv_label_set_long_mode(this->healthReasonLabel, LV_LABEL_LONG_WRAP);
   lv_label_set_text(this->healthReasonLabel, "");
    lv_obj_set_style_text_color(this->healthReasonLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(this->healthReasonLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->healthReasonLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

}
