#include "display/i18n.hpp"
#include "resourceDetailsScreen.hpp"
#include "../../../platform.hpp"
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

void ResourceDetailsScreen::showActionProgress(const FirmwareI18n::Text &title)
{
   this->actionInProgress = true;
   this->dropActionError();
   this->actionTitle = title.empty() ? FirmwareI18n::Text(FirmwareI18n::Message::PleaseWait) : title;
   actionOverlay.show(this->screen, this->actionTitle, FirmwareI18n::Text::literal(this->resourceCacheValid ? this->resourceCache.name : "") /* i18n-data: Server-supplied resource name in the action overlay; preserve exact contents. */);
}
void ResourceDetailsScreen::hideActionProgress()
{
   actionOverlay.hide();
   this->actionInProgress = false;
   this->applyActionError();
}
void ResourceDetailsScreen::hideActionProgressVisual() { actionOverlay.hide(); }

namespace
{
   bool shown(lv_obj_t *object)
   {
      for (; object; object = lv_obj_get_parent(object))
         if (lv_obj_has_flag(object, LV_OBJ_FLAG_HIDDEN)) return false;
      return true;
   }
}

lv_obj_t *ResourceDetailsScreen::buttonFor(button_click_type_t type, const std::string &flowId) const
{
   lv_obj_t *button = nullptr;
   switch (type)
   {
   case BUTTON_CLICK_TYPE_START_SESSION: button = this->startSessionButton; break;
   case BUTTON_CLICK_TYPE_STOP_SESSION: button = this->stopSessionButton; break;
   case BUTTON_CLICK_TYPE_LOCK_DOOR: button = this->lockDoorButton; break;
   case BUTTON_CLICK_TYPE_UNLOCK_DOOR: button = this->unlockDoorButton; break;
   case BUTTON_CLICK_TYPE_UNLATCH_DOOR: button = this->unlatchDoorButton; break;
   case BUTTON_CLICK_TYPE_FLOW_BUTTON:
      for (const auto &flow : this->flowButtons)
         if (flow.first == flowId) button = flow.second;
      break;
   default: break;
   }
   return button && shown(button) ? button : nullptr;
}

// What the button means right now: a start that became a takeover, or a stop that now ends
// another user's session (or a different session than before), is not the button that failed.
std::string ResourceDetailsScreen::roleOf(button_click_type_t type) const
{
   const bool takeOver = type == BUTTON_CLICK_TYPE_START_SESSION && this->startIsTakeover;
   const bool foreignStop = type == BUTTON_CLICK_TYPE_STOP_SESSION && this->stopIsForeign;
   if (!takeOver && !foreignStop) return type == BUTTON_CLICK_TYPE_STOP_SESSION ? "stop" : "";
   return std::string(takeOver ? "take over " : "stop other ") + this->resourceCache.activeUser + " #" +
          std::to_string(this->resourceCache.activeUsageId);
}

bool ResourceDetailsScreen::showActionError(const FirmwareI18n::Text &text)
{
   if (!this->screen || !this->buttonFor(this->lastActionType, this->lastActionFlowId))
   {
      return false;
   }
   this->actionErrorPending = true;
   this->actionErrorText = text;
   this->actionErrorDeadline = 0;
   this->applyActionError();
   return true;
}

void ResourceDetailsScreen::applyActionError()
{
   if (!this->actionErrorPending || !this->screen || this->actionInProgress)
   {
      return; // Nothing to show, or the status refresh still covers the screen.
   }
   lv_obj_t *button = this->buttonFor(this->lastActionType, this->lastActionFlowId);
   if (!button || this->roleOf(this->lastActionType) != this->lastActionRole)
   {
      this->dropActionError();
      return;
   }
   const uint32_t now = millis();
   if (!this->actionErrorDeadline)
   {
      this->actionErrorDeadline = now + ButtonError::DurationMs;
   }
   const int32_t remaining = static_cast<int32_t>(this->actionErrorDeadline - now);
   if (remaining <= 0)
   {
      this->dropActionError();
      return;
   }
   if (this->actionError.target() == button)
   {
      return;
   }
   this->actionError.show(button, this->actionErrorText, static_cast<uint32_t>(remaining), [this] {
      // Pressed: the click that follows is the retry.
      this->actionErrorPending = false;
   });
}

void ResourceDetailsScreen::dropActionError()
{
   this->actionErrorPending = false;
   this->actionErrorDeadline = 0;
   this->actionError.clear();
}
