#include "initscreen.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>

#include <cstdio>
#include "platform.hpp"

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

   this->createNetworkRows(statesContainer);

   this->createApiRows(statesContainer);

   this->createConnectionDetails(statesContainer);

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
