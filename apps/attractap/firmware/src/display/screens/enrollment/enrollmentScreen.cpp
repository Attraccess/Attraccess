#include "enrollmentScreen.hpp"

// Palette — dark, neutral background with explicit high-contrast white text.
// The previous design left label text colour unset (defaulting to near-black)
// on a dark purple background, which is the "bad contrast / hard to read"
// complaint in ATT-503.
#define ENROLL_COLOR_BG 0x14142A
#define ENROLL_COLOR_TEXT 0xFFFFFF
#define ENROLL_COLOR_TITLE 0xB9B9D6
#define ENROLL_COLOR_ACCENT 0x7C4DFF
#define ENROLL_COLOR_BAR_BG 0x2A2A40
#define ENROLL_COLOR_WAITING 0xE6E6F0
#define ENROLL_COLOR_WRITING 0xFFC107
#define ENROLL_COLOR_SUCCESS 0x4CD964
#define ENROLL_COLOR_ERROR 0xFF5252
#define ENROLL_COLOR_CANCEL_BG 0x3A3A57

void EnrollmentScreen::init()
{
   if (this->screen)
   {
      return;
   }

   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_bg_color(this->screen, lv_color_hex(ENROLL_COLOR_BG), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->screen, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
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
   lv_obj_set_style_bg_color(this->timeoutBar, lv_color_hex(ENROLL_COLOR_BAR_BG), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->timeoutBar, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->timeoutBar, lv_color_hex(ENROLL_COLOR_ACCENT), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->timeoutBar, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->timeoutBar, 6, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   // Title
   lv_obj_t *title = lv_label_create(this->screen);
   lv_obj_set_width(title, lv_pct(100));
   lv_obj_set_height(title, LV_SIZE_CONTENT);
   lv_label_set_text(title, "Neue Karte registrieren");
   lv_obj_set_style_text_align(title, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(title, lv_color_hex(ENROLL_COLOR_TITLE), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(title, &lv_font_montserrat_28, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Username — the person the card is being enrolled for. Most prominent line.
   this->userNameLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->userNameLabel, lv_pct(100));
   lv_obj_set_height(this->userNameLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->userNameLabel, LV_LABEL_LONG_WRAP);
   const char *initialName = this->userNameCache.length() > 0 ? this->userNameCache.c_str() : "...";
   lv_label_set_text(this->userNameLabel, initialName);
   lv_obj_set_style_text_align(this->userNameLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->userNameLabel, lv_color_hex(ENROLL_COLOR_TEXT), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->userNameLabel, &lv_font_montserrat_36, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Status line — colour + text reflect the current enrollment phase.
   this->statusLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->statusLabel, lv_pct(100));
   lv_obj_set_height(this->statusLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->statusLabel, LV_LABEL_LONG_WRAP);
   lv_obj_set_style_text_align(this->statusLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->statusLabel, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Cancel button — lets the user actively abort enrollment (ATT-503).
   this->cancelButton = lv_button_create(this->screen);
   lv_obj_set_width(this->cancelButton, lv_pct(80));
   lv_obj_set_height(this->cancelButton, 56);
   lv_obj_remove_flag(this->cancelButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->cancelButton, lv_color_hex(ENROLL_COLOR_CANCEL_BG), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->cancelButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->cancelButton, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(this->cancelButton, &EnrollmentScreen::onCancelButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *cancelLabel = lv_label_create(this->cancelButton);
   lv_obj_set_align(cancelLabel, LV_ALIGN_CENTER);
   lv_label_set_text(cancelLabel, "Abbrechen");
   lv_obj_set_style_text_color(cancelLabel, lv_color_hex(ENROLL_COLOR_TEXT), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(cancelLabel, &lv_font_montserrat_24, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->updateTimeoutBar();
   this->applyStatus();
}

void EnrollmentScreen::loop()
{
   this->updateTimeoutBar();
}

void EnrollmentScreen::updateTimeoutBar()
{
   if (!this->timeoutBar)
   {
      return;
   }
   uint32_t now = millis();
   int32_t remainingSeconds = 0;
   if (this->enrollmentTimeoutTime > now)
   {
      remainingSeconds = (int32_t)((this->enrollmentTimeoutTime - now) / 1000);
   }
   if (remainingSeconds > 30)
   {
      remainingSeconds = 30;
   }
   lv_bar_set_value(this->timeoutBar, remainingSeconds, LV_ANIM_ON);
}

void EnrollmentScreen::applyStatus()
{
   if (!this->statusLabel)
   {
      return;
   }

   const char *text = "";
   uint32_t color = ENROLL_COLOR_WAITING;
   switch (this->status)
   {
   case STATUS_WAITING:
      text = "Karte an den Leser halten";
      color = ENROLL_COLOR_WAITING;
      break;
   case STATUS_WRITING:
      text = "Karte wird beschrieben...\nbitte nicht bewegen";
      color = ENROLL_COLOR_WRITING;
      break;
   case STATUS_SUCCESS:
      text = "Karte registriert!";
      color = ENROLL_COLOR_SUCCESS;
      break;
   case STATUS_ERROR:
      text = this->statusMessageOverride.length() > 0 ? this->statusMessageOverride.c_str() : "Fehler";
      color = ENROLL_COLOR_ERROR;
      break;
   }

   lv_label_set_text(this->statusLabel, text);
   lv_obj_set_style_text_color(this->statusLabel, lv_color_hex(color), LV_PART_MAIN | LV_STATE_DEFAULT);

   // Hide the cancel button once enrollment has succeeded — nothing left to
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

lv_obj_t *EnrollmentScreen::getScreen()
{
   return this->screen;
}

void EnrollmentScreen::setEnrollmentTimeoutTime(uint32_t enrollmentTimeoutTime)
{
   this->enrollmentTimeoutTime = enrollmentTimeoutTime;
   this->updateTimeoutBar();
}

void EnrollmentScreen::setUserName(String userName)
{
   this->userNameCache = userName;
   if (this->userNameLabel)
   {
      lv_label_set_text(this->userNameLabel, userName.c_str());
   }
}

void EnrollmentScreen::setStatus(Status status)
{
   this->status = status;
   if (status != STATUS_ERROR)
   {
      this->statusMessageOverride = "";
   }
   this->applyStatus();
}

void EnrollmentScreen::setStatusMessage(const String &message)
{
   this->statusMessageOverride = message;
   this->applyStatus();
}

void EnrollmentScreen::setOnCancelCallback(std::function<void()> callback)
{
   this->onCancelCallback = callback;
}

void EnrollmentScreen::onCancelButtonEvent(lv_event_t *e)
{
   EnrollmentScreen *self = static_cast<EnrollmentScreen *>(lv_event_get_user_data(e));
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

String EnrollmentScreen::getName()
{
   return "EnrollmentScreen";
}

void EnrollmentScreen::onScreenLeave()
{
}

void EnrollmentScreen::destroy()
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
