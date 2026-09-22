#pragma once

#include "display/fonts/attractap_fonts.hpp"
#include "display/screens/IScreen.hpp"
#include "display/theme.hpp"
#include "display/shared/headerButton.hpp"
#include "platform.hpp"
#include <algorithm>
#include <functional>

// Shared by the list and details: the reader login is independent of machine usage.
class SessionHeader {
public:
    lv_obj_t *create(lv_obj_t *parent, std::function<void()> onLogout, std::function<void()> onBack = {}) {
        logout = std::move(onLogout);
        back = std::move(onBack);
        root = lv_obj_create(parent);
        lv_obj_remove_style_all(root);
        lv_obj_set_size(root, lv_pct(100), 46);
        lv_obj_remove_flag(root, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_flex_flow(root, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(root, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_column(root, 12, 0);
        if (back) ReaderHeader::createBackButton(root, [](lv_event_t *e) {
            auto *self = static_cast<SessionHeader *>(lv_event_get_user_data(e));
            if (self->back) self->back();
        }, this);
        auto *button = lv_button_create(root);
        DisplayTheme::button(button, DisplayTheme::danger(), DisplayTheme::onPrimary());
        ReaderHeader::keepButtonInBounds(button);
        lv_obj_set_size(button, 104, 46);
        auto *text = lv_label_create(button);
        lv_obj_set_style_text_font(text, &attractap_font_montserrat_latin1_14, 0);
        lv_label_set_text(text, "Abmelden");
        lv_obj_center(text);
        lv_obj_add_event_cb(button, [](lv_event_t *e) {
            auto *self = static_cast<SessionHeader *>(lv_event_get_user_data(e));
            if (self->logout) self->logout();
        }, LV_EVENT_CLICKED, this);
        auto *info = lv_obj_create(root);
        lv_obj_remove_style_all(info);
        lv_obj_set_size(info, 0, 46);
        lv_obj_set_flex_grow(info, 1);
        lv_obj_remove_flag(info, LV_OBJ_FLAG_SCROLLABLE);
        auto *identity = lv_obj_create(info);
        lv_obj_remove_style_all(identity);
        lv_obj_set_size(identity, lv_pct(100), 24);
        lv_obj_remove_flag(identity, LV_OBJ_FLAG_SCROLLABLE);
        // Reserve space for the persistent network badge, including paused text.
        lv_obj_set_style_pad_right(identity, 76, 0);
        lv_obj_set_style_pad_column(identity, 8, 0);
        lv_obj_set_flex_flow(identity, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(identity, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
        userLabel = lv_label_create(identity);
        lv_obj_set_width(userLabel, 0);
        lv_obj_set_flex_grow(userLabel, 1);
        lv_label_set_long_mode(userLabel, LV_LABEL_LONG_DOT);
        lv_obj_set_style_text_font(userLabel, &attractap_font_montserrat_latin1_16, 0);
        timeLabel = lv_label_create(identity);
        lv_obj_set_style_text_font(timeLabel, &attractap_font_montserrat_latin1_14, 0);
        lv_obj_set_style_text_color(timeLabel, DisplayTheme::muted(), 0);
        bar = lv_bar_create(info);
        lv_obj_set_size(bar, lv_pct(100), 9);
        lv_obj_align(bar, LV_ALIGN_BOTTOM_MID, 0, -9);
        lv_bar_set_range(bar, 0, 30);
        lastSeconds = -1;
        lv_obj_set_style_bg_color(bar, DisplayTheme::primarySoft(), LV_PART_MAIN);
        update();
        return root;
    }
    void detach() { root = userLabel = timeLabel = bar = nullptr; }
    void setUser(const std::string &value) { username = value; update(); }
    void setDeadline(uint32_t value) { deadline = value; update(); }
    void extend(uint32_t delta) { deadline += delta; update(); }
    void setPaused(bool value) {
        if (paused == value) return;
        paused = value;
        if (paused) frozenAt = millis();
        update();
    }
    void update() {
        if (!root) return;
        const int32_t remaining = static_cast<int32_t>(deadline - (paused ? frozenAt : millis()));
        const int seconds = std::clamp<int32_t>((std::max<int32_t>(remaining, 0) + 999) / 1000, 0, 30);
        setLabelTextIfChanged(userLabel, username.c_str());
        const std::string time = paused ? "Pausiert" : std::to_string(seconds) + " s";
        setLabelTextIfChanged(timeLabel, time.c_str());
        if (lastSeconds != seconds || lastPaused != paused) {
            lv_bar_set_value(bar, seconds, LV_ANIM_OFF);
            lv_obj_set_style_bg_color(bar, !paused && seconds <= 5 ? DisplayTheme::warning() : DisplayTheme::primary(), LV_PART_INDICATOR);
            lastSeconds = seconds;
            lastPaused = paused;
        }
    }
private:
    lv_obj_t *root = nullptr, *userLabel = nullptr, *timeLabel = nullptr, *bar = nullptr;
    std::function<void()> logout, back;
    std::string username;
    uint32_t deadline = 0, frozenAt = 0;
    bool paused = false, lastPaused = false;
    int lastSeconds = -1;
};
