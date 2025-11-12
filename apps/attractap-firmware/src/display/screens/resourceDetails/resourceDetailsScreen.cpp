#include "resourceDetailsScreen.hpp"

void ResourceDetailsScreen::init()
{
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
   lv_obj_add_event_cb(logoutButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_LOGOUT});

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
   lv_obj_set_width(resouceDetails, LV_SIZE_CONTENT);
   lv_obj_set_height(resouceDetails, LV_SIZE_CONTENT);
   lv_obj_set_align(resouceDetails, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(resouceDetails, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(resouceDetails, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(resouceDetails, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(resouceDetails, LV_OBJ_FLAG_SCROLLABLE);

   this->resourceName = lv_label_create(resouceDetails);
   lv_obj_set_width(this->resourceName, LV_SIZE_CONTENT);
   lv_obj_set_height(this->resourceName, LV_SIZE_CONTENT);
   lv_obj_set_align(this->resourceName, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->resourceName, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_text_font(this->resourceName, &lv_font_montserrat_36, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->resourceName, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->resourceDescription = lv_label_create(resouceDetails);
   lv_obj_set_height(this->resourceDescription, 28);
   lv_obj_set_width(this->resourceDescription, LV_SIZE_CONTENT);
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
   lv_obj_set_width(sessionStartTimeContainer, lv_pct(33));
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
   lv_obj_set_width(currentUserContainer, lv_pct(33));
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
   lv_obj_set_width(this->currentUser, LV_SIZE_CONTENT);
   lv_obj_set_height(this->currentUser, LV_SIZE_CONTENT);
   lv_obj_set_align(this->currentUser, LV_ALIGN_CENTER);
   lv_label_set_text(this->currentUser, "JappyJan");
   lv_obj_set_style_text_font(this->currentUser, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->currentUser, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *elapsedTimeContainer = lv_obj_create(this->sessionDetailsContainer);
   lv_obj_remove_style_all(elapsedTimeContainer);
   lv_obj_set_width(elapsedTimeContainer, lv_pct(33));
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

   this->startSessionButton = lv_button_create(this->sessionControls);
   lv_obj_set_height(this->startSessionButton, 50);
   lv_obj_set_width(this->startSessionButton, lv_pct(100));
   lv_obj_set_align(this->startSessionButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->startSessionButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->startSessionButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_START_SESSION});

   lv_obj_t *labelForSessionToggleButton = lv_label_create(this->startSessionButton);
   lv_obj_set_width(labelForSessionToggleButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForSessionToggleButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForSessionToggleButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForSessionToggleButton, "Ressource verwenden");

   this->stopSessionButton = lv_button_create(this->sessionControls);
   lv_obj_set_height(this->stopSessionButton, 50);
   lv_obj_set_width(this->stopSessionButton, lv_pct(100));
   lv_obj_set_align(this->stopSessionButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->stopSessionButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->stopSessionButton, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->stopSessionButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->stopSessionButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_STOP_SESSION});

   lv_obj_t *labelForStopSessionButton = lv_label_create(this->stopSessionButton);
   lv_obj_set_width(labelForStopSessionButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForStopSessionButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForStopSessionButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForStopSessionButton, "Sitzung beenden");

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
   lv_obj_add_event_cb(lockDoorButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_LOCK_DOOR});

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
   lv_obj_add_event_cb(unlockDoorButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_UNLOCK_DOOR});

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
   lv_obj_add_event_cb(unlatchDoorButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, new ButtonClickEventData{this, BUTTON_CLICK_TYPE_UNLATCH_DOOR});

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

   // action overlay is created lazily on lv_layer_top() when needed
   this->actionOverlay = nullptr;
   this->actionOverlayLabel = nullptr;
}

void ResourceDetailsScreen::setResourceAndUsageDetails(const API::ResourceBrief &resource)
{
   lv_label_set_text(this->resourceName, resource.name);
   lv_label_set_text(this->resourceDescription, resource.description);

   // Update introducers panel list
   if (this->introducersListLabel)
   {
      String list;
      for (uint8_t i = 0; i < resource.introducerCount; ++i)
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
      lv_label_set_text(this->introducersListLabel, list.c_str());
   }

   // Toggle sections based on type and usage
   resource_type_t resourceType = (resource.type == 1) ? RESOURCE_TYPE_DOOR : RESOURCE_TYPE_MACHINE;

   if (resource.hasActiveUsage)
   {
      // Persist the session start time so periodic updates can compute elapsed time correctly
      this->sessionStartTime = (time_t)resource.activeStartEpoch;
      lv_label_set_text(this->sessionStartTimeLabel, timeToTimeString(this->sessionStartTime).c_str());
      lv_label_set_text(this->currentUser, resource.activeUser);
   }

   lv_obj_set_flag(this->sessionDetailsContainer, LV_OBJ_FLAG_HIDDEN, !resource.hasActiveUsage);
   lv_obj_set_flag(this->flowButtonsContainer, LV_OBJ_FLAG_HIDDEN, !resource.hasActiveUsage);

   switch (resourceType)
   {
   case RESOURCE_TYPE_MACHINE:
      lv_obj_set_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN, resource.hasActiveUsage);
      lv_obj_set_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN, !resource.hasActiveUsage);
      lv_obj_add_flag(this->doorControls, LV_OBJ_FLAG_HIDDEN);
      break;
   case RESOURCE_TYPE_DOOR:
      lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN);
      lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);
      lv_obj_remove_flag(this->doorControls, LV_OBJ_FLAG_HIDDEN);
      break;
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
      lv_obj_set_style_bg_color(flowButton, lv_color_hex(0x5B5B5B), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_bg_opa(flowButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

      ButtonClickEventData *evt = new ButtonClickEventData{this, BUTTON_CLICK_TYPE_FLOW_BUTTON};
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
}

// TODO: show errors that happen when executing buttons (add a reusable popup dialog for this)

void ResourceDetailsScreen::updateElapsedTimeDisplay()
{
   // If session details are hidden, skip updating elapsed time to avoid using an undefined start time
   if (lv_obj_has_flag(this->sessionDetailsContainer, LV_OBJ_FLAG_HIDDEN))
   {
      return;
   }
   time_t currentTime = time(nullptr);
   // difftime returns seconds; convert to milliseconds for formatter
   double elapsedSeconds = difftime(currentTime, this->sessionStartTime);
   double elapsedMillis = elapsedSeconds * 1000.0;
   lv_label_set_text(this->elapsedTime, millisToTimeString(elapsedMillis).c_str());
}

void ResourceDetailsScreen::setSessionTimeoutTime(uint32_t sessionTimeoutTime)
{
   this->sessionTimeoutTime = sessionTimeoutTime;
   this->updateSessionTimeoutIndicator();
}

void ResourceDetailsScreen::setSessionTimeoutPaused(bool paused)
{
   if (paused == this->sessionTimeoutPaused)
   {
      return;
   }
   this->sessionTimeoutPaused = paused;
   if (paused)
   {
      // Capture freeze timestamp so the indicator can stay stable
      this->pauseFrozenAtMs = millis();
   }
   else
   {
      // On resume, refresh indicator immediately
      this->updateSessionTimeoutIndicator();
   }
}

void ResourceDetailsScreen::extendSessionTimeoutBy(uint32_t ms)
{
   this->sessionTimeoutTime += ms;
   this->updateSessionTimeoutIndicator();
}

void ResourceDetailsScreen::updateSessionTimeoutIndicator()
{
   // If paused, freeze the bar at the last computed value
   uint32_t now = this->sessionTimeoutPaused ? this->pauseFrozenAtMs : millis();
   // add 1 second to the remaining time to prevent overflow if the transition takes a bit
   double remainingMillis = this->sessionTimeoutTime - now + 1000;
   long remainingSeconds = remainingMillis / 1000;
   // Clamp to bar range [0,30]
   if (remainingSeconds < 0)
      remainingSeconds = 0;
   if (remainingSeconds > 30)
      remainingSeconds = 30;
   lv_bar_set_value(this->sessionTimeoutIndicator, remainingSeconds, LV_ANIM_ON);
}

void ResourceDetailsScreen::loop()
{
   this->updateElapsedTimeDisplay();
   this->updateSessionTimeoutIndicator();
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
   if (!evt->self)
      return;

   if (!evt->self->buttonClickCallback)
      return;

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

void ResourceDetailsScreen::onToastDelete(lv_event_t *e)
{
   (void)e;
}

String ResourceDetailsScreen::getName()
{
   return "ResourceDetailsScreen";
}

void ResourceDetailsScreen::setUserDetails(UserDetails userDetails)
{
   this->logger.debugf("Setting signed in username: %s", userDetails.username.c_str());
   this->loginUsernameCache = userDetails.username;

   if (this->loginUserLabel == nullptr)
   {
      this->logger.debug("No login user label found");
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

   // show introduction panel only if user does not have introduction
   lv_obj_set_flag(this->noIntroductionPanel, LV_OBJ_FLAG_HIDDEN, userDetails.hasIntroduction);

   // show session controls only if the user hasIntroduction, isIntroducer or canManageResource
   lv_obj_set_flag(this->sessionControls, LV_OBJ_FLAG_HIDDEN, !userDetails.hasIntroduction && !userDetails.isIntroducer && !userDetails.canManageResource);
}

void ResourceDetailsScreen::showActionProgress(const char *text)
{
   if (!this->actionOverlay)
   {
      lv_obj_t *top = lv_layer_top();
      this->actionOverlay = lv_obj_create(top);
      lv_obj_remove_style_all(this->actionOverlay);
      lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_IGNORE_LAYOUT);
      lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_CLICKABLE); // block input behind
      lv_obj_remove_flag(this->actionOverlay, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_set_size(this->actionOverlay, lv_pct(100), lv_pct(100));
      lv_obj_set_align(this->actionOverlay, LV_ALIGN_CENTER);
      lv_obj_set_style_bg_color(this->actionOverlay, lv_color_black(), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_bg_opa(this->actionOverlay, 128, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_flex_flow(this->actionOverlay, LV_FLEX_FLOW_COLUMN);
      lv_obj_set_flex_align(this->actionOverlay, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

      lv_obj_t *spinner = lv_spinner_create(this->actionOverlay);
      lv_obj_set_size(spinner, 48, 48);

      this->actionOverlayLabel = lv_label_create(this->actionOverlay);
      lv_label_set_text(this->actionOverlayLabel, "Bitte warten");
      lv_obj_set_style_text_color(this->actionOverlayLabel, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   if (text && this->actionOverlayLabel)
   {
      lv_label_set_text(this->actionOverlayLabel, text);
   }
   lv_obj_clear_flag(this->actionOverlay, LV_OBJ_FLAG_HIDDEN);
}

void ResourceDetailsScreen::hideActionProgress()
{
   if (!this->actionOverlay)
      return;
   lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_HIDDEN);
}

void ResourceDetailsScreen::showSuccessToast(const char *text, uint16_t ms)
{
   // Create toast once and reuse to avoid LVGL invalidation/delete during draw
   if (!this->successToast)
   {
      this->successToast = lv_obj_create(this->screen);
      lv_obj_remove_style_all(this->successToast);
      lv_obj_set_size(this->successToast, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
      lv_obj_set_align(this->successToast, LV_ALIGN_BOTTOM_MID);
      lv_obj_set_style_bg_color(this->successToast, lv_color_hex(0x10B981), LV_PART_MAIN | LV_STATE_DEFAULT); // green
      lv_obj_set_style_bg_opa(this->successToast, 230, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_left(this->successToast, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_right(this->successToast, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_top(this->successToast, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_bottom(this->successToast, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_radius(this->successToast, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   // Replace content
   lv_obj_clean(this->successToast);
   lv_obj_t *lbl = lv_label_create(this->successToast);
   lv_label_set_text(lbl, text ? text : "Erfolgreich");
   lv_obj_set_style_text_color(lbl, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);

   // Show now
   lv_obj_clear_flag(this->successToast, LV_OBJ_FLAG_HIDDEN);

   // Cancel any existing hide timer
   if (this->successToastTimer)
   {
      lv_timer_del(this->successToastTimer);
      this->successToastTimer = nullptr;
   }

   // Schedule hide (no deletion) to avoid cross-event deletes
   this->successToastTimer = lv_timer_create(
       [](lv_timer_t *timer)
       {
          auto *self = static_cast<ResourceDetailsScreen *>(lv_timer_get_user_data(timer));
          if (self && self->successToast)
          {
             lv_obj_add_flag(self->successToast, LV_OBJ_FLAG_HIDDEN);
          }
          if (self)
          {
             self->successToastTimer = nullptr;
          }
          lv_timer_del(timer);
       },
       ms, this);
}

void ResourceDetailsScreen::onScreenLeave()
{
   if (this->actionOverlay)
   {
      lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_HIDDEN);
   }
   if (this->successToast)
   {
      lv_obj_add_flag(this->successToast, LV_OBJ_FLAG_HIDDEN);
   }
}
