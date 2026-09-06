#include "connectionConfigurationScreen.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>
#include <cstring>

// Save-button widgets, field validation and the save flow.

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

   std::string hostValue = hostText ? hostText : "";
   if (hostValue.rfind("https://", 0) == 0)
   {
      hostValue.erase(0, 8);
      lv_textarea_set_text(self->serverHostname, hostValue.c_str());
   }

   if (hostValue.rfind("http://", 0) == 0)
   {
      hostValue.erase(0, 7);
      lv_textarea_set_text(self->serverHostname, hostValue.c_str());
   }

   bool hostValid = !hostValue.empty() && hostnameLooksValid(hostValue.c_str());
   bool devicePinValid = pinLooksValid(devicePinText);

   // Update label colors
   if (self->labelForServerHostname)
   {
      lv_obj_set_style_text_color(self->labelForServerHostname,
                                  hostValid ? self->labelForServerHostnameDefaultColor : DisplayTheme::danger(),
                                  LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   if (self->labelForDevicePin)
   {
      lv_obj_set_style_text_color(self->labelForDevicePin,
                                  devicePinValid ? self->labelForDevicePinDefaultColor : DisplayTheme::danger(),
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

   // All valid -> call callback if provided
   if (self->onSaveCallback)
   {
      ConnectionConfigurationScreen::ConnectionConfig cfg;
      cfg.ssid = std::string(ssidText);
      cfg.password = std::string(passwordText);
      cfg.host = hostValue;
      cfg.useSSL = lv_obj_has_state(self->useSSLSwitch, LV_STATE_CHECKED);
      cfg.devicePin = std::string(devicePinText);
      cfg.beeperEnabled = lv_obj_has_state(self->beeperEnabled, LV_STATE_CHECKED);
      self->onSaveCallback(cfg);
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
   DisplayTheme::button(save);
   lv_obj_add_event_cb(save, &ConnectionConfigurationScreen::onSaveButtonEvent, LV_EVENT_CLICKED, this);

   lv_obj_t *label = lv_label_create(save);
   lv_obj_set_width(label, LV_SIZE_CONTENT);
   lv_obj_set_height(label, LV_SIZE_CONTENT);
   lv_obj_set_align(label, LV_ALIGN_CENTER);
   lv_label_set_text(label, "Speichern");
   lv_obj_set_style_text_opa(label, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

   return save;
}

lv_obj_t *ConnectionConfigurationScreen::createSaveContainer(lv_obj_t *parent)
{
   lv_obj_t *container = lv_obj_create(parent);
   lv_obj_remove_style_all(container);
   lv_obj_set_width(container, lv_pct(100));
   lv_obj_set_height(container, LV_SIZE_CONTENT);
   lv_obj_set_align(container, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(container, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(container, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(container, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);
   return container;
}

void ConnectionConfigurationScreen::setOnSaveCallback(std::function<void(const ConnectionConfigurationScreen::ConnectionConfig &)> onSaveCallback)
{
   this->onSaveCallback = onSaveCallback;
}

void ConnectionConfigurationScreen::setOnResetCertificateCallback(std::function<void()> onResetCertificateCallback)
{
   this->onResetCertificateCallback = onResetCertificateCallback;
}

void ConnectionConfigurationScreen::onResetCertificateButtonEvent(lv_event_t *e)
{
   ConnectionConfigurationScreen *self = static_cast<ConnectionConfigurationScreen *>(lv_event_get_user_data(e));
   if (!self)
      return;

   if (self->onResetCertificateCallback)
   {
      self->onResetCertificateCallback();
   }

   // One-shot feedback: relabel and disable until the screen is rebuilt.
   if (self->resetCertLabel)
   {
      lv_label_set_text(self->resetCertLabel, "Zurueckgesetzt");
   }
   if (self->resetCertButton)
   {
      lv_obj_add_state(self->resetCertButton, LV_STATE_DISABLED);
   }
}
