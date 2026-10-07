#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <string.h>

#include "resourceDetailsCopy.hpp"

void ResourceDetailsScreen::init()
{
   if (this->screen)
   {
      return;
   }
   this->screen = lv_obj_create(NULL);
   // Detail panels can exceed the display height, especially with many tutors.
   lv_obj_add_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_scroll_dir(this->screen, LV_DIR_VER);
   lv_obj_set_scrollbar_mode(this->screen, LV_SCROLLBAR_MODE_AUTO);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   DisplayTheme::applyScreen(this->screen);
   lv_obj_set_style_pad_left(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   sessionHeader.create(this->screen, [this] {
      if (!this->actionInProgress && this->buttonClickCallback)
         this->buttonClickCallback({this, BUTTON_CLICK_TYPE_LOGOUT, {}});
   }, [this] {
      if (!this->actionInProgress && this->buttonClickCallback)
         this->buttonClickCallback({this, BUTTON_CLICK_TYPE_BACK, {}});
   });
   sessionHeader.setUser(this->loginUsernameCache);

   this->createResourceHeader();

   this->createSessionDetails();

   this->createSessionControls();

   this->createDoorControls();

   this->createStatusPanels();

   this->applyCachedState();
   if (this->actionInProgress) this->showActionProgress(this->actionTitle.c_str());
}
void ResourceDetailsScreen::loop()
{
   this->updateUsageStatsDisplay();
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
   if (evt && evt->self && lv_event_get_target(e) == evt->self->activeActionButton)
   {
      // Flow buttons are rebuilt during resource refreshes while their request may still be pending.
      evt->self->activeActionButton = nullptr;
      evt->self->activeActionLabel = nullptr;
      evt->self->activeActionSpinner = nullptr;
   }
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

   sessionHeader.setUser(userDetails.username);

   this->refreshAccessState();
   this->updateUsageStatsDisplay();
}
void ResourceDetailsScreen::onScreenLeave()
{
   this->hideActionProgressVisual();
   if (this->successToast)
   {
      lv_obj_add_flag(this->successToast, LV_OBJ_FLAG_HIDDEN);
   }
   this->hideProjectsModal();
}
