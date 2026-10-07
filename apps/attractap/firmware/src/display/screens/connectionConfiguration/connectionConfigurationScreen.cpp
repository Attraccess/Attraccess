#include "connectionConfigurationScreen.hpp"
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include <string>

// Screen construction (tabs/widgets) and lifecycle. Behaviour-specific logic
// lives in sibling translation units:
//   _wifi.cpp      WiFi scan + network dropdown
//   _keyboard.cpp  on-screen keyboard + text-area focus
//   _save.cpp      save widgets, validation, save flow
//   _pinlock.cpp   PIN-lock overlay + callbacks

void ConnectionConfigurationScreen::init()
{
   if (this->screen)
   {
      return;
   }

   NetworkConfig networkConfig = Settings::getNetworkConfig();
   AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();
   DeviceConfig deviceConfig = Settings::getDeviceConfig();

   this->screen = lv_obj_create(NULL);
   DisplayTheme::applyScreen(this->screen);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN_WRAP);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   this->tabs = lv_tabview_create(this->screen);
   lv_tabview_set_tab_bar_size(this->tabs, 50);
   lv_obj_set_width(this->tabs, lv_pct(100));
   lv_obj_set_height(this->tabs, lv_pct(100));
   lv_obj_set_align(this->tabs, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->tabs, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::applyScreen(this->tabs);

   this->createWifiTab(networkConfig);

   this->createApiTab(apiConfig);

   this->createDeviceTab(deviceConfig);

   this->pinLockOverlay = this->pinInputPage.init("Entsperren mit PIN", this->screen);
   lv_obj_add_flag(this->pinLockOverlay, LV_OBJ_FLAG_IGNORE_LAYOUT);
   lv_obj_set_style_arc_width(this->pinLockOverlay, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_height(this->pinLockOverlay, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_align(this->pinLockOverlay, LV_ALIGN_CENTER);
   lv_obj_set_width(this->pinLockOverlay, lv_pct(100));
   lv_obj_set_height(this->pinLockOverlay, lv_pct(100));
   lv_obj_set_x(this->pinLockOverlay, 0);
   lv_obj_set_y(this->pinLockOverlay, 0);

   if (!this->pinLockEnabled)
   {
      lv_obj_add_flag(this->pinLockOverlay, LV_OBJ_FLAG_HIDDEN);
   }
}

lv_obj_t *ConnectionConfigurationScreen::getScreen()
{
   return this->screen;
}

std::string ConnectionConfigurationScreen::getName()
{
   return "ConnectionConfigurationScreen";
}

void ConnectionConfigurationScreen::onScreenLeave()
{
#ifdef HAS_POWER_BUTTON
   PowerOffButton::hideConfirm();
#endif
}

void ConnectionConfigurationScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
   this->pinLockOverlay = nullptr;
   this->tabs = nullptr;
   this->keyboard = nullptr;
   this->wifiSSID = nullptr;
   this->wifiPassword = nullptr;
   this->wifiSelectNetwork = nullptr;
   this->serverHostname = nullptr;
   this->labelForWifiSSID = nullptr;
   this->labelForWifiPassword = nullptr;
   this->labelForServerHostname = nullptr;
   this->useSSLSwitch = nullptr;
   this->labelForUseSSLSwitch = nullptr;
   this->resetCertButton = nullptr;
   this->resetCertLabel = nullptr;
   this->devicePin = nullptr;
   this->labelForDevicePin = nullptr;
   this->beeperEnabled = nullptr;
   this->wifiScanRequested = false;
   this->wifiScanCompleted = false;
   this->wifiDropdownHasNetworks = false;
   this->wifiScanStartMs = 0;
}
