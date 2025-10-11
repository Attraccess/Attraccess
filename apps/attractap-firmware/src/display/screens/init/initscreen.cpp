#include "initscreen.hpp"

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
   this->finalizeState(spinner, label, lv_color_hex(0x00FF00));
}

void InitScreen::markStateAsError(lv_obj_t *spinner, lv_obj_t *label)
{
   this->finalizeState(spinner, label, lv_color_hex(0xFF0000));
}

void InitScreen::init()
{
   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(this->screen, lv_color_hex(0x1F2C47), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->screen, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_grad_color(this->screen, lv_color_hex(0x364C7C), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_grad_dir(this->screen, LV_GRAD_DIR_VER, LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_obj_set_style_arc_width(this->wifiSpinner, 5, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_set_style_arc_width(this->wifiSpinner, 5, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   this->wifiLabel = lv_label_create(wifiContainer);
   lv_obj_set_width(this->wifiLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->wifiLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->wifiLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->wifiLabel, "verbinde WLAN");
   lv_obj_set_style_text_font(this->wifiLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

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

   this->ethernetSpinner = lv_spinner_create(ethernetContainer);
   lv_obj_set_width(this->ethernetSpinner, 26);
   lv_obj_set_height(this->ethernetSpinner, 26);
   lv_obj_set_align(this->ethernetSpinner, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->ethernetSpinner, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_set_style_arc_width(this->ethernetSpinner, 5, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_set_style_arc_width(this->ethernetSpinner, 5, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   this->ethernetLabel = lv_label_create(ethernetContainer);
   lv_obj_set_width(this->ethernetLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->ethernetLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->ethernetLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->ethernetLabel, "verbinde Ethernet");
   lv_obj_set_style_text_font(this->ethernetLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_obj_set_style_arc_width(this->apiConnectionSpinner, 5, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_set_style_arc_width(this->apiConnectionSpinner, 5, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   this->apiConnectionLabel = lv_label_create(apiConnectionContainer);
   lv_obj_set_width(this->apiConnectionLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->apiConnectionLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->apiConnectionLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->apiConnectionLabel, "verbinde API");
   lv_obj_set_style_text_font(this->apiConnectionLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_obj_set_style_arc_width(this->apiAuthenticationSpinner, 5, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_set_style_arc_width(this->apiAuthenticationSpinner, 5, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   this->apiAuthenticationLabel = lv_label_create(apiAuthenticationContainer);
   lv_obj_set_width(this->apiAuthenticationLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(this->apiAuthenticationLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->apiAuthenticationLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->apiAuthenticationLabel, "authentifiziere an API");
   lv_obj_set_style_text_font(this->apiAuthenticationLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *openSettingsButton = lv_btn_create(statesContainer);
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
   lv_obj_set_style_text_font(openSettingsButtonLabel, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_add_event_cb(openSettingsButton, &InitScreen::onOpenSettingsButtonEvent, LV_EVENT_CLICKED, this);
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

void InitScreen::markWifiStateAsSuccess()
{
   this->markStateAsSuccess(this->wifiSpinner, this->wifiLabel);
}

void InitScreen::markWifiStateAsError()
{
   this->markStateAsError(this->wifiSpinner, this->wifiLabel);
}

void InitScreen::markEthernetStateAsSuccess()
{
   this->markStateAsSuccess(this->ethernetSpinner, this->ethernetLabel);
}

void InitScreen::markEthernetStateAsError()
{
   this->markStateAsError(this->ethernetSpinner, this->ethernetLabel);
}

void InitScreen::markApiConnectionStateAsSuccess()
{
   this->markStateAsSuccess(this->apiConnectionSpinner, this->apiConnectionLabel);
}

void InitScreen::markApiConnectionStateAsError()
{
   this->markStateAsError(this->apiConnectionSpinner, this->apiConnectionLabel);
}

void InitScreen::markApiAuthenticationStateAsSuccess()
{
   this->markStateAsSuccess(this->apiAuthenticationSpinner, this->apiAuthenticationLabel);
}

void InitScreen::markApiAuthenticationStateAsError()
{
   this->markStateAsError(this->apiAuthenticationSpinner, this->apiAuthenticationLabel);
}

void InitScreen::loop()
{
   State::NetworkState networkState = State::getNetworkState();
   // TODO: extend network state and network interface classes to be more descriptive (in progress, success, error and maybe error reason)
   if (networkState.wifi_connected)
   {
      this->markWifiStateAsSuccess();
   }

   if (networkState.ethernet_connected)
   {
      this->markEthernetStateAsSuccess();
   }

   State::WebsocketState websocketState = State::getWebsocketState();
   if (websocketState.connected)
   {
      this->markApiConnectionStateAsSuccess();
   }

   State::ApiState apiState = State::getApiState();
   if (apiState.authenticated)
   {
      this->markApiAuthenticationStateAsSuccess();
   }
}

void InitScreen::setOnOpenSettingsCallback(std::function<void()> onOpenSettingsCallback)
{
   this->onOpenSettingsCallback = onOpenSettingsCallback;
}