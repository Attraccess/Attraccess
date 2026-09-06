#include "supervisionScreen.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>

#include "platform.hpp"

void SupervisionScreen::init()
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
   lv_obj_set_style_pad_row(this->screen, 14, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Countdown bar — full width.
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
   lv_label_set_text(title, "Aufsicht erforderlich");
   lv_obj_set_style_text_align(title, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(title, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(title, &lv_font_montserrat_28, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Requester — the person who wants to use the resource. Most prominent line.
   this->requesterNameLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->requesterNameLabel, lv_pct(100));
   lv_obj_set_height(this->requesterNameLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->requesterNameLabel, LV_LABEL_LONG_WRAP);
   const char *initialName = this->view.requesterName.length() > 0 ? this->view.requesterName.c_str() : "...";
   lv_label_set_text(this->requesterNameLabel, initialName);
   lv_obj_set_style_text_align(this->requesterNameLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->requesterNameLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->requesterNameLabel, &lv_font_montserrat_36, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Status line — colour + text reflect the current supervision phase.
   this->statusLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->statusLabel, lv_pct(100));
   lv_obj_set_height(this->statusLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->statusLabel, LV_LABEL_LONG_WRAP);
   lv_obj_set_style_text_align(this->statusLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->statusLabel, &lv_font_montserrat_28, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Secondary hint — who may approve + the web fallback note.
   this->hintLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->hintLabel, lv_pct(100));
   lv_obj_set_height(this->hintLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->hintLabel, LV_LABEL_LONG_WRAP);
   lv_label_set_text(this->hintLabel, this->view.supervisorHint.c_str());
   lv_obj_set_style_text_align(this->hintLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->hintLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->hintLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Cancel button — lets the user abort the supervised start.
   this->cancelButton = lv_button_create(this->screen);
   lv_obj_set_width(this->cancelButton, lv_pct(80));
   lv_obj_set_height(this->cancelButton, 56);
   lv_obj_remove_flag(this->cancelButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::secondaryButton(this->cancelButton);
   // PRESSED is subscribed alongside CLICKED so the guard can judge when the press *started*: the
   // release that follows it lands arbitrarily late (see armCancelGuard()).
   lv_obj_add_event_cb(this->cancelButton, &SupervisionScreen::onCancelButtonEvent, LV_EVENT_PRESSED, this);
   lv_obj_add_event_cb(this->cancelButton, &SupervisionScreen::onCancelButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *cancelLabel = lv_label_create(this->cancelButton);
   lv_obj_set_align(cancelLabel, LV_ALIGN_CENTER);
   lv_label_set_text(cancelLabel, "Abbrechen");
   lv_obj_set_style_text_color(cancelLabel, DisplayTheme::onPrimarySoft(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(cancelLabel, &lv_font_montserrat_24, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->updateTimeoutBar();
   this->applyStatus();
}

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

lv_obj_t *SupervisionScreen::getScreen()
{
   return this->screen;
}

void SupervisionScreen::render(const View &view)
{
   this->view = view;
   this->timeoutTime = view.deadlineMs;
   if (this->hintLabel)
   {
       lv_label_set_text(this->hintLabel, this->view.supervisorHint.c_str());
   }
   if (this->requesterNameLabel)
   {
       lv_label_set_text(this->requesterNameLabel, this->view.requesterName.c_str());
   }
   this->updateTimeoutBar();
   this->applyStatus();
}

void SupervisionScreen::setOnCancelCallback(std::function<void()> callback)
{
   this->onCancelCallback = callback;
}

void SupervisionScreen::armCancelGuard()
{
   this->cancelGuardStartedMs = millis();
   // Refuse by default: LVGL can hand this button an already-in-flight press without a PRESSED
   // event of its own (a finger dragged in from the outgoing screen), and that is never a cancel.
   this->cancelPressAccepted = false;
}

void SupervisionScreen::onCancelButtonEvent(lv_event_t *e)
{
   SupervisionScreen *self = static_cast<SupervisionScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }

   if (lv_event_get_code(e) == LV_EVENT_PRESSED)
   {
      self->cancelPressAccepted = millis() - self->cancelGuardStartedMs >= CANCEL_GUARD_MS;
      return;
   }

   if (lv_event_get_code(e) != LV_EVENT_CLICKED)
   {
      return;
   }
   if (!self->cancelPressAccepted)
   {
      self->logger.debug("Ignoring cancel click from a press that began before this screen");
      return;
   }
   if (self->onCancelCallback)
   {
      self->onCancelCallback();
   }
}

std::string SupervisionScreen::getName()
{
   return "SupervisionScreen";
}

void SupervisionScreen::onScreenLeave()
{
}

void SupervisionScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
   this->timeoutBar = nullptr;
   this->requesterNameLabel = nullptr;
   this->statusLabel = nullptr;
   this->hintLabel = nullptr;
   this->cancelButton = nullptr;
}
