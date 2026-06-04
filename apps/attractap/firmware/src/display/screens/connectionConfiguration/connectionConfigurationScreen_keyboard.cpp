#include "connectionConfigurationScreen.hpp"

// On-screen keyboard handling + text-area focus wiring.

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
   else if (targetTextArea == this->devicePin)
   {
      lv_keyboard_set_mode(this->keyboard, LV_KEYBOARD_MODE_NUMBER);
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
