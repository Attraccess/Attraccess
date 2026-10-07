#include "initscreen.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>
#include <cstdio>
#include "platform.hpp"

void InitScreen::applyStage(lv_obj_t *spinner, lv_obj_t *label, StageState newState, StageState &cached)
{
   if (newState == cached)
   {
      return;
   }
   cached = newState;

   switch (newState)
   {
   case StageState::SUCCESS:
      this->markStateAsSuccess(spinner, label);
      break;
   case StageState::WARNING:
      this->markStateAsWarning(spinner, label);
      break;
   case StageState::PENDING:
   default:
      this->resetState(spinner, label);
      break;
   }
}

void InitScreen::loop()
{
   // Throttle: this screen redraws while WiFi/TLS work runs; updating LVGL (and
   // building Strings) every tick caused a permanent redraw storm (ATT-554 item 5).
   uint32_t now = millis();
   if (now - this->lastLoopRefreshMs < LOOP_REFRESH_INTERVAL_MS)
   {
      return;
   }
   this->lastLoopRefreshMs = now;

   State::NetworkState networkState = State::getNetworkState();
   // TODO: extend network state and network interface classes to be more descriptive (in progress, success, error and maybe error reason)
   if (networkState.wifi_connected)
   {
      setLabelTextIfChanged(this->wifiLabel, ("WLAN  " + this->formatIp(networkState.wifi_ip)).c_str());
      this->applyStage(this->wifiSpinner, this->wifiLabel, StageState::SUCCESS, this->wifiStage);
   }
   else
   {
      setLabelTextIfChanged(this->wifiLabel, "verbinde WLAN");
      this->applyStage(this->wifiSpinner, this->wifiLabel, StageState::PENDING, this->wifiStage);
   }

   if (networkState.ethernet_connected)
   {
      setLabelTextIfChanged(this->ethernetLabel, ("Ethernet  " + this->formatIp(networkState.ethernet_ip)).c_str());
      this->applyStage(this->ethernetSpinner, this->ethernetLabel, StageState::SUCCESS, this->ethernetStage);
   }
   else
   {
      setLabelTextIfChanged(this->ethernetLabel, "verbinde Ethernet");
      this->applyStage(this->ethernetSpinner, this->ethernetLabel, StageState::PENDING, this->ethernetStage);
   }

   State::WebsocketState websocketState = State::getWebsocketState();
   bool networkUp = networkState.wifi_connected || networkState.ethernet_connected;
   // A repeating cert sweep is the "searching" signal; a locked cert never sweeps.
   bool sweeping = websocketState.useSSL && !websocketState.certLocked &&
                   (websocketState.certIndex > 0 || websocketState.rememberedRetryCount > 0);
   if (websocketState.connected)
   {
      setLabelTextIfChanged(this->apiConnectionLabel, "API verbunden");
      this->applyStage(this->apiConnectionSpinner, this->apiConnectionLabel, StageState::SUCCESS, this->apiConnectionStage);
   }
   else if (networkUp && sweeping)
   {
      setLabelTextIfChanged(this->apiConnectionLabel, "suche Zertifikat");
      this->applyStage(this->apiConnectionSpinner, this->apiConnectionLabel, StageState::WARNING, this->apiConnectionStage);
   }
   else
   {
      setLabelTextIfChanged(this->apiConnectionLabel, "verbinde API");
      this->applyStage(this->apiConnectionSpinner, this->apiConnectionLabel, StageState::PENDING, this->apiConnectionStage);
   }

   State::ApiState apiState = State::getApiState();
   this->applyStage(this->apiAuthenticationSpinner, this->apiAuthenticationLabel,
                    apiState.authenticated ? StageState::SUCCESS : StageState::PENDING,
                    this->apiAuthenticationStage);

   // Server target line
   if (websocketState.hostname.empty() || websocketState.port == 0)
   {
      setLabelTextIfChanged(this->serverTargetLabel, "Server: nicht konfiguriert");
   }
   else
   {
      std::string target = "Server: " + websocketState.hostname + ":" + std::to_string(websocketState.port) +
                           (websocketState.useSSL ? "  (SSL)" : "  (kein SSL)");
      setLabelTextIfChanged(this->serverTargetLabel, target.c_str());
   }

   // Cert evaluation line (only relevant while connecting over SSL)
   if (websocketState.useSSL && !websocketState.connected && websocketState.certCount > 0)
   {
      std::string cert = "CA: " + websocketState.certName + "  " +
                         (websocketState.certLocked
                              ? "(fixiert)"
                              : "(" + std::to_string(websocketState.certIndex + 1) + "/" + std::to_string(websocketState.certCount) + ")");
      if (websocketState.rememberedRetryCount > 0)
      {
         cert += "  Wdh " + std::to_string(websocketState.rememberedRetryCount);
      }
      setLabelTextIfChanged(this->certLabel, cert.c_str());
      if (lv_obj_has_flag(this->certLabel, LV_OBJ_FLAG_HIDDEN))
      {
         lv_obj_remove_flag(this->certLabel, LV_OBJ_FLAG_HIDDEN);
      }
   }
   else if (!lv_obj_has_flag(this->certLabel, LV_OBJ_FLAG_HIDDEN))
   {
      lv_obj_add_flag(this->certLabel, LV_OBJ_FLAG_HIDDEN);
   }

   // Connection state + countdown line
   const char *phaseText = "INIT";
   switch (websocketState.phase)
   {
   case State::WS_CONNECTING:
      phaseText = "CONNECTING";
      break;
   case State::WS_CONNECTED:
      phaseText = "CONNECTED";
      break;
   case State::WS_INIT:
   default:
      phaseText = "INIT";
      break;
   }
   std::string stateLine = std::string("Status: ") + phaseText;
   if (!networkUp)
   {
      stateLine += "  warte auf Netzwerk";
   }
   else if (!websocketState.connected && websocketState.secondsUntilNextAttempt > 0)
   {
      stateLine += "  nächster Versuch in " + std::to_string(websocketState.secondsUntilNextAttempt) + "s";
   }
   setLabelTextIfChanged(this->connectionStateLabel, stateLine.c_str());
}
