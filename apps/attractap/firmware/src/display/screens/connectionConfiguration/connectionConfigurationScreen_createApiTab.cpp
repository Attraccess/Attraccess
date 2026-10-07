#include "connectionConfigurationScreen.hpp"
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include <string>

void ConnectionConfigurationScreen::createApiTab(const AttraccessApiConfig &apiConfig)
{
   lv_obj_t *apiTab = lv_tabview_add_tab(this->tabs, "API");
   lv_obj_set_flex_flow(apiTab, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(apiTab, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   this->labelForServerHostname = lv_label_create(apiTab);
   lv_obj_set_width(this->labelForServerHostname, LV_SIZE_CONTENT);
   lv_obj_set_height(this->labelForServerHostname, LV_SIZE_CONTENT);
   lv_obj_set_align(this->labelForServerHostname, LV_ALIGN_CENTER);
   lv_label_set_text(this->labelForServerHostname, "Attraccess API URL");
   lv_obj_set_style_text_color(this->labelForServerHostname, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   this->labelForServerHostnameDefaultColor = lv_obj_get_style_text_color(this->labelForServerHostname, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->serverHostname = lv_textarea_create(apiTab);
   DisplayTheme::field(this->serverHostname);
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
   lv_obj_set_style_text_color(this->labelForUseSSLSwitch, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *sslInfoLabel = lv_label_create(apiTab);
   lv_obj_set_width(sslInfoLabel, lv_pct(100));
   lv_obj_set_height(sslInfoLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(sslInfoLabel, LV_ALIGN_CENTER);
   lv_label_set_text(sslInfoLabel, "Selbst-Signierte Zertifikate werden (aktuell) nicht unterstützt. Eine Verbindung ohne SSL ist sehr unsicher und sollte vermieden werden.");
   lv_obj_set_style_text_font(sslInfoLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_style_text_color(sslInfoLabel, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);

   // Reset the locked certificate decision (ATT-714): once a cert worked it is
   // pinned forever, this is the only way to unpin it after a server cert change.
   this->resetCertButton = lv_button_create(apiTab);
   lv_obj_set_width(this->resetCertButton, LV_SIZE_CONTENT);
   lv_obj_set_height(this->resetCertButton, LV_SIZE_CONTENT);
   lv_obj_set_align(this->resetCertButton, LV_ALIGN_CENTER);
   lv_obj_remove_flag(this->resetCertButton, LV_OBJ_FLAG_SCROLLABLE);
   DisplayTheme::button(this->resetCertButton, DisplayTheme::warning());
   lv_obj_add_event_cb(this->resetCertButton, &ConnectionConfigurationScreen::onResetCertificateButtonEvent, LV_EVENT_CLICKED, this);

   this->resetCertLabel = lv_label_create(this->resetCertButton);
   lv_obj_set_align(this->resetCertLabel, LV_ALIGN_CENTER);
   lv_label_set_text(this->resetCertLabel, "Zertifikat zurücksetzen");
   lv_obj_set_style_text_font(this->resetCertLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);

   lv_obj_t *containerForSaveButton = this->createSaveContainer(apiTab);
   this->createSaveButton(containerForSaveButton);

}
