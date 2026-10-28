#include "display/i18n.hpp"
#include "massIntroductionScreen.hpp"
#include "../../theme.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <cstdio>
#include <string>
#include <functional>

#include "../../../platform.hpp"

namespace
{
lv_obj_t *createWrappedLabel(lv_obj_t *parent, const lv_font_t *font, lv_color_t color)
{
   lv_obj_t *label = lv_label_create(parent);
   lv_obj_set_width(label, lv_pct(100));
   lv_obj_set_height(label, LV_SIZE_CONTENT);
   lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
   lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(label, color, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(label, font, LV_PART_MAIN | LV_STATE_DEFAULT);
   return label;
}
}

void MassIntroductionScreen::init()
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
   lv_obj_set_style_pad_row(this->screen, 12, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Countdown bar — full width, scaled to the whole session.
   this->timeoutBar = lv_bar_create(this->screen);
   lv_obj_set_height(this->timeoutBar, 12);
   lv_obj_set_width(this->timeoutBar, lv_pct(100));
   lv_obj_set_style_radius(this->timeoutBar, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->timeoutBar, DisplayTheme::surfaceSecondary(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->timeoutBar, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->timeoutBar, DisplayTheme::primary(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->timeoutBar, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->timeoutBar, 6, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   this->titleLabel = createWrappedLabel(this->screen, &attractap_font_montserrat_latin1_28, DisplayTheme::muted());
   FirmwareI18n::setLabel(this->titleLabel, FirmwareI18n::Message::MassIntroduction);

   // Target resource or group — what everyone gets introduced to. Most prominent line.
   this->targetNameLabel = createWrappedLabel(this->screen, &attractap_font_montserrat_latin1_36, DisplayTheme::text());

   // "N introduced · m:ss left"
   this->progressLabel = createWrappedLabel(this->screen, &attractap_font_montserrat_latin1_18, DisplayTheme::muted());

   // Status line — colour + text reflect the current card.
   this->statusLabel = createWrappedLabel(this->screen, &attractap_font_montserrat_latin1_28, DisplayTheme::text());

   this->hintLabel = createWrappedLabel(this->screen, &attractap_font_montserrat_latin1_18, DisplayTheme::muted());

   // Cancel only takes this reader out of the session; the web QR code keeps working.
   this->cancelButton = lv_button_create(this->screen);
   lv_obj_set_width(this->cancelButton, lv_pct(80));
   lv_obj_set_height(this->cancelButton, 56);
   lv_obj_remove_flag(this->cancelButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::secondaryButton(this->cancelButton);
   lv_obj_add_event_cb(this->cancelButton, &MassIntroductionScreen::onCancelButtonEvent, LV_EVENT_PRESSED, this);
   lv_obj_add_event_cb(this->cancelButton, &MassIntroductionScreen::onCancelButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *cancelLabel = lv_label_create(this->cancelButton);
   lv_obj_set_align(cancelLabel, LV_ALIGN_CENTER);
   FirmwareI18n::setLabel(cancelLabel, FirmwareI18n::Message::Cancel);
   lv_obj_set_style_text_color(cancelLabel, DisplayTheme::onPrimarySoft(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(cancelLabel, &lv_font_montserrat_24, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->render(this->view);
}

lv_obj_t *MassIntroductionScreen::getScreen()
{
   return this->screen;
}

void MassIntroductionScreen::render(const View &view)
{
   this->view = view;
   if (!this->screen)
   {
      return;
   }
   const char *target = this->view.targetName.empty() ? "..." : this->view.targetName.c_str();
   FirmwareI18n::setDynamicLabel(this->targetNameLabel, target) /* i18n-data: Supplied resource or resource-group name (including the neutral empty-name display); preserve exact contents. */;
   FirmwareI18n::Text hint = FirmwareI18n::Message::TapYourCardToGetIntroduced;
   if (!this->view.introducerName.empty())
   {
      hint = FirmwareI18n::Text::format(FirmwareI18n::Message::Breadcrumb, {
         hint, FirmwareI18n::Text::format(FirmwareI18n::Message::MassIntroductionIntroducer,
                                          {FirmwareI18n::Text::literal(this->view.introducerName) /* i18n-data: Server-supplied introducer username; preserve exact contents. */})});
   }
   FirmwareI18n::setLabel(this->hintLabel, hint);
   const uint32_t durationSeconds = this->view.durationMs / 1000;
   lv_bar_set_range(this->timeoutBar, 0, durationSeconds > 0 ? (int32_t)durationSeconds : 1);
   this->updateCountdown(true);
   this->applyStatus();
}

void MassIntroductionScreen::setOnCancelCallback(std::function<void()> callback)
{
   this->onCancelCallback = callback;
}

void MassIntroductionScreen::armCancelGuard()
{
   this->cancelGuardStartedMs = millis();
   this->cancelPressAccepted = false;
}

void MassIntroductionScreen::onCancelButtonEvent(lv_event_t *e)
{
   MassIntroductionScreen *self = static_cast<MassIntroductionScreen *>(lv_event_get_user_data(e));
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

std::string MassIntroductionScreen::getName()
{
   return "MassIntroductionScreen";
}

void MassIntroductionScreen::onScreenLeave()
{
}

void MassIntroductionScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
   this->timeoutBar = nullptr;
   this->titleLabel = nullptr;
   this->targetNameLabel = nullptr;
   this->progressLabel = nullptr;
   this->statusLabel = nullptr;
   this->hintLabel = nullptr;
   this->cancelButton = nullptr;
}

void MassIntroductionScreen::loop()
{
   this->updateCountdown(false);
}

void MassIntroductionScreen::updateCountdown(bool force)
{
   if (!this->timeoutBar || !this->progressLabel)
   {
      return;
   }
   const uint32_t now = millis();
   int32_t remainingSeconds = 0;
   if (static_cast<int32_t>(this->view.deadlineMs - now) > 0)
   {
      // Round up so the display reaches 0:00 exactly when the session expires.
      remainingSeconds = (int32_t)((this->view.deadlineMs - now + 999) / 1000);
   }
   if (!force && remainingSeconds == this->shownRemainingSeconds &&
       this->view.participantCount == this->shownParticipantCount)
   {
      return;
   }
   this->shownRemainingSeconds = remainingSeconds;
   this->shownParticipantCount = this->view.participantCount;
   lv_bar_set_value(this->timeoutBar, remainingSeconds, LV_ANIM_OFF);

   char remaining[16];
   snprintf(remaining, sizeof(remaining), "%u:%02u", (unsigned)(remainingSeconds / 60), (unsigned)(remainingSeconds % 60));
   FirmwareI18n::setLabel(this->progressLabel, FirmwareI18n::Text::format(FirmwareI18n::Message::MassIntroductionProgress, {
      FirmwareI18n::Text::literal(std::to_string(this->view.participantCount)) /* i18n-data: Language-neutral participant count. */,
      FirmwareI18n::Text::literal(remaining) /* i18n-data: Language-neutral m:ss countdown. */}));
}

void MassIntroductionScreen::applyStatus()
{
   if (!this->statusLabel)
   {
      return;
   }

   const FirmwareI18n::Text participant = FirmwareI18n::Text::literal(this->view.participantName) /* i18n-data: Server-supplied participant username; preserve exact contents. */;
   FirmwareI18n::Text text;
   lv_color_t color = DisplayTheme::text();
   switch (this->view.status)
   {
   case STATUS_WAITING:
      text = FirmwareI18n::Message::MassIntroductionReady;
      color = DisplayTheme::text();
      break;
   case STATUS_VERIFYING:
      text = FirmwareI18n::Message::CardReadPleaseKeepItStill;
      color = DisplayTheme::warning();
      break;
   case STATUS_INTRODUCED:
      text = FirmwareI18n::Text::format(FirmwareI18n::Message::MassIntroductionIntroduced, {participant});
      color = DisplayTheme::success();
      break;
   case STATUS_ALREADY_INTRODUCED:
      text = FirmwareI18n::Text::format(FirmwareI18n::Message::MassIntroductionAlreadyIntroduced, {participant});
      color = DisplayTheme::primary();
      break;
   case STATUS_ERROR:
      text = !this->view.statusMessage.empty() ? this->view.statusMessage : FirmwareI18n::Text(FirmwareI18n::Message::Error);
      color = DisplayTheme::danger();
      break;
   }

   FirmwareI18n::setLabel(this->statusLabel, text);
   lv_obj_set_style_text_color(this->statusLabel, color, LV_PART_MAIN | LV_STATE_DEFAULT);
}
