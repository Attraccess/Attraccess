#include "initscreen.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>
#include <cstdio>
#include "platform.hpp"

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
   this->finalizeState(spinner, label, DisplayTheme::success());
}

void InitScreen::markStateAsError(lv_obj_t *spinner, lv_obj_t *label)
{
   this->finalizeState(spinner, label, DisplayTheme::danger());
}

void InitScreen::markStateAsWarning(lv_obj_t *spinner, lv_obj_t *label)
{
   // Amber: stage is actively working/retrying (e.g. sweeping CA certs) rather
   // than cleanly succeeded or hard-failed.
   this->finalizeState(spinner, label, DisplayTheme::warning());
}

std::string InitScreen::formatIp(esp_ip4_addr_t ip)
{
   char buf[16];
   snprintf(buf, sizeof(buf), IPSTR, IP2STR(&ip));
   return std::string(buf);
}

void InitScreen::resetState(lv_obj_t *spinner, lv_obj_t *label)
{
   lv_obj_set_style_arc_color(spinner, DisplayTheme::surfaceSecondary(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_opa(spinner, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_width(spinner, 5, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_set_style_arc_color(spinner, DisplayTheme::primary(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_width(spinner, 5, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_opa(spinner, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);

   lv_obj_set_style_text_color(label, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
}
