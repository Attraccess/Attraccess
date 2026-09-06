#include "resetScreen.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>

#include "platform.hpp"

void ResetScreen::init()
{
   if (this->screen)
   {
      return;
   }

   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   DisplayTheme::applyScreen(this->screen);
   lv_obj_set_style_pad_left(this->screen, 24, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->screen, 24, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->screen, 18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(this->screen, 18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_row(this->screen, 16, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Countdown bar — full width, clearly coloured so the remaining time reads
   // at a glance.
   this->timeoutBar = lv_bar_create(this->screen);
   lv_bar_set_range(this->timeoutBar, 0, 30);
   lv_bar_set_value(this->timeoutBar, 30, LV_ANIM_OFF);
   lv_obj_set_height(this->timeoutBar, 12);
   lv_obj_set_width(this->timeoutBar, lv_pct(100));
   lv_obj_set_style_radius(this->timeoutBar, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->timeoutBar, DisplayTheme::surfaceSecondary(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->timeoutBar, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->timeoutBar, DisplayTheme::primary(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->timeoutBar, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->timeoutBar, 6, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   // Title
   lv_obj_t *title = lv_label_create(this->screen);
   lv_obj_set_width(title, lv_pct(100));
   lv_obj_set_height(title, LV_SIZE_CONTENT);
   lv_label_set_text(title, "Karte zuruecksetzen");
   lv_obj_set_style_text_align(title, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(title, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(title, &lv_font_montserrat_28, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Username — the person the card belongs to. Most prominent line.
   this->userNameLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->userNameLabel, lv_pct(100));
   lv_obj_set_height(this->userNameLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->userNameLabel, LV_LABEL_LONG_WRAP);
   const char *initialName = this->userNameCache.length() > 0 ? this->userNameCache.c_str() : "...";
   lv_label_set_text(this->userNameLabel, initialName);
   lv_obj_set_style_text_align(this->userNameLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->userNameLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->userNameLabel, &lv_font_montserrat_36, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Status line — colour + text reflect the current reset phase.
   this->statusLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->statusLabel, lv_pct(100));
   lv_obj_set_height(this->statusLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->statusLabel, LV_LABEL_LONG_WRAP);
   lv_obj_set_style_text_align(this->statusLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->statusLabel, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Cancel button — lets the user actively abort the reset.
   this->cancelButton = lv_button_create(this->screen);
   lv_obj_set_width(this->cancelButton, lv_pct(80));
   lv_obj_set_height(this->cancelButton, 56);
   lv_obj_remove_flag(this->cancelButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::secondaryButton(this->cancelButton);
   lv_obj_add_event_cb(this->cancelButton, &ResetScreen::onCancelButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *cancelLabel = lv_label_create(this->cancelButton);
   lv_obj_set_align(cancelLabel, LV_ALIGN_CENTER);
   lv_label_set_text(cancelLabel, "Abbrechen");
   lv_obj_set_style_text_color(cancelLabel, DisplayTheme::onPrimarySoft(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(cancelLabel, &lv_font_montserrat_24, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->updateTimeoutBar();
   this->applyStatus();
}

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
      text = "Karte wird zurueckgesetzt...\nbitte nicht bewegen";
      color = DisplayTheme::warning();
      break;
   case STATUS_SUCCESS:
      text = "Karte zurueckgesetzt!";
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

lv_obj_t *ResetScreen::getScreen()
{
   return this->screen;
}

void ResetScreen::setTimeoutTime(uint32_t timeoutTime)
{
   this->timeoutTime = timeoutTime;
   this->updateTimeoutBar();
}

void ResetScreen::setUserName(std::string userName)
{
   this->userNameCache = userName;
   if (this->userNameLabel)
   {
      lv_label_set_text(this->userNameLabel, userName.c_str());
   }
}

void ResetScreen::setStatus(Status status)
{
   this->status = status;
   if (status != STATUS_ERROR)
   {
      this->statusMessageOverride = "";
   }
   this->applyStatus();
}

void ResetScreen::setStatusMessage(const std::string &message)
{
   this->statusMessageOverride = message;
   this->applyStatus();
}

void ResetScreen::setOnCancelCallback(std::function<void()> callback)
{
   this->onCancelCallback = callback;
}

void ResetScreen::onCancelButtonEvent(lv_event_t *e)
{
   ResetScreen *self = static_cast<ResetScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   if (lv_event_get_code(e) != LV_EVENT_CLICKED)
   {
      return;
   }
   if (self->onCancelCallback)
   {
      self->onCancelCallback();
   }
}

std::string ResetScreen::getName()
{
   return "ResetScreen";
}

void ResetScreen::onScreenLeave()
{
}

void ResetScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
   this->timeoutBar = nullptr;
   this->userNameLabel = nullptr;
   this->statusLabel = nullptr;
   this->cancelButton = nullptr;
}
