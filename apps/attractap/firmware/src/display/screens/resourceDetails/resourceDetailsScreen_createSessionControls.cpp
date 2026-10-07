#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <string.h>

#include "resourceDetailsCopy.hpp"

void ResourceDetailsScreen::createSessionControls()
{
   this->sessionControls = lv_obj_create(this->screen);
   lv_obj_remove_style_all(this->sessionControls);
   lv_obj_set_width(this->sessionControls, lv_pct(100));
   lv_obj_set_height(this->sessionControls, LV_SIZE_CONTENT);
   lv_obj_set_align(this->sessionControls, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->sessionControls, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->sessionControls, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->sessionControls, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(this->sessionControls, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(this->sessionControls, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(this->sessionControls, 10, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->projectSelectionRow = lv_obj_create(this->sessionControls);
   lv_obj_remove_style_all(this->projectSelectionRow);
   lv_obj_set_width(this->projectSelectionRow, lv_pct(100));
   lv_obj_set_height(this->projectSelectionRow, LV_SIZE_CONTENT);
   lv_obj_set_align(this->projectSelectionRow, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->projectSelectionRow, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(this->projectSelectionRow, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_column(this->projectSelectionRow, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_remove_flag(this->projectSelectionRow, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(this->projectSelectionRow, LV_OBJ_FLAG_SCROLLABLE);

   this->projectsButton = lv_button_create(this->projectSelectionRow);
   lv_obj_set_height(this->projectsButton, 50);
   lv_obj_set_align(this->projectsButton, LV_ALIGN_CENTER);
   lv_obj_set_flex_grow(this->projectsButton, 1);
   lv_obj_add_flag(this->projectsButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->projectsButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::button(this->projectsButton);
   lv_obj_add_event_cb(this->projectsButton, &ResourceDetailsScreen::onProjectsButtonClick, LV_EVENT_CLICKED, this);

    this->projectsButtonLabel = lv_label_create(this->projectsButton);
    lv_label_set_text(this->projectsButtonLabel, "Projekt wählen");
    lv_obj_set_align(this->projectsButtonLabel, LV_ALIGN_CENTER);
    lv_obj_set_style_text_align(this->projectsButtonLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->projectsButtonLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->clearProjectButton = lv_button_create(this->projectSelectionRow);
   lv_obj_set_height(this->clearProjectButton, 50);
   lv_obj_set_width(this->clearProjectButton, LV_SIZE_CONTENT);
   lv_obj_set_align(this->clearProjectButton, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->clearProjectButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::button(this->clearProjectButton, DisplayTheme::danger(), DisplayTheme::onPrimary());
   lv_obj_add_event_cb(this->clearProjectButton, &ResourceDetailsScreen::onClearProjectSelectionClick, LV_EVENT_CLICKED, this);

   lv_obj_t *clearProjectLabel = lv_label_create(this->clearProjectButton);
   lv_label_set_text(clearProjectLabel, "X");
   lv_obj_set_align(clearProjectLabel, LV_ALIGN_CENTER);
   lv_obj_set_style_text_align(clearProjectLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   this->updateClearProjectButtonState();

   this->startSessionButton = lv_button_create(this->sessionControls);
   lv_obj_set_height(this->startSessionButton, 50);
   lv_obj_set_width(this->startSessionButton, lv_pct(100));
   lv_obj_set_align(this->startSessionButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->startSessionButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::button(this->startSessionButton);
   lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->startSessionButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_START_SESSION, {}});

   this->startSessionButtonLabel = lv_label_create(this->startSessionButton);
   lv_obj_set_width(this->startSessionButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->startSessionButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->startSessionButtonLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->startSessionButtonLabel, "Ressource verwenden");
   lv_obj_set_style_text_font(this->startSessionButtonLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);

   this->stopOtherUserNote = lv_label_create(this->sessionControls);
   lv_obj_set_width(this->stopOtherUserNote, lv_pct(100));
   lv_obj_set_height(this->stopOtherUserNote, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->stopOtherUserNote, LV_LABEL_LONG_WRAP);
   lv_label_set_text(this->stopOtherUserNote, "Achtung: Sie beenden die laufende Sitzung eines anderen Nutzers.");
   lv_obj_set_style_text_color(this->stopOtherUserNote, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->stopOtherUserNote, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->stopOtherUserNote, LV_OBJ_FLAG_HIDDEN);

   this->stopSessionButton = lv_button_create(this->sessionControls);
   lv_obj_set_height(this->stopSessionButton, 50);
   lv_obj_set_width(this->stopSessionButton, lv_pct(100));
   lv_obj_set_align(this->stopSessionButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->stopSessionButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::button(this->stopSessionButton, DisplayTheme::danger(), DisplayTheme::onPrimary());
   lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->stopSessionButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_STOP_SESSION, {}});

   this->stopSessionButtonLabel = lv_label_create(this->stopSessionButton);
   lv_obj_set_width(this->stopSessionButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->stopSessionButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->stopSessionButtonLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->stopSessionButtonLabel, "Sitzung beenden");

}
