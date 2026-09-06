#include "initscreen.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>

#include <cstdio>
#include "platform.hpp"

void InitScreen::finalizeState(lv_obj_t *spinner, lv_obj_t *label, lv_color_t color)
{
   lv_obj_set_style_arc_color(spinner, color, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_opa(spinner, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_width(spinner, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_set_style_arc_color(spinner, color, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_opa(spinner, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   lv_obj_set_style_text_color(label, color, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void InitScreen::markStateAsSuccess(lv_obj_t *spinner, lv_obj_t *label)
{
   this->finalizeState(spinner, label, DisplayTheme::success());
}

void InitScreen::markStateAsError(lv_obj_t *spinner, lv_obj_t *label)
{
   this->finalizeState(spinner, label, DisplayTheme::danger());
}

void InitScreen::markStateAsWarning(lv_obj_t *spinner, lv_obj_t *label)
{
   // Amber: stage is actively working/retrying (e.g. sweeping CA certs) rather
   // than cleanly succeeded or hard-failed.
   this->finalizeState(spinner, label, DisplayTheme::warning());
}

std::string InitScreen::formatIp(esp_ip4_addr_t ip)
{
   char buf[16];
   snprintf(buf, sizeof(buf), IPSTR, IP2STR(&ip));
   return std::string(buf);
}

void InitScreen::resetState(lv_obj_t *spinner, lv_obj_t *label)
{
   lv_obj_set_style_arc_color(spinner, DisplayTheme::surfaceSecondary(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_opa(spinner, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_width(spinner, 5, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_set_style_arc_color(spinner, DisplayTheme::primary(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_width(spinner, 5, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_opa(spinner, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   lv_obj_set_style_text_color(label, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
}

void InitScreen::init()
{
   if (this->screen)
   {
      return;
   }
   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::applyScreen(this->screen);

   lv_obj_t *logo = lv_image_create(this->screen);
   lv_image_set_src(logo, &logo_400w_png);
   lv_obj_set_width(logo, LV_SIZE_CONTENT);
   lv_obj_set_height(logo, LV_SIZE_CONTENT);
   lv_obj_set_x(logo, 0);
   lv_obj_set_y(logo, -160);
   lv_obj_set_align(logo, LV_ALIGN_CENTER);
   lv_obj_add_flag(logo, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(logo, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *statesContainer = lv_obj_create(this->screen);
   lv_obj_remove_style_all(statesContainer);
   lv_obj_set_width(statesContainer, lv_pct(100));
   lv_obj_set_height(statesContainer, LV_SIZE_CONTENT);
   lv_obj_set_x(statesContainer, 0);
   lv_obj_set_y(statesContainer, 53);
   lv_obj_set_align(statesContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(statesContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(statesContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_remove_flag(statesContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(statesContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_left(statesContainer, 40, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(statesContainer, 40, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(statesContainer, 40, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(statesContainer, 40, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_row(statesContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(statesContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *wifiContainer = lv_obj_create(statesContainer);
   lv_obj_remove_style_all(wifiContainer);
   lv_obj_set_width(wifiContainer, lv_pct(100));
   lv_obj_set_height(wifiContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(wifiContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(wifiContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(wifiContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_remove_flag(wifiContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(wifiContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(wifiContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(wifiContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->wifiSpinner = lv_spinner_create(wifiContainer);
   lv_obj_set_width(this->wifiSpinner, 26);
   lv_obj_set_height(this->wifiSpinner, 26);
   lv_obj_set_align(this->wifiSpinner, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->wifiSpinner, LV_OBJ_FLAG_CLICKABLE);

   this->wifiLabel = lv_label_create(wifiContainer);
   lv_obj_set_width(this->wifiLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->wifiLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->wifiLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->wifiLabel, "verbinde WLAN");
   lv_obj_set_style_text_font(this->wifiLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->resetState(this->wifiSpinner, this->wifiLabel);

   lv_obj_t *ethernetContainer = lv_obj_create(statesContainer);
   lv_obj_remove_style_all(ethernetContainer);
   lv_obj_set_width(ethernetContainer, lv_pct(100));
   lv_obj_set_height(ethernetContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(ethernetContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(ethernetContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(ethernetContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_SPACE_BETWEEN);
   lv_obj_remove_flag(ethernetContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(ethernetContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(ethernetContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(ethernetContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   if (PIN_ETH_SPI_CS >= 0)
   {
      lv_obj_add_flag(ethernetContainer, LV_OBJ_FLAG_HIDDEN);
   }

   this->ethernetSpinner = lv_spinner_create(ethernetContainer);
   lv_obj_set_width(this->ethernetSpinner, 26);
   lv_obj_set_height(this->ethernetSpinner, 26);
   lv_obj_set_align(this->ethernetSpinner, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->ethernetSpinner, LV_OBJ_FLAG_CLICKABLE);

   this->ethernetLabel = lv_label_create(ethernetContainer);
   lv_obj_set_width(this->ethernetLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->ethernetLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->ethernetLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->ethernetLabel, "verbinde Ethernet");
   lv_obj_set_style_text_font(this->ethernetLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->resetState(this->ethernetSpinner, this->ethernetLabel);

   lv_obj_t *apiConnectionContainer = lv_obj_create(statesContainer);
   lv_obj_remove_style_all(apiConnectionContainer);
   lv_obj_set_width(apiConnectionContainer, lv_pct(100));
   lv_obj_set_height(apiConnectionContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(apiConnectionContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(apiConnectionContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(apiConnectionContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_SPACE_BETWEEN);
   lv_obj_remove_flag(apiConnectionContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(apiConnectionContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(apiConnectionContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(apiConnectionContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->apiConnectionSpinner = lv_spinner_create(apiConnectionContainer);
   lv_obj_set_width(this->apiConnectionSpinner, 26);
   lv_obj_set_height(this->apiConnectionSpinner, 26);
   lv_obj_set_align(this->apiConnectionSpinner, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->apiConnectionSpinner, LV_OBJ_FLAG_CLICKABLE);

   this->apiConnectionLabel = lv_label_create(apiConnectionContainer);
   lv_obj_set_width(this->apiConnectionLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->apiConnectionLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->apiConnectionLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->apiConnectionLabel, "verbinde API");
   lv_obj_set_style_text_font(this->apiConnectionLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->resetState(this->apiConnectionSpinner, this->apiConnectionLabel);

   lv_obj_t *apiAuthenticationContainer = lv_obj_create(statesContainer);
   lv_obj_remove_style_all(apiAuthenticationContainer);
   lv_obj_set_width(apiAuthenticationContainer, lv_pct(100));
   lv_obj_set_height(apiAuthenticationContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(apiAuthenticationContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(apiAuthenticationContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(apiAuthenticationContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_SPACE_BETWEEN);
   lv_obj_remove_flag(apiAuthenticationContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(apiAuthenticationContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(apiAuthenticationContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(apiAuthenticationContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->apiAuthenticationSpinner = lv_spinner_create(apiAuthenticationContainer);
   lv_obj_set_width(this->apiAuthenticationSpinner, 26);
   lv_obj_set_height(this->apiAuthenticationSpinner, 26);
   lv_obj_set_align(this->apiAuthenticationSpinner, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->apiAuthenticationSpinner, LV_OBJ_FLAG_CLICKABLE);

   this->apiAuthenticationLabel = lv_label_create(apiAuthenticationContainer);
   lv_obj_set_width(this->apiAuthenticationLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->apiAuthenticationLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->apiAuthenticationLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->apiAuthenticationLabel, "authentifiziere an API");
   lv_obj_set_style_text_font(this->apiAuthenticationLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->resetState(this->apiAuthenticationSpinner, this->apiAuthenticationLabel);

   // Connection / cert-detection progress detail block. Smaller font, left aligned,
   // so users can see the configured target, which CA is being tried, the live
   // connection phase and the countdown to the next attempt.
   lv_obj_t *detailsContainer = lv_obj_create(statesContainer);
   lv_obj_remove_style_all(detailsContainer);
   lv_obj_set_width(detailsContainer, lv_pct(100));
   lv_obj_set_height(detailsContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(detailsContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(detailsContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(detailsContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(detailsContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(detailsContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_pad_row(detailsContainer, 6, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->serverTargetLabel = lv_label_create(detailsContainer);
   lv_obj_set_width(this->serverTargetLabel, lv_pct(100));
   lv_obj_set_height(this->serverTargetLabel, LV_SIZE_CONTENT);
   lv_label_set_text(this->serverTargetLabel, "");
   lv_obj_set_style_text_font(this->serverTargetLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->serverTargetLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->certLabel = lv_label_create(detailsContainer);
   lv_obj_set_width(this->certLabel, lv_pct(100));
   lv_obj_set_height(this->certLabel, LV_SIZE_CONTENT);
   lv_label_set_long_mode(this->certLabel, LV_LABEL_LONG_DOT);
   lv_label_set_text(this->certLabel, "");
   lv_obj_set_style_text_font(this->certLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->certLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->connectionStateLabel = lv_label_create(detailsContainer);
   lv_obj_set_width(this->connectionStateLabel, lv_pct(100));
   lv_obj_set_height(this->connectionStateLabel, LV_SIZE_CONTENT);
   lv_label_set_text(this->connectionStateLabel, "");
   lv_obj_set_style_text_font(this->connectionStateLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(this->connectionStateLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *openSettingsButton = lv_btn_create(statesContainer);
   DisplayTheme::button(openSettingsButton);
   lv_obj_set_width(openSettingsButton, LV_SIZE_CONTENT);
   lv_obj_set_height(openSettingsButton, LV_SIZE_CONTENT);
   lv_obj_set_align(openSettingsButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(openSettingsButton, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_add_flag(openSettingsButton, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *openSettingsButtonLabel = lv_label_create(openSettingsButton);
   lv_obj_set_width(openSettingsButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(openSettingsButtonLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(openSettingsButtonLabel, LV_ALIGN_CENTER);
   lv_label_set_text(openSettingsButtonLabel, "Einstellungen");
   lv_obj_set_style_text_color(openSettingsButtonLabel, DisplayTheme::onPrimary(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(openSettingsButtonLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_add_event_cb(openSettingsButton, &InitScreen::onOpenSettingsButtonEvent, LV_EVENT_CLICKED, this);

   // init() applied resetState (= PENDING visuals) to every row above; keep the
   // change-detection caches in sync so loop() only re-styles on real transitions.
   this->wifiStage = StageState::PENDING;
   this->ethernetStage = StageState::PENDING;
   this->apiConnectionStage = StageState::PENDING;
   this->apiAuthenticationStage = StageState::PENDING;
   this->lastLoopRefreshMs = 0;
}

void InitScreen::onOpenSettingsButtonEvent(lv_event_t *e)
{
   InitScreen *self = static_cast<InitScreen *>(lv_event_get_user_data(e));
   if (!self)
      return;

   if (self->onOpenSettingsCallback)
      self->onOpenSettingsCallback();
}

lv_obj_t *InitScreen::getScreen()
{
   return this->screen;
}

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
      stateLine += "  naechster Versuch in " + std::to_string(websocketState.secondsUntilNextAttempt) + "s";
   }
   setLabelTextIfChanged(this->connectionStateLabel, stateLine.c_str());
}

void InitScreen::setOnOpenSettingsCallback(std::function<void()> onOpenSettingsCallback)
{
   this->onOpenSettingsCallback = onOpenSettingsCallback;
}

std::string InitScreen::getName()
{
   return "InitScreen";
}

void InitScreen::onScreenLeave()
{
   this->resetState(this->wifiSpinner, this->wifiLabel);
   this->resetState(this->ethernetSpinner, this->ethernetLabel);
   this->resetState(this->apiConnectionSpinner, this->apiConnectionLabel);
   this->resetState(this->apiAuthenticationSpinner, this->apiAuthenticationLabel);
   this->wifiStage = StageState::PENDING;
   this->ethernetStage = StageState::PENDING;
   this->apiConnectionStage = StageState::PENDING;
   this->apiAuthenticationStage = StageState::PENDING;
}

void InitScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
   this->wifiSpinner = nullptr;
   this->wifiLabel = nullptr;
   this->ethernetSpinner = nullptr;
   this->ethernetLabel = nullptr;
   this->apiConnectionSpinner = nullptr;
   this->apiConnectionLabel = nullptr;
   this->apiAuthenticationSpinner = nullptr;
   this->apiAuthenticationLabel = nullptr;
   this->serverTargetLabel = nullptr;
   this->certLabel = nullptr;
   this->connectionStateLabel = nullptr;
}
