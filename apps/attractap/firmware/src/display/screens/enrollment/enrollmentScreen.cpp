#include "enrollmentScreen.hpp"

void EnrollmentScreen::init()
{
   if (this->screen)
   {
      return;
   }
   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_ROW_WRAP);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
   lv_obj_set_style_bg_color(this->screen, lv_color_hex(0x600B28), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->screen, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_left(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->timeoutBar = lv_bar_create(this->screen);
   lv_bar_set_range(this->timeoutBar, 0, 30);
   lv_bar_set_value(this->timeoutBar, 25, LV_ANIM_OFF);
   lv_bar_set_start_value(this->timeoutBar, 0, LV_ANIM_OFF);
   lv_obj_set_height(this->timeoutBar, 10);
   lv_obj_set_width(this->timeoutBar, lv_pct(100));
   lv_obj_set_x(this->timeoutBar, 13);
   lv_obj_set_y(this->timeoutBar, -215);
   lv_obj_set_align(this->timeoutBar, LV_ALIGN_CENTER);
   this->updateTimeoutBar();

   lv_obj_t *logo = lv_image_create(this->screen);
   lv_image_set_src(logo, &logo_400w_png);
   lv_obj_set_height(logo, lv_pct(50));
   lv_obj_set_width(logo, LV_SIZE_CONTENT);
   lv_obj_set_align(logo, LV_ALIGN_CENTER);
   lv_obj_add_flag(logo, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(logo, LV_OBJ_FLAG_SCROLLABLE);
   lv_image_set_scale(logo, 200);

   lv_obj_t *infoLineOne = lv_label_create(this->screen);
   lv_obj_set_width(infoLineOne, lv_pct(100));
   lv_obj_set_height(infoLineOne, LV_SIZE_CONTENT);
   lv_obj_set_align(infoLineOne, LV_ALIGN_CENTER);
   lv_label_set_text(infoLineOne, "bitte neue Karte fuer");
   lv_obj_set_style_text_align(infoLineOne, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(infoLineOne, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->userNameLabel = lv_label_create(this->screen);
   lv_obj_set_width(this->userNameLabel, lv_pct(100));
   lv_obj_set_height(this->userNameLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(this->userNameLabel, LV_ALIGN_CENTER);
   const char *initialName = this->userNameCache.length() > 0 ? this->userNameCache.c_str() : "<USERNAME>";
    lv_label_set_text(this->userNameLabel, initialName);
   lv_obj_set_style_text_align(this->userNameLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->userNameLabel, &lv_font_montserrat_36, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *infoLineTwo = lv_label_create(this->screen);
   lv_obj_set_width(infoLineTwo, lv_pct(100));
   lv_obj_set_height(infoLineTwo, LV_SIZE_CONTENT);
   lv_obj_set_align(infoLineTwo, LV_ALIGN_CENTER);
   lv_label_set_text(infoLineTwo, "an den NFC Leser halten");
   lv_obj_set_style_text_align(infoLineTwo, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(infoLineTwo, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void EnrollmentScreen::loop()
{
   this->updateTimeoutBar();
}

void EnrollmentScreen::updateTimeoutBar()
{
   if (!this->timeoutBar)
   {
      return;
   }
   uint32_t now = millis();
    uint32_t remainingTime = 0;
    if (this->enrollmentTimeoutTime > now)
    {
       remainingTime = this->enrollmentTimeoutTime - now;
    }
    lv_bar_set_value(this->timeoutBar, remainingTime, LV_ANIM_ON);
}

lv_obj_t *EnrollmentScreen::getScreen()
{
   return this->screen;
}

void EnrollmentScreen::setEnrollmentTimeoutTime(uint32_t enrollmentTimeoutTime)
{
   this->enrollmentTimeoutTime = enrollmentTimeoutTime;
   this->updateTimeoutBar();
}

void EnrollmentScreen::setUserName(String userName)
{
   this->userNameCache = userName;
   if (this->userNameLabel)
   {
      lv_label_set_text(this->userNameLabel, userName.c_str());
   }
}

String EnrollmentScreen::getName()
{
   return "EnrollmentScreen";
}

void EnrollmentScreen::onScreenLeave()
{
}

void EnrollmentScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
   this->timeoutBar = nullptr;
   this->userNameLabel = nullptr;
}