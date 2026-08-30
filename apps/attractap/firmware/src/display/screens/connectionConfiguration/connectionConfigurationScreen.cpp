#include "connectionConfigurationScreen.hpp"
#include "../../../state/state.hpp"
#include <cstdio>
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

   this->wifiSelectNetwork = lv_dropdown_create(wifiTab);
   lv_dropdown_set_options(this->wifiSelectNetwork, "Suche WLANs...");
   lv_obj_set_width(this->wifiSelectNetwork, lv_pct(100));
   lv_obj_set_height(this->wifiSelectNetwork, LV_SIZE_CONTENT);
   lv_obj_set_align(this->wifiSelectNetwork, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->wifiSelectNetwork, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_add_event_cb(this->wifiSelectNetwork, &ConnectionConfigurationScreen::onWifiDropdownEvent, LV_EVENT_VALUE_CHANGED, this);

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

   std::string fullHostname = apiConfig.hostname;
   if (apiConfig.port != 0)
   {
      fullHostname += ":" + std::to_string(apiConfig.port);
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

   // Reset the locked certificate decision (ATT-714): once a cert worked it is
   // pinned forever, this is the only way to unpin it after a server cert change.
   this->resetCertButton = lv_button_create(apiTab);
   lv_obj_set_width(this->resetCertButton, LV_SIZE_CONTENT);
   lv_obj_set_height(this->resetCertButton, LV_SIZE_CONTENT);
   lv_obj_set_align(this->resetCertButton, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->resetCertButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->resetCertButton, lv_color_hex(0xFF8000), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->resetCertButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(this->resetCertButton, &ConnectionConfigurationScreen::onResetCertificateButtonEvent, LV_EVENT_CLICKED, this);

   this->resetCertLabel = lv_label_create(this->resetCertButton);
   lv_obj_set_align(this->resetCertLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->resetCertLabel, "Zertifikat zuruecksetzen");
   lv_obj_set_style_text_color(this->resetCertLabel, lv_color_hex(0x000000), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *containerForSaveButton = this->createSaveContainer(apiTab);
   this->createSaveButton(containerForSaveButton);

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

#ifdef HAS_POWER_BUTTON
   // Power off (V4 hardware with SYS_EN latch only) — cuts battery power.
   PowerOffButton::create(deviceTab, [this]()
                          { if (this->onPowerOffCallback) this->onPowerOffCallback(); });
#endif

   lv_obj_t *containerForSaveButtonDevice = this->createSaveContainer(deviceTab);
   this->createSaveButton(containerForSaveButtonDevice);

   lv_obj_t *statusTab = lv_tabview_add_tab(this->tabs, "Status");
   lv_obj_set_flex_flow(statusTab, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(statusTab, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   this->networkQualityStatus = lv_label_create(statusTab);
   lv_obj_set_width(this->networkQualityStatus, lv_pct(100));
   lv_label_set_long_mode(this->networkQualityStatus, LV_LABEL_LONG_WRAP);
   lv_obj_set_style_text_color(this->networkQualityStatus, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->networkQualityStatus, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
   this->updateNetworkQualityStatus();

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

   this->pinInputPage.setOnConfirmCallback([this](std::string pin)
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
   this->networkQualityStatus = nullptr;
   this->lastNetworkQualityStatusUpdateMs = 0;
   this->wifiScanRequested = false;
   this->wifiScanCompleted = false;
   this->wifiDropdownHasNetworks = false;
   this->wifiScanStartMs = 0;
}

void ConnectionConfigurationScreen::updateNetworkQualityStatus()
{
   if (!this->networkQualityStatus)
   {
      return;
   }

   State::NetworkQualityState quality = State::getNetworkQualityState();
   const char *qualityLabel = "Offline";
   switch (quality.quality)
   {
   case State::NETWORK_QUALITY_GOOD:
      qualityLabel = "Gut";
      break;
   case State::NETWORK_QUALITY_DEGRADED:
      qualityLabel = "Eingeschraenkt";
      break;
   case State::NETWORK_QUALITY_OFFLINE:
   default:
      break;
   }

   char text[600];
   snprintf(text, sizeof(text),
            "Verbindungsqualitaet: %s\n\n"
            "Letzte Nachricht: %lu ms\n"
            "Letzter Ping: %lu ms\n"
            "Durchschnittlicher Ping: %lu ms\n"
            "Ping-Trend: %+ld ms\n\n"
            "Wiederverbindungen (1 Min.): %u\n"
            "Sende-Warteschlange: %u\n"
            "Warteschlange voll (1 Min.): %u\n"
            "Sendefehler (1 Min.): %u\n"
            "Verbindungs-Timeouts (1 Min.): %u\n"
            "Ping-Timeouts (1 Min.): %u\n"
            "Ping-Verlust (1 Min.): %u%%\n"
            "Verpasste Heartbeats (1 Min.): %u",
            qualityLabel,
            (unsigned long)quality.lastInboundAgeMs,
            (unsigned long)quality.lastPongRttMs,
            (unsigned long)quality.averagePongRttMs,
            (long)quality.pongRttTrendMs,
            (unsigned)quality.reconnectsLastMinute,
            (unsigned)quality.txQueueDepth,
            (unsigned)quality.txQueueFullEventsLastMinute,
            (unsigned)quality.sendFailuresLastMinute,
            (unsigned)quality.livenessTimeoutsLastMinute,
            (unsigned)quality.pongTimeoutsLastMinute,
            (unsigned)quality.pongProbeLossPercentLastMinute,
            (unsigned)quality.missedHeartbeatsLastMinute);
   lv_label_set_text(this->networkQualityStatus, text);
}
