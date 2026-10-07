#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <string.h>
#include "resourceDetailsCopy.hpp"

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
         if (this->stopOtherUserNote)
         {
            lv_obj_set_flag(this->stopOtherUserNote, LV_OBJ_FLAG_HIDDEN, !isForeignStop);
         }
         lv_color_t stopBgColor = isForeignStop ? DisplayTheme::dangerSoft() : DisplayTheme::danger();
         DisplayTheme::button(this->stopSessionButton, stopBgColor,
                              isForeignStop ? DisplayTheme::danger() : DisplayTheme::onPrimary());
         if (this->stopSessionButtonLabel)
         {
            lv_label_set_text(this->stopSessionButtonLabel,
                              isForeignStop ? "Fremde Sitzung beenden" : "Sitzung beenden");
         }

         if (this->startSessionButtonLabel)
         {
            lv_label_set_text(this->startSessionButtonLabel,
                              isTakeover ? "Übernehmen" : "Ressource verwenden");
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
}
