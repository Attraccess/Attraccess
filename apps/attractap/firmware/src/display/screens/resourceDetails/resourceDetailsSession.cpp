#include "resourceDetailsScreen.hpp"
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include "platform.hpp"

void ResourceDetailsScreen::updateElapsedTimeDisplay()
{
   if (!this->sessionDetailsContainer || !this->elapsedTime)
   {
      return;
   }
   // If session details are hidden, skip updating elapsed time to avoid using an undefined start time
   if (lv_obj_has_flag(this->sessionDetailsContainer, LV_OBJ_FLAG_HIDDEN))
   {
      return;
   }
   time_t currentTime = time(nullptr);
   // difftime returns seconds; convert to milliseconds for formatter
   double elapsedSeconds = difftime(currentTime, this->sessionStartTime);
   double elapsedMillis = elapsedSeconds * 1000.0;
   // The formatted value only changes once per second; raw lv_label_set_text from
   // loop() would invalidate (re-render) the label every tick (ATT-554 item 5).
   setLabelTextIfChanged(this->elapsedTime, millisToTimeString(elapsedMillis).c_str());
}
void ResourceDetailsScreen::setSessionTimeoutTime(uint32_t value) { sessionHeader.setDeadline(value); }
void ResourceDetailsScreen::setSessionTimeoutPaused(bool value) { sessionHeader.setPaused(value); }
void ResourceDetailsScreen::extendSessionTimeoutBy(uint32_t value) { sessionHeader.extend(value); }
void ResourceDetailsScreen::updateSessionTimeoutIndicator() { sessionHeader.update(); }

void ResourceDetailsScreen::setUsageStats(const API::UsageStats &stats)
{
   if (!this->resourceCacheValid || stats.resourceId != this->resourceCache.id ||
       (stats.usageId && stats.usageId != this->resourceCache.activeUsageId)) return;
   this->usageStats = stats;
   this->usageStatsValid = stats.usageId != 0;
   this->usageStatsReceivedAt = millis();
   this->updateUsageStatsDisplay();
}

void ResourceDetailsScreen::updateUsageStatsDisplay()
{
   if (!this->usageStatsContainer) return;
   const bool visible = this->resourceCacheValid && this->resourceCache.hasActiveUsage &&
       this->resourceCache.activeUsageId && this->loginUsernameCache == this->resourceCache.activeUser;
   lv_obj_set_flag(this->usageStatsContainer, LV_OBJ_FLAG_HIDDEN, !visible);
   if (!visible) return;
   const bool fresh = this->usageStatsValid && millis() - this->usageStatsReceivedAt < 25000;
   const std::string energy = fresh && !this->usageStats.energyKwh.empty()
       ? this->usageStats.energyKwh + " kWh" : "Warte auf Messwert";
   setLabelTextIfChanged(this->energyValue, energy.c_str());
   std::string operating = "Keine Daten";
   if (fresh && this->usageStats.operatingDurationMs >= 0) {
      operating = millisToTimeString(this->usageStats.operatingDurationMs);
      if (this->usageStats.isOperating >= 0)
         operating += this->usageStats.isOperating ? " · Läuft" : " · Leerlauf";
   }
   setLabelTextIfChanged(this->operatingValue, operating.c_str());
}
