#include "connectionConfigurationScreen.hpp"
#include <cstring>

void ConnectionConfigurationScreen::init()
{
   NetworkConfig networkConfig = Settings::getNetworkConfig();
   AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();

   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN_WRAP);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   this->tabs = lv_tabview_create(this->screen);
   lv_tabview_set_tab_bar_size(this->tabs, 50);
   lv_obj_set_width(this->tabs, lv_pct(100));
   lv_obj_set_height(this->tabs, lv_pct(100));
   lv_obj_set_x(this->tabs, 11);
   lv_obj_set_y(this->tabs, -119);
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
   lv_obj_set_x(labelForWifiSelectNetwork, -117);
   lv_obj_set_y(labelForWifiSelectNetwork, 47);
   lv_obj_set_align(labelForWifiSelectNetwork, LV_ALIGN_CENTER);
   lv_label_set_text(labelForWifiSelectNetwork, "WLAN Netzwerk");
   lv_obj_set_style_text_color(labelForWifiSelectNetwork, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *wifiSelectNetwork = lv_dropdown_create(wifiTab);
   // TODO: insert available networks
   // TODO: when selection is changed, set the ssid field to the selection
   lv_dropdown_set_options(wifiSelectNetwork, "Option 1\nOption 2\nOption 3");
   lv_obj_set_width(wifiSelectNetwork, lv_pct(100));
   lv_obj_set_height(wifiSelectNetwork, LV_SIZE_CONTENT);
   lv_obj_set_x(wifiSelectNetwork, -113);
   lv_obj_set_y(wifiSelectNetwork, -182);
   lv_obj_set_align(wifiSelectNetwork, LV_ALIGN_CENTER);
   lv_obj_add_flag(wifiSelectNetwork, LV_OBJ_FLAG_SCROLL_ON_FOCUS);

   this->labelForWifiSSID = lv_label_create(wifiTab);
   lv_obj_set_width(this->labelForWifiSSID, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForWifiSSID, LV_SIZE_CONTENT);
   lv_obj_set_x(this->labelForWifiSSID, -121);
   lv_obj_set_y(this->labelForWifiSSID, 82);
   lv_obj_set_align(this->labelForWifiSSID, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForWifiSSID, "SSID*");
   lv_obj_set_style_text_color(this->labelForWifiSSID, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForWifiSSIDDefaultColor = lv_obj_get_style_text_color(this->labelForWifiSSID, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->wifiSSID = lv_textarea_create(wifiTab);
   lv_obj_set_width(this->wifiSSID, lv_pct(100));
   lv_obj_set_height(this->wifiSSID, LV_SIZE_CONTENT);
   lv_obj_set_x(this->wifiSSID, -111);
   lv_obj_set_y(this->wifiSSID, -83);
   lv_obj_set_align(this->wifiSSID, LV_ALIGN_CENTER);
   lv_textarea_set_placeholder_text(this->wifiSSID, "SSID");
   lv_textarea_set_one_line(this->wifiSSID, true);
   lv_obj_add_event_cb(this->wifiSSID, &ConnectionConfigurationScreen::onTextAreaEvent, LV_EVENT_ALL, this);
   lv_textarea_set_text(this->wifiSSID, networkConfig.ssid.c_str());

   this->labelForWifiPassword = lv_label_create(wifiTab);
   lv_obj_set_width(this->labelForWifiPassword, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForWifiPassword, LV_SIZE_CONTENT);
   lv_obj_set_x(this->labelForWifiPassword, 116);
   lv_obj_set_y(this->labelForWifiPassword, 101);
   lv_obj_set_align(this->labelForWifiPassword, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForWifiPassword, "Passwort*");
   lv_obj_set_style_text_color(this->labelForWifiPassword, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForWifiPasswordDefaultColor = lv_obj_get_style_text_color(this->labelForWifiPassword, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->wifiPassword = lv_textarea_create(wifiTab);
   lv_obj_set_width(this->wifiPassword, lv_pct(100));
   lv_obj_set_height(this->wifiPassword, LV_SIZE_CONTENT);
   lv_obj_set_x(this->wifiPassword, -111);
   lv_obj_set_y(this->wifiPassword, -83);
   lv_obj_set_align(this->wifiPassword, LV_ALIGN_CENTER);
   lv_textarea_set_placeholder_text(this->wifiPassword, "Password");
   lv_textarea_set_one_line(this->wifiPassword, true);
   lv_textarea_set_password_mode(this->wifiPassword, true);
   lv_obj_add_event_cb(this->wifiPassword, &ConnectionConfigurationScreen::onTextAreaEvent, LV_EVENT_ALL, this);
   lv_textarea_set_text(this->wifiPassword, networkConfig.password.c_str());

   lv_obj_t *containerForContinueButton = lv_obj_create(wifiTab);
   lv_obj_remove_style_all(containerForContinueButton);
   lv_obj_set_width(containerForContinueButton, lv_pct(100));
   lv_obj_set_height(containerForContinueButton, LV_SIZE_CONTENT);
   lv_obj_set_align(containerForContinueButton, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(containerForContinueButton, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(containerForContinueButton, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_END);
   lv_obj_remove_flag(containerForContinueButton, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(containerForContinueButton, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *continueButton = lv_button_create(containerForContinueButton);
   lv_obj_set_width(continueButton, 100);
   lv_obj_set_height(continueButton, 50);
   lv_obj_set_x(continueButton, 193);
   lv_obj_set_y(continueButton, -34);
   lv_obj_set_align(continueButton, LV_ALIGN_CENTER);
   lv_obj_add_flag(continueButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(continueButton, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_event_cb(continueButton, &ConnectionConfigurationScreen::onContinueButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *labelForContinueButton = lv_label_create(continueButton);
   lv_obj_set_width(labelForContinueButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForContinueButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForContinueButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForContinueButton, "Weiter");

   lv_obj_t *apiTab = lv_tabview_add_tab(this->tabs, "API");
   lv_obj_set_flex_flow(apiTab, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(apiTab, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   this->labelForServerHostname = lv_label_create(apiTab);
   lv_obj_set_width(this->labelForServerHostname, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForServerHostname, LV_SIZE_CONTENT);
   lv_obj_set_x(this->labelForServerHostname, -55);
   lv_obj_set_y(this->labelForServerHostname, 164);
   lv_obj_set_align(this->labelForServerHostname, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForServerHostname, "Attraccess API URL");
   lv_obj_set_style_text_color(this->labelForServerHostname, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForServerHostnameDefaultColor = lv_obj_get_style_text_color(this->labelForServerHostname, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->serverHostname = lv_textarea_create(apiTab);
   lv_obj_set_width(this->serverHostname, lv_pct(100));
   lv_obj_set_height(this->serverHostname, LV_SIZE_CONTENT);
   lv_obj_set_x(this->serverHostname, -111);
   lv_obj_set_y(this->serverHostname, -83);
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

   lv_obj_t *sslInfoLabel = lv_label_create(apiTab);
   lv_obj_set_width(sslInfoLabel, lv_pct(100));
   lv_obj_set_height(sslInfoLabel, LV_SIZE_CONTENT);
   lv_obj_set_x(sslInfoLabel, -111);
   lv_obj_set_y(sslInfoLabel, 101);
   lv_obj_set_align(sslInfoLabel, LV_ALIGN_CENTER);
   lv_label_set_text(sslInfoLabel, "Attractap NFC Leser funktionieren AUSCHLIESSLICH mit einer SSL Verbindung (https).");
   lv_obj_set_style_text_color(sslInfoLabel, lv_color_hex(0xFF8000), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *containerForSaveButton = lv_obj_create(apiTab);
   lv_obj_remove_style_all(containerForSaveButton);
   lv_obj_set_height(containerForSaveButton, 50);
   lv_obj_set_width(containerForSaveButton, lv_pct(100));
   lv_obj_set_x(containerForSaveButton, 34);
   lv_obj_set_y(containerForSaveButton, 170);
   lv_obj_set_align(containerForSaveButton, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(containerForSaveButton, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(containerForSaveButton, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(containerForSaveButton, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(containerForSaveButton, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *save = lv_button_create(containerForSaveButton);
   lv_obj_set_width(save, 100);
   lv_obj_set_height(save, 50);
   lv_obj_set_x(save, 89);
   lv_obj_set_y(save, 143);
   lv_obj_set_align(save, LV_ALIGN_CENTER);
   lv_obj_add_flag(save, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(save, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_bg_color(save, lv_color_hex(0x00FF00), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(save, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(save, &ConnectionConfigurationScreen::onSaveButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *labelForSaveButton = lv_label_create(save);
   lv_obj_set_width(labelForSaveButton, LV_SIZE_CONTENT);
   lv_obj_set_height(labelForSaveButton, LV_SIZE_CONTENT);
   lv_obj_set_align(labelForSaveButton, LV_ALIGN_CENTER);
   lv_label_set_text(labelForSaveButton, "Speichern");
   lv_obj_set_style_text_color(labelForSaveButton, lv_color_hex(0x000000), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_opa(labelForSaveButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->keyboard = lv_keyboard_create(this->screen);
   lv_obj_set_width(this->keyboard, lv_pct(100));
   lv_obj_set_height(this->keyboard, lv_pct(48));
   lv_obj_set_x(this->keyboard, -124);
   lv_obj_set_y(this->keyboard, 171);
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
}

lv_obj_t *ConnectionConfigurationScreen::getScreen()
{
   return this->screen;
}

void ConnectionConfigurationScreen::loop()
{
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

void ConnectionConfigurationScreen::onContinueButtonEvent(lv_event_t *e)
{
   ConnectionConfigurationScreen *self = static_cast<ConnectionConfigurationScreen *>(lv_event_get_user_data(e));
   if (!self)
      return;

   lv_event_code_t code = lv_event_get_code(e);
   if (code == LV_EVENT_CLICKED)
   {
      // Validate inputs
      bool ssidValid = false;
      bool passwordValid = false;

      const char *ssidText = lv_textarea_get_text(self->wifiSSID);
      const char *passwordText = lv_textarea_get_text(self->wifiPassword);

      ssidValid = (ssidText && ssidText[0] != '\0');
      passwordValid = (passwordText && passwordText[0] != '\0');

      // Update label colors
      if (self->labelForWifiSSID)
      {
         lv_color_t color = ssidValid ? self->labelForWifiSSIDDefaultColor : lv_color_hex(0xFF0000);
         lv_obj_set_style_text_color(self->labelForWifiSSID, color, LV_PART_MAIN | LV_STATE_DEFAULT);
      }
      if (self->labelForWifiPassword)
      {
         lv_color_t color = passwordValid ? self->labelForWifiPasswordDefaultColor : lv_color_hex(0xFF0000);
         lv_obj_set_style_text_color(self->labelForWifiPassword, color, LV_PART_MAIN | LV_STATE_DEFAULT);
      }

      if (ssidValid && passwordValid)
      {
         // API tab is the second tab (index 1)
         lv_tabview_set_act(self->tabs, 1, LV_ANIM_ON);
      }
   }
}

static bool isEmpty(const char *text)
{
   return !(text && text[0] != '\0');
}

static bool hostnameLooksValid(const char *text)
{
   if (!text || text[0] == '\0')
      return false;
   // Must NOT start with http://; https:// will be handled by stripping elsewhere
   if (strncmp(text, "http://", 7) == 0)
      return false;
   return true;
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

   bool ssidValid = !isEmpty(ssidText);
   bool passwordValid = !isEmpty(passwordText);
   // Accept https:// by stripping it; reject http:// and empty
   String hostValue = String(hostText ? hostText : "");
   if (hostValue.startsWith("https://"))
   {
      hostValue.remove(0, 8);
      lv_textarea_set_text(self->serverHostname, hostValue.c_str());
   }
   bool hostValid = !hostValue.isEmpty() && hostnameLooksValid(hostValue.c_str());

   // Update label colors
   if (self->labelForWifiSSID)
   {
      lv_obj_set_style_text_color(self->labelForWifiSSID,
                                  ssidValid ? self->labelForWifiSSIDDefaultColor : lv_color_hex(0xFF0000),
                                  LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   if (self->labelForWifiPassword)
   {
      lv_obj_set_style_text_color(self->labelForWifiPassword,
                                  passwordValid ? self->labelForWifiPasswordDefaultColor : lv_color_hex(0xFF0000),
                                  LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   if (self->labelForServerHostname)
   {
      lv_obj_set_style_text_color(self->labelForServerHostname,
                                  hostValid ? self->labelForServerHostnameDefaultColor : lv_color_hex(0xFF0000),
                                  LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   // Focus first invalid input and ensure visible
   if (!ssidValid)
   {
      lv_keyboard_set_textarea(self->keyboard, self->wifiSSID);
      self->showKeyboardFor(self->wifiSSID);
      lv_obj_scroll_to_view_recursive(self->wifiSSID, LV_ANIM_ON);
      return;
   }
   if (!passwordValid)
   {
      lv_keyboard_set_textarea(self->keyboard, self->wifiPassword);
      self->showKeyboardFor(self->wifiPassword);
      lv_obj_scroll_to_view_recursive(self->wifiPassword, LV_ANIM_ON);
      return;
   }
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

   // All valid -> call callback if provided
   if (self->onSaveCallback)
   {
      ConnectionConfigurationScreen::ConnectionConfig cfg;
      cfg.ssid = String(ssidText);
      cfg.password = String(passwordText);
      cfg.host = hostValue;
      self->onSaveCallback(cfg);
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

void ConnectionConfigurationScreen::setOnSaveCallback(std::function<void(const ConnectionConfigurationScreen::ConnectionConfig &)> onSaveCallback)
{
   this->onSaveCallback = onSaveCallback;
}

void ConnectionConfigurationScreen::disablePinLock()
{
   if (!this->pinLockOverlay)
      return;
   lv_obj_add_flag(this->pinLockOverlay, LV_OBJ_FLAG_HIDDEN);
}

void ConnectionConfigurationScreen::enablePinLock()
{
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