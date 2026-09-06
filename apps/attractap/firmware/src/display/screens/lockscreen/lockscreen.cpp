#include "lockscreen.hpp"
#include "display/theme.hpp"
#include <string>

#include <cstring>

void Lockscreen::init()
{
    if (this->screen)
    {
        return;
    }
    this->screen = lv_obj_create(NULL);
    lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
    DisplayTheme::applyScreen(this->screen);

    lv_obj_t *label = lv_label_create(this->screen);
    lv_obj_set_width(label, LV_SIZE_CONTENT);
    lv_obj_set_height(label, LV_SIZE_CONTENT);
    lv_obj_set_x(label, 12);
    lv_obj_set_y(label, -57);
    lv_obj_set_align(label, LV_ALIGN_CENTER);
    lv_label_set_text(label, "Bitte mit NFC \n        Karte/Tag anmelden");
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_AUTO, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(label, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *header = lv_obj_create(this->screen);
    lv_obj_remove_style_all(header);
    lv_obj_set_width(header, lv_pct(100));
    lv_obj_set_height(header, LV_SIZE_CONTENT);
    lv_obj_set_x(header, 0);
    lv_obj_set_y(header, -170);
    lv_obj_set_align(header, LV_ALIGN_CENTER);
    lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
    lv_obj_remove_flag(header, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_pad_left(header, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(header, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_top(header, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_bottom(header, 0, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *logo = lv_image_create(header);
    lv_image_set_src(logo, &logo_40h);
    lv_obj_set_width(logo, LV_SIZE_CONTENT);
    lv_obj_set_height(logo, LV_SIZE_CONTENT);
    lv_obj_set_align(logo, LV_ALIGN_CENTER);
    lv_obj_add_flag(logo, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(logo, LV_OBJ_FLAG_SCROLLABLE);
    lv_image_set_scale(logo, 200);

    lv_obj_t *resourceInfo = lv_obj_create(header);
    lv_obj_remove_style_all(resourceInfo);
    lv_obj_set_width(resourceInfo, LV_SIZE_CONTENT);
    lv_obj_set_height(resourceInfo, LV_SIZE_CONTENT);
    lv_obj_set_align(resourceInfo, LV_ALIGN_CENTER);
    lv_obj_set_flex_flow(resourceInfo, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(resourceInfo, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_START);
    lv_obj_remove_flag(resourceInfo, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(resourceInfo, LV_OBJ_FLAG_SCROLLABLE);

    this->resourceNameLabel = lv_label_create(resourceInfo);
    lv_obj_set_width(this->resourceNameLabel, 250);
    lv_label_set_long_mode(this->resourceNameLabel, LV_LABEL_LONG_SCROLL);
    lv_obj_set_height(this->resourceNameLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(this->resourceNameLabel, LV_ALIGN_CENTER);
    lv_label_set_text(this->resourceNameLabel, "???");
    lv_obj_set_style_text_color(this->resourceNameLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

    this->usageInfoLabel = lv_label_create(resourceInfo);
    lv_obj_set_width(this->usageInfoLabel, LV_SIZE_CONTENT);
    lv_obj_set_height(this->usageInfoLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(this->usageInfoLabel, LV_ALIGN_CENTER);
    lv_label_set_text(this->usageInfoLabel, "???");

    this->updateUsageInfo();
}

lv_obj_t *Lockscreen::getScreen()
{
    return this->screen;
}

void Lockscreen::loop()
{
}

std::string Lockscreen::getName()
{
    return "Lockscreen";
}

void Lockscreen::setResourceName(const char *resourceName)
{
    strlcpy(this->resourceName, resourceName, API::MAX_RESOURCE_NAME_LEN);
    this->resourceName[API::MAX_RESOURCE_NAME_LEN - 1] = '\0';

    this->updateUsageInfo();
}

void Lockscreen::setUsageInfo(bool hasActiveUsage, const char *username, bool isUnderMaintenance)
{
    if (hasActiveUsage)
    {
        strlcpy(this->username, username, API::MAX_USERNAME_LEN);
        this->username[API::MAX_USERNAME_LEN - 1] = '\0';
    }
    this->hasActiveUsage = hasActiveUsage;
    this->isUnderMaintenance = isUnderMaintenance;

    this->updateUsageInfo();
}

void Lockscreen::updateUsageInfo()
{
    if (!this->resourceNameLabel || !this->usageInfoLabel)
    {
        return;
    }

    lv_label_set_text(this->resourceNameLabel, this->resourceName);

    // Status priority mirrors the web resource list: in use > maintenance > available.
    if (this->hasActiveUsage)
    {
        std::string usageText = std::string("In Verwendung: ") + this->username;
        lv_label_set_text(this->usageInfoLabel, usageText.c_str());
        lv_obj_set_style_text_color(this->usageInfoLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
    }
    else if (this->isUnderMaintenance)
    {
        lv_label_set_text(this->usageInfoLabel, "In Wartung");
        lv_obj_set_style_text_color(this->usageInfoLabel, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);
    }
    else
    {
        lv_label_set_text(this->usageInfoLabel, "Verfuegbar");
        lv_obj_set_style_text_color(this->usageInfoLabel, DisplayTheme::success(), LV_PART_MAIN | LV_STATE_DEFAULT);
    }
}

void Lockscreen::onScreenLeave()
{
}

void Lockscreen::destroy()
{
    if (!this->screen)
    {
        return;
    }
    lv_obj_del(this->screen);
    this->screen = nullptr;
    this->resourceNameLabel = nullptr;
    this->usageInfoLabel = nullptr;
}
