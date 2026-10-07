#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <string.h>
#include "resourceDetailsCopy.hpp"

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
   lv_label_set_text(this->resourceName, resource.name);
   lv_label_set_text(this->resourceDescription, resource.description.c_str());

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
      DisplayTheme::button(flowButton);

      ButtonClickEventData *evt = new ButtonClickEventData{this, BUTTON_CLICK_TYPE_FLOW_BUTTON, {}};
      strlcpy(evt->flowButtonId, fb.id, API::MAX_FLOW_BUTTON_ID_LEN);
      lv_obj_add_event_cb(flowButton, &ResourceDetailsScreen::onButtonClick, LV_EVENT_CLICKED, evt);
      lv_obj_add_event_cb(flowButton, &ResourceDetailsScreen::onContainerDelete, LV_EVENT_DELETE, evt);

      lv_obj_t *labelForFlowButton = lv_label_create(flowButton);
      lv_obj_set_width(labelForFlowButton, LV_SIZE_CONTENT);
      lv_obj_set_height(labelForFlowButton, LV_SIZE_CONTENT);
       lv_obj_set_align(labelForFlowButton, LV_ALIGN_CENTER);
       lv_label_set_text(labelForFlowButton, fb.label);
       lv_obj_set_style_text_font(labelForFlowButton, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   this->updateElapsedTimeDisplay();
   this->updateUsageStatsDisplay();
   this->refreshAccessState();
}
