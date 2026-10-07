#include "supervisionScreen.hpp"
#include "display/theme.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include "platform.hpp"

void SupervisionScreen::loop()
{
   this->updateTimeoutBar();
}

void SupervisionScreen::updateTimeoutBar()
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

void SupervisionScreen::applyStatus()
{
   if (!this->statusLabel)
   {
      return;
   }

   const char *text = "";
   lv_color_t color = DisplayTheme::text();
   switch (this->view.status)
   {
   case STATUS_WAITING:
      text = "Aufsichts-Karte auflegen";
      color = DisplayTheme::text();
      break;
   case STATUS_VERIFYING:
      text = "Karte gelesen...\nbitte nicht bewegen";
      color = DisplayTheme::warning();
      break;
   case STATUS_SUCCESS:
      text = "Freigegeben!";
      color = DisplayTheme::success();
      break;
   case STATUS_ERROR:
      text = this->view.statusMessage.length() > 0 ? this->view.statusMessage.c_str() : "Fehler";
      color = DisplayTheme::danger();
      break;
   }

   lv_label_set_text(this->statusLabel, text);
   lv_obj_set_style_text_color(this->statusLabel, color, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Hide the cancel button once approved — nothing left to cancel.
   if (this->cancelButton)
   {
      if (this->view.status == STATUS_SUCCESS)
      {
         lv_obj_add_flag(this->cancelButton, LV_OBJ_FLAG_HIDDEN);
      }
      else
      {
         lv_obj_remove_flag(this->cancelButton, LV_OBJ_FLAG_HIDDEN);
      }
   }
}
