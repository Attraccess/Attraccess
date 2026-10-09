#pragma once

#include <map>
#include <lvgl.h>
#include "display/messages.hpp"
#include "state/state.hpp"

namespace FirmwareI18n {
enum class WidgetText { Label, Dropdown, Placeholder };
struct Binding { WidgetText kind; Text text; };
// No fixed registration limit: every visible localized control is refreshed.
inline std::map<lv_obj_t *, Binding> bindings;
inline void forgetText(lv_event_t *event) {
    bindings.erase(static_cast<lv_obj_t *>(lv_event_get_target(event)));
}
inline void write(lv_obj_t *object, WidgetText kind, const std::string &value) {
    switch (kind) {
    case WidgetText::Label:
        if (value != lv_label_get_text(object)) lv_label_set_text(object, value.c_str());
        break;
    case WidgetText::Dropdown: {
        const auto selected = lv_dropdown_get_selected(object);
        lv_dropdown_set_options(object, value.c_str());
        if (selected < lv_dropdown_get_option_count(object)) lv_dropdown_set_selected(object, selected);
        break;
    }
    case WidgetText::Placeholder: lv_textarea_set_placeholder_text(object, value.c_str()); break;
    }
}
inline void bind(lv_obj_t *object, WidgetText kind, const Text &text) {
    if (!object) return;
    if (text.isLiteral) bindings.erase(object);
    else {
        if (!bindings.count(object)) {
            lv_obj_remove_event_cb(object, forgetText);
            lv_obj_add_event_cb(object, forgetText, LV_EVENT_DELETE, nullptr);
        }
        bindings.insert_or_assign(object, Binding{kind, text});
    }
    write(object, kind, text.render(State::getActiveLanguage()));
}
inline void setLabel(lv_obj_t *object, const Text &text) { bind(object, WidgetText::Label, text); }
inline void setDynamicLabel(lv_obj_t *object, const char *text) { setLabel(object, Text::literal(text ? text : "")); }
inline void setDropdownOptions(lv_obj_t *object, const Text &text) { bind(object, WidgetText::Dropdown, text); }
inline void setDynamicDropdownOptions(lv_obj_t *object, const char *text) { setDropdownOptions(object, Text::literal(text ? text : "")); }
inline void setPlaceholder(lv_obj_t *object, const Text &text) { bind(object, WidgetText::Placeholder, text); }
inline void setDynamicPlaceholder(lv_obj_t *object, const char *text) { setPlaceholder(object, Text::literal(text ? text : "")); }
inline lv_obj_t *addTab(lv_obj_t *tabview, Message message) {
    const auto index = lv_tabview_get_tab_count(tabview);
    auto *tab = lv_tabview_add_tab(tabview, "");
    auto *button = lv_obj_get_child(lv_tabview_get_tab_bar(tabview), index);
    setLabel(lv_obj_get_child(button, 0), message);
    return tab;
}
inline bool isLocalizedLabel(lv_obj_t *object) { return bindings.count(object) && bindings.at(object).kind == WidgetText::Label; }
inline void refreshTree(lv_obj_t *root, const std::string &locale) {
    if (!root) return;
    const auto binding = bindings.find(root);
    if (binding != bindings.end()) write(root, binding->second.kind, binding->second.text.render(locale));
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i) refreshTree(lv_obj_get_child(root, i), locale);
}
}
