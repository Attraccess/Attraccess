#include "connectionConfigurationScreen.hpp"
#include "display/i18n.hpp"
#include <string>
#include "../../../network/wifi/wifi.hpp"
#include "platform.hpp"

// WiFi network scanning + dropdown population.

static constexpr auto WIFI_DROPDOWN_LOADING = FirmwareI18n::Message::SearchingForWiFiNetworks;
static constexpr auto WIFI_DROPDOWN_EMPTY = FirmwareI18n::Message::NoNetworksFound;
static constexpr auto WIFI_DROPDOWN_SCAN_FAILED = FirmwareI18n::Message::WiFiScanFailed;
static const uint32_t WIFI_SCAN_TIMEOUT_MS = 10000;

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
         FirmwareI18n::setDropdownOptions(this->wifiSelectNetwork, WIFI_DROPDOWN_SCAN_FAILED);
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
   FirmwareI18n::setDropdownOptions(this->wifiSelectNetwork, WIFI_DROPDOWN_LOADING);
   Wifi::startScan();
}

void ConnectionConfigurationScreen::populateWifiDropdown()
{
   if (!this->wifiSelectNetwork)
   {
      return;
   }

   Wifi::WifiScanResult scan = Wifi::getKnownWifiNetworks();
   std::string options = "";
   std::string savedSSID = Settings::getNetworkConfig().ssid;
   uint8_t selectedIndex = 0;
   bool selectedFound = false;

   std::string uniqueSsids[Wifi::MAX_KNOWN_WIFI_NETWORKS];
   uint8_t uniqueCount = 0;

   for (uint8_t i = 0; i < scan.count; i++)
   {
      const std::string &ssid = scan.networks[i].ssid;
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
      FirmwareI18n::setDropdownOptions(this->wifiSelectNetwork, WIFI_DROPDOWN_EMPTY);
      return;
   }

   this->wifiDropdownHasNetworks = true;
   FirmwareI18n::setDynamicDropdownOptions(this->wifiSelectNetwork, options.c_str());
   if (selectedFound)
   {
      lv_dropdown_set_selected(this->wifiSelectNetwork, selectedIndex);
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
