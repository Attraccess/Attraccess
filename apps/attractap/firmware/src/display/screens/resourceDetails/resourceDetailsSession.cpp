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
   if (!this->sessionTimeoutIndicator)
   {
      return;
   }
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
