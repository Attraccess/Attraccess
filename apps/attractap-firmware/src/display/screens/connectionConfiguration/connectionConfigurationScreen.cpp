#include "connectionConfigurationScreen.hpp"
#include <cstring>
#include "../../../network/wifi/wifi.hpp"

static const char *WIFI_DROPDOWN_LOADING = "Suche WLANs...";
static const char *WIFI_DROPDOWN_EMPTY = "Keine Netzwerke gefunden";
static const char *WIFI_DROPDOWN_SCAN_FAILED = "WLAN Scan fehlgeschlagen";
static const uint32_t WIFI_SCAN_TIMEOUT_MS = 10000;

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
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN_WRAP);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   this->tabs = lv_tabview_create(this->screen);
   lv_tabview_set_tab_bar_size(this->tabs, 50);
   lv_obj_set_width(this->tabs, lv_pct(100));
   lv_obj_set_height(this->tabs, lv_pct(100));
   lv_obj_set_align(this->tabs, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->tabs, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->tabs, lv_color_hex(0x1F2C47), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->tabs, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_grad_color(this->tabs, lv_color_hex(0x364C7C), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_main_stop(this->tabs, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_grad_stop(this->tabs, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_grad_dir(this->tabs, LV_GRAD_DIR_VER, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *wifiTab = lv_tabview_add_tab(this->tabs, "WLAN");
   lv_obj_set_flex_flow(wifiTab, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(wifiTab, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   lv_obj_t *labelForWifiSelectNetwork = lv_label_create(wifiTab);
   lv_obj_set_width(labelForWifiSelectNetwork, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForWifiSelectNetwork, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForWifiSelectNetwork, LV_ALIGN_CENTER);
   lv_label_set_text(labelForWifiSelectNetwork, "WLAN Netzwerk");
   lv_obj_set_style_text_color(labelForWifiSelectNetwork, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *wifiSelectContainer = lv_obj_create(wifiTab);
   lv_obj_remove_style_all(wifiSelectContainer);
   lv_obj_set_width(wifiSelectContainer, lv_pct(100));
   lv_obj_set_height(wifiSelectContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(wifiSelectContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(wifiSelectContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(wifiSelectContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_column(wifiSelectContainer, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_remove_flag(wifiSelectContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(wifiSelectContainer, LV_OBJ_FLAG_SCROLLABLE);

   this->wifiSelectNetwork = lv_dropdown_create(wifiSelectContainer);
   lv_dropdown_set_options(this->wifiSelectNetwork, WIFI_DROPDOWN_LOADING);
   lv_obj_set_width(this->wifiSelectNetwork, 1);
   lv_obj_set_height(this->wifiSelectNetwork, LV_SIZE_CONTENT);
   lv_obj_set_flex_grow(this->wifiSelectNetwork, 1);
   lv_obj_add_flag(this->wifiSelectNetwork, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_add_event_cb(this->wifiSelectNetwork, &ConnectionConfigurationScreen::onWifiDropdownEvent, LV_EVENT_VALUE_CHANGED, this);

   lv_obj_t *refreshWifiButton = lv_button_create(wifiSelectContainer);
   lv_obj_set_size(refreshWifiButton, 46, 46);
   lv_obj_set_style_pad_all(refreshWifiButton, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(refreshWifiButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(refreshWifiButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_event_cb(refreshWifiButton, &ConnectionConfigurationScreen::onRefreshWifiButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *refreshWifiButtonLabel = lv_label_create(refreshWifiButton);
   lv_obj_center(refreshWifiButtonLabel);
   lv_label_set_text(refreshWifiButtonLabel, LV_SYMBOL_REFRESH);

   this->labelForWifiSSID = lv_label_create(wifiTab);
   lv_obj_set_width(this->labelForWifiSSID, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForWifiSSID, LV_SIZE_CONTENT);
   lv_obj_set_align(this->labelForWifiSSID, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForWifiSSID, "SSID*");
   lv_obj_set_style_text_color(this->labelForWifiSSID, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForWifiSSIDDefaultColor = lv_obj_get_style_text_color(this->labelForWifiSSID, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->wifiSSID = lv_textarea_create(wifiTab);
   lv_obj_set_width(this->wifiSSID, lv_pct(100));
   lv_obj_set_height(this->wifiSSID, LV_SIZE_CONTENT);
   lv_obj_set_align(this->wifiSSID, LV_ALIGN_CENTER);
   lv_textarea_set_placeholder_text(this->wifiSSID, "SSID");
   lv_textarea_set_one_line(this->wifiSSID, true);
   lv_obj_add_event_cb(this->wifiSSID, &ConnectionConfigurationScreen::onTextAreaEvent, LV_EVENT_ALL, this);
   lv_textarea_set_text(this->wifiSSID, networkConfig.ssid.c_str());

   this->labelForWifiPassword = lv_label_create(wifiTab);
   lv_obj_set_width(this->labelForWifiPassword, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForWifiPassword, LV_SIZE_CONTENT);
   lv_obj_set_align(this->labelForWifiPassword, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForWifiPassword, "Passwort*");
   lv_obj_set_style_text_color(this->labelForWifiPassword, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForWifiPasswordDefaultColor = lv_obj_get_style_text_color(this->labelForWifiPassword, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->wifiPassword = lv_textarea_create(wifiTab);
   lv_obj_set_width(this->wifiPassword, lv_pct(100));
   lv_obj_set_height(this->wifiPassword, LV_SIZE_CONTENT);
   lv_obj_set_align(this->wifiPassword, LV_ALIGN_CENTER);
   lv_textarea_set_placeholder_text(this->wifiPassword, "Password");
   lv_textarea_set_one_line(this->wifiPassword, true);
   lv_textarea_set_password_mode(this->wifiPassword, true);
   lv_obj_add_event_cb(this->wifiPassword, &ConnectionConfigurationScreen::onTextAreaEvent, LV_EVENT_ALL, this);
   lv_textarea_set_text(this->wifiPassword, networkConfig.password.c_str());

   lv_obj_t *containerForSaveButtonWifi = this->createSaveContainer(wifiTab);
   this->createCloseButton(containerForSaveButtonWifi);
   this->createSaveButton(containerForSaveButtonWifi);

   this->startWifiScan();

   lv_obj_t *apiTab = lv_tabview_add_tab(this->tabs, "API");
   lv_obj_set_flex_flow(apiTab, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(apiTab, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   this->labelForServerHostname = lv_label_create(apiTab);
   lv_obj_set_width(this->labelForServerHostname, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForServerHostname, LV_SIZE_CONTENT);
   lv_obj_set_align(this->labelForServerHostname, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForServerHostname, "Attraccess API URL");
   lv_obj_set_style_text_color(this->labelForServerHostname, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForServerHostnameDefaultColor = lv_obj_get_style_text_color(this->labelForServerHostname, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->serverHostname = lv_textarea_create(apiTab);
   lv_obj_set_width(this->serverHostname, lv_pct(100));
   lv_obj_set_height(this->serverHostname, LV_SIZE_CONTENT);
   lv_obj_set_align(this->serverHostname, LV_ALIGN_CENTER);
   lv_textarea_set_placeholder_text(this->serverHostname, "bsp.: deine-domain.de oder 192.168.1.100:3000");
   lv_textarea_set_one_line(this->serverHostname, true);
   lv_obj_add_event_cb(this->serverHostname, &ConnectionConfigurationScreen::onTextAreaEvent, LV_EVENT_ALL, this);

   String fullHostname = apiConfig.hostname;
   if (apiConfig.port != 0)
   {
      fullHostname += ":" + String(apiConfig.port);
   }
   lv_textarea_set_text(this->serverHostname, fullHostname.c_str());

   lv_obj_t *useSSLContainer = lv_obj_create(apiTab);
   lv_obj_remove_style_all(useSSLContainer);
   lv_obj_set_width(useSSLContainer, lv_pct(100));
   lv_obj_set_height(useSSLContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(useSSLContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(useSSLContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(useSSLContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(useSSLContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(useSSLContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(useSSLContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(useSSLContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->useSSLSwitch = lv_switch_create(useSSLContainer);
   lv_obj_set_width(this->useSSLSwitch, 50);
   lv_obj_set_height(this->useSSLSwitch, 25);
   lv_obj_set_align(this->useSSLSwitch, LV_ALIGN_CENTER);
   lv_obj_set_state(this->useSSLSwitch, LV_STATE_CHECKED, apiConfig.useSSL);

   this->labelForUseSSLSwitch = lv_label_create(useSSLContainer);
   lv_obj_set_width(this->labelForUseSSLSwitch, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForUseSSLSwitch, LV_SIZE_CONTENT);
   lv_obj_set_align(this->labelForUseSSLSwitch, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForUseSSLSwitch, "SSL verwenden");
   lv_obj_set_style_text_color(this->labelForUseSSLSwitch, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *sslInfoLabel = lv_label_create(apiTab);
   lv_obj_set_width(sslInfoLabel, lv_pct(100));
   lv_obj_set_height(sslInfoLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(sslInfoLabel, LV_ALIGN_CENTER);
   lv_label_set_text(sslInfoLabel, "Selbst-Signierte Zertifikate werden (aktuell) nicht unterstuetzt. Eine Verbindung ohne SSL ist sehr unsicher und sollte vermieden werden.");
   lv_obj_set_style_text_color(sslInfoLabel, lv_color_hex(0xFF8000), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *containerForSaveButton = this->createSaveContainer(apiTab);
   this->createCloseButton(containerForSaveButton);
   this->createSaveButton(containerForSaveButton);

   // Also add a save button to the API tab header/footer container for consistency
   // (re-use existing containerForSaveButton)

   // Device tab
   lv_obj_t *deviceTab = lv_tabview_add_tab(this->tabs, "Geraet");
   lv_obj_set_flex_flow(deviceTab, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(deviceTab, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   this->labelForDevicePin = lv_label_create(deviceTab);
   lv_obj_set_width(this->labelForDevicePin, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForDevicePin, LV_SIZE_CONTENT);
   lv_obj_set_align(this->labelForDevicePin, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForDevicePin, "Geraete PIN*");
   lv_obj_set_style_text_color(this->labelForDevicePin, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForDevicePinDefaultColor = lv_obj_get_style_text_color(this->labelForDevicePin, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->devicePin = lv_textarea_create(deviceTab);
   lv_obj_set_width(this->devicePin, lv_pct(100));
   lv_obj_set_height(this->devicePin, LV_SIZE_CONTENT);
   lv_obj_set_align(this->devicePin, LV_ALIGN_CENTER);
   lv_textarea_set_placeholder_text(this->devicePin, "Mind. 4 Ziffern");
   lv_textarea_set_one_line(this->devicePin, true);
   lv_obj_add_event_cb(this->devicePin, &ConnectionConfigurationScreen::onTextAreaEvent, LV_EVENT_ALL, this);
   lv_textarea_set_text(this->devicePin, deviceConfig.passCode.c_str());

   lv_obj_t *labelForBeeperEnabled = lv_label_create(deviceTab);
   lv_obj_set_width(labelForBeeperEnabled, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForBeeperEnabled, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForBeeperEnabled, LV_ALIGN_CENTER);
   lv_label_set_text(labelForBeeperEnabled, "Beeper");
   lv_obj_set_style_text_color(labelForBeeperEnabled, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->beeperEnabled = lv_switch_create(deviceTab);
   lv_obj_set_width(this->beeperEnabled, 50);
   lv_obj_set_height(this->beeperEnabled, 25);
   lv_obj_set_align(this->beeperEnabled, LV_ALIGN_CENTER);
   lv_obj_set_state(this->beeperEnabled, LV_STATE_CHECKED, deviceConfig.beeperEnabled);

   lv_obj_t *containerForSaveButtonDevice = this->createSaveContainer(deviceTab);
   this->createCloseButton(containerForSaveButtonDevice);
   this->createSaveButton(containerForSaveButtonDevice);

   this->keyboard = lv_keyboard_create(this->screen);
   lv_obj_set_width(this->keyboard, lv_pct(100));
   lv_obj_set_height(this->keyboard, lv_pct(48));
   lv_obj_set_align(this->keyboard, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->keyboard, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->keyboard, &ConnectionConfigurationScreen::onKeyboardEvent, LV_EVENT_ALL, this);

   // Default target
   lv_keyboard_set_textarea(this->keyboard, this->wifiSSID);

   this->pinInputPage.setOnCancelCallback([this]()
                                          { if (this->onCancelPinLockCallback) {
                                             this->onCancelPinLockCallback();
                                          } });

   this->pinInputPage.setOnConfirmCallback([this](String pin)
                                           { return this->onPinLockConfirmCallback(pin); });
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

void ConnectionConfigurationScreen::loop()
{
   if (!this->wifiSelectNetwork || !this->wifiScanRequested || this->wifiScanCompleted)
   {
      return;
   }

   if (Wifi::isScanning())
   {
      if (this->wifiScanStartMs > 0 && (millis() - this->wifiScanStartMs) > WIFI_SCAN_TIMEOUT_MS)
      {
         this->wifiScanCompleted = true;
         this->wifiScanRequested = false;
         this->wifiDropdownHasNetworks = false;
         lv_dropdown_set_options(this->wifiSelectNetwork, WIFI_DROPDOWN_SCAN_FAILED);
      }
      return;
   }

   this->wifiScanCompleted = true;
   this->wifiScanRequested = false;
   this->populateWifiDropdown();
}

void ConnectionConfigurationScreen::startWifiScan()
{
   if (!this->wifiSelectNetwork)
   {
      return;
   }

   this->wifiScanRequested = true;
   this->wifiScanCompleted = false;
   this->wifiScanStartMs = millis();
   this->wifiDropdownHasNetworks = false;
   lv_dropdown_set_options(this->wifiSelectNetwork, WIFI_DROPDOWN_LOADING);
   Wifi::startScan();
}

void ConnectionConfigurationScreen::populateWifiDropdown()
{
   if (!this->wifiSelectNetwork)
   {
      return;
   }

   Wifi::WifiScanResult scan = Wifi::getKnownWifiNetworks();
   String options = "";
   String savedSSID = Settings::getNetworkConfig().ssid;
   uint8_t selectedIndex = 0;
   bool selectedFound = false;

   String uniqueSsids[Wifi::MAX_KNOWN_WIFI_NETWORKS];
   uint8_t uniqueCount = 0;

   for (uint8_t i = 0; i < scan.count; i++)
   {
      const String &ssid = scan.networks[i].ssid;
      if (ssid.length() == 0)
      {
         continue;
      }

      bool isDuplicate = false;
      for (uint8_t j = 0; j < uniqueCount; j++)
      {
         if (uniqueSsids[j] == ssid)
         {
            isDuplicate = true;
            break;
         }
      }
      if (isDuplicate)
      {
         continue;
      }

      if (uniqueCount >= Wifi::MAX_KNOWN_WIFI_NETWORKS)
      {
         break;
      }

      uniqueSsids[uniqueCount] = ssid;
      uniqueCount++;

      if (options.length() > 0)
      {
         options += "\n";
      }
      options += ssid;

      if (!selectedFound && savedSSID.length() > 0 && ssid == savedSSID)
      {
         selectedIndex = uniqueCount - 1;
         selectedFound = true;
      }
   }

   if (options.length() == 0)
   {
      this->wifiDropdownHasNetworks = false;
      lv_dropdown_set_options(this->wifiSelectNetwork, WIFI_DROPDOWN_EMPTY);
      return;
   }

   this->wifiDropdownHasNetworks = true;
   lv_dropdown_set_options(this->wifiSelectNetwork, options.c_str());
   if (selectedFound)
   {
      lv_dropdown_set_selected(this->wifiSelectNetwork, selectedIndex);
   }
}

void ConnectionConfigurationScreen::onTextAreaEvent(lv_event_t *e)
{
   ConnectionConfigurationScreen *self = static_cast<ConnectionConfigurationScreen *>(lv_event_get_user_data(e));
   if (!self)
      return;
   lv_event_code_t code = lv_event_get_code(e);
   lv_obj_t *target = (lv_obj_t *)lv_event_get_target(e);

   if (code == LV_EVENT_FOCUSED || code == LV_EVENT_CLICKED)
   {
      self->showKeyboardFor(target);
   }
}

void ConnectionConfigurationScreen::onWifiDropdownEvent(lv_event_t *e)
{
   ConnectionConfigurationScreen *self = static_cast<ConnectionConfigurationScreen *>(lv_event_get_user_data(e));
   if (!self || !self->wifiSelectNetwork || !self->wifiSSID)
   {
      return;
   }

   lv_event_code_t code = lv_event_get_code(e);
   if (code != LV_EVENT_VALUE_CHANGED)
   {
      return;
   }

   if (!self->wifiDropdownHasNetworks)
   {
      return;
   }

   char selected[64] = {0};
   lv_dropdown_get_selected_str(self->wifiSelectNetwork, selected, sizeof(selected));
   if (selected[0] == '\0')
   {
      return;
   }

   lv_textarea_set_text(self->wifiSSID, selected);
}

void ConnectionConfigurationScreen::onRefreshWifiButtonEvent(lv_event_t *e)
{
   ConnectionConfigurationScreen *self = static_cast<ConnectionConfigurationScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }

   if (lv_event_get_code(e) != LV_EVENT_CLICKED)
   {
      return;
   }

   self->startWifiScan();
}

void ConnectionConfigurationScreen::onKeyboardEvent(lv_event_t *e)
{
   ConnectionConfigurationScreen *self = static_cast<ConnectionConfigurationScreen *>(lv_event_get_user_data(e));
   if (!self)
      return;

   lv_event_code_t code = lv_event_get_code(e);
   if (code == LV_EVENT_READY || code == LV_EVENT_CANCEL)
   {
      self->hideKeyboardIfNoFocus();
   }
   else if (code == LV_EVENT_VALUE_CHANGED)
   {
      lv_obj_t *kb = (lv_obj_t *)lv_event_get_target(e);
      if (!kb)
         return;

      lv_keyboard_mode_t mode = lv_keyboard_get_mode(kb);
      if (mode == LV_KEYBOARD_MODE_TEXT_UPPER)
      {
         uint32_t btn_id = lv_keyboard_get_selected_button(kb);
         if (btn_id != LV_BUTTONMATRIX_BUTTON_NONE)
         {
            const char *btn_txt = lv_keyboard_get_button_text(kb, btn_id);
            if (btn_txt && btn_txt[0] >= 'A' && btn_txt[0] <= 'Z' && btn_txt[1] == '\0')
            {
               lv_keyboard_set_mode(kb, LV_KEYBOARD_MODE_TEXT_LOWER);
            }
         }
      }
   }
}

// removed continue button handler (replaced by Save buttons on each tab)

static bool isEmpty(const char *text)
{
   return !(text && text[0] != '\0');
}

static bool hostnameLooksValid(const char *text)
{
   if (!text || text[0] == '\0')
      return false;
   return true;
}

static bool pinLooksValid(const char *text)
{
   if (!text)
      return false;
   size_t len = strlen(text);
   if (len < 4)
      return false;
   for (size_t i = 0; i < len; ++i)
   {
      if (text[i] < '0' || text[i] > '9')
         return false;
   }
   return true;
}

void ConnectionConfigurationScreen::onCloseButtonEvent(lv_event_t *e)
{
   ConnectionConfigurationScreen *self = static_cast<ConnectionConfigurationScreen *>(lv_event_get_user_data(e));
   if (!self)
      return;
   if (lv_event_get_code(e) != LV_EVENT_CLICKED)
      return;
   if (self->onCancelPinLockCallback)
      self->onCancelPinLockCallback();
}

void ConnectionConfigurationScreen::onSaveButtonEvent(lv_event_t *e)
{
   ConnectionConfigurationScreen *self = static_cast<ConnectionConfigurationScreen *>(lv_event_get_user_data(e));
   if (!self)
      return;

   lv_event_code_t code = lv_event_get_code(e);
   if (code != LV_EVENT_CLICKED)
      return;

   const char *ssidText = lv_textarea_get_text(self->wifiSSID);
   const char *passwordText = lv_textarea_get_text(self->wifiPassword);
   const char *hostText = lv_textarea_get_text(self->serverHostname);
   const char *devicePinText = self->devicePin ? lv_textarea_get_text(self->devicePin) : "";

   String hostValue = String(hostText ? hostText : "");
   if (hostValue.startsWith("https://"))
   {
      hostValue.remove(0, 8);
      lv_textarea_set_text(self->serverHostname, hostValue.c_str());
   }

   if (hostValue.startsWith("http://"))
   {
      hostValue.remove(0, 7);
      lv_textarea_set_text(self->serverHostname, hostValue.c_str());
   }

   bool hostValid = !hostValue.isEmpty() && hostnameLooksValid(hostValue.c_str());
   bool devicePinValid = pinLooksValid(devicePinText);

   // Update label colors
   if (self->labelForServerHostname)
   {
      lv_obj_set_style_text_color(self->labelForServerHostname,
                                  hostValid ? self->labelForServerHostnameDefaultColor : lv_color_hex(0xFF0000),
                                  LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   if (self->labelForDevicePin)
   {
      lv_obj_set_style_text_color(self->labelForDevicePin,
                                  devicePinValid ? self->labelForDevicePinDefaultColor : lv_color_hex(0xFF0000),
                                  LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   // Focus first invalid input and ensure visible
   if (!hostValid)
   {
      // Switch to API tab, focus server hostname
      if (self->tabs)
         lv_tabview_set_act(self->tabs, 1, LV_ANIM_ON);
      lv_keyboard_set_textarea(self->keyboard, self->serverHostname);
      self->showKeyboardFor(self->serverHostname);
      lv_obj_scroll_to_view_recursive(self->serverHostname, LV_ANIM_ON);
      return;
   }
   if (!devicePinValid)
   {
      if (self->tabs)
         lv_tabview_set_act(self->tabs, 2, LV_ANIM_ON);
      lv_keyboard_set_textarea(self->keyboard, self->devicePin);
      self->showKeyboardFor(self->devicePin);
      lv_obj_scroll_to_view_recursive(self->devicePin, LV_ANIM_ON);
      return;
   }

   // All valid -> call callback if provided, then close
   if (self->onSaveCallback)
   {
      ConnectionConfigurationScreen::ConnectionConfig cfg;
      cfg.ssid = String(ssidText);
      cfg.password = String(passwordText);
      cfg.host = hostValue;
      cfg.useSSL = lv_obj_has_state(self->useSSLSwitch, LV_STATE_CHECKED);
      cfg.devicePin = String(devicePinText);
      cfg.beeperEnabled = lv_obj_has_state(self->beeperEnabled, LV_STATE_CHECKED);
      self->onSaveCallback(cfg);
      if (self->onCancelPinLockCallback)
         self->onCancelPinLockCallback();
   }
}

void ConnectionConfigurationScreen::showKeyboardFor(lv_obj_t *targetTextArea)
{
   if (!targetTextArea)
      return;

   // Retarget keyboard
   lv_keyboard_set_textarea(this->keyboard, targetTextArea);

   // Choose mode based on field
   if (targetTextArea == this->wifiSSID)
   {
      lv_keyboard_set_mode(this->keyboard, LV_KEYBOARD_MODE_TEXT_LOWER);
   }
   else if (targetTextArea == this->wifiPassword)
   {
      lv_keyboard_set_mode(this->keyboard, LV_KEYBOARD_MODE_TEXT_LOWER);
   }
   else if (targetTextArea == this->serverHostname)
   {
      lv_keyboard_set_mode(this->keyboard, LV_KEYBOARD_MODE_TEXT_LOWER);
   }
   else if (targetTextArea == this->devicePin)
   {
      lv_keyboard_set_mode(this->keyboard, LV_KEYBOARD_MODE_NUMBER);
   }

   // Show keyboard and shrink tabs
   lv_obj_clear_flag(this->keyboard, LV_OBJ_FLAG_HIDDEN);
   if (this->tabs)
   {
      lv_obj_set_height(this->tabs, lv_pct(50));
   }

   // Ensure focused input is visible after layout changes
   lv_obj_update_layout(this->screen);
   lv_obj_scroll_to_view_recursive(targetTextArea, LV_ANIM_ON);
}

void ConnectionConfigurationScreen::hideKeyboardIfNoFocus()
{
   lv_obj_add_flag(this->keyboard, LV_OBJ_FLAG_HIDDEN);
   if (this->tabs)
   {
      lv_obj_set_height(this->tabs, lv_pct(100));
   }
}

lv_obj_t *ConnectionConfigurationScreen::createSaveButton(lv_obj_t *parent)
{
   lv_obj_t *save = lv_button_create(parent);
   lv_obj_set_width(save, 100);
   lv_obj_set_height(save, 50);
   lv_obj_set_align(save, LV_ALIGN_CENTER);
   lv_obj_add_flag(save, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(save, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(save, lv_color_hex(0x00FF00), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(save, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(save, &ConnectionConfigurationScreen::onSaveButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *label = lv_label_create(save);
   lv_obj_set_width(label, LV_SIZE_CONTENT);
   lv_obj_set_height(label, LV_SIZE_CONTENT);
   lv_obj_set_align(label, LV_ALIGN_CENTER);
   lv_label_set_text(label, "Speichern");
   lv_obj_set_style_text_color(label, lv_color_hex(0x000000), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(label, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   return save;
}

lv_obj_t *ConnectionConfigurationScreen::createCloseButton(lv_obj_t *parent)
{
   lv_obj_t *close = lv_button_create(parent);
   lv_obj_set_width(close, 100);
   lv_obj_set_height(close, 50);
   lv_obj_set_align(close, LV_ALIGN_CENTER);
   lv_obj_add_flag(close, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(close, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(close, lv_color_hex(0x5B5B5B), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(close, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(close, &ConnectionConfigurationScreen::onCloseButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *label = lv_label_create(close);
   lv_obj_set_width(label, LV_SIZE_CONTENT);
   lv_obj_set_height(label, LV_SIZE_CONTENT);
   lv_obj_set_align(label, LV_ALIGN_CENTER);
   lv_label_set_text(label, "Schliessen");
   lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(label, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   return close;
}

lv_obj_t *ConnectionConfigurationScreen::createSaveContainer(lv_obj_t *parent)
{
   lv_obj_t *container = lv_obj_create(parent);
   lv_obj_remove_style_all(container);
   lv_obj_set_width(container, lv_pct(100));
   lv_obj_set_height(container, LV_SIZE_CONTENT);
   lv_obj_set_align(container, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(container, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(container, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_column(container, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_remove_flag(container, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);
   return container;
}

void ConnectionConfigurationScreen::setOnSaveCallback(std::function<void(const ConnectionConfigurationScreen::ConnectionConfig &)> onSaveCallback)
{
   this->onSaveCallback = onSaveCallback;
}

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

void ConnectionConfigurationScreen::onPinCooldownTimer(lv_timer_t *t)
{
   ConnectionConfigurationScreen *self = static_cast<ConnectionConfigurationScreen *>(lv_timer_get_user_data(t));
   if (!self)
      return;
   if (self->pinCooldownOverlay)
   {
      lv_obj_del(self->pinCooldownOverlay);
      self->pinCooldownOverlay = nullptr;
   }
   lv_timer_del(t);
   self->pinWrongCooldownTimer = nullptr;
}

bool ConnectionConfigurationScreen::onPinLockConfirmCallback(String pin)
{
   String devicePin = Settings::getDeviceConfig().passCode;
   bool matches = pin == devicePin;

   if (!matches)
   {
      if (this->pinWrongCooldownTimer)
         return false; /* cooldown already in progress */

      if (!this->pinLockOverlay)
         return false;

      this->pinCooldownOverlay = lv_obj_create(this->pinLockOverlay);
      lv_obj_set_size(this->pinCooldownOverlay, lv_pct(100), lv_pct(100));
      lv_obj_set_align(this->pinCooldownOverlay, LV_ALIGN_CENTER);
      lv_obj_set_style_bg_color(this->pinCooldownOverlay, lv_color_hex(0x1F2C47), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_bg_opa(this->pinCooldownOverlay, 200, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_remove_flag(this->pinCooldownOverlay, LV_OBJ_FLAG_SCROLLABLE);

      lv_obj_t *label = lv_label_create(this->pinCooldownOverlay);
      lv_label_set_text(label, "Falscher PIN.\nBitte 5s warten.");
      lv_obj_set_style_text_color(label, lv_color_hex(0xFF4D4D), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_text_font(label, &lv_font_montserrat_24, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_center(label);

      this->pinWrongCooldownTimer = lv_timer_create(onPinCooldownTimer, 5000, this);
      lv_timer_set_repeat_count(this->pinWrongCooldownTimer, 1);
      return false;
   }

   this->disablePinLock();
   return true;
}

void ConnectionConfigurationScreen::setOnCancelPinLockCallback(std::function<void()> onCancelPinLockCallback)
{
   this->onCancelPinLockCallback = onCancelPinLockCallback;
}

String ConnectionConfigurationScreen::getName()
{
   return "ConnectionConfigurationScreen";
}

void ConnectionConfigurationScreen::onScreenLeave()
{
}

void ConnectionConfigurationScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   if (this->pinWrongCooldownTimer)
   {
      lv_timer_del(this->pinWrongCooldownTimer);
      this->pinWrongCooldownTimer = nullptr;
   }
   this->pinCooldownOverlay = nullptr;
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
   this->devicePin = nullptr;
   this->labelForDevicePin = nullptr;
   this->beeperEnabled = nullptr;
   this->wifiScanRequested = false;
   this->wifiScanCompleted = false;
   this->wifiDropdownHasNetworks = false;
   this->wifiScanStartMs = 0;
}
