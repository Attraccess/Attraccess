#include "initscreen.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>
#include <cstdio>
#include "platform.hpp"

void InitScreen::createApiRows(lv_obj_t *statesContainer)
{
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

}
