#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <string.h>

#include "resourceDetailsCopy.hpp"

void ResourceDetailsScreen::createDoorControls()
{
   this->doorControls = lv_obj_create(this->sessionControls);
   lv_obj_remove_style_all(this->doorControls);
   lv_obj_set_height(this->doorControls, 50);
   lv_obj_set_width(this->doorControls, lv_pct(100));
   lv_obj_set_align(this->doorControls, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->doorControls, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(this->doorControls, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->doorControls, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(this->doorControls, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_flag(this->doorControls, LV_OBJ_FLAG_HIDDEN);

   lv_obj_t *lockDoorButton = lv_button_create(this->doorControls);
   lv_obj_set_height(lockDoorButton, 50);
   lv_obj_set_width(lockDoorButton, lv_pct(30));
   lv_obj_set_align(lockDoorButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(lockDoorButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(lockDoorButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::button(lockDoorButton, DisplayTheme::danger(), DisplayTheme::onPrimary());
   lv_obj_add_event_cb(lockDoorButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_LOCK_DOOR, {}});

   lv_obj_t *labelForLockDoorButton = lv_label_create(lockDoorButton);
   lv_obj_set_width(labelForLockDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForLockDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForLockDoorButton, LV_ALIGN_CENTER);
   FirmwareI18n::setLabel(labelForLockDoorButton, FirmwareI18n::Message::Lock);

   lv_obj_t *unlockDoorButton = lv_button_create(this->doorControls);
   lv_obj_set_height(unlockDoorButton, 50);
   lv_obj_set_width(unlockDoorButton, lv_pct(30));
   lv_obj_set_align(unlockDoorButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(unlockDoorButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(unlockDoorButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::button(unlockDoorButton);
   lv_obj_add_event_cb(unlockDoorButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_UNLOCK_DOOR, {}});

   lv_obj_t *labelForUnlockDoorButton = lv_label_create(unlockDoorButton);
   lv_obj_set_width(labelForUnlockDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForUnlockDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForUnlockDoorButton, LV_ALIGN_CENTER);
   FirmwareI18n::setLabel(labelForUnlockDoorButton, FirmwareI18n::Message::Unlock);

   lv_obj_t *unlatchDoorButton = lv_button_create(this->doorControls);
   lv_obj_set_height(unlatchDoorButton, 50);
   lv_obj_set_width(unlatchDoorButton, lv_pct(30));
   lv_obj_set_align(unlatchDoorButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(unlatchDoorButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(unlatchDoorButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::button(unlatchDoorButton);
   lv_obj_add_event_cb(unlatchDoorButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_UNLATCH_DOOR, {}});

   lv_obj_t *labelForUnlatchDoorButton = lv_label_create(unlatchDoorButton);
   lv_obj_set_width(labelForUnlatchDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForUnlatchDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForUnlatchDoorButton, LV_ALIGN_CENTER);
   FirmwareI18n::setLabel(labelForUnlatchDoorButton, FirmwareI18n::Message::ReleaseLatch);
   lv_obj_set_style_text_font(labelForUnlatchDoorButton, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);

   this->flowButtonsContainer = lv_obj_create(this->sessionControls);
   lv_obj_remove_style_all(this->flowButtonsContainer);
   lv_obj_set_height(this->flowButtonsContainer, LV_SIZE_CONTENT);
   lv_obj_set_width(this->flowButtonsContainer, lv_pct(100));
   lv_obj_set_align(this->flowButtonsContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->flowButtonsContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->flowButtonsContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(this->flowButtonsContainer, 5, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->flowButtonsContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_remove_flag(this->flowButtonsContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(this->flowButtonsContainer, LV_OBJ_FLAG_SCROLLABLE);

}

void ResourceDetailsScreen::createResourceHeader()
{
   lv_obj_t *header = lv_obj_create(this->screen);
   lv_obj_remove_style_all(header);
   lv_obj_set_width(header, lv_pct(100));
   lv_obj_set_height(header, LV_SIZE_CONTENT);
   lv_obj_set_align(header, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(header, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *resouceDetails = lv_obj_create(header);
   lv_obj_remove_style_all(resouceDetails);
   lv_obj_set_width(resouceDetails, lv_pct(100));
   lv_obj_set_height(resouceDetails, LV_SIZE_CONTENT);
   lv_obj_set_align(resouceDetails, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(resouceDetails, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(resouceDetails, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(resouceDetails, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(resouceDetails, LV_OBJ_FLAG_SCROLLABLE);

   this->resourceName = lv_label_create(resouceDetails);
   lv_obj_set_width(this->resourceName, lv_pct(100));
   lv_label_set_long_mode(this->resourceName, LV_LABEL_LONG_SCROLL);
   lv_obj_set_height(this->resourceName, LV_SIZE_CONTENT);
   lv_obj_set_align(this->resourceName, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->resourceName, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_text_font(this->resourceName, &attractap_font_montserrat_latin1_36, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(this->resourceName, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->resourceDescription = lv_label_create(resouceDetails);
   lv_obj_set_height(this->resourceDescription, 28);
   lv_obj_set_width(this->resourceDescription, lv_pct(100));
   lv_label_set_long_mode(this->resourceDescription, LV_LABEL_LONG_SCROLL);
   lv_obj_set_align(this->resourceDescription, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->resourceDescription, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_text_color(this->resourceDescription, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->resourceDescription, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

}

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
    FirmwareI18n::setLabel(this->projectsButtonLabel, FirmwareI18n::Message::ChooseProject);
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
   FirmwareI18n::setLabel(clearProjectLabel, FirmwareI18n::Text::literal("X"));
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
   FirmwareI18n::setLabel(this->startSessionButtonLabel, FirmwareI18n::Message::UseResource);
   lv_obj_set_style_text_font(this->startSessionButtonLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);

   this->stopOtherUserNote = lv_label_create(this->sessionControls);
   lv_obj_set_width(this->stopOtherUserNote, lv_pct(100));
   lv_obj_set_height(this->stopOtherUserNote, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->stopOtherUserNote, LV_LABEL_LONG_WRAP);
   FirmwareI18n::setLabel(this->stopOtherUserNote, FirmwareI18n::Message::WarningYouAreEndingAnotherUserSActiveSession);
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
   FirmwareI18n::setLabel(this->stopSessionButtonLabel, FirmwareI18n::Message::EndSession);


}

void ResourceDetailsScreen::createSessionDetails()
{
   this->sessionDetailsContainer = lv_obj_create(this->screen);
   lv_obj_remove_style_all(this->sessionDetailsContainer);
   lv_obj_set_width(this->sessionDetailsContainer, lv_pct(100));
   lv_obj_set_height(this->sessionDetailsContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(this->sessionDetailsContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->sessionDetailsContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(this->sessionDetailsContainer, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->sessionDetailsContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(this->sessionDetailsContainer, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *sessionStartTimeContainer = lv_obj_create(this->sessionDetailsContainer);
   lv_obj_remove_style_all(sessionStartTimeContainer);
   lv_obj_set_width(sessionStartTimeContainer, LV_SIZE_CONTENT);
   lv_obj_set_height(sessionStartTimeContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(sessionStartTimeContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(sessionStartTimeContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(sessionStartTimeContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(sessionStartTimeContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(sessionStartTimeContainer, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *labelForSessionStartTime = lv_label_create(sessionStartTimeContainer);
   lv_obj_set_width(labelForSessionStartTime, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForSessionStartTime, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForSessionStartTime, LV_ALIGN_CENTER);
   FirmwareI18n::setLabel(labelForSessionStartTime, FirmwareI18n::Message::StartTime);
   lv_obj_set_style_text_color(labelForSessionStartTime, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(labelForSessionStartTime, 255, LV_PART_MAIN | LV_STATE_DEFAULT);


   this->sessionStartTimeLabel = lv_label_create(sessionStartTimeContainer);
   lv_obj_set_width(this->sessionStartTimeLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->sessionStartTimeLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->sessionStartTimeLabel, LV_ALIGN_CENTER);
   FirmwareI18n::setLabel(this->sessionStartTimeLabel, FirmwareI18n::Text::literal("??.??. ??:??"));
   lv_obj_set_style_text_font(this->sessionStartTimeLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->sessionStartTimeLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);


   lv_obj_t *currentUserContainer = lv_obj_create(this->sessionDetailsContainer);
   lv_obj_remove_style_all(currentUserContainer);
   lv_obj_set_flex_grow(currentUserContainer, 1);
   lv_obj_set_style_pad_left(currentUserContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(currentUserContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_height(currentUserContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(currentUserContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(currentUserContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(currentUserContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_remove_flag(currentUserContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(currentUserContainer, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *labelForCurrentUser = lv_label_create(currentUserContainer);
   lv_obj_set_width(labelForCurrentUser, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForCurrentUser, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForCurrentUser, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(labelForCurrentUser, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(labelForCurrentUser, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   FirmwareI18n::setLabel(labelForCurrentUser, FirmwareI18n::Message::User);
   lv_obj_set_style_text_color(labelForCurrentUser, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(labelForCurrentUser, 255, LV_PART_MAIN | LV_STATE_DEFAULT);


   this->currentUser = lv_label_create(currentUserContainer);
   lv_obj_set_width(this->currentUser, lv_pct(100));
   lv_obj_set_height(this->currentUser, LV_SIZE_CONTENT);
   lv_obj_set_align(this->currentUser, LV_ALIGN_CENTER);
   lv_label_set_long_mode(this->currentUser, LV_LABEL_LONG_SCROLL_CIRCULAR);
   lv_obj_set_style_text_align(this->currentUser, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   FirmwareI18n::setLabel(this->currentUser, FirmwareI18n::Text::literal("JappyJan"));
    lv_obj_set_style_text_font(this->currentUser, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(this->currentUser, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);


   lv_obj_t *elapsedTimeContainer = lv_obj_create(this->sessionDetailsContainer);
   lv_obj_remove_style_all(elapsedTimeContainer);
   lv_obj_set_width(elapsedTimeContainer, LV_SIZE_CONTENT);
   lv_obj_set_height(elapsedTimeContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(elapsedTimeContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(elapsedTimeContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(elapsedTimeContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_END);
   lv_obj_remove_flag(elapsedTimeContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(elapsedTimeContainer, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *labelForElapsedTime = lv_label_create(elapsedTimeContainer);
   lv_obj_set_width(labelForElapsedTime, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForElapsedTime, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForElapsedTime, LV_ALIGN_CENTER);
   FirmwareI18n::setLabel(labelForElapsedTime, FirmwareI18n::Message::Duration);
   lv_obj_set_style_text_color(labelForElapsedTime, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(labelForElapsedTime, 255, LV_PART_MAIN | LV_STATE_DEFAULT);


   this->elapsedTime = lv_label_create(elapsedTimeContainer);
   lv_obj_set_width(this->elapsedTime, LV_SIZE_CONTENT);
   lv_obj_set_height(this->elapsedTime, LV_SIZE_CONTENT);
   lv_obj_set_align(this->elapsedTime, LV_ALIGN_CENTER);
   FirmwareI18n::setLabel(this->elapsedTime, FirmwareI18n::Text::literal("00:23:46"));
   lv_obj_set_style_text_font(this->elapsedTime, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->elapsedTime, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);


}

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
   FirmwareI18n::setLabel(statsTitle, FirmwareI18n::Message::CurrentUsage);
   lv_obj_set_style_text_font(statsTitle, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   auto createStat = [this](const FirmwareI18n::Text &title) {
      auto *row = lv_obj_create(this->usageStatsContainer);
      lv_obj_remove_style_all(row);
      lv_obj_set_width(row, lv_pct(100));
      lv_obj_set_height(row, LV_SIZE_CONTENT);
      lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
      lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
      auto *label = lv_label_create(row);
      FirmwareI18n::setLabel(label, title);
      lv_obj_set_style_text_color(label, DisplayTheme::muted(), LV_PART_MAIN);
      lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_16, LV_PART_MAIN);
      auto *value = lv_label_create(row);
      lv_obj_set_width(value, lv_pct(62));
      lv_label_set_long_mode(value, LV_LABEL_LONG_WRAP);
      lv_obj_set_style_text_align(value, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN);
      lv_obj_set_style_text_font(value, &attractap_font_montserrat_latin1_16, LV_PART_MAIN);
      return value;
   };
   this->meterValue = createStat(FirmwareI18n::Message::Meter);
   this->operatingValue = createStat(FirmwareI18n::Message::OperatingTime);
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
   FirmwareI18n::setLabel(noIntroductionInfoLabel, FirmwareI18n::Message::YouNeedAnIntroductionBeforeUsingThisResourcePleaseContactOneOfTheIntroducersList);
   lv_obj_set_style_text_font(noIntroductionInfoLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_style_text_color(noIntroductionInfoLabel, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(noIntroductionInfoLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->introducersListLabel = lv_label_create(this->noIntroductionPanel);
   lv_obj_set_width(this->introducersListLabel, lv_pct(100));
   lv_label_set_long_mode(this->introducersListLabel, LV_LABEL_LONG_WRAP);
   lv_obj_set_height(this->introducersListLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(this->introducersListLabel, LV_ALIGN_CENTER);
    FirmwareI18n::setLabel(this->introducersListLabel, FirmwareI18n::Text::literal("???"));
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
   FirmwareI18n::setLabel(maintenanceInfoLabel, MAINTENANCE_INFO_TEXT);
   lv_obj_set_style_text_font(maintenanceInfoLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_style_text_color(maintenanceInfoLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(maintenanceInfoLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->maintenanceIntroducersLabel = lv_label_create(this->maintenancePanel);
   lv_obj_set_width(this->maintenanceIntroducersLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->maintenanceIntroducersLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(this->maintenanceIntroducersLabel, LV_ALIGN_CENTER);
    FirmwareI18n::setLabel(this->maintenanceIntroducersLabel, FirmwareI18n::Text::literal("???"));
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
   FirmwareI18n::setLabel(healthInfoLabel, FirmwareI18n::Message::ThisResourceIsCurrentlyUnavailableAndCannotBeUsed);
   lv_obj_set_style_text_color(healthInfoLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(healthInfoLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);


   this->healthReasonLabel = lv_label_create(this->healthPanel);
   lv_obj_set_width(this->healthReasonLabel, lv_pct(100));
   lv_obj_set_height(this->healthReasonLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->healthReasonLabel, LV_ALIGN_CENTER);
   lv_label_set_long_mode(this->healthReasonLabel, LV_LABEL_LONG_WRAP);
   FirmwareI18n::setLabel(this->healthReasonLabel, FirmwareI18n::Text::literal(""));
    lv_obj_set_style_text_color(this->healthReasonLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(this->healthReasonLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->healthReasonLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

}
