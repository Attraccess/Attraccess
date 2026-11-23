#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/durationText.hpp"
#include "../../../api/session_duration.hpp"
#include "../../../platform.hpp"

// The automatic end of the card holder's own running session (ATT-43): the remaining time with the local stop time,
// and the Extend button that opens the extension screen. Only the own session shows them; the countdown runs on
// the monotonic clock from the seconds the server sent with the list, so a reader without a clock shows it too.

void ResourceDetailsScreen::createAutoEnd()
{
   this->autoEndLabel = lv_label_create(this->sessionControls);
   lv_obj_set_width(this->autoEndLabel, lv_pct(100));
   lv_obj_set_height(this->autoEndLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->autoEndLabel, LV_LABEL_LONG_WRAP);
   lv_obj_set_style_text_font(this->autoEndLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_style_text_color(this->autoEndLabel, DisplayTheme::warning(), LV_PART_MAIN);
   lv_obj_add_flag(this->autoEndLabel, LV_OBJ_FLAG_HIDDEN);

   this->extendButton = lv_button_create(this->sessionControls);
   lv_obj_set_height(this->extendButton, 50);
   lv_obj_set_width(this->extendButton, lv_pct(100));
   lv_obj_add_flag(this->extendButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(this->extendButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::button(this->extendButton);
   lv_obj_add_flag(this->extendButton, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->extendButton, [](lv_event_t *e) {
      auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
      if (!self->actionInProgress && self->openExtendCallback) self->openExtendCallback();
   }, LV_EVENT_CLICKED, this);
   lv_obj_t *label = lv_label_create(this->extendButton);
   lv_obj_set_align(label, LV_ALIGN_CENTER);
   lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   FirmwareI18n::setLabel(label, FirmwareI18n::Message::ExtendSession);

   // Above the stop button, so the countdown and Extend sit with the other controls of the running session.
   const uint32_t stopIndex = lv_obj_get_index(this->stopSessionButton);
   lv_obj_move_to_index(this->autoEndLabel, stopIndex);
   lv_obj_move_to_index(this->extendButton, stopIndex + 1);
}

void ResourceDetailsScreen::updateAutoEnd()
{
   if (!this->autoEndLabel || !this->extendButton) return;
   const bool visible = this->resourceCacheValid && this->resourceCache.type == 0 && this->resourceCache.hasAutoEnd &&
                        this->resourceCache.hasActiveUsage && this->ownsActiveUsage();
   lv_obj_set_flag(this->autoEndLabel, LV_OBJ_FLAG_HIDDEN, !visible);
   lv_obj_set_flag(this->extendButton, LV_OBJ_FLAG_HIDDEN, !visible);
   if (!visible) { this->autoEndShownSeconds = UINT32_MAX; return; }
   const uint32_t remaining = SessionDuration::remainingSeconds(
      this->resourceCache.autoEndInSeconds, this->resourceCache.autoEndReceivedMs, millis());
   if (remaining == this->autoEndShownSeconds) return;
   this->autoEndShownSeconds = remaining;
   const std::string clock = SessionDuration::clockString(this->resourceCache.autoEndEpoch, this->resourceCache.autoEndUtcOffsetMinutes);
   const FirmwareI18n::Text left = FirmwareI18n::Text::literal(DurationText::countdown(remaining)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */;
   setLabelTextIfChanged(this->autoEndLabel, clock.empty()
      ? FirmwareI18n::Text::format(FirmwareI18n::Message::AutoEndLine, {left})
      : FirmwareI18n::Text::format(FirmwareI18n::Message::AutoEndLineAt, {left, FirmwareI18n::Text::literal(clock) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */}));
}
