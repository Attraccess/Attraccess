#include "connectionConfigurationScreen.hpp"

// PIN-lock overlay: unlock flow and its callbacks.

void ConnectionConfigurationScreen::disablePinLock()
{
   this->pinLockEnabled = false;
   if (!this->pinLockOverlay)
      return;
   lv_obj_add_flag(this->pinLockOverlay, LV_OBJ_FLAG_HIDDEN);
}

void ConnectionConfigurationScreen::enablePinLock()
{
   this->pinLockEnabled = true;
   if (!this->pinLockOverlay)
      return;
   lv_obj_clear_flag(this->pinLockOverlay, LV_OBJ_FLAG_HIDDEN);
}

bool ConnectionConfigurationScreen::onPinLockConfirmCallback(String pin)
{
   String devicePin = Settings::getDeviceConfig().passCode;
   bool matches = pin == devicePin;

   if (!matches)
   {
      // delay to slow down brute force attacks
      delay(5000);
      return false;
   }

   this->disablePinLock();
   return true;
}

void ConnectionConfigurationScreen::setOnCancelPinLockCallback(std::function<void()> onCancelPinLockCallback)
{
   this->onCancelPinLockCallback = onCancelPinLockCallback;
}
