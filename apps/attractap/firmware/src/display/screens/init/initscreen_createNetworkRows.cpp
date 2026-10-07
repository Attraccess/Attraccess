#include "initscreen.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>
#include <cstdio>
#include "platform.hpp"

void InitScreen::createNetworkRows(lv_obj_t *statesContainer)
{
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

}
