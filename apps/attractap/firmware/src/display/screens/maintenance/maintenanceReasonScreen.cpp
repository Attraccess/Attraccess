#include "maintenanceReasonScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/resultLayout.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../shared/textEditor.hpp"

namespace
{
    // Characters, not bytes: umlauts take two bytes in UTF-8.
    size_t characterCount(const std::string &text)
    {
        size_t count = 0;
        for (const char c : text)
            if ((static_cast<unsigned char>(c) & 0xC0) != 0x80) ++count;
        return count;
    }
}

void MaintenanceReasonScreen::configure(Config next)
{
    config = std::move(next);
    if (screen) build();
}

void MaintenanceReasonScreen::init()
{
    if (screen) return;
    screen = ScreenChrome::createScreen();
    build();
}

void MaintenanceReasonScreen::build()
{
    lv_obj_clean(screen);
    lv_obj_set_flex_flow(screen, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(screen, 10, LV_PART_MAIN);

    lv_obj_t *title = ScreenChrome::createOneLineLabel(screen, ScreenChrome::ContentWidth, &attractap_font_montserrat_latin1_20);
    FirmwareI18n::setLabel(title, FirmwareI18n::Message::MaintenanceReasonTitle);
    lv_obj_set_style_text_color(title, DisplayTheme::text(), LV_PART_MAIN);
    lv_obj_t *resource = ScreenChrome::createOneLineLabel(screen, ScreenChrome::ContentWidth, &attractap_font_montserrat_latin1_16);
    FirmwareI18n::setDynamicLabel(resource, config.resourceName.c_str()) /* i18n-data: Server-supplied resource name; preserve exact contents. */;
    lv_obj_set_style_text_color(resource, DisplayTheme::muted(), LV_PART_MAIN);

    textArea = TextEditor::createTextArea(screen);
    lv_textarea_set_max_length(textArea, MaxCharacters);
    FirmwareI18n::setPlaceholder(textArea, FirmwareI18n::Message::MaintenanceReasonPlaceholder);
    lv_textarea_set_text(textArea, config.initialText.c_str());
    lv_obj_add_event_cb(textArea, [](lv_event_t *e) {
        static_cast<MaintenanceReasonScreen *>(lv_event_get_user_data(e))->refresh();
    }, LV_EVENT_VALUE_CHANGED, this);
    // Tapping the text brings back a hidden keyboard.
    lv_obj_add_event_cb(textArea, [](lv_event_t *e) {
        auto *self = static_cast<MaintenanceReasonScreen *>(lv_event_get_user_data(e));
        if (self->keyboard) lv_obj_remove_flag(self->keyboard, LV_OBJ_FLAG_HIDDEN);
    }, LV_EVENT_CLICKED, this);

    lv_obj_t *buttons = ResultLayout::createButtonRow(screen);
    ResultLayout::createButton(buttons, FirmwareI18n::Message::Cancel, DisplayTheme::primary(), true, [](lv_event_t *e) {
        static_cast<MaintenanceReasonScreen *>(lv_event_get_user_data(e))->cancel();
    }, this);
    confirmButton = ResultLayout::createButton(buttons, config.confirmLabel, DisplayTheme::primary(), false, [](lv_event_t *e) {
        static_cast<MaintenanceReasonScreen *>(lv_event_get_user_data(e))->confirm();
    }, this);
    lv_obj_set_style_opa(confirmButton, LV_OPA_50, LV_PART_MAIN | LV_STATE_DISABLED);

    // The hide key only hides the keyboard: unlike in the form editor, discarding here would also abort the stop.
    keyboard = TextEditor::createKeyboard(screen, [](lv_event_t *e) {
        auto *self = static_cast<MaintenanceReasonScreen *>(lv_event_get_user_data(e));
        if (lv_event_get_code(e) == LV_EVENT_READY) self->confirm();
        else if (lv_event_get_code(e) == LV_EVENT_CANCEL && self->keyboard)
            lv_obj_add_flag(self->keyboard, LV_OBJ_FLAG_HIDDEN);
    }, this);
    lv_keyboard_set_textarea(keyboard, textArea);
    refresh();
    lv_obj_update_layout(screen);
}

void MaintenanceReasonScreen::setText(const std::string &text)
{
    if (!textArea) return;
    lv_textarea_set_text(textArea, text.c_str());
    refresh();
}

std::string MaintenanceReasonScreen::reason() const
{
    if (!textArea) return std::string();
    const std::string text = lv_textarea_get_text(textArea);
    const size_t first = text.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return std::string();
    return text.substr(first, text.find_last_not_of(" \t\r\n") - first + 1);
}

bool MaintenanceReasonScreen::canConfirm() const { return characterCount(reason()) >= MinCharacters; }

void MaintenanceReasonScreen::refresh()
{
    if (confirmButton) lv_obj_set_state(confirmButton, LV_STATE_DISABLED, !canConfirm());
}

void MaintenanceReasonScreen::confirm()
{
    if (!canConfirm()) return;
    // Copies: the callback may leave this screen, which deletes the text area.
    const std::string text = reason();
    if (const auto callback = config.onConfirm) callback(text);
}

void MaintenanceReasonScreen::cancel()
{
    if (const auto callback = config.onCancel) callback();
}

void MaintenanceReasonScreen::destroy()
{
    if (screen) lv_obj_delete(screen);
    screen = nullptr;
    textArea = nullptr;
    confirmButton = nullptr;
    keyboard = nullptr;
}
