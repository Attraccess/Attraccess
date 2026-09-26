#include "display/i18n.hpp"
#include "lockscreen.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include "display/theme.hpp"
#include "display/shared/headerButton.hpp"
#include "display/images/lockscreen_background_image.hpp"
#include "state/state.hpp"
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
    lv_obj_set_style_pad_all(this->screen, 20, 0);
    lv_obj_set_style_bg_image_src(this->screen, &lockscreen_background_image, LV_PART_MAIN);

    lv_obj_t *label = lv_label_create(this->screen);
    this->signInPromptLabel = label;
    lv_obj_set_width(label, LV_SIZE_CONTENT);
    lv_obj_set_height(label, LV_SIZE_CONTENT);
    lv_obj_set_x(label, 12);
    lv_obj_set_y(label, -57);
    lv_obj_set_align(label, LV_ALIGN_CENTER);
    this->renderedLanguage = State::getActiveLanguage();
    FirmwareI18n::setLabel(label, this->renderedLanguage == "en"
        ? "Tap your NFC \n        card/tag to sign in"
        : "Bitte mit NFC \n        Karte/Tag anmelden");
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_AUTO, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(label, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *header = lv_obj_create(this->screen);
    lv_obj_remove_style_all(header);
    lv_obj_set_width(header, lv_pct(100));
    lv_obj_set_height(header, 46);
    lv_obj_set_align(header, LV_ALIGN_TOP_LEFT);
    lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(header, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
    lv_obj_remove_flag(header, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_pad_column(header, 12, 0);
    ReaderHeader::createBackButton(header, [](lv_event_t *event) {
        auto *self = static_cast<Lockscreen *>(lv_event_get_user_data(event));
        if (!self->authenticating && self->backCallback) self->backCallback();
    }, this);

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
    lv_obj_set_width(resourceInfo, 0);
    lv_obj_set_flex_grow(resourceInfo, 1);
    lv_obj_set_height(resourceInfo, 46);
    lv_obj_set_align(resourceInfo, LV_ALIGN_CENTER);
    lv_obj_set_flex_flow(resourceInfo, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(resourceInfo, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_START);
    lv_obj_remove_flag(resourceInfo, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(resourceInfo, LV_OBJ_FLAG_SCROLLABLE);

    this->resourceNameLabel = lv_label_create(resourceInfo);
    lv_obj_set_width(this->resourceNameLabel, lv_pct(100));
    lv_obj_set_style_pad_right(this->resourceNameLabel, 76, 0);
    lv_label_set_long_mode(this->resourceNameLabel, LV_LABEL_LONG_DOT);
    lv_obj_set_height(this->resourceNameLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(this->resourceNameLabel, LV_ALIGN_CENTER);
    FirmwareI18n::setLabel(this->resourceNameLabel, "???");
    lv_obj_set_style_text_color(this->resourceNameLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->resourceNameLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    this->usageInfoLabel = lv_label_create(resourceInfo);
    lv_obj_set_width(this->usageInfoLabel, lv_pct(100));
    lv_label_set_long_mode(this->usageInfoLabel, LV_LABEL_LONG_DOT);
    lv_obj_set_height(this->usageInfoLabel, LV_SIZE_CONTENT);
    lv_obj_set_align(this->usageInfoLabel, LV_ALIGN_CENTER);
    FirmwareI18n::setLabel(this->usageInfoLabel, "???");
    lv_obj_set_style_text_font(this->usageInfoLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_update_layout(this->screen);
    this->updateUsageInfo();
}

lv_obj_t *Lockscreen::getScreen()
{
    return this->screen;
}

void Lockscreen::loop()
{
    const std::string language = State::getActiveLanguage();
    if (this->signInPromptLabel && language != this->renderedLanguage)
    {
        this->renderedLanguage = language;
        FirmwareI18n::setLabel(this->signInPromptLabel, language == "en"
            ? "Tap your NFC \n        card/tag to sign in"
            : "Bitte mit NFC \n        Karte/Tag anmelden");
        // This screen remains alive across authentication transitions. Refresh
        // its status as well as the prompt when the active locale changes.
        this->updateUsageInfo();
    }
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
        const std::string usageText = State::getActiveLanguage() == "en"
            ? std::string("In use: ") + this->username
            : std::string("In Verwendung: ") + this->username;
        FirmwareI18n::setLabel(this->usageInfoLabel, usageText.c_str());
        lv_obj_set_style_text_color(this->usageInfoLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
    }
    else if (this->isUnderMaintenance)
    {
        FirmwareI18n::setLabel(this->usageInfoLabel, State::getActiveLanguage() == "en" ? "Under maintenance" : "In Wartung");
        lv_obj_set_style_text_color(this->usageInfoLabel, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);
    }
    else
    {
        FirmwareI18n::setLabel(this->usageInfoLabel, State::getActiveLanguage() == "en" ? "Available" : "Verfügbar");
        lv_obj_set_style_text_color(this->usageInfoLabel, DisplayTheme::success(), LV_PART_MAIN | LV_STATE_DEFAULT);
    }
}

void Lockscreen::onScreenLeave()
{
    this->hideActionProgress();
}

void Lockscreen::destroy()
{
    if (!this->screen)
    {
        return;
    }
    lv_obj_del(this->screen);
    this->screen = nullptr;
    overlay.detach();
    this->resourceNameLabel = nullptr;
    this->usageInfoLabel = nullptr;
}
