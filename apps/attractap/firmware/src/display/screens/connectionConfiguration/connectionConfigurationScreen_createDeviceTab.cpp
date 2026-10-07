#include "connectionConfigurationScreen.hpp"
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include <string>

void ConnectionConfigurationScreen::createDeviceTab(const DeviceConfig &deviceConfig)
{
   // Device tab
   lv_obj_t *deviceTab = lv_tabview_add_tab(this->tabs, "Gerät");
   lv_obj_set_style_text_font(lv_tabview_get_tab_bar(this->tabs), &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_flex_flow(deviceTab, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(deviceTab, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   this->labelForDevicePin = lv_label_create(deviceTab);
   lv_obj_set_width(this->labelForDevicePin, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForDevicePin, LV_SIZE_CONTENT);
   lv_obj_set_align(this->labelForDevicePin, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForDevicePin, "Geräte PIN*");
   lv_obj_set_style_text_font(this->labelForDevicePin, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_style_text_color(this->labelForDevicePin, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForDevicePinDefaultColor = lv_obj_get_style_text_color(this->labelForDevicePin, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->devicePin = lv_textarea_create(deviceTab);
   DisplayTheme::field(this->devicePin);
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
   lv_obj_set_style_text_color(labelForBeeperEnabled, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

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

   this->keyboard = lv_keyboard_create(this->screen);
   DisplayTheme::keyboard(this->keyboard);
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
}
