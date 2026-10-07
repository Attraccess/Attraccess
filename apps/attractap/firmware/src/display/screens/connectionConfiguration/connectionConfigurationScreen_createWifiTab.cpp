#include "connectionConfigurationScreen.hpp"
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include <string>

void ConnectionConfigurationScreen::createWifiTab(const NetworkConfig &networkConfig)
{
   lv_obj_t *wifiTab = lv_tabview_add_tab(this->tabs, "WLAN");
   lv_obj_set_flex_flow(wifiTab, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(wifiTab, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   lv_obj_t *labelForWifiSelectNetwork = lv_label_create(wifiTab);
   lv_obj_set_width(labelForWifiSelectNetwork, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForWifiSelectNetwork, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForWifiSelectNetwork, LV_ALIGN_CENTER);
   lv_label_set_text(labelForWifiSelectNetwork, "WLAN Netzwerk");
   lv_obj_set_style_text_color(labelForWifiSelectNetwork, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->wifiSelectNetwork = lv_dropdown_create(wifiTab);
   DisplayTheme::field(this->wifiSelectNetwork);
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
   lv_obj_set_style_text_color(this->labelForWifiSSID, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForWifiSSIDDefaultColor = lv_obj_get_style_text_color(this->labelForWifiSSID, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->wifiSSID = lv_textarea_create(wifiTab);
   DisplayTheme::field(this->wifiSSID);
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
   lv_obj_set_style_text_color(this->labelForWifiPassword, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForWifiPasswordDefaultColor = lv_obj_get_style_text_color(this->labelForWifiPassword, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->wifiPassword = lv_textarea_create(wifiTab);
   DisplayTheme::field(this->wifiPassword);
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

}
