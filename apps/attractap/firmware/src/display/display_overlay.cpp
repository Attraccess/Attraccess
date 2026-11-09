#include "display/i18n.hpp"
#include "display.hpp"
#include "fonts/attractap_fonts.hpp"
#include "theme.hpp"
#include "shared/wallClockText.hpp"

#include <algorithm>
#include <new>
#include <string>
#include <utility>

// Persistent device-info overlay drawn on the LVGL top layer: a bottom bar
// showing the device name and firmware version, present across all screens.

void Display::initDeviceOverlay()
{
    lv_obj_t *top = lv_layer_top();
    lv_obj_remove_flag(top, LV_OBJ_FLAG_SCROLLABLE);
    // Keep the top layer passive; don't assign a layout directly
    lv_obj_add_flag(top, LV_OBJ_FLAG_IGNORE_LAYOUT);

    // The clock's line is taller than the two outer labels. The bar clips its children, so it grows upwards by what
    // sticks out above the row (the bottom padding takes what sticks out below): nothing of the clock is cut off,
    // and it stays inside the bottom band the screens keep free (ScreenChrome::Bottom).
    const int32_t rowHeight = std::max(lv_font_get_line_height(&attractap_font_montserrat_latin1_10),
                                       lv_font_get_line_height(&lv_font_montserrat_10));
    const int32_t clockOverhang = (lv_font_get_line_height(&attractap_font_montserrat_latin1_14) - rowHeight + 1) / 2;
    // Reader names are free text (pairing allows 64 characters): the name ends with dots before it reaches the clock
    // in the middle of the bar, and the firmware version on the right likewise. Montserrat digits differ in width,
    // so the room is kept for the widest HH:MM.
    int32_t clockWidth = 0;
    for (char digit = '0'; digit <= '9'; ++digit)
    {
        const char text[] = {digit, digit, ':', digit, digit};
        clockWidth = std::max(clockWidth, lv_text_get_width(text, sizeof text, &attractap_font_montserrat_latin1_14, 0));
    }
    constexpr int32_t BarPadding = 20;
    constexpr int32_t ClockGap = 8;
    const int32_t sideWidth = lv_display_get_horizontal_resolution(lv_obj_get_display(top)) / 2 - BarPadding -
                              (clockWidth + 1) / 2 - ClockGap;

    lv_obj_t *deviceInfoContainer = lv_obj_create(top);
    lv_obj_remove_style_all(deviceInfoContainer);
    lv_obj_set_width(deviceInfoContainer, lv_pct(100));
    lv_obj_set_height(deviceInfoContainer, LV_SIZE_CONTENT);
    lv_obj_set_align(deviceInfoContainer, LV_ALIGN_BOTTOM_MID);
    lv_obj_set_x(deviceInfoContainer, 0);
    lv_obj_set_y(deviceInfoContainer, 0);
    lv_obj_set_flex_flow(deviceInfoContainer, LV_FLEX_FLOW_ROW);
    // Spread labels horizontally in a bottom bar
    lv_obj_set_flex_align(deviceInfoContainer, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
    lv_obj_remove_flag(deviceInfoContainer, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(deviceInfoContainer, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_pad_left(deviceInfoContainer, BarPadding, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(deviceInfoContainer, BarPadding, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_top(deviceInfoContainer, clockOverhang, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_bottom(deviceInfoContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);

    // One line of fixed width: dot truncation needs the pixel size (and a layout pass) before the text.
    Display::deviceNameLabel = lv_label_create(deviceInfoContainer);
    lv_obj_set_style_text_font(Display::deviceNameLabel, &attractap_font_montserrat_latin1_10, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_size(Display::deviceNameLabel, sideWidth, lv_font_get_line_height(&attractap_font_montserrat_latin1_10));
    lv_obj_update_layout(Display::deviceNameLabel);
    lv_label_set_long_mode(Display::deviceNameLabel, LV_LABEL_LONG_DOT);
    lv_obj_set_align(Display::deviceNameLabel, LV_ALIGN_CENTER);
    FirmwareI18n::setLabel(Display::deviceNameLabel, Display::deviceNameInitValue);

    lv_obj_set_style_text_color(Display::deviceNameLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(Display::deviceNameLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

    // The current time, centred between the device name and the firmware version. Out of the flex row, so the
    // two outer labels keep their places; hidden until the time is known (see updateFooter).
    Display::footerClockLabel = lv_label_create(deviceInfoContainer);
    lv_obj_add_flag(Display::footerClockLabel, LV_OBJ_FLAG_IGNORE_LAYOUT);
    lv_obj_add_flag(Display::footerClockLabel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_width(Display::footerClockLabel, LV_SIZE_CONTENT);
    lv_obj_set_height(Display::footerClockLabel, LV_SIZE_CONTENT);
    // Centred on the row of the device name and the firmware version: the clock's line is taller than theirs and
    // sticks out by the same amount above and below the row.
    lv_obj_align(Display::footerClockLabel, LV_ALIGN_BOTTOM_MID, 0, clockOverhang);
    FirmwareI18n::setDynamicLabel(Display::footerClockLabel, "00:00") /* i18n-data: Numeric wall-clock time placeholder. */;
    lv_obj_set_style_text_color(Display::footerClockLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(Display::footerClockLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(Display::footerClockLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
    Display::footerClockMinute = -2;

    lv_obj_t *firmwareLabel = lv_label_create(deviceInfoContainer);
    lv_obj_set_style_text_font(firmwareLabel, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_size(firmwareLabel, sideWidth, lv_font_get_line_height(&lv_font_montserrat_10));
    lv_obj_update_layout(firmwareLabel);
    lv_label_set_long_mode(firmwareLabel, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_align(firmwareLabel, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_align(firmwareLabel, LV_ALIGN_CENTER);
    FirmwareI18n::setDynamicLabel(firmwareLabel, (std::string(FIRMWARE_FRIENDLY_NAME) + " v" + FIRMWARE_VERSION).c_str()) /* i18n-data: Build or server firmware name/version data; preserve exact version contents. */;
    lv_obj_set_style_text_color(firmwareLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(firmwareLabel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

    Display::networkQualityContainer = lv_obj_create(top);
    lv_obj_remove_style_all(Display::networkQualityContainer);
    lv_obj_set_size(Display::networkQualityContainer, 62, 30);
    lv_obj_set_align(Display::networkQualityContainer, LV_ALIGN_TOP_RIGHT);
    lv_obj_set_x(Display::networkQualityContainer, -12);
    lv_obj_set_y(Display::networkQualityContainer, 12);
    lv_obj_set_style_radius(Display::networkQualityContainer, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(Display::networkQualityContainer, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(Display::networkQualityContainer, 2, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(Display::networkQualityContainer, DisplayTheme::border(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_flex_flow(Display::networkQualityContainer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(Display::networkQualityContainer, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_remove_flag(Display::networkQualityContainer, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(Display::networkQualityContainer, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(Display::networkQualityContainer, LV_OBJ_FLAG_HIDDEN);

    Display::networkQualityLabel = lv_label_create(Display::networkQualityContainer);
    FirmwareI18n::setLabel(Display::networkQualityLabel, FirmwareI18n::Message::NetworkPoor);
    lv_obj_set_style_text_color(Display::networkQualityLabel, DisplayTheme::onPrimary(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(Display::networkQualityLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);

    // Order on the top layer, bottom to top: drawer grabber, network badge, [plugin step], device footer, drawer
    // backdrop and panel. A plugin step goes directly below the footer: the footer and its clock stay visible over
    // the step, the step covers the badge (and the grabber, see initDrawer), and the open drawer dims them all.
    lv_obj_move_to_index(Display::networkQualityContainer, 0);
    Display::stepModal.placeBelow(deviceInfoContainer);
}

#ifdef ATTRACTAP_HOST
std::vector<Display::ChromePart> Display::chromeParts()
{
    return {{"drawer grabber", Display::drawerGrabber},
            {"network badge", Display::networkQualityContainer},
            {"device footer", Display::deviceNameLabel ? lv_obj_get_parent(Display::deviceNameLabel) : nullptr},
            {"footer clock", Display::footerClockLabel}};
}
#endif

// The footer is hidden on the session summary, except while a plugin step (the keep/free question) is open over it.
// The clock shows once the time is known and never next to a bigger clock: the lock screen and the signed-out
// resource list already show one. It changes once a minute and sends nothing to the server.
void Display::updateFooter()
{
    if (!Display::deviceNameLabel || !Display::footerClockLabel)
    {
        return;
    }
    // The step overlay sits below the footer on the top layer (StepModal::show places it there).
    lv_obj_t *footer = lv_obj_get_parent(Display::deviceNameLabel);
    lv_obj_set_flag(footer, LV_OBJ_FLAG_HIDDEN,
                    Display::activeScreen == &Display::sessionSummaryScreen && !Display::stepModal.isOpen());

    const auto now = WallClock::now();
    const bool bigClockShown = Display::activeScreen == &Display::lockscreen ||
        (Display::activeScreen == &Display::resourceListScreen && Display::resourceListScreen.showsClockHeader());
    const bool show = now.valid && !bigClockShown;
    lv_obj_set_flag(Display::footerClockLabel, LV_OBJ_FLAG_HIDDEN, !show);
    if (!show)
    {
        Display::footerClockMinute = -2;
        return;
    }
    const auto minute = WallClockText::minuteKey(now);
    if (minute == Display::footerClockMinute)
    {
        return;
    }
    Display::footerClockMinute = minute;
    FirmwareI18n::setDynamicLabel(Display::footerClockLabel, WallClockText::clock(now).c_str()) /* i18n-data: Numeric wall-clock time. */;
}

void Display::refreshChromeLanguage(const std::string &language)
{
    FirmwareI18n::refreshTree(lv_layer_top(), language);
}

void Display::updateNetworkQualityOverlay()
{
    if (!Display::networkQualityContainer || !Display::networkQualityLabel)
    {
        return;
    }

    // The goodbye is a plain full-screen view. Connectivity still controls the
    // application state; restore the badge when ordinary routing resumes.
    if (Display::activeScreen == &Display::sessionSummaryScreen)
    {
        lv_obj_add_flag(Display::networkQualityContainer, LV_OBJ_FLAG_HIDDEN);
        Display::networkQualityOverlayInitialized = false;
        return;
    }
    State::NetworkQualityState qualityState = State::getNetworkQualityState();
    if (Display::networkQualityOverlayInitialized && qualityState.quality == Display::networkQualityOverlayValue)
    {
        return;
    }

    Display::networkQualityOverlayValue = qualityState.quality;
    Display::networkQualityOverlayInitialized = true;

    switch (qualityState.quality)
    {
    case State::NETWORK_QUALITY_GOOD:
        lv_obj_add_flag(Display::networkQualityContainer, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_style_bg_color(Display::networkQualityContainer, DisplayTheme::success(), LV_PART_MAIN | LV_STATE_DEFAULT);
        FirmwareI18n::setLabel(Display::networkQualityLabel, FirmwareI18n::Message::NetworkGood);
        break;
    case State::NETWORK_QUALITY_DEGRADED:
        lv_obj_remove_flag(Display::networkQualityContainer, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_style_bg_color(Display::networkQualityContainer, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);
        FirmwareI18n::setLabel(Display::networkQualityLabel, FirmwareI18n::Message::NetworkPoor);
        break;
    case State::NETWORK_QUALITY_OFFLINE:
    default:
        lv_obj_remove_flag(Display::networkQualityContainer, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_style_bg_color(Display::networkQualityContainer, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
        FirmwareI18n::setLabel(Display::networkQualityLabel, FirmwareI18n::Message::NetworkOffline);
        break;
    }
}

void Display::setDeviceName(std::string deviceName)
{
    setDeviceNameText(FirmwareI18n::Text::literal(std::move(deviceName)) /* i18n-data: Operator-supplied reader name; preserve exact contents. */);
}

void Display::setDemoDeviceName()
{
    setDeviceNameText(FirmwareI18n::Message::DemoDeviceName);
}

void Display::setDeviceNameText(const FirmwareI18n::Text &deviceName)
{
    if (!Display::deviceNameLabel)
    {
        Display::deviceNameInitValue = deviceName;
        return;
    }

    // Schedule label update on LVGL thread to avoid cross-thread access
    auto *text = new (std::nothrow) FirmwareI18n::Text(deviceName);
    if (!text)
    {
        return;
    }
    Display::asyncCall(
        [](void *p)
        {
            if (Display::deviceNameLabel)
            {
                FirmwareI18n::setLabel(Display::deviceNameLabel, *static_cast<FirmwareI18n::Text *>(p));
            }
            delete static_cast<FirmwareI18n::Text *>(p);
        },
        text);
}
