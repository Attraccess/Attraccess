#include "maintenanceCheckScreen.hpp"
#include "display/i18n.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/resultLayout.hpp"
#include "../../shared/screenChrome.hpp"

void MaintenanceCheckScreen::configure(const std::string &name, Callbacks next)
{
    resourceName = name;
    callbacks = std::move(next);
    if (screen) build();
}

void MaintenanceCheckScreen::init()
{
    if (screen) return;
    screen = ScreenChrome::createScreen();
    build();
}

void MaintenanceCheckScreen::build()
{
    lv_obj_clean(screen);
    lv_obj_t *column = ResultLayout::createColumn(screen);
    ResultLayout::createText(column, FirmwareI18n::Text::literal(resourceName) /* i18n-data: Server-supplied resource name; preserve exact contents. */,
                             &attractap_font_montserrat_latin1_20, DisplayTheme::muted(), 1);
    ResultLayout::createText(column, FirmwareI18n::Message::MaintenanceCheckTitle, &attractap_font_montserrat_latin1_32,
                             DisplayTheme::text(), 2);
    ResultLayout::createText(column, FirmwareI18n::Message::MaintenanceCheckHint, &attractap_font_montserrat_latin1_18,
                             DisplayTheme::muted(), 3);
    // Full width, so both answers fit in every language; the choices first, then the way out.
    auto addButton = [&](const FirmwareI18n::Text &text, lv_color_t color, bool secondary, lv_event_cb_t onClick) {
        lv_obj_t *button = lv_button_create(column);
        if (secondary) DisplayTheme::secondaryButton(button);
        else DisplayTheme::button(button, color);
        lv_obj_set_size(button, lv_pct(100), ResultLayout::ButtonHeight);
        lv_obj_t *label = lv_label_create(button);
        lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_20, 0);
        FirmwareI18n::setLabel(label, text);
        lv_obj_center(label);
        lv_obj_add_event_cb(button, onClick, LV_EVENT_CLICKED, this);
    };
    addButton(FirmwareI18n::Message::MaintenanceMachineOk, DisplayTheme::primary(), false, [](lv_event_t *e) {
        static_cast<MaintenanceCheckScreen *>(lv_event_get_user_data(e))->machineOk();
    });
    addButton(FirmwareI18n::Message::MaintenanceNeeded, DisplayTheme::warning(), false, [](lv_event_t *e) {
        static_cast<MaintenanceCheckScreen *>(lv_event_get_user_data(e))->needsMaintenance();
    });
    addButton(FirmwareI18n::Message::Cancel, DisplayTheme::primary(), true, [](lv_event_t *e) {
        static_cast<MaintenanceCheckScreen *>(lv_event_get_user_data(e))->cancel();
    });
    // Size the texts now: their dot truncation needs the laid-out height.
    lv_obj_update_layout(screen);
}

// A copy of the callback runs: it may configure this screen again and replace the original.
void MaintenanceCheckScreen::machineOk()
{
    if (const auto callback = callbacks.onMachineOk) callback();
}

void MaintenanceCheckScreen::needsMaintenance()
{
    if (const auto callback = callbacks.onNeedsMaintenance) callback();
}

void MaintenanceCheckScreen::cancel()
{
    if (const auto callback = callbacks.onCancel) callback();
}

void MaintenanceCheckScreen::destroy()
{
    if (screen) lv_obj_delete(screen);
    screen = nullptr;
}
