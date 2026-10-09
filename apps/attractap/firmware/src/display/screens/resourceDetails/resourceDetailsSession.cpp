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
   setDynamicLabelTextIfChanged(this->elapsedTime, millisToTimeString(elapsedMillis).c_str());
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
   FirmwareI18n::Text consumption;
   if (fresh) {
      for (const auto &meter : this->usageStats.meters) {
         const auto reading = meter.value.empty() ? FirmwareI18n::Text(FirmwareI18n::Message::WaitForReading) : FirmwareI18n::Text::literal(meter.value);
         const auto rate = meter.creditsPerUnit >= 0 && !meter.formattedRate.empty()
            ? FirmwareI18n::Text::format(FirmwareI18n::Message::MeterRate, {FirmwareI18n::Text::literal(meter.formattedRate)}) : FirmwareI18n::Text();
         const auto line = FirmwareI18n::Text::format(FirmwareI18n::Message::MeterReading, {FirmwareI18n::Text::literal(meter.name), reading, rate});
         consumption = consumption.empty() ? line : FirmwareI18n::Text::format(FirmwareI18n::Message::Lines, {consumption, line});
      }
   }
   if (consumption.empty()) consumption = FirmwareI18n::Message::WaitForReading;
   setLabelTextIfChanged(this->meterValue, consumption);
   FirmwareI18n::Text operating = FirmwareI18n::Message::NoData;
   if (fresh && this->usageStats.operatingDurationMs >= 0) {
      operating = FirmwareI18n::Text::literal(millisToTimeString(this->usageStats.operatingDurationMs));
      if (this->usageStats.isOperating >= 0)
         operating = FirmwareI18n::Text::format(FirmwareI18n::Message::OperatingState, {operating, this->usageStats.isOperating ? FirmwareI18n::Message::Running : FirmwareI18n::Message::Idle});
   }
   setLabelTextIfChanged(this->operatingValue, operating);
}
