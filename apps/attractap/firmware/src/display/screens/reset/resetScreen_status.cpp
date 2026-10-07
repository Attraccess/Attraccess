#include "resetScreen.hpp"
#include "display/theme.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include "platform.hpp"

void ResetScreen::loop()
{
   this->updateTimeoutBar();
}

void ResetScreen::updateTimeoutBar()
{
   if (!this->timeoutBar)
   {
      return;
   }
   uint32_t now = millis();
   int32_t remainingSeconds = 0;
   if (this->timeoutTime > now)
   {
      remainingSeconds = (int32_t)((this->timeoutTime - now) / 1000);
   }
   if (remainingSeconds > 30)
   {
      remainingSeconds = 30;
   }
   lv_bar_set_value(this->timeoutBar, remainingSeconds, LV_ANIM_ON);
}

void ResetScreen::applyStatus()
{
   if (!this->statusLabel)
   {
      return;
   }

   const char *text = "";
   lv_color_t color = DisplayTheme::text();
   switch (this->status)
   {
   case STATUS_WAITING:
      text = "Karte an den Leser halten";
      color = DisplayTheme::text();
      break;
   case STATUS_WRITING:
      text = "Karte wird zurückgesetzt...\nbitte nicht bewegen";
      color = DisplayTheme::warning();
      break;
   case STATUS_SUCCESS:
      text = "Karte zurückgesetzt!";
      color = DisplayTheme::success();
      break;
   case STATUS_ERROR:
      text = this->statusMessageOverride.length() > 0 ? this->statusMessageOverride.c_str() : "Fehler";
      color = DisplayTheme::danger();
      break;
   }

   lv_label_set_text(this->statusLabel, text);
   lv_obj_set_style_text_color(this->statusLabel, color, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Hide the cancel button once the reset has succeeded — nothing left to
   // cancel, and it auto-dismisses shortly after.
   if (this->cancelButton)
   {
      if (this->status == STATUS_SUCCESS)
      {
         lv_obj_add_flag(this->cancelButton, LV_OBJ_FLAG_HIDDEN);
      }
      else
      {
         lv_obj_remove_flag(this->cancelButton, LV_OBJ_FLAG_HIDDEN);
      }
   }
}
