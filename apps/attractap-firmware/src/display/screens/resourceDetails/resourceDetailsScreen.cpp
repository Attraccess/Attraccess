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

   this->sessionTimeoutIndicator = lv_bar_create(this->screen);
   lv_bar_set_range(sessionTimeoutIndicator, 0, 30);
   // TODO: animate with current timeout
   lv_bar_set_start_value(this->sessionTimeoutIndicator, 30, LV_ANIM_ON);
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

   this->resourceDescription = lv_label_create(resouceDetails);
   lv_obj_set_height(this->resourceDescription, 28);
   lv_obj_set_width(this->resourceDescription, LV_SIZE_CONTENT);
   lv_obj_set_align(this->resourceDescription, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->resourceDescription, LV_OBJ_FLAG_SCROLLABLE);

   this->thumbnail = lv_image_create(header);
   lv_obj_set_width(this->thumbnail, 48);
   lv_obj_set_height(this->thumbnail, 48);
   lv_obj_set_align(this->thumbnail, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->thumbnail, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(this->thumbnail, LV_OBJ_FLAG_SCROLLABLE);

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
   lv_label_set_text(labelForSessionStartTime, "Sitzung gestartet");
   lv_obj_set_style_text_color(labelForSessionStartTime, lv_color_hex(0xE5E5E5), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(labelForSessionStartTime, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->sessionStartTimeLabel = lv_label_create(sessionStartTimeContainer);
   lv_obj_set_width(this->sessionStartTimeLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->sessionStartTimeLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->sessionStartTimeLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->sessionStartTimeLabel, "15.10. 16:45");
   lv_obj_set_style_text_font(this->sessionStartTimeLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_label_set_text(labelForElapsedTime, "Verstrichene Zeit");
   lv_obj_set_style_text_color(labelForElapsedTime, lv_color_hex(0xE5E5E5), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(labelForElapsedTime, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->elapsedTime = lv_label_create(elapsedTimeContainer);
   lv_obj_set_width(this->elapsedTime, LV_SIZE_CONTENT);
   lv_obj_set_height(this->elapsedTime, LV_SIZE_CONTENT);
   lv_obj_set_align(this->elapsedTime, LV_ALIGN_CENTER);
   lv_label_set_text(this->elapsedTime, "00:23:46");
   lv_obj_set_style_text_font(this->elapsedTime, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->startSessionButton = lv_button_create(this->screen);
   lv_obj_set_height(this->startSessionButton, 50);
   lv_obj_set_width(this->startSessionButton, lv_pct(100));
   lv_obj_set_align(this->startSessionButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->startSessionButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN);

   lv_obj_t *labelForSessionToggleButton = lv_label_create(this->startSessionButton);
   lv_obj_set_width(labelForSessionToggleButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForSessionToggleButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForSessionToggleButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForSessionToggleButton, "Ressource verwenden");

   this->stopSessionButton = lv_button_create(this->screen);
   lv_obj_set_height(this->stopSessionButton, 50);
   lv_obj_set_width(this->stopSessionButton, lv_pct(100));
   lv_obj_set_align(this->stopSessionButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->stopSessionButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->stopSessionButton, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->stopSessionButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);

   lv_obj_t *labelForStopSessionButton = lv_label_create(this->stopSessionButton);
   lv_obj_set_width(labelForStopSessionButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForStopSessionButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForStopSessionButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForStopSessionButton, "Sitzung beenden");

   this->doorControls = lv_obj_create(this->screen);
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

   lv_obj_t *labelForUnlatchDoorButton = lv_label_create(unlatchDoorButton);
   lv_obj_set_width(labelForUnlatchDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForUnlatchDoorButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForUnlatchDoorButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForUnlatchDoorButton, "Falle oeffnen");

   this->flowButtonsContainer = lv_obj_create(this->screen);
   lv_obj_remove_style_all(this->flowButtonsContainer);
   lv_obj_set_height(this->flowButtonsContainer, 50);
   lv_obj_set_width(this->flowButtonsContainer, lv_pct(100));
   lv_obj_set_align(this->flowButtonsContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(this->flowButtonsContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->flowButtonsContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(this->flowButtonsContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(this->flowButtonsContainer, LV_OBJ_FLAG_SCROLLABLE);

   /*
   // TODO: add flow buttons
   lv_obj_t *flowButton = lv_button_create(this->flowButtonsContainer);
   lv_obj_set_height(flowButton, 50);
   lv_obj_set_width(flowButton, lv_pct(100));
   lv_obj_set_align(flowButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(flowButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(flowButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(flowButton, lv_color_hex(0x5B5B5B), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(flowButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *labelForFlowButton = lv_label_create(flowButton);
   lv_obj_set_width(labelForFlowButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForFlowButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForFlowButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForFlowButton, "Trigger a Flow");
   */
}

void ResourceDetailsScreen::setInfo(resource_type_t resourceType, String resourceName, String resourceDescription)
{
   lv_label_set_text(this->resourceName, resourceName.c_str());
   lv_label_set_text(this->resourceDescription, resourceDescription.c_str());

   lv_obj_add_flag(this->sessionDetailsContainer, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);

   switch (resourceType)
   {
   case RESOURCE_TYPE_MACHINE:
      lv_obj_remove_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN);
      lv_obj_add_flag(this->doorControls, LV_OBJ_FLAG_HIDDEN);
      break;
   case RESOURCE_TYPE_DOOR:
      lv_obj_remove_flag(this->doorControls, LV_OBJ_FLAG_HIDDEN);
      lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN);
      break;
   }
}

void ResourceDetailsScreen::setInfo(
    resource_type_t resourceType,
    String resourceName,
    String resourceDescription,
    time_t sessionStartTime,
    String currentUser)
{
   lv_label_set_text(this->sessionStartTimeLabel, timeToTimeString(sessionStartTime).c_str());
   lv_label_set_text(this->currentUser, currentUser.c_str());

   lv_obj_remove_flag(this->sessionDetailsContainer, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_flag(this->startSessionButton, LV_OBJ_FLAG_HIDDEN);

   switch (resourceType)
   {
   case RESOURCE_TYPE_MACHINE:
      lv_obj_remove_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);
      lv_obj_add_flag(this->doorControls, LV_OBJ_FLAG_HIDDEN);
      break;
   case RESOURCE_TYPE_DOOR:
      lv_obj_add_flag(this->stopSessionButton, LV_OBJ_FLAG_HIDDEN);
      lv_obj_remove_flag(this->doorControls, LV_OBJ_FLAG_HIDDEN);
      break;
   }

   this->updateElapsedTimeDisplay();
}

void ResourceDetailsScreen::updateElapsedTimeDisplay()
{
   time_t currentTime = time(nullptr);
   double elapsedTimeMs = difftime(currentTime, this->sessionStartTime);
   lv_label_set_text(this->elapsedTime, millisToTimeString(elapsedTimeMs).c_str());
}

void ResourceDetailsScreen::setSessionTimeoutTime(uint32_t sessionTimeoutTime)
{
   this->sessionTimeoutTime = sessionTimeoutTime;
   this->updateSessionTimeoutIndicator();
}

void ResourceDetailsScreen::updateSessionTimeoutIndicator()
{
   double remainingMillis = this->sessionTimeoutTime - millis();
   long remainingSeconds = remainingMillis / 1000;
   lv_bar_set_start_value(this->sessionTimeoutIndicator, remainingSeconds, LV_ANIM_ON);
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