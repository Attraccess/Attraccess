#include "resourceDetailsScreen.hpp"
#include "../../shared/screenChrome.hpp"
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
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   DisplayTheme::applyScreen(this->screen);
   lv_obj_set_style_pad_left(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   // The body scrolls above the device footer on the top layer, never under it.
   lv_obj_set_style_pad_bottom(this->screen, ScreenChrome::Bottom, LV_PART_MAIN | LV_STATE_DEFAULT);

   sessionHeader.create(this->screen, [this] {
      if (!this->actionInProgress && this->buttonClickCallback)
         this->buttonClickCallback({this, BUTTON_CLICK_TYPE_LOGOUT, {}});
   }, [this] {
      if (!this->actionInProgress && this->buttonClickCallback)
         this->buttonClickCallback({this, BUTTON_CLICK_TYPE_BACK, {}});
   });
   sessionHeader.setUser(this->loginUsernameCache);

   // Detail panels can exceed the display height, especially with many tutors: they scroll in the body.
   this->body = lv_obj_create(this->screen);
   lv_obj_remove_style_all(this->body);
   lv_obj_set_size(this->body, lv_pct(100), 0);
   lv_obj_set_flex_grow(this->body, 1);
   lv_obj_add_flag(this->body, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_scroll_dir(this->body, LV_DIR_VER);
   lv_obj_set_scrollbar_mode(this->body, LV_SCROLLBAR_MODE_AUTO);
   lv_obj_set_flex_flow(this->body, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->body, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   // The sections keep the screen's row gap, as when they sat on the screen itself.
   lv_obj_set_style_pad_row(this->body, lv_obj_get_style_pad_row(this->screen, LV_PART_MAIN), LV_PART_MAIN);

   this->createResourceHeader();

   this->createSessionDetails();

   this->createSessionControls();

   this->createDoorControls();

   this->createStatusPanels();

   this->applyCachedState();
   if (this->actionInProgress) this->showActionProgress(this->actionTitle);
   // Back from a screen shown over the details (status, forms, ...) while a request is still
   // pending: the input stays blocked, so the progress shows again.
   lv_obj_add_event_cb(this->screen, [](lv_event_t *event) {
      auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(event));
      if (self->actionInProgress) self->showActionProgress(self->actionTitle);
   }, LV_EVENT_SCREEN_LOAD_START, this);
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

   if (evt->buttonClickType != BUTTON_CLICK_TYPE_LOGOUT && evt->buttonClickType != BUTTON_CLICK_TYPE_BACK)
   {
      // Remember the button by role: a failure is shown on it even after a refresh rebuilt it.
      // A tap on a button in its error state is a retry: ButtonError took the error away on
      // LV_EVENT_PRESSED, which LVGL sends before this LV_EVENT_CLICKED.
      evt->self->dropActionError();
      evt->self->lastActionType = evt->buttonClickType;
      evt->self->lastActionFlowId = evt->buttonClickType == BUTTON_CLICK_TYPE_FLOW_BUTTON ? evt->flowButtonId : "";
      evt->self->lastActionRole = evt->self->roleOf(evt->buttonClickType);
   }
   evt->self->buttonClickCallback(*evt);
}
void ResourceDetailsScreen::onContainerDelete(lv_event_t *e)
{
   delete static_cast<ButtonClickEventData *>(lv_event_get_user_data(e));
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
   this->dropActionError();
}

void ResourceDetailsScreen::destroy()
{
   this->dropActionError();

   if (this->screen)
   {
      lv_obj_del(this->screen);
   }

   this->screen = nullptr;
   this->body = nullptr;
   sessionHeader.detach();
   actionOverlay.detach();
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
   this->startSessionButton = nullptr;
   this->startSessionButtonLabel = nullptr;
   this->stopSessionButton = nullptr;
   this->stopSessionButtonLabel = nullptr;
   this->stopOtherUserNote = nullptr;
   this->doorControls = nullptr;
   this->flowButtonsContainer = nullptr;
   this->elapsedTime = nullptr;
   this->usageStatsContainer = nullptr;
   this->meterValue = nullptr;
   this->operatingValue = nullptr;

   this->noIntroductionPanel = nullptr;
   this->introducersListLabel = nullptr;
   this->maintenancePanel = nullptr;
   this->maintenanceIntroducersLabel = nullptr;
   this->healthPanel = nullptr;
   this->healthReasonLabel = nullptr;
   this->lockDoorButton = nullptr;
   this->unlockDoorButton = nullptr;
   this->unlatchDoorButton = nullptr;
   this->flowButtons.clear();
}
void ResourceDetailsScreen::applyCachedState()
{
   if (!this->screen)
   {
      return;
   }

   sessionHeader.setUser(this->loginUsernameCache);

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

void ResourceDetailsScreen::setResourceAndUsageDetails(const API::ResourceBrief &resource)
{
   if (!this->resourceCacheValid || this->resourceCache.id != resource.id ||
       this->resourceCache.activeUsageId != resource.activeUsageId || !resource.hasActiveUsage)
      this->usageStatsValid = false;
   this->resourceCache = resource;
   this->resourceCacheValid = true;

   if (!this->screen || !this->resourceName || !this->resourceDescription || !this->flowButtonsContainer)
   {
      return;
   }
   FirmwareI18n::setDynamicLabel(this->resourceName, resource.name) /* i18n-data: Server-supplied resource/user/introducer name, description, health reason or flow caption; preserve exact contents. */;
   FirmwareI18n::setDynamicLabel(this->resourceDescription, resource.description.c_str()) /* i18n-data: Server-supplied resource/user/introducer name, description, health reason or flow caption; preserve exact contents. */;

   // Update introducer/maintainer panel lists (same set of allowed users)
   std::string introducersText = this->buildIntroducersText(resource);
   if (this->introducersListLabel)
   {
      if (resource.introducers.empty()) FirmwareI18n::setLabel(this->introducersListLabel, FirmwareI18n::Message::NoIntroducerAvailable);
      else FirmwareI18n::setDynamicLabel(this->introducersListLabel, introducersText.c_str()) /* i18n-data: Server-supplied resource/user/introducer name, description, health reason or flow caption; preserve exact contents. */;
   }
   if (this->maintenanceIntroducersLabel)
   {
      if (resource.introducers.empty()) FirmwareI18n::setLabel(this->maintenanceIntroducersLabel, FirmwareI18n::Message::NoIntroducerAvailable);
      else FirmwareI18n::setDynamicLabel(this->maintenanceIntroducersLabel, introducersText.c_str()) /* i18n-data: Server-supplied resource/user/introducer name, description, health reason or flow caption; preserve exact contents. */;
   }

   // Update health banner reason text
   if (this->healthReasonLabel)
   {
      if (resource.healthReason[0] != '\0')
         FirmwareI18n::setDynamicLabel(this->healthReasonLabel, resource.healthReason) /* i18n-data: Server-supplied resource/user/introducer name, description, health reason or flow caption; preserve exact contents. */;
      else
         FirmwareI18n::setLabel(this->healthReasonLabel, FirmwareI18n::Message::NoReasonProvided);
   }

   // Toggle sections based on type and usage
   resource_type_t resourceType = (resource.type == 1) ? RESOURCE_TYPE_DOOR : RESOURCE_TYPE_MACHINE;

   if (resource.hasActiveUsage)
   {
      // Persist the session start time so periodic updates can compute elapsed time correctly
      this->sessionStartTime = (time_t)resource.activeStartEpoch;
      FirmwareI18n::setDynamicLabel(this->sessionStartTimeLabel, timeToTimeString(this->sessionStartTime, resource.activeStartUtcOffsetMinutes).c_str()) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */;
      FirmwareI18n::setDynamicLabel(this->currentUser, resource.activeUser) /* i18n-data: Server-supplied resource/user/introducer name, description, health reason or flow caption; preserve exact contents. */;
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
   this->flowButtons.clear();
   for (uint8_t i = 0; i < resource.flowButtonCount; ++i)
   {
      const API::FlowButton &fb = resource.flowButtons[i];
      lv_obj_t *flowButton = lv_button_create(this->flowButtonsContainer);
      lv_obj_set_height(flowButton, 50);
      lv_obj_set_width(flowButton, lv_pct(100));
      lv_obj_set_align(flowButton, LV_ALIGN_CENTER);
      lv_obj_add_flag(flowButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
      lv_obj_remove_flag(flowButton, LV_OBJ_FLAG_SCROLLABLE);
      DisplayTheme::button(flowButton);

      ButtonClickEventData *evt = new ButtonClickEventData{this, BUTTON_CLICK_TYPE_FLOW_BUTTON, {}};
      strlcpy(evt->flowButtonId, fb.id, API::MAX_FLOW_BUTTON_ID_LEN);
      this->flowButtons.emplace_back(fb.id, flowButton);
      lv_obj_add_event_cb(flowButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, evt);
      lv_obj_add_event_cb(flowButton, &ResourceDetailsScreen::onContainerDelete, LV_EVENT_DELETE, evt);

      lv_obj_t *labelForFlowButton = lv_label_create(flowButton);
      lv_obj_set_width(labelForFlowButton, LV_SIZE_CONTENT);
      lv_obj_set_height(labelForFlowButton, LV_SIZE_CONTENT);
       lv_obj_set_align(labelForFlowButton, LV_ALIGN_CENTER);
       FirmwareI18n::setDynamicLabel(labelForFlowButton, fb.label) /* i18n-data: Server-supplied resource/user/introducer name, description, health reason or flow caption; preserve exact contents. */;
       lv_obj_set_style_text_font(labelForFlowButton, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   }


   this->updateElapsedTimeDisplay();
   this->updateUsageStatsDisplay();
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
      list = "-- kein Einweiser verfügbar --";
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
   bool isMaintainer = this->resourceCache.accessKnown ? this->resourceCache.canManageMaintenance
                                                        : user.isIntroducer || user.canManageResource;

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
      canUse = isMaintainer || ownsActiveUsage;
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
         // - foreign session: soft danger surface, warning label + amber note
         bool isForeignStop = showStop && !ownsActiveUsage;
         this->startIsTakeover = isTakeover;
         this->stopIsForeign = isForeignStop;
         if (this->stopOtherUserNote)
         {
            lv_obj_set_flag(this->stopOtherUserNote, LV_OBJ_FLAG_HIDDEN, !isForeignStop);
         }
         lv_color_t stopBgColor = isForeignStop ? DisplayTheme::dangerSoft() : DisplayTheme::danger();
         DisplayTheme::button(this->stopSessionButton, stopBgColor,
                              isForeignStop ? DisplayTheme::danger() : DisplayTheme::onPrimary());
         if (this->stopSessionButtonLabel)
         {
            FirmwareI18n::setLabel(this->stopSessionButtonLabel,
                              isForeignStop ? FirmwareI18n::Message::EndOtherUserSSession : FirmwareI18n::Message::EndSession);
         }

         if (this->startSessionButtonLabel)
         {
            FirmwareI18n::setLabel(this->startSessionButtonLabel,
                              isTakeover ? FirmwareI18n::Message::TakeOver : FirmwareI18n::Message::UseResource);
         }
         // Takeover retains its warning role; starting is a primary action.
         lv_color_t startBgColor = isTakeover ? DisplayTheme::warning() : DisplayTheme::primary();
         DisplayTheme::button(this->startSessionButton, startBgColor, DisplayTheme::onPrimary());
      }
   }

   // Flow node buttons are only relevant to the person who owns the active session.
   if (this->flowButtonsContainer)
   {
      lv_obj_set_flag(this->flowButtonsContainer, LV_OBJ_FLAG_HIDDEN, !ownsActiveUsage);
   }
   // A failure waiting for this refresh goes back on its button, if it still means the same.
   this->applyActionError();
}
