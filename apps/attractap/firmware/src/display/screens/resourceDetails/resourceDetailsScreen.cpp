#include "resourceDetailsScreen.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <string.h>

static const char *MAINTENANCE_INFO_TEXT = "Diese Ressource ist wegen Wartungsarbeiten nicht verfuegbar. Wartungsarbeiten duerfen nur von den unten aufgefuehrten Personen durchgefuehrt werden.";

void ResourceDetailsScreen::init()
{
   if (this->screen)
   {
      return;
   }
   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_bg_image_src(this->screen, &lockscreen_background_image, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_left(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *loginContainer = lv_obj_create(this->screen);
   lv_obj_remove_style_all(loginContainer);
   lv_obj_set_width(loginContainer, lv_pct(100));
   lv_obj_set_height(loginContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(loginContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(loginContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(loginContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(loginContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(loginContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(loginContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(loginContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *logoutButton = lv_button_create(loginContainer);
   lv_obj_set_width(logoutButton, 70);
   lv_obj_set_height(logoutButton, LV_SIZE_CONTENT);
   lv_obj_set_align(logoutButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(logoutButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(logoutButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(logoutButton, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(logoutButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(logoutButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_LOGOUT, {}});

   lv_obj_t *labelForLogoutButton = lv_label_create(logoutButton);
   lv_obj_set_width(labelForLogoutButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForLogoutButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForLogoutButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForLogoutButton, "Abmelden");
   lv_obj_set_style_text_align(labelForLogoutButton, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(labelForLogoutButton, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *userAndTimeoutContainer = lv_obj_create(loginContainer);
   lv_obj_remove_style_all(userAndTimeoutContainer);
   lv_obj_set_width(userAndTimeoutContainer, 340);
   lv_obj_set_height(userAndTimeoutContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(userAndTimeoutContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(userAndTimeoutContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(userAndTimeoutContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(userAndTimeoutContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(userAndTimeoutContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(userAndTimeoutContainer, 5, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(userAndTimeoutContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->loginUserLabel = lv_label_create(userAndTimeoutContainer);
   lv_obj_set_width(this->loginUserLabel, lv_pct(100));
   lv_obj_set_height(this->loginUserLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->loginUserLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->loginUserLabel, this->loginUsernameCache.c_str());
   lv_obj_set_style_text_font(this->loginUserLabel, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);
   // Ensure the username is visible on the background image
   lv_obj_set_style_text_color(this->loginUserLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(this->loginUserLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->sessionTimeoutIndicator = lv_bar_create(userAndTimeoutContainer);
   lv_bar_set_mode(this->sessionTimeoutIndicator, LV_BAR_MODE_SYMMETRICAL);
   lv_bar_set_range(this->sessionTimeoutIndicator, 0, 30);
   lv_bar_set_value(this->sessionTimeoutIndicator, 25, LV_ANIM_OFF);
   lv_bar_set_start_value(this->sessionTimeoutIndicator, 30, LV_ANIM_OFF);
   lv_obj_set_height(this->sessionTimeoutIndicator, 10);
   lv_obj_set_width(this->sessionTimeoutIndicator, lv_pct(100));
   lv_obj_set_align(this->sessionTimeoutIndicator, LV_ALIGN_CENTER);

   lv_obj_set_style_bg_color(this->sessionTimeoutIndicator, lv_color_hex(0xF31260), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->sessionTimeoutIndicator, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   // Compensating for LVGL9.1 draw crash with bar/slider max value when top-padding is nonzero and right-padding is 0
   if (lv_obj_get_style_pad_top(this->sessionTimeoutIndicator, LV_PART_MAIN) > 0)
      lv_obj_set_style_pad_right(this->sessionTimeoutIndicator, lv_obj_get_style_pad_right(this->sessionTimeoutIndicator, LV_PART_MAIN) + 1, LV_PART_MAIN);

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
   lv_obj_set_style_text_font(this->resourceName, &lv_font_montserrat_36, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->resourceName, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->resourceDescription = lv_label_create(resouceDetails);
   lv_obj_set_height(this->resourceDescription, 28);
   lv_obj_set_width(this->resourceDescription, lv_pct(100));
   lv_label_set_long_mode(this->resourceDescription, LV_LABEL_LONG_SCROLL);
   lv_obj_set_align(this->resourceDescription, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->resourceDescription, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_text_color(this->resourceDescription, lv_color_hex(0xE5E5E5), LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_label_set_text(labelForSessionStartTime, "Startzeit");
   lv_obj_set_style_text_color(labelForSessionStartTime, lv_color_hex(0xE5E5E5), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(labelForSessionStartTime, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->sessionStartTimeLabel = lv_label_create(sessionStartTimeContainer);
   lv_obj_set_width(this->sessionStartTimeLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->sessionStartTimeLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->sessionStartTimeLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->sessionStartTimeLabel, "??.??. ??:??");
   lv_obj_set_style_text_font(this->sessionStartTimeLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->sessionStartTimeLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_label_set_text(labelForCurrentUser, "Nutzer");
   lv_obj_set_style_text_color(labelForCurrentUser, lv_color_hex(0xE5E5E5), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(labelForCurrentUser, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->currentUser = lv_label_create(currentUserContainer);
   lv_obj_set_width(this->currentUser, lv_pct(100));
   lv_obj_set_height(this->currentUser, LV_SIZE_CONTENT);
   lv_obj_set_align(this->currentUser, LV_ALIGN_CENTER);
   lv_label_set_long_mode(this->currentUser, LV_LABEL_LONG_SCROLL_CIRCULAR);
   lv_obj_set_style_text_align(this->currentUser, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_label_set_text(this->currentUser, "JappyJan");
   lv_obj_set_style_text_font(this->currentUser, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->currentUser, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_label_set_text(labelForElapsedTime, "Dauer");
   lv_obj_set_style_text_color(labelForElapsedTime, lv_color_hex(0xE5E5E5), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(labelForElapsedTime, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->elapsedTime = lv_label_create(elapsedTimeContainer);
   lv_obj_set_width(this->elapsedTime, LV_SIZE_CONTENT);
   lv_obj_set_height(this->elapsedTime, LV_SIZE_CONTENT);
   lv_obj_set_align(this->elapsedTime, LV_ALIGN_CENTER);
   lv_label_set_text(this->elapsedTime, "00:23:46");
   lv_obj_set_style_text_font(this->elapsedTime, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->elapsedTime, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_obj_set_style_bg_color(this->projectsButton, lv_color_hex(0x006FEE), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->projectsButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(this->projectsButton, &ResourceDetailsScreen::onProjectsButtonClick, LV_EVENT_CLICKED, this);

   this->projectsButtonLabel = lv_label_create(this->projectsButton);
   lv_label_set_text(this->projectsButtonLabel, "Projekt waehlen");
   lv_obj_set_align(this->projectsButtonLabel, LV_ALIGN_CENTER);
   lv_obj_set_style_text_align(this->projectsButtonLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->clearProjectButton = lv_button_create(this->projectSelectionRow);
   lv_obj_set_height(this->clearProjectButton, 50);
   lv_obj_set_width(this->clearProjectButton, LV_SIZE_CONTENT);
   lv_obj_set_align(this->clearProjectButton, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->clearProjectButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->clearProjectButton, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
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
   lv_obj_set_style_bg_color(this->startSessionButton, lv_color_hex(0x17C964), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->startSessionButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->startSessionButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_START_SESSION, {}});

   this->startSessionButtonLabel = lv_label_create(this->startSessionButton);
   lv_obj_set_width(this->startSessionButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->startSessionButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->startSessionButtonLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->startSessionButtonLabel, "Ressource verwenden");

   this->stopOtherUserNote = lv_label_create(this->sessionControls);
   lv_obj_set_width(this->stopOtherUserNote, lv_pct(100));
   lv_obj_set_height(this->stopOtherUserNote, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->stopOtherUserNote, LV_LABEL_LONG_WRAP);
   lv_label_set_text(this->stopOtherUserNote, "Achtung: Sie beenden die laufende Sitzung eines anderen Nutzers.");
   lv_obj_set_style_text_color(this->stopOtherUserNote, lv_color_hex(0xF5A524), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->stopOtherUserNote, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->stopOtherUserNote, LV_OBJ_FLAG_HIDDEN);

   this->stopSessionButton = lv_button_create(this->sessionControls);
   lv_obj_set_height(this->stopSessionButton, 50);
   lv_obj_set_width(this->stopSessionButton, lv_pct(100));
   lv_obj_set_align(this->stopSessionButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->stopSessionButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->stopSessionButton, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->stopSessionButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->stopSessionButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_STOP_SESSION, {}});

   this->stopSessionButtonLabel = lv_label_create(this->stopSessionButton);
   lv_obj_set_width(this->stopSessionButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->stopSessionButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->stopSessionButtonLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->stopSessionButtonLabel, "Sitzung beenden");

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
   lv_obj_set_style_bg_color(lockDoorButton, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(lockDoorButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(lockDoorButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_LOCK_DOOR, {}});

   lv_obj_t *labelForLockDoorButton = lv_label_create(lockDoorButton);
   lv_obj_set_width(labelForLockDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForLockDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForLockDoorButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForLockDoorButton, "Abschliessen");

   lv_obj_t *unlockDoorButton = lv_button_create(this->doorControls);
   lv_obj_set_height(unlockDoorButton, 50);
   lv_obj_set_width(unlockDoorButton, lv_pct(30));
   lv_obj_set_align(unlockDoorButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(unlockDoorButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(unlockDoorButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(unlockDoorButton, lv_color_hex(0x17C964), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(unlockDoorButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(unlockDoorButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_UNLOCK_DOOR, {}});

   lv_obj_t *labelForUnlockDoorButton = lv_label_create(unlockDoorButton);
   lv_obj_set_width(labelForUnlockDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForUnlockDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForUnlockDoorButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForUnlockDoorButton, "Aufschliessen");

   lv_obj_t *unlatchDoorButton = lv_button_create(this->doorControls);
   lv_obj_set_height(unlatchDoorButton, 50);
   lv_obj_set_width(unlatchDoorButton, lv_pct(30));
   lv_obj_set_align(unlatchDoorButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(unlatchDoorButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(unlatchDoorButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(unlatchDoorButton, lv_color_hex(0x9353D3), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(unlatchDoorButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(unlatchDoorButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_UNLATCH_DOOR, {}});

   lv_obj_t *labelForUnlatchDoorButton = lv_label_create(unlatchDoorButton);
   lv_obj_set_width(labelForUnlatchDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForUnlatchDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForUnlatchDoorButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForUnlatchDoorButton, "Falle oeffnen");

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

   this->noIntroductionPanel = lv_obj_create(this->screen);
   lv_obj_set_width(this->noIntroductionPanel, lv_pct(100));
   lv_obj_set_height(this->noIntroductionPanel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->noIntroductionPanel, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->noIntroductionPanel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->noIntroductionPanel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->noIntroductionPanel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->noIntroductionPanel, lv_color_hex(0xF5A524), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->noIntroductionPanel, 200, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *noIntroductionInfoLabel = lv_label_create(this->noIntroductionPanel);
   lv_obj_set_width(noIntroductionInfoLabel, lv_pct(100));
   lv_obj_set_height(noIntroductionInfoLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(noIntroductionInfoLabel, LV_ALIGN_CENTER);
   lv_label_set_text(noIntroductionInfoLabel, "Sie benoetigen eine Einweisung, bevor Sie diese Ressource nutzen koennen. Bitte wenden Sie sich an einen der unten aufgefuehrten Einweiser.");
   lv_obj_set_style_text_color(noIntroductionInfoLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(noIntroductionInfoLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->introducersListLabel = lv_label_create(this->noIntroductionPanel);
   lv_obj_set_width(this->introducersListLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->introducersListLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->introducersListLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->introducersListLabel, "???");

   this->maintenancePanel = lv_obj_create(this->screen);
   lv_obj_set_width(this->maintenancePanel, lv_pct(100));
   lv_obj_set_height(this->maintenancePanel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->maintenancePanel, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->maintenancePanel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->maintenancePanel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->maintenancePanel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->maintenancePanel, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->maintenancePanel, 200, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->maintenancePanel, LV_OBJ_FLAG_HIDDEN);

   lv_obj_t *maintenanceInfoLabel = lv_label_create(this->maintenancePanel);
   lv_obj_set_width(maintenanceInfoLabel, lv_pct(100));
   lv_obj_set_height(maintenanceInfoLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(maintenanceInfoLabel, LV_ALIGN_CENTER);
   lv_label_set_text(maintenanceInfoLabel, MAINTENANCE_INFO_TEXT);
   lv_obj_set_style_text_color(maintenanceInfoLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(maintenanceInfoLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->maintenanceIntroducersLabel = lv_label_create(this->maintenancePanel);
   lv_obj_set_width(this->maintenanceIntroducersLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->maintenanceIntroducersLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->maintenanceIntroducersLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->maintenanceIntroducersLabel, "???");

   this->healthPanel = lv_obj_create(this->screen);
   lv_obj_set_width(this->healthPanel, lv_pct(100));
   lv_obj_set_height(this->healthPanel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->healthPanel, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->healthPanel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->healthPanel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->healthPanel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->healthPanel, lv_color_hex(0xC20E4D), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->healthPanel, 200, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->healthPanel, LV_OBJ_FLAG_HIDDEN);

   lv_obj_t *healthInfoLabel = lv_label_create(this->healthPanel);
   lv_obj_set_width(healthInfoLabel, lv_pct(100));
   lv_obj_set_height(healthInfoLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(healthInfoLabel, LV_ALIGN_CENTER);
   lv_label_set_text(healthInfoLabel, "Diese Ressource ist derzeit nicht betriebsbereit und kann nicht verwendet werden.");
   lv_obj_set_style_text_color(healthInfoLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(healthInfoLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->healthReasonLabel = lv_label_create(this->healthPanel);
   lv_obj_set_width(this->healthReasonLabel, lv_pct(100));
   lv_obj_set_height(this->healthReasonLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->healthReasonLabel, LV_ALIGN_CENTER);
   lv_label_set_long_mode(this->healthReasonLabel, LV_LABEL_LONG_WRAP);
   lv_label_set_text(this->healthReasonLabel, "");
   lv_obj_set_style_text_color(this->healthReasonLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(this->healthReasonLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->applyCachedState();
}
void ResourceDetailsScreen::setResourceAndUsageDetails(const API::ResourceBrief &resource)
{
   this->resourceCache = resource;
   this->resourceCacheValid = true;

   if (!this->screen || !this->resourceName || !this->resourceDescription || !this->flowButtonsContainer)
   {
      return;
   }
   lv_label_set_text(this->resourceName, resource.name);
   lv_label_set_text(this->resourceDescription, resource.description);

   // Update introducer/maintainer panel lists (same set of allowed users)
   std::string introducersText = this->buildIntroducersText(resource);
   if (this->introducersListLabel)
   {
      lv_label_set_text(this->introducersListLabel, introducersText.c_str());
   }
   if (this->maintenanceIntroducersLabel)
   {
      lv_label_set_text(this->maintenanceIntroducersLabel, introducersText.c_str());
   }

   // Update health banner reason text
   if (this->healthReasonLabel)
   {
      const char *reason = (resource.healthReason[0] != '\0') ? resource.healthReason : "Kein Grund angegeben.";
      lv_label_set_text(this->healthReasonLabel, reason);
   }

   // Toggle sections based on type and usage
   resource_type_t resourceType = (resource.type == 1) ? RESOURCE_TYPE_DOOR : RESOURCE_TYPE_MACHINE;

   if (resource.hasActiveUsage)
   {
      // Persist the session start time so periodic updates can compute elapsed time correctly
      this->sessionStartTime = (time_t)resource.activeStartEpoch;
      lv_label_set_text(this->sessionStartTimeLabel, timeToTimeString(this->sessionStartTime, resource.activeStartUtcOffsetMinutes).c_str());
      lv_label_set_text(this->currentUser, resource.activeUser);
   }

   lv_obj_set_flag(this->sessionDetailsContainer, LV_OBJ_FLAG_HIDDEN, !resource.hasActiveUsage);
   // ponytail: always hide here; refreshAccessState() reveals it only to the session owner
   lv_obj_add_flag(this->flowButtonsContainer, LV_OBJ_FLAG_HIDDEN);

   switch (resourceType)
   {
   case RESOURCE_TYPE_MACHINE:
      // Start/stop button visibility is determined in refreshAccessState() with full user context
      lv_obj_add_flag(this->doorControls, LV_OBJ_FLAG_HIDDEN);
      break;
   case RESOURCE_TYPE_DOOR:
      lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN);
      lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);
      lv_obj_remove_flag(this->doorControls, LV_OBJ_FLAG_HIDDEN);
      break;
   }

   bool hideProjectSelection = resource.hasActiveUsage || resourceType == RESOURCE_TYPE_DOOR;
   if (this->projectSelectionRow)
   {
      if (hideProjectSelection)
      {
         lv_obj_add_flag(this->projectSelectionRow, LV_OBJ_FLAG_HIDDEN);
      }
      else
      {
         lv_obj_clear_flag(this->projectSelectionRow, LV_OBJ_FLAG_HIDDEN);
      }
   }

   // Rebuild flow buttons
   lv_obj_clean(this->flowButtonsContainer);
   for (uint8_t i = 0; i < resource.flowButtonCount; ++i)
   {
      const API::FlowButton &fb = resource.flowButtons[i];
      lv_obj_t *flowButton = lv_button_create(this->flowButtonsContainer);
      lv_obj_set_height(flowButton, 50);
      lv_obj_set_width(flowButton, lv_pct(100));
      lv_obj_set_align(flowButton, LV_ALIGN_CENTER);
      lv_obj_add_flag(flowButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
      lv_obj_remove_flag(flowButton, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_set_style_bg_color(flowButton, lv_color_hex(0x006FEE), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_bg_opa(flowButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

      ButtonClickEventData *evt = new ButtonClickEventData{this, BUTTON_CLICK_TYPE_FLOW_BUTTON, {}};
      strlcpy(evt->flowButtonId, fb.id, API::MAX_FLOW_BUTTON_ID_LEN);
      lv_obj_add_event_cb(flowButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, evt);
      lv_obj_add_event_cb(flowButton, &ResourceDetailsScreen::onContainerDelete, LV_EVENT_DELETE, evt);

      lv_obj_t *labelForFlowButton = lv_label_create(flowButton);
      lv_obj_set_width(labelForFlowButton, LV_SIZE_CONTENT);
      lv_obj_set_height(labelForFlowButton, LV_SIZE_CONTENT);
      lv_obj_set_align(labelForFlowButton, LV_ALIGN_CENTER);
      lv_label_set_text(labelForFlowButton, fb.label);
   }

   this->updateElapsedTimeDisplay();
   this->refreshAccessState();
}
std::string ResourceDetailsScreen::buildIntroducersText(const API::ResourceBrief &resource)
{
   std::string list;
   for (size_t i = 0; i < resource.introducers.size(); ++i)
   {
      if (i > 0)
      {
         list += "\n";
      }
      list += resource.introducers[i];
   }
   if (list.length() == 0)
   {
      list = "-- kein Einweiser verfuegbar --";
   }
   return list;
}
void ResourceDetailsScreen::refreshAccessState()
{
   bool underMaintenance = this->resourceCacheValid && this->resourceCache.isUnderMaintenance;
   bool isUnhealthy = this->resourceCacheValid && !this->resourceCache.isHealthy;

   if (this->maintenancePanel)
   {
      lv_obj_set_flag(this->maintenancePanel, LV_OBJ_FLAG_HIDDEN, !underMaintenance);
   }

   if (this->healthPanel)
   {
      lv_obj_set_flag(this->healthPanel, LV_OBJ_FLAG_HIDDEN, !isUnhealthy);
   }

   if (!this->userDetailsInitialized)
   {
      return;
   }

   const UserDetails &user = this->userDetailsCache;
   bool isMaintainer = user.isIntroducer || user.canManageResource;

   // Resource is blocked when it is under maintenance or reporting an unhealthy state.
   bool blocked = underMaintenance || isUnhealthy;

   bool ownsActiveUsage = this->resourceCacheValid && this->resourceCache.hasActiveUsage &&
                          strcmp(this->resourceCache.activeUser, user.username.c_str()) == 0;
   bool supervisedStartAvailable = user.requiresSupervisor && this->resourceCacheValid &&
                                   !this->resourceCache.hasActiveUsage;
   // Keep the introduction guidance visible alongside any available session action.
   if (this->noIntroductionPanel)
   {
      lv_obj_set_flag(this->noIntroductionPanel, LV_OBJ_FLAG_HIDDEN,
                       user.hasIntroduction || blocked);
   }

   // Session controls require access, an available supervised start, or ownership of the active
   // supervised session; while blocked only maintainers may use the resource.
   bool canUse = user.hasIntroduction || user.isIntroducer || user.canManageResource ||
                 supervisedStartAvailable || ownsActiveUsage;
   if (blocked)
   {
      canUse = isMaintainer;
   }
   if (this->sessionControls)
   {
      lv_obj_set_flag(this->sessionControls, LV_OBJ_FLAG_HIDDEN, !canUse);
   }

   // Machine-type: determine which action buttons to show based on user permissions and session owner
   if (this->resourceCacheValid)
   {
      resource_type_t resourceType = (this->resourceCache.type == 1) ? RESOURCE_TYPE_DOOR : RESOURCE_TYPE_MACHINE;
      if (resourceType == RESOURCE_TYPE_MACHINE && this->startSessionButton && this->stopSessionButton)
      {
         bool showStart = false;
         bool showStop = false;
         bool isTakeover = false;

         if (!this->resourceCache.hasActiveUsage)
         {
            // No active session: show start button
            showStart = true;
         }
         else if (ownsActiveUsage)
         {
            // Current user owns the session: show stop button
            showStop = true;
         }
         else
         {
            // Another user has an active session
            bool canTakeOver = this->resourceCache.allowTakeOver &&
                               (user.hasIntroduction || user.isIntroducer || user.canManageResource);
            if (canTakeOver)
            {
               showStart = true;
               isTakeover = true;
            }
            // Introducers and resource managers can force-stop another user's session
            // (mirrors the web frontend's canStopOtherUserSession). Not gated on allowTakeOver:
            // an introducer can both take over and force-stop.
            showStop = user.isIntroducer || user.canManageResource;
         }

         lv_obj_set_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN, !showStart);
         lv_obj_set_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN, !showStop);

         // Differentiate stopping your own session from force-stopping someone else's:
         // - own session: solid danger red, full prominence, plain label, no note
         // - foreign session: softened/darker red, warning label + orange note
         bool isForeignStop = showStop && !ownsActiveUsage;
         if (this->stopOtherUserNote)
         {
            lv_obj_set_flag(this->stopOtherUserNote, LV_OBJ_FLAG_HIDDEN, !isForeignStop);
         }
         lv_color_t stopBgColor = isForeignStop ? lv_color_hex(0x920B3A) : lv_color_hex(0xF31260);
         lv_obj_set_style_bg_color(this->stopSessionButton, stopBgColor, LV_PART_MAIN | LV_STATE_DEFAULT);
         lv_obj_set_style_bg_opa(this->stopSessionButton, isForeignStop ? 200 : 255, LV_PART_MAIN | LV_STATE_DEFAULT);
         if (this->stopSessionButtonLabel)
         {
            lv_label_set_text(this->stopSessionButtonLabel,
                              isForeignStop ? "Fremde Sitzung beenden" : "Sitzung beenden");
         }

         if (this->startSessionButtonLabel)
         {
            lv_label_set_text(this->startSessionButtonLabel,
                              isTakeover ? "Uebernehmen" : "Ressource verwenden");
         }
         // Takeover = warning orange (danger-soft on web), normal start = success green
         lv_color_t startBgColor = isTakeover ? lv_color_hex(0xF5A524) : lv_color_hex(0x17C964);
         lv_obj_set_style_bg_color(this->startSessionButton, startBgColor, LV_PART_MAIN | LV_STATE_DEFAULT);
      }
   }

   // Flow node buttons are only relevant to the person who owns the active session.
   if (this->flowButtonsContainer)
   {
      lv_obj_set_flag(this->flowButtonsContainer, LV_OBJ_FLAG_HIDDEN, !ownsActiveUsage);
   }
}
void ResourceDetailsScreen::loop()
{
   this->updateElapsedTimeDisplay();
   this->updateSessionTimeoutIndicator();
}
void ResourceDetailsScreen::destroy()
{
   this->disposeProjectsModal();
   this->disposeFormsModal();
   this->disposeSuccessToast();

   if (this->screen)
   {
      lv_obj_del(this->screen);
   }

   this->screen = nullptr;
   this->loginUserLabel = nullptr;
   this->sessionDetailsContainer = nullptr;
   this->resourceName = nullptr;
   this->resourceDescription = nullptr;
   this->sessionStartTimeLabel = nullptr;
   this->currentUser = nullptr;
   this->sessionControls = nullptr;
   this->projectSelectionRow = nullptr;
   this->projectsButton = nullptr;
   this->projectsButtonLabel = nullptr;
   this->clearProjectButton = nullptr;
   this->projectsModalPanel = nullptr;
   this->projectsListContainer = nullptr;
   this->projectsPaginationLabel = nullptr;
   this->projectsPrevButton = nullptr;
   this->projectsNextButton = nullptr;
   this->startSessionButton = nullptr;
   this->startSessionButtonLabel = nullptr;
   this->stopSessionButton = nullptr;
   this->stopSessionButtonLabel = nullptr;
   this->stopOtherUserNote = nullptr;
   this->doorControls = nullptr;
   this->flowButtonsContainer = nullptr;
   this->formsModalPanel = nullptr;
   this->formsModalContent = nullptr;
   this->formsModalList = nullptr;
   this->formsModalErrorLabel = nullptr;
   this->formsModalProgressLabel = nullptr;
   this->formsEditorOverlay = nullptr;
   this->formsEditorTitleLabel = nullptr;
   this->formsEditorTextarea = nullptr;
   this->formsEditorSpacer = nullptr;
   this->formsEditorKeyboard = nullptr;
   this->formsBackButton = nullptr;
   this->formsNextButton = nullptr;
   this->formsNextLabel = nullptr;
   this->formsNextSpinner = nullptr;
   this->elapsedTime = nullptr;
   this->sessionTimeoutIndicator = nullptr;
   this->noIntroductionPanel = nullptr;
   this->introducersListLabel = nullptr;
   this->maintenancePanel = nullptr;
   this->maintenanceIntroducersLabel = nullptr;
   this->healthPanel = nullptr;
   this->healthReasonLabel = nullptr;
   this->activeActionButton = nullptr;
   this->activeActionLabel = nullptr;
   this->activeActionSpinner = nullptr;
   this->actionInProgress = false;
   this->successToast = nullptr;
   this->formsModalMeta = nullptr;
   this->formsModalPage = nullptr;
   this->formFieldWidgetCount = 0;
}
void ResourceDetailsScreen::applyCachedState()
{
   if (!this->screen)
   {
      return;
   }

   if (this->loginUserLabel && this->loginUsernameCache.length() > 0)
   {
      lv_label_set_text(this->loginUserLabel, this->loginUsernameCache.c_str());
   }

   if (this->resourceCacheValid)
   {
      this->setResourceAndUsageDetails(this->resourceCache);
   }

   if (this->userDetailsInitialized)
   {
      this->setUserDetails(this->userDetailsCache);
   }

   this->refreshProjectsButtonLabel();
   this->updateClearProjectButtonState();
   this->updateSessionTimeoutIndicator();
   this->updateElapsedTimeDisplay();
}
lv_obj_t *ResourceDetailsScreen::getScreen()
{
   return this->screen;
}
void ResourceDetailsScreen::setButtonClickCallback(std::function<void(ButtonClickEventData)> callback)
{
   this->buttonClickCallback = callback;
}
void ResourceDetailsScreen::onButtonClick(lv_event_t *e)
{
   ButtonClickEventData *evt = static_cast<ButtonClickEventData *>(lv_event_get_user_data(e));
   if (!evt->self || evt->self->actionInProgress)
      return;

   if (!evt->self->buttonClickCallback)
      return;

   if (evt->buttonClickType != BUTTON_CLICK_TYPE_LOGOUT)
   {
      evt->self->activeActionButton = static_cast<lv_obj_t *>(lv_event_get_current_target(e));
      evt->self->activeActionLabel = lv_obj_get_child(evt->self->activeActionButton, 0);
      evt->self->activeActionSpinner = lv_obj_get_child_count(evt->self->activeActionButton) > 1
                                          ? lv_obj_get_child(evt->self->activeActionButton, 1)
                                          : nullptr;
   }
   evt->self->buttonClickCallback(*evt);
}
void ResourceDetailsScreen::onContainerDelete(lv_event_t *e)
{
   ButtonClickEventData *evt = static_cast<ButtonClickEventData *>(lv_event_get_user_data(e));
   if (evt)
   {
      delete evt;
   }
}
std::string ResourceDetailsScreen::getName()
{
   return "ResourceDetailsScreen";
}
void ResourceDetailsScreen::setUserDetails(UserDetails userDetails)
{
   this->logger.debugf("Setting signed in username: %s", userDetails.username.c_str());
   this->loginUsernameCache = userDetails.username;
   this->userDetailsCache = userDetails;
   this->userDetailsInitialized = true;

   if (!this->loginUserLabel)
   {
      return;
   }

   if (userDetails.username.length() == 0)
   {
      this->logger.debug("No login user label found");
      lv_label_set_text(this->loginUserLabel, "???");
      return;
   }

   this->logger.debugf("Setting login user label text: %s", userDetails.username.c_str());
   lv_label_set_text(this->loginUserLabel, userDetails.username.c_str());

   this->refreshAccessState();
}
void ResourceDetailsScreen::onScreenLeave()
{
   this->hideActionProgress();
   if (this->successToast)
   {
      lv_obj_add_flag(this->successToast, LV_OBJ_FLAG_HIDDEN);
   }
   this->hideProjectsModal();
}
